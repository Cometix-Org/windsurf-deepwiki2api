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

export type IncomingMessage = UpdateContentMessage | LoadingDoneMessage | InitStateMessage;

