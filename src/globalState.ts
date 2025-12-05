import * as vscode from 'vscode';

let globalState: vscode.Memento | undefined;

export function initGlobalState(context: vscode.ExtensionContext): void {
	globalState = context.globalState;
}

export function getGlobalState(): vscode.Memento {
	if (!globalState) {
		throw new Error('Global state has not been initialized');
	}
	return globalState;
}
