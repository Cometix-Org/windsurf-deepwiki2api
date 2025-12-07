import * as vscode from 'vscode';
import { NodeCreatorService } from './nodeCreatorService';

export function registerCommands(nodeCreator: NodeCreatorService): vscode.Disposable[] {
	const hello = vscode.commands.registerCommand('context-code-text.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from context-code-text!');
	});

	return [hello];
}
