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
			console.debug('[context-code-text] NodeCreatorService: No word range at position');
			return;
		}
		const caretPos = wordRange.start;
		const outline = await this.resolveOutline(uri, caretPos);
		if (outline) {
			return new RichNode(outline, services);
		}
		console.debug('[context-code-text] NodeCreatorService: Failed to resolve outline element, falling back to raw word');
		const word = doc.getText(wordRange);
		if (!word?.length) {
			return undefined;
		}
		return new RichNode(
			{
				word,
				location: {
					uri,
					range: wordRange
				}
			},
			services
		);
	}

	getRichNodeFromOutlineElement(elem: import('./types').OutlineElement): RichNode {
		return new RichNode(elem, this.ensureServices());
	}

	private async resolveOutline(uri: vscode.Uri, pos: vscode.Position) {
		// Prefer going through definition to resolve the canonical symbol, then map to its document symbols.
		const normalized = await this.tryNormalizeDefinition(uri, pos);
		if (normalized?.position) {
			const outline = await this.tryGetOutline(normalized.uri, normalized.position);
			if (outline) {
				return outline;
			}
			console.debug('[context-code-text] NodeCreatorService: Outline lookup at definition location failed');
		} else {
			console.debug('[context-code-text] NodeCreatorService: Definition lookup returned no result');
		}
		// Fallback: try outline in the current document at the caret position.
		const fallback = await this.tryGetOutline(uri, pos);
		if (!fallback) {
			console.debug('[context-code-text] NodeCreatorService: Outline lookup at caret position failed');
		}
		return fallback;
	}

	private async tryNormalizeDefinition(uri: vscode.Uri, pos: vscode.Position): Promise<
		| {
				uri: vscode.Uri;
				position: vscode.Position;
		  }
		| undefined
	> {
		try {
			const defs = await this.lsp.getDefinitions(uri, pos, 300);
			const first = Array.isArray(defs) ? defs[0] : defs;
			if (!first) {
				return undefined;
			}
			if (isLocationLink(first)) {
				const targetRange = first.targetSelectionRange ?? first.targetRange;
				return targetRange ? { uri: first.targetUri, position: targetRange.start } : undefined;
			}
			if (!first.range) {
				return undefined;
			}
			return { uri: first.uri, position: first.range.start };
		} catch (err) {
			console.debug('[context-code-text] NodeCreatorService: Definition lookup threw', err);
			return undefined;
		}
	}

	private async tryGetOutline(uri: vscode.Uri, pos?: vscode.Position) {
		if (!pos) {
			return undefined;
		}
		try {
			const outline = await this.lsp.getOutlineElementFromPosition(uri, pos);
			if (outline) {
				return outline;
			}
		} catch (err) {
			console.debug('[context-code-text] NodeCreatorService: Outline lookup threw', err);
		}
		return undefined;
	}
}

function isLocationLink(value: vscode.Location | vscode.LocationLink): value is vscode.LocationLink {
	return (value as vscode.LocationLink).targetUri !== undefined;
}
