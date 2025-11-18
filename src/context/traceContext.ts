import * as vscode from 'vscode';
import { RichNode } from '../richNode';
import { renderFileSlice } from '../render';

export async function getTraceContext(node: RichNode): Promise<string> {
	try {
		const trace = (await node.getTrace()).trace;
		if (!trace.length) {
			return `=== Trace Context for '${node.getName()}' ===\nNo trace path found for this symbol.`;
		}
		const lines: string[] = [
			`=== Trace Context for '${node.getName()}' ===`,
			`Found trace path with ${trace.length} node(s):`,
			''
		];
		for (let i = 0; i < trace.length; i++) {
			const tn = trace[i];
			const rn = tn.richNode;
			const indent = '  '.repeat(i);
			const range = rn.getRange();
			lines.push(`${indent}${i + 1}. ${rn.getName()} (${rn.getUri().fsPath}:${range.start.line + 1})`);
			if (tn.parentCandidates.length > 0) {
				lines.push(`${indent}   Parent candidates: ${tn.parentCandidates.map(p => p.symbol.name).join(', ')}`);
				lines.push(`${indent}   Selected parent index: ${tn.parentIndex}`);
			}
			const doc = await vscode.workspace.openTextDocument(rn.getUri());
			const slice = renderFileSlice(doc, Math.max(0, range.start.line - 2), range.end.line + 2);
			for (const line of slice.split('\n')) {
				if (line.trim()) {
					lines.push(`${indent}   ${line}`);
				}
			}
			lines.push('');
		}
		return lines.join('\n');
	} catch (err) {
		return `Error getting trace context for ${node.getName()}: ${err instanceof Error ? err.message : 'Unknown error'}`;
	}
}
