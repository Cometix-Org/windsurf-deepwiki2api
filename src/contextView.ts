import * as vscode from 'vscode';
import { NodeCreatorService } from './nodeCreatorService';
import { fetchDeepwikiArticle } from './deepwikiClient';

export class ContextWebviewViewProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;

	constructor(private readonly nodeCreator: NodeCreatorService) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: false
		};
		webviewView.webview.html = this.renderHtml('Context Code Text', '将光标移动到代码中的一个符号上以查看 DeepWiki 结果。');
		void this.updateForEditor(vscode.window.activeTextEditor ?? undefined);
	}

	public async updateForEditor(editor: vscode.TextEditor | undefined): Promise<void> {
		if (!this.view) {
			return;
		}
		if (!editor) {
			this.view.webview.html = this.renderHtml('No active editor', '打开一个文件并将光标移动到一个符号上以查看 DeepWiki 结果。');
			return;
		}

		const doc = editor.document;
		const selection = editor.selection;
		const pos = selection.isEmpty ? selection.active : selection.start;
		const wordRange = doc.getWordRangeAtPosition(pos);
		if (!wordRange) {
			this.view.webview.html = this.renderHtml('No symbol at cursor', '将光标移动到一个符号名称上以查看 DeepWiki 结果。');
			return;
		}

		const name = doc.getText(wordRange);
		const location = `${doc.uri.fsPath}:${wordRange.start.line + 1}`;

		this.view.webview.html = this.renderHtml('Loading…', `正在向 DeepWiki 请求符号 “${name}” 在 ${location} 的解释…`);

		try {
			const rich = await this.nodeCreator.getRichNode(doc.uri, wordRange.start);
			if (!rich) {
				this.view.webview.html = this.renderHtml('No rich node', '当前选择未能生成上下文信息。');
				return;
			}

			const [fileContext, usageContext, traceContext, quickGrepContext, fullGrepContext, symbolKind] = await Promise.all([
				rich.getFileContext(),
				rich.getUsageContext(),
				rich.getTraceContext(),
				rich.getQuickGrepContext(),
				rich.getGrepContext(),
				rich.getSymbolKindText()
			]);

			const symbolType = rich.getSymbolKind ? await rich.getSymbolKind() : 0;

			const article = await fetchDeepwikiArticle({
				symbolName: name,
				symbolUri: doc.uri.toString(),
				symbolType,
				fileContext: fileContext ?? undefined,
				usageContext: usageContext ?? undefined,
				traceContext: traceContext ?? undefined,
				quickGrepContext: quickGrepContext ?? undefined,
				fullGrepContext: fullGrepContext ?? undefined
			});

			const header = `符号: ${name}\n位置: ${location}\n\n`;
			this.view.webview.html = this.renderHtml('DeepWiki', header + article);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.view.webview.html = this.renderHtml('Error', `DeepWiki 请求失败或解析出错：\n${message}`);
		}
	}

	private renderHtml(title: string, body: string): string {
		const escapedBody = body
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
	body {
		font-family: var(--vscode-editor-font-family);
		padding: 8px;
		color: var(--vscode-editor-foreground);
		background-color: var(--vscode-editor-background);
	}
	h2 {
		font-size: 13px;
		margin: 0 0 6px 0;
	}
	pre {
		white-space: pre-wrap;
		word-wrap: break-word;
		font-family: var(--vscode-editor-font-family);
		font-size: var(--vscode-editor-font-size);
		line-height: 1.4;
	}
</style>
<title>${title}</title>
</head>
<body>
<h2>${title}</h2>
<pre>${escapedBody}</pre>
</body>
</html>`;
	}
}
