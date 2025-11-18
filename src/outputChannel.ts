import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('Context Code Text');
	}
	return outputChannel;
}

export function disposeOutputChannel(): void {
	if (outputChannel) {
		outputChannel.dispose();
		outputChannel = undefined;
	}
}
