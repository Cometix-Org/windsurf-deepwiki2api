import * as vscode from 'vscode';
import { NodeCreatorService } from './nodeCreatorService';
import { streamDeepwikiArticle, DeepwikiStreamMessage } from './deepwikiClient';

export class ContextWebviewViewProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;

	constructor(private readonly nodeCreator: NodeCreatorService) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
    	webviewView.webview.options = {
			enableScripts: true
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

		// 自动聚焦到面板
		try {
			await vscode.commands.executeCommand('workbench.view.extension.contextCodeText');
			await vscode.commands.executeCommand('contextCodeText.contextView.focus');
		} catch (error) {
			// 如果聚焦失败，继续执行其他逻辑
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

			const header = `符号: ${name}\n位置: ${location}\n\n`;
			// 初始化带脚本的页面，后续通过 postMessage 追加内容
			this.view.webview.html = this.renderHtml('DeepWiki', header + '（流式加载中…）');

			let followupBuffer = '';
			let articleText = '';

			const renderState = () => {
				if (!this.view) {
					return;
				}
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
				const followups = unique.length > 0
					? ['','---','','后续提问', ...unique.map(q => `- ${q}`)].join('\n')
					: '';
				const body = followups ? `${header}${articleText}\n${followups}` : `${header}${articleText}`;
				const html = this.renderMarkdown(body);
				void this.view.webview.postMessage({ type: 'replace', html });
			};

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
				if (!this.view) return;
				if (m.type === 'article' && (m as any).text) {
					articleText += String((m as any).text);
					renderState();
				} else if (m.type === 'followup' && (m as any).text) {
					followupBuffer += String((m as any).text);
					renderState();
				} else if (m.type === 'done') {
					renderState();
				}
			});
			renderState();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			
			// Special handling for LSP unavailable error
			if (message.includes('LSP is not available') || message.includes('Cannot get definitions: LSP is not available')) {
				this.view.webview.html = this.renderHtml('LSP 服务不可用', 
					`LSP (Language Server Protocol) 服务当前不可用。\n\n可能的原因：\n• 当前文件类型不支持 LSP 服务\n• LSP 服务器未启动或崩溃\n• 扩展配置问题\n\n建议的解决方案：\n• 检查是否安装了对应语言的 LSP 扩展\n• 重新 VS Code 或重启 LSP 服务\n• 尝试在其他支持的文件中使用\n\n错误详情：\n${message}`
				);
			} else {
				this.view.webview.html = this.renderHtml('Error', `DeepWiki 请求失败或解析出错：\n${message}`);
			}
		}
	}

    
	private renderHtml(title: string, body: string): string {
		const htmlBody = this.renderMarkdown(body);
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
	.markdown-body { line-height: 1.5; }
	.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin: 12px 0 6px; }
	.markdown-body p { margin: 6px 0; }
	.markdown-body ul { padding-left: 20px; }
	.markdown-body code { background: rgba(127,127,127,0.12); padding: 0 3px; border-radius: 3px; }
	.markdown-body pre { background: rgba(127,127,127,0.12); padding: 8px; border-radius: 6px; overflow: auto; }
	.markdown-body pre code { background: transparent; padding: 0; }
</style>
<title>${title}</title>
</head>
<body>
<h2>${title}</h2>
<div class="markdown-body">${htmlBody}</div>
<script>
// 接收扩展端 postMessage，流式追加或替换 HTML 片段
window.addEventListener('message', (event) => {
  const msg = event.data || {};
  const container = document.querySelector('.markdown-body');
  if (!container) return;
  if (msg.type === 'append' && msg.html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = msg.html;
    while (wrapper.firstChild) {
      container.appendChild(wrapper.firstChild);
    }
  } else if (msg.type === 'replace' && msg.html) {
    container.innerHTML = msg.html;
  }
});
</script>
</body>
</html>`;
	}

	// Minimal Markdown -> HTML converter (headings, lists, code, links, emphasis)
	private renderMarkdown(src: string): string {
		let text = (src ?? '').replace(/\r\n/g, '\n');

		// Escape HTML first
		const escapeHtml = (s: string) => s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\"/g, '&quot;');

		text = escapeHtml(text);

		// Preserve fenced code blocks using placeholders to avoid later transforms inside
		const codeBlocks: string[] = [];
		text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, lang: string | undefined, code: string) => {
			const idx = codeBlocks.length;
			const cls = lang ? ` class="language-${lang}"` : '';
			codeBlocks.push(`<pre><code${cls}>${code.replace(/\n$/,'')}</code></pre>`);
			return `@@CODEBLOCK_${idx}@@`;
		});

		// Headings (# to ######)
		for (let level = 6; level >= 1; level--) {
			const re = new RegExp(`^${'#'.repeat(level)}\\s+(.+)$`, 'gm');
			text = text.replace(re, (_m, g1) => `<h${level}>${g1.trim()}</h${level}>`);
		}

		// Inline code (after escaping)
		text = text.replace(/`([^`]+)`/g, (_m, g1) => `<code>${g1}</code>`);

		// Bold and italic
		text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

		// Links [text](url)
		text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
			return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
		});

		// Simple lists: convert lines starting with - or *
		const lines = text.split('\n');
		const out: string[] = [];
		let inList = false;
		for (const line of lines) {
			const m = line.match(/^\s*[-*]\s+(.*)$/);
			if (m) {
				if (!inList) { out.push('<ul>'); inList = true; }
				out.push(`<li>${m[1]}</li>`);
			} else {
				if (inList) { out.push('</ul>'); inList = false; }
				out.push(line);
			}
		}
		if (inList) {
			out.push('</ul>');
		}
		text = out.join('\n');

		// Paragraphs: wrap plain text blocks not already HTML blocks
		const blocks = text.split(/\n{2,}/);
		const rendered = blocks.map(b => {
			const trimmed = b.trim();
			if (!trimmed) {
				return '';
			}
			if (/^\s*<\/?(h\d|ul|li|pre|code|blockquote)/i.test(trimmed)) {
				return trimmed;
			}
			return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
		}).join('\n');

		// Restore code blocks
		return rendered.replace(/@@CODEBLOCK_(\d+)@@/g, (_m, i) => codeBlocks[Number(i)] ?? '');
	}
}
