<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue';
import { MarkdownCodeBlockNode } from 'markstream-vue';
import { parseCodeBlockHeader, getFileName, formatLineInfo, getFileExtension } from '../utils/codeBlockParser';
import { fileExtensionMap, specialFileNameMap } from '../config/fileIconMap';
import { postMessage } from '../vscode';

// Markstream Vue 传递的 node 结构
interface CodeBlockNode {
  type: 'code_block';
  lang?: string;
  value?: string;
  code?: string;
  raw?: string;
  // Markstream 可能的其他字段
  meta?: string;
  info?: string;
}

const props = defineProps<{
  node: CodeBlockNode;
}>();

// 从全局注入获取主题配置和图标基础 URI（注入的是 ComputedRef）
const isDarkRef = inject<ComputedRef<boolean> | boolean>('isDark', true);
const shikiThemeDarkRef = inject<ComputedRef<string> | string>('shikiThemeDark', 'github-dark-default');
const shikiThemeLightRef = inject<ComputedRef<string> | string>('shikiThemeLight', 'github-light-default');
const iconBaseUriRef = inject<ComputedRef<string> | string>('iconBaseUri', '');

// 解包 Ref 值
const isDark = computed(() => {
  if (typeof isDarkRef === 'boolean') return isDarkRef;
  return isDarkRef?.value ?? true;
});

const darkTheme = computed(() => {
  if (typeof shikiThemeDarkRef === 'string') return shikiThemeDarkRef;
  return shikiThemeDarkRef?.value || 'github-dark-default';
});

const lightTheme = computed(() => {
  if (typeof shikiThemeLightRef === 'string') return shikiThemeLightRef;
  return shikiThemeLightRef?.value || 'github-light-default';
});

const iconBaseUri = computed(() => {
  if (typeof iconBaseUriRef === 'string') return iconBaseUriRef;
  return iconBaseUriRef?.value || '';
});

// 当前使用的主题（根据 isDark 切换）
const currentTheme = computed(() => (isDark.value ? darkTheme.value : lightTheme.value));

// 获取代码内容（添加防御性检查）
const rawCode = computed(() => {
  const code = props.node?.value || props.node?.code || props.node?.raw || '';
  return typeof code === 'string' ? code : '';
});

// 解析代码块首行
const parsedHeader = computed(() => {
  return parseCodeBlockHeader(rawCode.value);
});

// 获取语言 - 尝试多个可能的字段
const language = computed(() => {
  // 优先使用 node.lang
  if (props.node?.lang) return props.node.lang;
  // 尝试从 info 或 meta 获取
  if (props.node?.info) return props.node.info.split(' ')[0];
  if (props.node?.meta) return props.node.meta.split(' ')[0];
  // 从文件路径推断
  if (parsedHeader.value.filePath) {
    const ext = getFileExtension(parsedHeader.value.filePath);
    // 常见扩展名映射到语言
    const extToLang: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      vue: 'vue',
      svelte: 'svelte',
      html: 'html',
      css: 'css',
      scss: 'scss',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sql: 'sql',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
    };
    if (extToLang[ext]) return extToLang[ext];
    if (ext) return ext;
  }
  return 'plaintext';
});

// 是否有文件路径信息
const hasFileInfo = computed(() => {
  return parsedHeader.value.filePath !== null;
});

// 文件名
const fileName = computed(() => {
  if (!parsedHeader.value.filePath) return '';
  return getFileName(parsedHeader.value.filePath);
});

// 行号信息
const lineInfo = computed(() => {
  return formatLineInfo(parsedHeader.value.startLine, parsedHeader.value.endLine);
});

// 获取图标名称
const iconName = computed(() => {
  if (parsedHeader.value.filePath) {
    const fName = fileName.value.toLowerCase();
    // 先检查特殊文件名
    if (specialFileNameMap[fName]) {
      return specialFileNameMap[fName].icon;
    }
    // 再检查扩展名
    const ext = getFileExtension(parsedHeader.value.filePath);
    if (fileExtensionMap[ext]) {
      return fileExtensionMap[ext].icon;
    }
  }
  // 根据语言获取图标
  const lang = language.value.toLowerCase();
  if (fileExtensionMap[lang]) {
    return fileExtensionMap[lang].icon;
  }
  return 'document';
});

// 图标 URL
const iconUrl = computed(() => {
  const baseUri = iconBaseUri.value;
  if (!baseUri) return '';
  return `${baseUri}/${iconName.value}.svg`;
});

// 处理过的代码（移除首行路径信息）
const processedCode = computed(() => {
  const code = parsedHeader.value.remainingCode;
  return typeof code === 'string' ? code : '';
});

// 用于渲染的 node（使用处理过的代码）
// 注意：MarkdownCodeBlockNode 期望使用 lang 和 value 字段（参考文档示例）
// 同时也提供 language 和 code 以兼容类型定义
const renderNode = computed(() => ({
  type: 'code_block' as const,
  lang: language.value,
  language: language.value,
  value: processedCode.value,
  code: processedCode.value,
  raw: processedCode.value,
}));

// 处理文件链接点击
function handleFileLinkClick() {
  if (!parsedHeader.value.filePath) return;
  
  postMessage('openFile', {
    path: parsedHeader.value.filePath,
    startLine: parsedHeader.value.startLine ?? 1,
    endLine: parsedHeader.value.endLine ?? parsedHeader.value.startLine ?? 1
  });
}

</script>

<template>
  <MarkdownCodeBlockNode 
    :node="renderNode"
    :theme="currentTheme"
    :darkTheme="darkTheme"
    :lightTheme="lightTheme"
    :isDark="isDark"
    :themes="[darkTheme, lightTheme]"
    :lang="language"
    :loading="false"
    :stream="false"
    :showHeader="true"
    :showExpandButton="false"
    :showPreviewButton="false"
    :showFontSizeButtons="false"
    :showCopyButton="true"
  >
    <!-- 当有文件路径信息时，自定义头部左侧显示文件图标、文件名和行号 -->
    <template v-if="hasFileInfo" #header-left>
      <div class="custom-header-left" @click="handleFileLinkClick">
        <img v-if="iconUrl" :src="iconUrl" class="file-icon" alt="" />
        <span class="file-link">
          <span class="file-name">{{ fileName }}</span>
          <span v-if="lineInfo" class="line-info">:{{ lineInfo }}</span>
        </span>
      </div>
    </template>
  </MarkdownCodeBlockNode>
</template>

<style scoped>
.custom-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
  font-size: 13px;
  transition: opacity 0.15s ease;
}

.custom-header-left:hover {
  opacity: 0.85;
}

.custom-header-left:hover .file-link {
  text-decoration: underline;
}

.file-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.file-link {
  color: var(--vscode-textLink-foreground, #4a90e2);
  display: inline;
}

/* 统一代码块背景色 - 使用 VS Code 编辑器背景 */
:deep(.code-block-container) {
  background-color: var(--vscode-editor-background) !important;
  border-color: var(--vscode-editorWidget-border, var(--vscode-panel-border, #3e3e42)) !important;
}

:deep(.code-block-container .code-block-header) {
  background-color: var(--vscode-editor-background) !important;
  border-color: var(--vscode-editorWidget-border, var(--vscode-panel-border, #3e3e42)) !important;
  color: var(--vscode-editor-foreground);
}

:deep(.code-block-container .code-block-content) {
  background-color: var(--vscode-editor-background) !important;
}

/* Shiki 代码区域 - 清除主题背景，使用 VS Code 背景 */
:deep(.code-block-container .shiki),
:deep(.code-block-container .shiki pre),
:deep(.code-block-container .shiki code) {
  background-color: var(--vscode-editor-background) !important;
}

/* 确保 token 级别没有额外背景 */
:deep(.code-block-container .shiki span) {
  background-color: transparent !important;
}
</style>
