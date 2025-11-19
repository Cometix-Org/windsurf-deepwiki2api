import * as vscode from 'vscode';
import { RichNode } from '../richNode';
import { renderFileSlice } from '../render';
import { Caller, ReferenceWithPreview } from '../types';

export async function getUsageContext(node: RichNode): Promise<string> {
	try {
		const name = node.getName();
		const callers = await node.getCallers();
		const refs = await node.getReferences();
		const parts: string[] = [
			`=== Usage Context for '${name}' ===`,
			`Found ${callers.length} caller(s) and ${refs.length} reference(s).`,
			''
		];
		parts.push(...(await renderCallers(callers)));
		parts.push(...(await renderReferences(refs)));
		if (!callers.length && !refs.length) {
			parts.push('No callers or references found for this symbol.');
		}
		return parts.join('\n');
	} catch (err) {
		return `Error getting usage context for ${node.getName()}: ${err instanceof Error ? err.message : 'Unknown error'}`;
	}
}

async function renderCallers(callers: Caller[]): Promise<string[]> {
	if (!callers.length) {
		return [];
	}
	const parts: string[] = ['=== Callers ==='];
	const limit = Math.min(3, callers.length);
	for (let i = 0; i < limit; i++) {
		const caller = callers[i];
		const range = caller.targetRange;
		const start = Math.max(0, range.start.line - 4);
		const end = range.end.line + 4;
		const doc = await vscode.workspace.openTextDocument(caller.source.uri);
		parts.push(`Caller ${i + 1}: ${caller.source.symbol.name}`);
		parts.push(renderFileSlice(doc, start, end));
		parts.push('');
	}
	if (callers.length > limit) {
		parts.push(`... and ${callers.length - limit} more caller(s)`);
	}
	return parts;
}

async function renderReferences(refs: ReferenceWithPreview[]): Promise<string[]> {
	if (!refs.length) {
		return [];
	}
	const parts: string[] = ['=== References ==='];
	const limit = Math.min(10, refs.length);
	for (let i = 0; i < limit; i++) {
		const ref = refs[i];
		const range = ref.location.range;
		parts.push(`Reference ${i + 1}: ${ref.location.uri.fsPath}:${range.start.line + 1}`);
		if (ref.codePreview) {
			parts.push(ref.codePreview.fullLine);
			parts.push(makePointer(ref.codePreview.matchStart, ref.codePreview.matchEnd));
			parts.push('');
			continue;
		}
		const doc = await vscode.workspace.openTextDocument(ref.location.uri);
		parts.push(renderFileSlice(doc, Math.max(0, range.start.line - 4), range.end.line + 4));
		parts.push('');
	}
	if (refs.length > limit) {
		parts.push(`... and ${refs.length - limit} more reference(s)`);
	}
	return parts;
}

function makePointer(start: number, end: number): string {
	const safeStart = Math.max(0, start);
	const width = Math.max(1, end - start);
	return `${' '.repeat(safeStart)}${'^'.repeat(width)}`;
}
