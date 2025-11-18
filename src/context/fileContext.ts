import * as vscode from 'vscode';
import { RichNode } from '../richNode';
import { renderFileSlice } from '../render';

export async function getFileContext(node: RichNode): Promise<string> {
	try {
		const uri = node.getUri();
		const range = node.getRange();
		const doc = await vscode.workspace.openTextDocument(uri);
		const total = doc.lineCount;
		const padding = 100;
		const start = total <= 400 ? 0 : Math.max(0, range.start.line - padding);
		const end = total <= 400 ? total - 1 : Math.min(total - 1, range.end.line + padding);
		const lines = [
			`=== File Context for '${node.getName()}' ===`,
			total <= 400 ? 'Showing entire file:' : `Showing ${end - start + 1} lines around the symbol (lines ${start + 1}-${end + 1}):`,
			'',
			renderFileSlice(doc, start, end),
			'',
			`=== Symbol Range: ${node.getName()} ===`,
			renderFileSlice(doc, range.start.line, range.end.line)
		];
		return lines.join('\n');
	} catch (err) {
		return `Error getting file context for ${node.getName()}: ${err instanceof Error ? err.message : 'Unknown error'}`;
	}
}
