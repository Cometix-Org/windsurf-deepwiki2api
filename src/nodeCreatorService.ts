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
		try {
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
		} catch (err) {
			console.debug('[context-code-text] NodeCreatorService: getRichNode failed', err);
			return undefined;
		}
	}

	getRichNodeFromOutlineElement(elem: import('./types').OutlineElement): RichNode {
		return new RichNode(elem, this.ensureServices());
	}

	private async resolveOutline(uri: vscode.Uri, pos: vscode.Position) {
		// Prefer going through definition to resolve the canonical symbol, then map to its document symbols.
		let normalized: { uri: vscode.Uri; position: vscode.Position } | undefined;
		try {
			normalized = await this.tryNormalizeDefinition(uri, pos);
		} catch (err) {
			console.debug('[context-code-text] NodeCreatorService: tryNormalizeDefinition failed', err);
			normalized = undefined;
		}
		
		if (normalized?.position) {
			let outline: import('./types').OutlineElement | undefined;
			try {
				outline = await this.tryGetOutline(normalized.uri, normalized.position);
			} catch (err) {
				console.debug('[context-code-text] NodeCreatorService: Outline lookup at definition location failed', err);
				outline = undefined;
			}
			
			if (outline) {
				return outline;
			}
			console.debug('[context-code-text] NodeCreatorService: Outline lookup at definition location failed');
		} else {
			console.debug('[context-code-text] NodeCreatorService: Definition lookup returned no result');
		}
		
		// Fallback: try outline in the current document at the caret position.
		let fallback: import('./types').OutlineElement | undefined;
		try {
			fallback = await this.tryGetOutline(uri, pos);
		} catch (err) {
			console.debug('[context-code-text] NodeCreatorService: Outline lookup at caret position failed', err);
			fallback = undefined;
		}
		
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
			// Re-throw LSP unavailable errors so they can be handled at higher level
			if (err instanceof Error && (err.message.includes('LSP is not available') || err.message.includes('Cannot get definitions: LSP is not available'))) {
				throw err;
			}
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
