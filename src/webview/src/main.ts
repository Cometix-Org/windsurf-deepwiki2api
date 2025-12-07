import { createApp } from 'vue';
import App from './App.vue';

// VS Code API
declare global {
  interface Window {
    acquireVsCodeApi?: () => {
      postMessage: (message: unknown) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
  }
}

// 注意：Shiki 由 markstream-vue 内部管理，无需手动预加载
// markstream-vue 会在需要时动态加载 shiki

createApp(App).mount('#app');

