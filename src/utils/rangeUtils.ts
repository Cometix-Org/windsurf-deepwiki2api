import * as vscode from 'vscode';

export function containsRange(outer: vscode.Range, inner: vscode.Range): boolean {
	return outer.start.isBeforeOrEqual(inner.start) && outer.end.isAfterOrEqual(inner.end);
}

export function rangesEqual(a: vscode.Range, b: vscode.Range): boolean {
	return a.start.isEqual(b.start) && a.end.isEqual(b.end);
}

export function containsPosition(range: vscode.Range, pos: vscode.Position): boolean {
	return range.start.isBeforeOrEqual(pos) && range.end.isAfterOrEqual(pos);
}

export function makeIdFromRange(range: vscode.Range): string {
	return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}
