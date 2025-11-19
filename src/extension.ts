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
const HAS_OUTLINE_CONTEXT_KEY = 'contextCodeText.hasOutlineContext';
let contextUpdateToken = 0;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const lsp = new LspService(vscode.commands, vscode.workspace);
	const nodeScore = new NodeScoreService();
	const nodeCreator = new NodeCreatorService(lsp);
	const nodeContext = new NodeContextService();
	const trace = new TraceService(nodeScore, nodeCreator);

	const registry: ServiceRegistry = { lsp, trace, nodeContext };
	nodeCreator.setRegistry(registry);

	disposables = registerCommands(nodeCreator);
	context.subscriptions.push(lsp, ...disposables);
	registerContextKeyUpdater(context, nodeCreator);
}

export function deactivate(): void {
	disposables.forEach(d => d.dispose());
	disposables = [];

disposeOutputChannel();
}

function registerContextKeyUpdater(context: vscode.ExtensionContext, nodeCreator: NodeCreatorService): void {
	const update = async (editor: vscode.TextEditor | undefined): Promise<void> => {
		const token = ++contextUpdateToken;
		let hasOutline = false;
		try {
			if (editor) {
				const selection = editor.selection;
				const position = selection.isEmpty ? selection.active : selection.start;
				const node = await nodeCreator.getRichNode(editor.document.uri, position);
				if (node) {
					hasOutline = node.hasOutlineElement() || !!(await node.ensureOutlineElement());
				}
			}
		} catch {
			hasOutline = false;
		}
		if (token === contextUpdateToken) {
			await vscode.commands.executeCommand('setContext', HAS_OUTLINE_CONTEXT_KEY, hasOutline);
		}
	};

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(event => {
			void update(event.textEditor);
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			void update(editor ?? undefined);
		})
	);

	void update(vscode.window.activeTextEditor ?? undefined);
}
