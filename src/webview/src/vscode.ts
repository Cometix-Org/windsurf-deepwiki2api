// VS Code Webview API wrapper

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

let vscodeApi: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    if (typeof window.acquireVsCodeApi === 'function') {
      vscodeApi = window.acquireVsCodeApi();
    } else {
      // 开发模式下的模拟 API
      vscodeApi = {
        postMessage: (msg) => console.log('postMessage:', msg),
        getState: () => null,
        setState: (state) => console.log('setState:', state)
      };
    }
  }
  return vscodeApi;
}

export function postMessage(type: string, data?: Record<string, unknown>): void {
  getVsCodeApi().postMessage({ type, ...data });
}

