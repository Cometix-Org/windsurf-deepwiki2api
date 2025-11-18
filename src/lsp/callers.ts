import * as vscode from 'vscode';
import { OutlineElement, Caller } from '../types';
import { containsRange } from '../utils/rangeUtils';
import { OutlineModel } from '../outlineModel';

type Deps = {
	getOutlineModel: (uri: vscode.Uri) => Promise<OutlineModel>;
	workspace: typeof vscode.workspace;
	commands: typeof vscode.commands;
	isLspAvailable: (uri: vscode.Uri) => Promise<boolean>;
	getRootUri: (elem: OutlineElement) => vscode.Uri | undefined;
};

export async function resolveCallers(elem: OutlineElement, deps: Deps): Promise<Caller[]> {
	const rootUri = deps.getRootUri(elem);
	if (!rootUri || !(await deps.isLspAvailable(rootUri))) {
		return [];
	}
	const refs = await deps.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
		'_executeReferenceProvider',
		rootUri,
		elem.symbol.selectionRange?.start ?? elem.symbol.range.start
	);
	if (!refs) {
		return [];
	}
	const callers: Caller[] = [];
	for (const ref of refs) {
		const info = normalizeLocation(ref);
		if (!info) {
			continue;
		}
		const doc = await deps.workspace.openTextDocument(info.uri);
		const model = await deps.getOutlineModel(doc.uri);
		const outline = model.getItemEnclosingPosition(info.range.start);
		if (!outline || (rootUri.toString() === info.uri.toString() && containsRange(elem.symbol.range, info.range))) {
			continue;
		}
		if (callers.some(c => c.source === outline)) {
			continue;
		}
		callers.push({
			type: 'CALLS',
			source: outline,
			target: elem,
			targetRange: info.range
		});
		if (callers.length >= 20) {
			break;
		}
	}
	return callers;
}

function normalizeLocation(
	loc: vscode.Location | vscode.LocationLink
): { uri: vscode.Uri; range: vscode.Range } | undefined {
	if ('targetUri' in loc) {
		const range = loc.targetRange ?? loc.targetSelectionRange ?? loc.originSelectionRange;
		if (!range) {
			return undefined;
		}
		return { uri: loc.targetUri, range };
	}
	return { uri: loc.uri, range: loc.range };
}
