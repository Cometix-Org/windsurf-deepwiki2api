<script setup lang="ts">
import LoadingSpinner from './LoadingSpinner.vue';

defineProps<{
  isLoading: boolean;
  content: string;
}>();
</script>

<template>
  <div class="content-area">
    <LoadingSpinner v-if="isLoading" />
    <div v-else class="article-content" v-html="content"></div>
  </div>
</template>

<style scoped>
.content-area {
  min-height: 100px;
}

/* 文章内容样式 */
.article-content {
  line-height: 1.7;
}

.article-content :deep(p) {
  margin: 10px 0;
}

.article-content :deep(h1),
.article-content :deep(h2),
.article-content :deep(h3) {
  color: var(--header-color, #e1e1e1);
  margin: 20px 0 12px;
  line-height: 1.4;
}

.article-content :deep(h2) {
  font-size: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #3e3e42);
}

.article-content :deep(h3) {
  font-size: 14px;
}

.article-content :deep(ul) {
  padding-left: 20px;
  margin: 10px 0;
}

.article-content :deep(li) {
  margin-bottom: 8px;
}

/* 行内代码 - 灰色胶囊状 */
.article-content :deep(code) {
  background-color: var(--vscode-editorWidget-background, var(--inline-code-bg, #3c3c3c));
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, Consolas, 'Courier New', monospace);
  font-size: 0.9em;
  color: var(--vscode-editor-foreground, #d4d4d4);
}

/* 代码块 */
.article-content :deep(pre) {
  margin: 0;
}

.article-content :deep(.code-window) {
  background-color: var(--vscode-editor-background, #1e1e1e);
  border: 1px solid var(--vscode-editorWidget-border, #333);
  border-radius: 6px;
  overflow: hidden;
  margin: 14px 0;
  font-family: var(--font-mono, Consolas, 'Courier New', monospace);
  font-size: 13px;
}

.article-content :deep(.code-header) {
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
  background: var(--vscode-editor-background, rgba(255, 255, 255, 0.03));
  display: flex;
  align-items: center;
  gap: 6px;
}

.article-content :deep(.code-lang) {
  color: var(--vscode-descriptionForeground, #858585);
}

.article-content :deep(.code-file-link) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--vscode-textLink-foreground, #4a90e2);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.15s;
}

.article-content :deep(.code-file-link:hover) {
  color: var(--vscode-textLink-activeForeground, #6bb5ff);
  text-decoration: underline;
}

.article-content :deep(.code-icon) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  vertical-align: middle;
}

.article-content :deep(.code-file-name) {
  font-weight: 500;
}

.article-content :deep(.code-line-info) {
  color: var(--vscode-descriptionForeground, #858585);
  font-size: 11px;
  margin-left: 4px;
}

.article-content :deep(.code-content) {
  padding: 12px;
  background-color: var(--vscode-editor-background, #1e1e1e);
  overflow-x: auto;
}

.article-content :deep(.code-content pre) {
  margin: 0;
}

.article-content :deep(.code-content code) {
  background: transparent;
  padding: 0;
  font-size: 13px;
  color: var(--vscode-editor-foreground, #d4d4d4);
}

/* 链接样式 */
.article-content :deep(a) {
  color: var(--accent-color, #4a90e2);
  text-decoration: none;
}

.article-content :deep(a:hover) {
  text-decoration: underline;
}

/* 强调 */
.article-content :deep(strong) {
  color: var(--header-color, #e1e1e1);
  font-weight: 600;
}

/* 水平分割线 */
.article-content :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border-color, #3e3e42);
  margin: 20px 0;
}

/* 代码语法高亮样式 - 使用 VS Code 注入的 CSS 变量 */
.article-content :deep(.tokenized-code) {
  font-family: var(--vscode-editor-font-family, var(--font-mono, Consolas, 'Courier New', monospace));
  font-size: var(--vscode-editor-font-size, 13px);
  line-height: 1.5;
}

.article-content :deep(.code-line) {
  min-height: 1.5em;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Token 颜色 - 使用 VS Code 主题变量 */
.article-content :deep(.token-keyword) {
  color: var(--vscode-textLink-foreground, #569cd6);
}

.article-content :deep(.token-string) {
  color: var(--vscode-debugTokenExpression-string, #ce9178);
}

.article-content :deep(.token-number) {
  color: var(--vscode-debugTokenExpression-number, #b5cea8);
}

.article-content :deep(.token-comment) {
  color: var(--vscode-editorLineNumber-foreground, #6a9955);
  font-style: italic;
}

.article-content :deep(.token-function) {
  color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
}

.article-content :deep(.token-type) {
  color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
}

.article-content :deep(.token-variable) {
  color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
}

.article-content :deep(.token-operator) {
  color: var(--vscode-editor-foreground, #d4d4d4);
}

.article-content :deep(.token-punctuation) {
  color: var(--vscode-editor-foreground, #d4d4d4);
}
</style>

