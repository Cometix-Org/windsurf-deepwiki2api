import * as vscode from 'vscode';
import { containsPosition } from '../utils/rangeUtils';

export function findSymbolByTarget(symbols: any[], rangeStart: vscode.Position, name: string): any | null {
	for (const s of symbols) {
		const range: vscode.Range = s.range || s.location?.range;
		if (range && containsPosition(range, rangeStart)) {
			if (s.children) {
				const child = findSymbolByTarget(s.children, rangeStart, name);
				if (child) {
					return child;
				}
			}
			if (s.name === name) {
				return s;
			}
		}
	}
	return null;
}

export function findSymbolByName(symbols: any[], name: string): any | null {
	for (const s of symbols) {
		if (s.name === name) {
			return s;
		}
		if (s.children) {
			const child = findSymbolByName(s.children, name);
			if (child) {
				return child;
			}
		}
	}
	return null;
}
