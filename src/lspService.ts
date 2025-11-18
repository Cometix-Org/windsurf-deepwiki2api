import * as vscode from 'vscode';
import { OutlineElement, ReferenceWithPreview, Caller } from './types';
import { OutlineModel, buildOutlineElements } from './outlineModel';
import { containsPosition } from './utils/rangeUtils';
import { resolveCallers } from './lsp/callers';
import { inferSymbolKind } from './lsp/inferSymbolKind';

export class LspService {
	private outlineCache = new Map<string, OutlineModel>();

	constructor(
		private readonly commands = vscode.commands,
		private readonly workspace = vscode.workspace
	) {}

	private async isLspAvailable(uri: vscode.Uri): Promise<boolean> {
		// Best effort: assume LSP is available; underlying commands will throw if not.
		return this.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString()) || true;
	}

	async getOutlineModel(uri: vscode.Uri): Promise<OutlineModel> {
		if (!(await this.isLspAvailable(uri))) {
			throw new Error('Cannot get outline model: LSP is not available');
		}
		const key = uri.toString();
		const cached = this.outlineCache.get(key);
		if (cached) {
			return cached;
		}
		const symbols = await this.commands.executeCommand<vscode.DocumentSymbol[]>('_executeDocumentSymbolProvider', uri);
		if (!symbols) {
			throw new Error('No document symbols returned');
		}
		const model = new OutlineModel(uri, buildOutlineElements(symbols, uri));
		this.outlineCache.set(key, model);
		return model;
	}

	async getOutlineElementFromPosition(uri: vscode.Uri, pos: vscode.Position): Promise<OutlineElement | undefined> {
		const model = await this.getOutlineModel(uri);
		return model.getItemEnclosingPosition(pos);
	}

	async getDefinitions(
		uri: vscode.Uri,
		pos: vscode.Position,
		limit: number
	): Promise<vscode.Definition | undefined> {
		return this.commands.executeCommand('_executeDefinitionProvider', uri, pos, limit);
	}

	async getReferences(elem: OutlineElement): Promise<ReferenceWithPreview[]> {
		const refs = await this.commands.executeCommand<vscode.LocationLink[]>(
			'_executeReferenceProvider',
			elem.uri,
			elem.symbol.selectionRange?.start ?? elem.symbol.range.start
		);
		if (!refs) {
			return [];
		}
		return refs.slice(0, 50).map(loc => ({ location: new vscode.Location(loc.targetUri, loc.targetRange) }));
	}

	getRootUri(elem: OutlineElement): vscode.Uri | undefined {
		let current: OutlineElement | undefined = elem;
		while (current?.parent) {
			current = current.parent;
		}
		return current?.uri;
	}

	async getCallers(elem: OutlineElement): Promise<Caller[]> {
		return resolveCallers(elem, {
			getOutlineModel: uri => this.getOutlineModel(uri),
			workspace: this.workspace,
			commands: this.commands,
			isLspAvailable: uri => this.isLspAvailable(uri),
			getRootUri: e => this.getRootUri(e)
		});
	}

	async getSymbolKind(elem: OutlineElement): Promise<vscode.SymbolKind> {
		if (elem.symbol.kind !== vscode.SymbolKind.Function) {
			return elem.symbol.kind;
		}
		const rootUri = this.getRootUri(elem);
		if (!rootUri || !(await this.isLspAvailable(rootUri))) {
			return elem.symbol.kind;
		}
		return inferSymbolKind(
			{
				name: elem.symbol.name,
				range: elem.symbol.range,
				position: elem.symbol.selectionRange?.start ?? elem.symbol.range.start
			},
			rootUri,
			this.commands,
			(uri, position, limit) => this.getDefinitions(uri, position, limit)
		);
	}
}
