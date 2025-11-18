import * as vscode from 'vscode';
import { OutlineElement } from './types';
import { containsPosition, makeIdFromRange } from './utils/rangeUtils';

export class OutlineModel {
	constructor(public readonly uri: vscode.Uri, public readonly roots: OutlineElement[]) {}

	getItemEnclosingPosition(pos: vscode.Position): OutlineElement | undefined {
		const find = (nodes: OutlineElement[]): OutlineElement | undefined => {
			for (const n of nodes) {
				if (containsPosition(n.symbol.range, pos)) {
					const child = find(n.children);
					return child ?? n;
				}
			}
			return undefined;
		};
		return find(this.roots);
	}
}

export function buildOutlineElements(
	symbols: vscode.DocumentSymbol[],
	uri: vscode.Uri,
	parent?: OutlineElement
): OutlineElement[] {
	return symbols.map(sym => {
		const elem: OutlineElement = {
			id: `${uri.toString()}:${makeIdFromRange(sym.range)}`,
			symbol: sym,
			parent,
			children: [],
			uri
		};
		elem.children = buildOutlineElements(sym.children ?? [], uri, elem);
		return elem;
	});
}
