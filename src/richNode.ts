import * as vscode from 'vscode';
import { RichNodeBacking, OutlineElement, ReferenceWithPreview, Caller, ServiceRegistry } from './types';
import { containsPosition, makeIdFromRange } from './utils/rangeUtils';

export class RichNode {
	constructor(private readonly backing: RichNodeBacking, private readonly services: ServiceRegistry) {}

	getCacheKey(): string {
		if (this.hasOutlineElement()) {
			return this.getOutlineElement().id;
		}
		const loc = (this.backing as any).location;
		const range: vscode.Range = loc.range;
		return `${(this.backing as any).word}:${loc.uri.toString()}:${makeIdFromRange(range)}`;
	}

	equals(other: RichNode): boolean {
		return this.getCacheKey() === other.getCacheKey();
	}

	getName(): string {
		return this.hasOutlineElement() ? this.getOutlineElement().symbol.name : (this.backing as any).word;
	}

	getSelectionRange(): vscode.Range {
		return this.hasOutlineElement()
			? this.getOutlineElement().symbol.selectionRange ?? this.getOutlineElement().symbol.range
			: (this.backing as any).location.range;
	}

	getRange(): vscode.Range {
		return this.hasOutlineElement() ? this.getOutlineElement().symbol.range : (this.backing as any).location.range;
	}

	getUri(): vscode.Uri {
		return this.hasOutlineElement() ? this.getOutlineElement().uri : (this.backing as any).location.uri;
	}

	getOutlineElement(): OutlineElement {
		if (!this.hasOutlineElement()) {
			throw new Error('Not an outline element');
		}
		return this.backing as OutlineElement;
	}

	hasOutlineElement(): boolean {
		return (this.backing as OutlineElement).symbol !== undefined;
	}

	getSymbolKind(): Promise<vscode.SymbolKind> {
		return this.hasOutlineElement()
			? this.services.lsp.getSymbolKind(this.getOutlineElement())
			: Promise.resolve(vscode.SymbolKind.Function);
	}

	getTrace() {
		return this.services.trace.getTrace(this);
	}

	getReferences(): Promise<ReferenceWithPreview[]> {
		return this.hasOutlineElement()
			? this.services.lsp.getReferences(this.getOutlineElement())
			: Promise.resolve([]);
	}

	getCallers(): Promise<Caller[]> {
		return this.hasOutlineElement() ? this.services.lsp.getCallers(this.getOutlineElement()) : Promise.resolve([]);
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
}
