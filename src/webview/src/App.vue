<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, computed } from 'vue';
import MarkdownRender, { setCustomComponents } from 'markstream-vue';
import 'markstream-vue/index.css';
import SymbolHeader from './components/SymbolHeader.vue';
import ContentArea from './components/ContentArea.vue';
import FollowupQuestions from './components/FollowupQuestions.vue';
import CustomCodeBlock from './components/CustomCodeBlock.vue';
import type { WebviewState, IncomingMessage } from './types';
import { postMessage } from './vscode';

// 注册自定义代码块组件（兼容不同节点类型命名）
setCustomComponents('deepwiki', {
  code_block: CustomCodeBlock,
  fenced_code_block: CustomCodeBlock,
});

const state = ref<WebviewState>({
  title: 'Context Code Text',
  symbolKindName: '',
  symbolKind: 0,
  isLoading: false,
  content: '将光标移动到代码中的一个符号上以查看 DeepWiki 结果。',
  followups: [],
  canGoPrev: false,
  canGoNext: false,
  isDark: true,
  shikiThemeDark: 'github-dark-default',
  shikiThemeLight: 'github-light-default',
  iconBaseUri: ''
});

// 提供主题配置和图标基础 URI 给子组件
const isDark = computed(() => state.value.isDark ?? true);
const shikiThemeDark = computed(() => state.value.shikiThemeDark || 'github-dark-default');
const shikiThemeLight = computed(() => state.value.shikiThemeLight || 'github-light-default');
const iconBaseUri = computed(() => state.value.iconBaseUri || '');

provide('isDark', isDark);
provide('shikiThemeDark', shikiThemeDark);
provide('shikiThemeLight', shikiThemeLight);
provide('iconBaseUri', iconBaseUri);

function handleMessage(event: MessageEvent<IncomingMessage>) {
  const msg = event.data;
  
  if (msg.type === 'initState') {
    state.value = {
      ...msg.state,
      isDark: msg.state.isDark ?? state.value.isDark,
      shikiThemeDark: msg.state.shikiThemeDark || state.value.shikiThemeDark,
      shikiThemeLight: msg.state.shikiThemeLight || state.value.shikiThemeLight,
      iconBaseUri: msg.state.iconBaseUri || state.value.iconBaseUri
    };
  } else if (msg.type === 'updateContent') {
    state.value.content = msg.markdown;
    state.value.followups = msg.followups;
    state.value.isLoading = false;
  } else if (msg.type === 'loadingDone') {
    state.value.isLoading = false;
  } else if (msg.type === 'setTheme') {
    state.value.isDark = msg.isDark;
    state.value.shikiThemeDark = msg.shikiThemeDark;
    state.value.shikiThemeLight = msg.shikiThemeLight;
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage);
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
});
</script>

<template>
  <div class="deepwiki-container">
    <!-- 浮动符号标题 -->
    <SymbolHeader 
      :title="state.title"
      :symbol-kind-name="state.symbolKindName"
      :symbol-kind="state.symbolKind"
      class="floating-header"
    />
    
    <!-- Wiki内容 -->
    <ContentArea :is-loading="state.isLoading">
      <MarkdownRender 
        v-if="!state.isLoading && state.content"
        :content="state.content" 
        custom-id="deepwiki"
        :isDark="isDark"
        :themes="[shikiThemeDark, shikiThemeLight]"
        :codeBlockDarkTheme="shikiThemeDark"
        :codeBlockLightTheme="shikiThemeLight"
        :codeBlockStream="true"
      />
    </ContentArea>
    
    <!-- Follow-up Questions -->
    <FollowupQuestions 
      v-if="state.followups.length > 0 && !state.isLoading"
      :questions="state.followups"
    />
  </div>
</template>

<style>
:root {
  --bg-color: #1e1e1e;
  --text-color: #cccccc;
  --header-color: #e1e1e1;
  --accent-purple: #a772d0;
  --code-bg: #2d2d2d;
  --inline-code-bg: #3c3c3c;
  --card-bg: #252526;
  --border-color: #3e3e42;
  --muted-color: #858585;
  --accent-color: #4a90e2;
  --font-main: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-mono: Consolas, 'Courier New', monospace;
}

/* 使用 VS Code 主题变量 */
@media (prefers-color-scheme: light) {
  :root {
    --bg-color: var(--vscode-editor-background, #ffffff);
    --text-color: var(--vscode-foreground, #333333);
    --header-color: var(--vscode-editor-foreground, #1e1e1e);
  }
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--vscode-sideBar-background, var(--vscode-panel-background, var(--bg-color)));
  color: var(--vscode-foreground, var(--text-color));
  font-family: var(--vscode-font-family, var(--font-main));
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
}

.deepwiki-container {
  max-width: 100%;
  padding: 0 16px 16px 16px;
}

/* 浮动标题样式 */
.floating-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--vscode-sideBar-background, var(--vscode-panel-background, var(--bg-color)));
  padding: 12px 16px;
  margin: 0 -16px;
  border-bottom: 1px solid var(--vscode-sideBar-border, var(--border-color));
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

/* Markstream Vue 全局样式覆盖 */
[data-custom-id="deepwiki"] {
  line-height: 1.7;
}

[data-custom-id="deepwiki"] p {
  margin: 10px 0;
}

[data-custom-id="deepwiki"] h1,
[data-custom-id="deepwiki"] h2,
[data-custom-id="deepwiki"] h3 {
  color: var(--header-color, #e1e1e1);
  margin: 20px 0 12px;
  line-height: 1.4;
}

[data-custom-id="deepwiki"] h2 {
  font-size: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #3e3e42);
}

[data-custom-id="deepwiki"] h3 {
  font-size: 14px;
}

[data-custom-id="deepwiki"] ul {
  padding-left: 20px;
  margin: 10px 0;
}

[data-custom-id="deepwiki"] li {
  margin-bottom: 8px;
}

/* 行内代码 - 灰色胶囊状 */
[data-custom-id="deepwiki"] code:not(pre code) {
  background-color: var(--vscode-editorWidget-background, var(--inline-code-bg, #3c3c3c));
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, Consolas, 'Courier New', monospace);
  font-size: 0.9em;
  color: var(--vscode-editor-foreground, #d4d4d4);
}

/* 链接样式 */
[data-custom-id="deepwiki"] a {
  color: var(--accent-color, #4a90e2);
  text-decoration: none;
}

[data-custom-id="deepwiki"] a:hover {
  text-decoration: underline;
}

/* 强调 */
[data-custom-id="deepwiki"] strong {
  color: var(--header-color, #e1e1e1);
  font-weight: 600;
}

/* 水平分割线 */
[data-custom-id="deepwiki"] hr {
  border: 0;
  border-top: 1px solid var(--border-color, #3e3e42);
  margin: 20px 0;
}

/* ========================================
   代码块样式 - 统一使用 VS Code 背景色
   ======================================== */

/* 代码块容器 - 覆盖 Tailwind bg-gray-900 */
.code-block-container {
  background-color: var(--vscode-editor-background) !important;
  border-color: var(--vscode-editorWidget-border, var(--vscode-panel-border, #3e3e42)) !important;
}

/* 代码块头部 */
.code-block-container .code-block-header {
  background-color: var(--vscode-editor-background) !important;
  border-color: var(--vscode-editorWidget-border, var(--vscode-panel-border, #3e3e42)) !important;
}

/* 代码块内容区 */
.code-block-container .code-block-content {
  background-color: var(--vscode-editor-background) !important;
}

/* Shiki 高亮区域 - 覆盖内联样式 background-color: #0d1117 */
.code-block-container .shiki,
.code-block-container .shiki[style],
.code-block-container pre.shiki,
.code-block-container pre.shiki[style] {
  background-color: var(--vscode-editor-background) !important;
}

.code-block-container .shiki code,
.code-block-container pre.shiki code {
  background-color: transparent !important;
}

/* 清除可能的 token 级别背景 */
.code-block-container .shiki span {
  background-color: transparent !important;
}
</style>
