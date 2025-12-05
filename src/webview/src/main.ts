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

createApp(App).mount('#app');

