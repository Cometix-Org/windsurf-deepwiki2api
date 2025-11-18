import * as vscode from 'vscode';
import { RichNode } from '../richNode';
import { renderFileSlice } from '../render';

const MAX_GREP_FILES = 12;
const MAX_GREP_CHARS = 200;

export async function runGrep(node: RichNode, mode: 'quick' | 'full'): Promise<string> {
	try {
		const symbol = node.getName();
		const finder: undefined | ((
			query: { pattern: string },
			options: Record<string, unknown>,
			callback: (result: { uri: vscode.Uri; ranges: readonly vscode.Range[] }) => void
		) => Thenable<void>) = (vscode.workspace as any).findTextInFiles;
		if (!finder) {
			return `Grep is not supported in this version of VS Code.`;
		}
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(node.getUri());
		const title = mode === 'quick' ? `=== Quick Grep Results for '${symbol}' ===` : `=== Grep Results for '${symbol}' ===`;
		const scopeDescription = mode === 'quick' ? 'Quick search (parent folder only)' : 'Full workspace search';
		const matches: { resource: vscode.Uri; range: vscode.Range }[] = [];

		const options: Record<string, unknown> = {
			include: mode === 'quick' && workspaceFolder ? new vscode.RelativePattern(workspaceFolder, '**/*') : undefined,
			useDefaultExcludes: true
		};

		await finder.call(
			vscode.workspace,
			{ pattern: symbol },
			options,
			(result: { uri: vscode.Uri; ranges: readonly vscode.Range[] }) => {
				for (const range of result.ranges) {
					matches.push({ resource: result.uri, range });
				}
			}
		);

		if (!matches.length) {
			return `No grep results found for '${symbol}'.`;
		}

		const lines: string[] = [];
		lines.push(title);
		lines.push(`Search query: ${symbol}`);
		lines.push(`${scopeDescription}: Found ${matches.length} match(es)`);
		lines.push('');

		const byFile = new Map<string, typeof matches>();
		for (const m of matches) {
			const key = m.resource.toString();
			if (!byFile.has(key)) {
				byFile.set(key, []);
			}
			byFile.get(key)!.push(m);
		}

		let shownFiles = 0;
		for (const [, ms] of byFile) {
			if (shownFiles >= MAX_GREP_FILES) {
				lines.push('... and more matches...');
				break;
			}
			const doc = await vscode.workspace.openTextDocument(ms[0].resource);
			lines.push(`${ms[0].resource.fsPath} (${ms.length} matches, showing context around first match)`);
			const start = Math.max(0, ms[0].range.start.line - 10);
			const end = Math.min(doc.lineCount - 1, ms[0].range.end.line + 10);
			lines.push(renderFileSlice(doc, start, end, MAX_GREP_CHARS, 200));
			lines.push('');
			shownFiles += 1;
		}

		return lines.join('\n');
	} catch (err) {
		return `Error retrieving ${mode === 'quick' ? 'quick ' : ''}grep results: ${
			err instanceof Error ? err.message : 'Unknown error'
		}`;
	}
}
