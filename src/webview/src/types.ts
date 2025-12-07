// Webview 状态类型定义

export interface WebviewState {
  title: string;
  symbolKindName: string;
  symbolKind: number;
  isLoading: boolean;
  content: string;
  followups: string[];
  canGoPrev: boolean;
  canGoNext: boolean;
  // VS Code 当前是否为暗色主题
  isDark?: boolean;
  // Shiki 暗色主题名称
  shikiThemeDark?: string;
  // Shiki 亮色主题名称
  shikiThemeLight?: string;
  // 图标资源基础 URI
  iconBaseUri?: string;
}

export interface UpdateContentMessage {
  type: 'updateContent';
  markdown: string;
  followups: string[];
}

export interface LoadingDoneMessage {
  type: 'loadingDone';
}

export interface InitStateMessage {
  type: 'initState';
  state: WebviewState;
}
export interface SetThemeMessage {
  type: 'setTheme';
  isDark: boolean;
  shikiThemeDark: string;
  shikiThemeLight: string;
}

export type IncomingMessage = UpdateContentMessage | LoadingDoneMessage | InitStateMessage | SetThemeMessage;

