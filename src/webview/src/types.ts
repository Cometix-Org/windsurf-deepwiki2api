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
  // 当前使用的 Shiki theme 名称（可选，仅用于前端显示/调试）
  shikiTheme?: string;
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
  theme: string;
}

export type IncomingMessage = UpdateContentMessage | LoadingDoneMessage | InitStateMessage | SetThemeMessage;

