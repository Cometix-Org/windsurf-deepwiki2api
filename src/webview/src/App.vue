<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { marked } from 'marked';
import SymbolHeader from './components/SymbolHeader.vue';
import ContentArea from './components/ContentArea.vue';
import FollowupQuestions from './components/FollowupQuestions.vue';
import type { WebviewState, IncomingMessage } from './types';
import { postMessage } from './vscode';

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true
});

const state = ref<WebviewState>({
  title: 'Context Code Text',
  symbolKindName: '',
  symbolKind: 0,
  isLoading: false,
  content: '将光标移动到代码中的一个符号上以查看 DeepWiki 结果。',
  followups: [],
  canGoPrev: false,
  canGoNext: false
});

// 渲染 Markdown 为 HTML
function renderMarkdown(md: string): string {
  try {
    return marked.parse(md) as string;
  } catch {
    return md;
  }
}

function handleMessage(event: MessageEvent<IncomingMessage>) {
  const msg = event.data;
  
  if (msg.type === 'initState') {
    // initState 的 content 也是 markdown，需要渲染
    state.value = {
      ...msg.state,
      content: renderMarkdown(msg.state.content)
    };
  } else if (msg.type === 'updateContent') {
    state.value.content = renderMarkdown(msg.markdown);
    state.value.followups = msg.followups;
    state.value.isLoading = false;
  } else if (msg.type === 'loadingDone') {
    state.value.isLoading = false;
  }
}

// 处理代码块链接点击
function handleCodeLinkClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const link = target.closest('a.code-file-link') as HTMLAnchorElement | null;
  
  if (link) {
    event.preventDefault();
    const linkData = link.getAttribute('data-vscode-link');
    if (linkData) {
      try {
        const data = JSON.parse(linkData);
        postMessage('openFile', {
          path: data.path,
          startLine: data.startLine,
          endLine: data.endLine
        });
      } catch {
        // 解析失败，忽略
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage);
  document.addEventListener('click', handleCodeLinkClick);
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
  document.removeEventListener('click', handleCodeLinkClick);
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
    <ContentArea 
      :is-loading="state.isLoading"
      :content="state.content"
    />
    
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
  padding: 12px 0;
  margin: 0 -16px;
  padding-left: 16px;
  padding-right: 16px;
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
</style>

