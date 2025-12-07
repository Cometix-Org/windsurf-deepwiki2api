import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { NodeCreatorService } from './nodeCreatorService';
import { NodeContextService } from './context/nodeContextService';
import { NodeScoreService } from './nodeScoreService';
import { LspService } from './lspService';
import { TraceService } from './traceService';
import { initGlobalState } from './globalState';
import { ServiceRegistry } from './types';
import { runWindsurfLogin } from './windsurfLogin';
import { ContextWebviewViewProvider } from './contextView';

let disposables: vscode.Disposable[] = [];
const HAS_OUTLINE_CONTEXT_KEY = 'contextCodeText.hasOutlineContext';
let contextUpdateToken = 0;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// 初始化全局状态存储
	initGlobalState(context);
	const lsp = new LspService(vscode.commands, vscode.workspace);
	const nodeScore = new NodeScoreService();
	const nodeCreator = new NodeCreatorService(lsp);
	const nodeContext = new NodeContextService();
	const trace = new TraceService(nodeScore, nodeCreator);

	const registry: ServiceRegistry = { lsp, trace, nodeContext };
	nodeCreator.setRegistry(registry);

	disposables = registerCommands(nodeCreator);

	const loginDisposable = vscode.commands.registerCommand('context-code-text.loginWindsurf', () => {
		void runWindsurfLogin();
	});

	const contextViewProvider = new ContextWebviewViewProvider(nodeCreator, context.extensionUri);
	const viewDisposable = vscode.window.registerWebviewViewProvider('contextCodeText.contextView', contextViewProvider);

	const deepwikiDisposable = vscode.commands.registerCommand('context-code-text.showDeepWiki', () => {
		void contextViewProvider.updateForEditor(vscode.window.activeTextEditor ?? undefined);
	});

	const refreshDisposable = vscode.commands.registerCommand('context-code-text.refresh', () => {
		void contextViewProvider.refreshCurrentEntry();
	});

	const copyArticleDisposable = vscode.commands.registerCommand('context-code-text.copyArticle', () => {
		contextViewProvider.copyCurrentArticle();
	});

	const goBackDisposable = vscode.commands.registerCommand('context-code-text.goBack', () => {
		contextViewProvider.goBack();
	});

	const goForwardDisposable = vscode.commands.registerCommand('context-code-text.goForward', () => {
		contextViewProvider.goForward();
	});

	const exportArticleDisposable = vscode.commands.registerCommand('context-code-text.exportArticle', () => {
		void contextViewProvider.exportArticleToNewFile();
	});

	const exportContextDisposable = vscode.commands.registerCommand('context-code-text.exportContext', () => {
		void contextViewProvider.exportContextToNewFile();
	});

	context.subscriptions.push(lsp, ...disposables, loginDisposable, viewDisposable, deepwikiDisposable, refreshDisposable, copyArticleDisposable, goBackDisposable, goForwardDisposable, exportArticleDisposable, exportContextDisposable);
	registerContextKeyUpdater(context, nodeCreator);
}

export function deactivate(): void {
	disposables.forEach(d => d.dispose());
	disposables = [];
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
