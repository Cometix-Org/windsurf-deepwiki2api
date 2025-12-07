import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NodeCreatorService } from './nodeCreatorService';
import { streamDeepwikiArticle, DeepwikiStreamMessage } from './deepwikiClient';

// Webview 状态类型定义（与 webview/src/types.ts 保持一致）
interface WebviewState {
	title: string;
	symbolKindName: string;
	symbolKind: number;
	isLoading: boolean;
	content: string;
	followups: string[];
	canGoPrev: boolean;
	canGoNext: boolean;
	isDark?: boolean;
	shikiThemeDark?: string;
	shikiThemeLight?: string;
	iconBaseUri?: string;
}

interface HistoryEntry {
	title: string;
	symbolKindName: string;
	symbolKind: number;
	markdown: string;
	followups: string[];
	// 符号位置信息
	filePath: string;
	line: number;
	// 上下文信息
	fileContext?: string;
	usageContext?: string;
	traceContext?: string;
	quickGrepContext?: string;
	fullGrepContext?: string;
}

export class ContextWebviewViewProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;
	private extensionUri: vscode.Uri;
	private currentEditor: vscode.TextEditor | undefined;
	private history: HistoryEntry[] = [];
	private historyIndex: number = -1;
	private currentArticle: string = '';
	private updateGeneration: number = 0;

	constructor(
		private readonly nodeCreator: NodeCreatorService,
		extensionUri: vscode.Uri
	) {
		this.extensionUri = extensionUri;
	}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};
		
		// 加载 Vue webview
		webviewView.webview.html = this.getWebviewHtml(webviewView.webview);
		
		// 处理来自 webview 的消息
		webviewView.webview.onDidReceiveMessage(this.handleWebviewMessage.bind(this));
		
		// 监听 VS Code 主题和配置变化，更新 Shiki 主题
		vscode.window.onDidChangeActiveColorTheme(() => {
			this.sendThemeToWebview();
		});
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('context-code-text.shikiThemeDark') || e.affectsConfiguration('context-code-text.shikiThemeLight')) {
				this.sendThemeToWebview();
			}
		});
		
		// 初次加载时同步一次 Shiki 主题
		this.sendThemeToWebview();
		
		// 初始化导航状态
		this.updateNavigationContext();
		
		// 初始化状态
		this.sendInitState({
			title: 'Context Code Text',
			symbolKindName: '',
			symbolKind: 0,
			isLoading: false,
			content: '将光标移动到代码中的一个符号上以查看 DeepWiki 结果。',
			followups: [],
			canGoPrev: false,
			canGoNext: false
		});
		
		void this.updateForEditor(vscode.window.activeTextEditor ?? undefined);
	}

	private handleWebviewMessage(message: { type: string; [key: string]: unknown }): void {
		switch (message.type) {
			case 'refresh':
				void this.updateForEditor(this.currentEditor);
				break;
			case 'navigate':
				this.handleNavigate(message.direction as 'prev' | 'next');
				break;
			case 'copyArticle':
				this.copyCurrentArticle();
				break;
			case 'openFile':
				void this.openFileAtLocation(
					message.path as string,
					message.startLine as number,
					message.endLine as number
				);
				break;
			case 'copyFollowup':
				this.copyFollowupWithContext(message.question as string);
				break;
		}
	}

	private async openFileAtLocation(filePath: string, startLine: number, endLine: number): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			const doc = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(doc, {
				preview: true,
				preserveFocus: false
			});
			
			// 创建选区并跳转
			const startPos = new vscode.Position(Math.max(0, startLine - 1), 0);
			const endPos = new vscode.Position(Math.max(0, endLine - 1), Number.MAX_SAFE_INTEGER);
			const range = new vscode.Range(startPos, endPos);
			
			editor.selection = new vscode.Selection(startPos, endPos);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
		} catch (err) {
			void vscode.window.showErrorMessage(`无法打开文件: ${filePath}`);
		}
	}

	public copyCurrentArticle(): void {
		if (this.currentArticle) {
			void vscode.env.clipboard.writeText(this.currentArticle);
			void vscode.window.showInformationMessage('文章已复制到剪贴板');
		} else {
			void vscode.window.showWarningMessage('没有可复制的文章内容');
		}
	}

	private copyFollowupWithContext(question: string): void {
		const trimmed = String(question ?? '').trim();
		if (!trimmed) {
			void vscode.window.showWarningMessage('请输入 Follow-up 问题');
			return;
		}

		const entry = this.history[this.historyIndex];

		const lines: string[] = [];
		if (entry) {
			lines.push(
				`${entry.filePath}:${entry.line}`,
				`Symbol: ${entry.title}`
			);
			if (entry.symbolKindName) {
				lines.push(`Kind: ${entry.symbolKindName}`);
			}
			lines.push('', trimmed);
		} else {
			lines.push(trimmed);
		}

		void vscode.env.clipboard.writeText(lines.join('\n'));

		if (entry) {
			void vscode.window.showInformationMessage('Follow-up 问题已复制到剪贴板，包含上下文信息');
		} else {
			void vscode.window.showInformationMessage('Follow-up 问题已复制到剪贴板');
		}
	}

	private handleNavigate(direction: 'prev' | 'next'): void {
		if (direction === 'prev' && this.historyIndex > 0) {
			this.historyIndex--;
			this.showHistoryEntry();
			this.updateNavigationContext();
		} else if (direction === 'next' && this.historyIndex < this.history.length - 1) {
			this.historyIndex++;
			this.showHistoryEntry();
			this.updateNavigationContext();
		}
	}

	/** 供命令使用的公开导航方法 */
	public goBack(): void {
		this.handleNavigate('prev');
	}

	public goForward(): void {
		this.handleNavigate('next');
	}

	public canGoBack(): boolean {
		return this.historyIndex > 0;
	}

	public canGoForward(): boolean {
		return this.historyIndex < this.history.length - 1;
	}

	/** 更新 VS Code context key 以控制按钮启用状态 */
	private updateNavigationContext(): void {
		void vscode.commands.executeCommand('setContext', 'contextCodeText.canGoBack', this.canGoBack());
		void vscode.commands.executeCommand('setContext', 'contextCodeText.canGoForward', this.canGoForward());
	}

	private showHistoryEntry(): void {
		const entry = this.history[this.historyIndex];
		if (!entry) { return; }

		this.currentArticle = entry.markdown;
		
		// 发送状态和内容 - 直接发送原始 markdown，webview 端使用 Markstream Vue 渲染
		this.sendInitState({
			title: entry.title,
			symbolKindName: entry.symbolKindName,
			symbolKind: entry.symbolKind,
			isLoading: false,
			content: entry.markdown,
			followups: entry.followups,
			canGoPrev: this.historyIndex > 0,
			canGoNext: this.historyIndex < this.history.length - 1
		});
	}

	private pushHistory(entry: HistoryEntry): void {
		// 如果当前不在历史末尾，删除后面的历史
		if (this.historyIndex < this.history.length - 1) {
			this.history = this.history.slice(0, this.historyIndex + 1);
		}
		this.history.push(entry);
		this.historyIndex = this.history.length - 1;
		this.updateNavigationContext();
	}

	private getNavigationState(): { canGoPrev: boolean; canGoNext: boolean } {
		return {
			canGoPrev: this.historyIndex > 0,
			canGoNext: this.historyIndex < this.history.length - 1
		};
	}

	/** 获取图标资源的基础 URI */
	private getIconBaseUri(): string {
		if (!this.view) {
			return '';
		}
		const iconUri = this.view.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'assets', 'icons')
		);
		return iconUri.toString();
	}

	private sendInitState(state: WebviewState): void {
		const themeConfig = this.getShikiThemeConfig();
		const iconBaseUri = this.getIconBaseUri();
		const nextState: WebviewState = {
			...state,
			isDark: themeConfig.isDark,
			shikiThemeDark: themeConfig.darkTheme,
			shikiThemeLight: themeConfig.lightTheme,
			iconBaseUri
		};
		void this.view?.webview.postMessage({ type: 'initState', state: nextState });
	}

	private getShikiThemeConfig(): { isDark: boolean; darkTheme: string; lightTheme: string } {
		const config = vscode.workspace.getConfiguration('context-code-text');
		const darkTheme = config.get<string>('shikiThemeDark', 'github-dark-default');
		const lightTheme = config.get<string>('shikiThemeLight', 'github-light-default');
		const kind = vscode.window.activeColorTheme.kind;
		const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
		return { isDark, darkTheme, lightTheme };
	}

	private sendThemeToWebview(): void {
		const themeConfig = this.getShikiThemeConfig();
		void this.view?.webview.postMessage({ 
			type: 'setTheme', 
			isDark: themeConfig.isDark,
			shikiThemeDark: themeConfig.darkTheme,
			shikiThemeLight: themeConfig.lightTheme
		});
	}

	/**
	 * 发送内容更新 - 直接发送原始 markdown
	 * Webview 端使用 Markstream Vue 进行流式渲染和 Shiki 高亮
	 */
	private sendUpdateContent(markdown: string, followups: string[]): void {
		void this.view?.webview.postMessage({ type: 'updateContent', markdown, followups });
	}

	private sendLoadingDone(): void {
		void this.view?.webview.postMessage({ type: 'loadingDone' });
	}

	public async updateForEditor(editor: vscode.TextEditor | undefined): Promise<void> {
		this.currentEditor = editor;
		
		if (!this.view) {
			return;
		}
		if (!editor) {
			this.sendInitState({
				title: 'No active editor',
				symbolKindName: '',
				symbolKind: 0,
				isLoading: false,
				content: '打开一个文件并将光标移动到一个符号上以查看 DeepWiki 结果。',
				followups: [],
				canGoPrev: false,
				canGoNext: false
			});
			return;
		}

		// 自动聚焦到面板
		try {
			await vscode.commands.executeCommand('workbench.view.extension.contextCodeText');
			await vscode.commands.executeCommand('contextCodeText.contextView.focus');
		} catch {
			// 如果聚焦失败，继续执行其他逻辑
		}

		const doc = editor.document;
		const selection = editor.selection;
		const pos = selection.isEmpty ? selection.active : selection.start;
		const wordRange = doc.getWordRangeAtPosition(pos);
		if (!wordRange) {
			this.sendInitState({
				title: 'No symbol at cursor',
				symbolKindName: '',
				symbolKind: 0,
				isLoading: false,
				content: '将光标移动到一个符号名称上以查看 DeepWiki 结果。',
				followups: [],
				canGoPrev: false,
				canGoNext: false
			});
			return;
		}

		const name = doc.getText(wordRange);
		const location = `${doc.uri.fsPath}:${wordRange.start.line + 1}`;

		const gen = ++this.updateGeneration;

		// 设置加载状态
		this.sendInitState({
			title: name,
			symbolKindName: '',
			symbolKind: 0,
			isLoading: true,
			content: `正在向 DeepWiki 请求符号 "${name}" 在 ${location} 的解释…`,
			followups: [],
			canGoPrev: false,
			canGoNext: false
		});

		try {
			const rich = await this.nodeCreator.getRichNode(doc.uri, wordRange.start);
			if (gen !== this.updateGeneration) { return; }

			if (!rich) {
				this.sendInitState({
					title: 'No rich node',
					symbolKindName: '',
					symbolKind: 0,
					isLoading: false,
					content: '当前选择未能生成上下文信息。',
					followups: [],
					canGoPrev: false,
					canGoNext: false
				});
				return;
			}

			const [fileContext, usageContext, traceContext, quickGrepContext, fullGrepContext, symbolKindText] = await Promise.all([
				rich.getFileContext(),
				rich.getUsageContext(),
				rich.getTraceContext(),
				rich.getQuickGrepContext(),
				rich.getGrepContext(),
				rich.getSymbolKindText()
			]);
			if (gen !== this.updateGeneration) { return; }

			const symbolType = rich.getSymbolKind ? await rich.getSymbolKind() : 0;

			let followupBuffer = '';
			let articleText = '';
			this.currentArticle = '';
			let pendingRender = false;

			const renderState = () => {
				if (!this.view || gen !== this.updateGeneration) {
					return;
				}
				// 防抖：如果已经有待处理的渲染，跳过
				if (pendingRender) {
					return;
				}
				pendingRender = true;
				
				// 延迟一小段时间，合并多次快速更新
				setTimeout(() => {
					pendingRender = false;
					if (gen !== this.updateGeneration) { return; }
					
					const items = followupBuffer
						.split(/\r?\n/)
						.map(s => s.trim())
						.filter(Boolean);
					const seen = new Set<string>();
					const unique: string[] = [];
					for (const it of items) {
						if (!seen.has(it)) {
							seen.add(it);
							unique.push(it);
						}
					}
					
					this.currentArticle = articleText;
					// 直接发送原始 markdown，webview 端使用 Markstream Vue 进行流式渲染
					this.sendUpdateContent(articleText, unique);
				}, 50);
			};

			// 更新标题和符号信息
			this.sendInitState({
				title: name,
				symbolKindName: symbolKindText ?? '',
				symbolKind: symbolType,
				isLoading: true,
				content: '（流式加载中…）',
				followups: [],
				...this.getNavigationState()
			});

			await streamDeepwikiArticle({
				symbolName: name,
				symbolUri: doc.uri.toString(),
				symbolType,
				fileContext: fileContext ?? undefined,
				usageContext: usageContext ?? undefined,
				traceContext: traceContext ?? undefined,
				quickGrepContext: quickGrepContext ?? undefined,
				fullGrepContext: fullGrepContext ?? undefined
			}, (m: DeepwikiStreamMessage) => {
				if (!this.view || gen !== this.updateGeneration) {
					return;
				}
				if (m.type === 'article' && (m as { text?: string }).text) {
					articleText += String((m as { text?: string }).text);
					renderState();
				} else if (m.type === 'followup' && (m as { text?: string }).text) {
					followupBuffer += String((m as { text?: string }).text);
					renderState();
				} else if (m.type === 'done') {
					renderState();
					this.sendLoadingDone();
				}
			});
			if (gen !== this.updateGeneration) { return; }
			renderState();
			this.sendLoadingDone();

			// 保存到历史记录
			if (articleText) {
				const followups = followupBuffer
					.split(/\r?\n/)
					.map(s => s.trim())
					.filter(Boolean)
					.filter((v, i, a) => a.indexOf(v) === i);
				
				this.pushHistory({
					title: name,
					symbolKindName: symbolKindText ?? '',
					symbolKind: symbolType,
					markdown: articleText,
					followups,
					// 符号位置信息
					filePath: doc.uri.fsPath,
					line: wordRange.start.line + 1,
					// 上下文信息
					fileContext: fileContext ?? undefined,
					usageContext: usageContext ?? undefined,
					traceContext: traceContext ?? undefined,
					quickGrepContext: quickGrepContext ?? undefined,
					fullGrepContext: fullGrepContext ?? undefined
				});
			}
		} catch (err) {
			if (gen !== this.updateGeneration) { return; }
			const message = err instanceof Error ? err.message : String(err);
			
			// Special handling for LSP unavailable error
			if (message.includes('LSP is not available') || message.includes('Cannot get definitions: LSP is not available')) {
				this.sendInitState({
					title: 'LSP 服务不可用',
					symbolKindName: '',
					symbolKind: 0,
					isLoading: false,
					content: `LSP (Language Server Protocol) 服务当前不可用。\n\n**可能的原因：**\n- 当前文件类型不支持 LSP 服务\n- LSP 服务器未启动或崩溃\n- 扩展配置问题\n\n**建议的解决方案：**\n- 检查是否安装了对应语言的 LSP 扩展\n- 重新启动 VS Code 或重启 LSP 服务\n- 尝试在其他支持的文件中使用\n\n**错误详情：**\n\`${message}\``,
					followups: [],
					canGoPrev: false,
					canGoNext: false
				});
			} else {
				this.sendInitState({
					title: 'Error',
					symbolKindName: '',
					symbolKind: 0,
					isLoading: false,
					content: `DeepWiki 请求失败或解析出错：\n\n\`${message}\``,
					followups: [],
					canGoPrev: false,
					canGoNext: false
				});
			}
		}
	}

	private getWebviewHtml(webview: vscode.Webview): string {
		const webviewPath = path.join(this.extensionUri.fsPath, 'dist', 'webview', 'index.html');
		
		if (!fs.existsSync(webviewPath)) {
			throw new Error('Webview 未构建，请先运行 pnpm build:webview');
		}

		// 生成 nonce 用于 CSP
		const nonce = this.getNonce();

		// 获取资源 URI
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'style.css')
		);
		
		// 获取 codicon 字体的 URI（使用 assets 下的资源）
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'assets', 'codicons', 'codicon.css')
		);
		
		let html = fs.readFileSync(webviewPath, 'utf-8');

		// 替换资源路径并添加 nonce
		html = html.replace(
			/<script\s+type="module"\s+crossorigin\s+src="\.\/assets\/index\.js"><\/script>/i,
			`<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`
		);
		html = html.replace('./assets/style.css', styleUri.toString());

		// 允许脚本从 webview.cspSource 加载，并允许 fetch/oniguruma wasm 等资源访问
		// wasm-unsafe-eval: 允许 Shiki 加载 onig.wasm
		// blob: 允许动态创建的 blob URL（某些库需要）
		// nonce: 用于内联脚本安全
		const csp = [
			`default-src 'none'`,
			`style-src 'unsafe-inline' ${webview.cspSource}`,
			`script-src 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' ${webview.cspSource} blob:`,
			`worker-src ${webview.cspSource} blob:`,
			`font-src ${webview.cspSource} data:`,
			`img-src ${webview.cspSource} data: https:`,
			`connect-src ${webview.cspSource} data: https: blob:`
		].join('; ');
		
		// 注入 codicon CSS
		const codiconLink = `<link rel="stylesheet" href="${codiconsUri}">`;
		
		let result = html;
		
		// 注入 CSP（替换现有的或添加新的）
		if (/<meta\s+http-equiv="Content-Security-Policy"/i.test(result)) {
			result = result.replace(
				/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i,
				`<meta http-equiv="Content-Security-Policy" content="${csp}">`
			);
		} else {
			result = result.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
		}
		
		// 注入 codicon CSS
		result = result.replace('</head>', `${codiconLink}\n</head>`);
		
		return result;
	}

	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
