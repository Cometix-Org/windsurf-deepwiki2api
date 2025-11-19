import * as vscode from 'vscode';
import { NodeCreatorService } from './nodeCreatorService';
import { getOutputChannel } from './outputChannel';

export function registerCommands(nodeCreator: NodeCreatorService): vscode.Disposable[] {
	const hello = vscode.commands.registerCommand('context-code-text.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from context-code-text!');
	});

	const show = vscode.commands.registerCommand('context-code-text.showContexts', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor for symbol context.');
			return;
		}
		const doc = editor.document;
		const selection = editor.selection;
		const pos = selection.isEmpty ? selection.active : selection.start;
		const wordRange = doc.getWordRangeAtPosition(pos);
		if (!wordRange) {
			vscode.window.showErrorMessage('No symbol selected for context.');
			return;
		}
		const name = doc.getText(wordRange);
		const channel = getOutputChannel();
		channel.clear();
		channel.show(true);
		channel.appendLine(`Collecting contexts for symbol '${name}' at ${doc.uri.fsPath}:${wordRange.start.line + 1}`);
		channel.appendLine('');
		try {
			const rich = await nodeCreator.getRichNode(doc.uri, wordRange.start);
			if (!rich) {
				channel.appendLine('No rich node created for selection.');
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

			const separator = '\n' + '='.repeat(40) + '\n';
			const all = [
				fileContext,
				usageContext,
				traceContext,
				quickGrepContext,
				fullGrepContext,
				`=== Symbol Kind ===\n${symbolKind}`
			]
				.filter(Boolean)
				.join(separator);
			channel.appendLine(all);
		} catch (err) {
			channel.appendLine(`Error while collecting symbol context: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	});

	return [hello, show];
}
