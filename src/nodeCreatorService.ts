import * as vscode from 'vscode';
import { LspService } from './lspService';
import { RichNode } from './richNode';
import { ServiceRegistry } from './types';

export class NodeCreatorService {
	private services?: ServiceRegistry;

	constructor(private readonly lsp: LspService) {}

	setRegistry(services: ServiceRegistry): void {
		this.services = services;
	}

	private ensureServices(): ServiceRegistry {
		if (!this.services) {
			throw new Error('Service registry not set on NodeCreatorService');
		}
		return this.services;
	}

	async getRichNode(uri: vscode.Uri, pos: vscode.Position): Promise<RichNode | undefined> {
		const services = this.ensureServices();
		const doc = await vscode.workspace.openTextDocument(uri);
		const wordRange = doc.getWordRangeAtPosition(pos);
		if (!wordRange) {
			return;
		}
		const word = doc.getText(wordRange);

		const def = await this.tryGetDefinition(uri, pos);
		if (!def) {
			return new RichNode(
				{ word, location: { uri, range: new vscode.Range(wordRange.start, wordRange.end) } },
				services
			);
		}

		const outline = await this.tryGetOutline(def.uri, def.pos);
		if (outline) {
			return new RichNode(outline, services);
		}

		return new RichNode(
			{ word, location: { uri, range: new vscode.Range(wordRange.start, wordRange.end) } },
			services
		);
	}

	getRichNodeFromOutlineElement(elem: import('./types').OutlineElement): RichNode {
		return new RichNode(elem, this.ensureServices());
	}

	private async tryGetDefinition(
		uri: vscode.Uri,
		pos: vscode.Position
	): Promise<{ uri: vscode.Uri; pos: vscode.Position } | undefined> {
		try {
			const defs = await this.lsp.getDefinitions(uri, pos, 300);
			const first = Array.isArray(defs) ? defs[0] : defs;
			if (first) {
				if (isLocationLink(first)) {
					const targetRange = first.targetSelectionRange ?? first.targetRange;
					if (targetRange) {
						return { uri: first.targetUri, pos: targetRange.start };
					}
				} else {
					return { uri: first.uri, pos: first.range.start };
				}
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	private async tryGetOutline(uri: vscode.Uri, pos: vscode.Position) {
		try {
			const outline = await this.lsp.getOutlineElementFromPosition(uri, pos);
			if (outline) {
				const sel = outline.symbol.selectionRange ?? outline.symbol.range;
				if (sel.contains(pos)) {
					return outline;
				}
				return outline;
			}
		} catch {
			// ignore
		}
		return undefined;
	}
}

function isLocationLink(value: vscode.Definition | vscode.Location | vscode.LocationLink): value is vscode.LocationLink {
	return (value as vscode.LocationLink).targetUri !== undefined;
}
