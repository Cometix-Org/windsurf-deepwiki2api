import * as vscode from 'vscode';
import { Caller, OutlineElement, RawWord, ReferenceWithPreview, RichNodeBacking, ServiceRegistry } from './types';
import { makeIdFromRange } from './utils/rangeUtils';

export class RichNode {
	private resolvedOutline?: OutlineElement;

	constructor(private readonly backing: RichNodeBacking, private readonly services: ServiceRegistry) {}

	private isOutlineBacking(backing: RichNodeBacking): backing is OutlineElement {
		return (backing as OutlineElement).symbol !== undefined;
	}

	getCacheKey(): string {
		if (this.isOutlineBacking(this.backing)) {
			return this.backing.id;
		}
		const raw = this.getRawWord();
		return `raw:${raw.word}:${raw.location.uri.toString()}:${makeIdFromRange(raw.location.range)}`;
	}

	equals(other: RichNode): boolean {
		return this.getCacheKey() === other.getCacheKey();
	}

	getName(): string {
		return this.isOutlineBacking(this.backing) ? this.backing.symbol.name : this.getRawWord().word;
	}

	getSelectionRange(): vscode.Range {
		return this.isOutlineBacking(this.backing)
			? this.backing.symbol.selectionRange ?? this.backing.symbol.range
			: this.getRawWord().location.range;
	}

	getRange(): vscode.Range {
		return this.isOutlineBacking(this.backing) ? this.backing.symbol.range : this.getRawWord().location.range;
	}

	getUri(): vscode.Uri {
		return this.isOutlineBacking(this.backing) ? this.backing.uri : this.getRawWord().location.uri;
	}

	getOutlineElement(): OutlineElement {
		const outline = this.getExistingOutline();
		if (!outline) {
			throw new Error('Not an outline element');
		}
		return outline;
	}

	hasOutlineElement(): boolean {
		return this.getExistingOutline() !== undefined;
	}

	async getSymbolKind(): Promise<vscode.SymbolKind> {
		const outline = await this.ensureOutlineElement();
		if (outline) {
			return this.services.lsp.getSymbolKind(outline);
		}
		const raw = this.getRawWord();
		return this.services.lsp.getSymbolKindFromHover(raw.location.uri, raw.location.range.start);
	}

	getTrace() {
		return this.services.trace.getTrace(this);
	}

	async getReferences(): Promise<ReferenceWithPreview[]> {
		const outline = await this.ensureOutlineElement();
		if (outline) {
			return this.services.lsp.getReferences(outline);
		}
		return this.services.lsp.getReferencesAtPosition(this.getUri(), this.getRange().start);
	}

	async getCallers(): Promise<Caller[]> {
		const outline = await this.ensureOutlineElement();
		if (outline) {
			return this.services.lsp.getCallers(outline);
		}
		const raw = this.getRawWord();
		const syntheticOutline = this.createSyntheticOutline(raw);
		return this.services.lsp.getCallersAtPosition(raw.location.uri, raw.location.range.start, syntheticOutline);
	}

	getGrepContext(): Promise<string> {
		return this.services.nodeContext.grepContext(this);
	}

	getQuickGrepContext(): Promise<string> {
		return this.services.nodeContext.quickGrepContext(this);
	}

	getFileContext(): Promise<string> {
		return this.services.nodeContext.nodeFileContext(this);
	}

	getUsageContext(): Promise<string> {
		return this.services.nodeContext.nodeUsageContext(this);
	}

	getTraceContext(): Promise<string> {
		return this.services.nodeContext.nodeTraceContext(this);
	}

	getSummaryContext(): Promise<string> {
		return this.services.nodeContext.nodeSummaryContext(this);
	}

	getArticleContext(): Promise<string> {
		return this.services.nodeContext.nodeArticleContext(this);
	}

	getSymbolKindText(): Promise<string> {
		return this.services.nodeContext.getSymbolKindText(this);
	}

	async ensureOutlineElement(): Promise<OutlineElement | undefined> {
		const existing = this.getExistingOutline();
		if (existing) {
			return existing;
		}
		const raw = this.getRawWord();
		try {
			const defs = await this.services.lsp.getDefinitions(raw.location.uri, raw.location.range.start, 1);
			const first = Array.isArray(defs) ? defs[0] : defs;
			const normalized = normalizeDefinitionTarget(first);
			if (!normalized) {
				return undefined;
			}
			const resolved = await this.services.lsp.getOutlineElementFromPosition(normalized.uri, normalized.position);
			if (resolved) {
				this.resolvedOutline = resolved;
				return resolved;
			}
		} catch {
			// ignore and fall back to raw
		}
		return undefined;
	}

	private getExistingOutline(): OutlineElement | undefined {
		if (this.isOutlineBacking(this.backing)) {
			return this.backing;
		}
		return this.resolvedOutline;
	}

	private getRawWord(): RawWord {
		if (this.isOutlineBacking(this.backing)) {
			throw new Error('Not a raw word');
		}
		return this.backing as RawWord;
	}

	private createSyntheticOutline(raw: RawWord): OutlineElement {
		const range = raw.location.range;
		const symbol = new vscode.DocumentSymbol(raw.word, '', vscode.SymbolKind.Variable, range, range);
		symbol.children = [];
		return {
			id: `raw:${raw.word}:${raw.location.uri.toString()}:${makeIdFromRange(range)}`,
			symbol,
			children: [],
			uri: raw.location.uri
		};
	}
}

function normalizeDefinitionTarget(
	value: vscode.Location | vscode.LocationLink | undefined
): { uri: vscode.Uri; position: vscode.Position } | undefined {
	if (!value) {
		return undefined;
	}
	if (isLocationLink(value)) {
		const targetRange = value.targetSelectionRange ?? value.targetRange;
		return targetRange ? { uri: value.targetUri, position: targetRange.start } : undefined;
	}
	if (!value.range) {
		return undefined;
	}
	return { uri: value.uri, position: value.range.start };
}

function isLocationLink(value: vscode.Location | vscode.LocationLink): value is vscode.LocationLink {
	return (value as vscode.LocationLink).targetUri !== undefined;
}
