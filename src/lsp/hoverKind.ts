import * as vscode from 'vscode';

export async function inferKindFromHover(
	rootUri: vscode.Uri,
	position: vscode.Position,
	commands: typeof vscode.commands
): Promise<vscode.SymbolKind | undefined> {
	try {
		const hover = await commands.executeCommand<any>('vscode.executeHoverProvider', rootUri, position);
		const contents = hover?.[0]?.contents ?? [];
		if (!contents.length) {
			return undefined;
		}
		const first = contents[0];
		const text = typeof first === 'string' ? first : first?.value ?? '';
		if (text.includes('function') || text.includes('def ') || text.includes('func ') || text.includes('method')) {
			return vscode.SymbolKind.Method;
		}
		if (text.includes('class ')) {
			return vscode.SymbolKind.Class;
		}
		if (text.includes('const ') || text.includes('let ') || text.includes('var ')) {
			return vscode.SymbolKind.Variable;
		}
	} catch {
		// ignore
	}
	return undefined;
}
