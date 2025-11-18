import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { NodeCreatorService } from './nodeCreatorService';
import { NodeContextService } from './context/nodeContextService';
import { NodeScoreService } from './nodeScoreService';
import { LspService } from './lspService';
import { TraceService } from './traceService';
import { disposeOutputChannel } from './outputChannel';
import { ServiceRegistry } from './types';

let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const lsp = new LspService(vscode.commands, vscode.workspace);
	const nodeScore = new NodeScoreService();
	const nodeCreator = new NodeCreatorService(lsp);
	const nodeContext = new NodeContextService();
	const trace = new TraceService(nodeScore, nodeCreator);

	const registry: ServiceRegistry = { lsp, trace, nodeContext };
	nodeCreator.setRegistry(registry);

	disposables = registerCommands(nodeCreator);
	context.subscriptions.push(...disposables);
}

export function deactivate(): void {
	disposables.forEach(d => d.dispose());
	disposables = [];
	disposeOutputChannel();
}
