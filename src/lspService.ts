import * as vscode from 'vscode';
import { OutlineElement, ReferenceWithPreview, Caller } from './types';
import { OutlineModel, buildOutlineElements } from './outlineModel';
import { containsRange } from './utils/rangeUtils';
import { inferSymbolKind } from './lsp/inferSymbolKind';
import { inferKindFromHover } from './lsp/hoverKind';
import { normalizeReferenceLocation } from './lsp/locations';
import { withTimeout } from './utils/asyncUtils';

export class LspService implements vscode.Disposable {
	private outlineCache = new Map<string, OutlineModel | null>();
	private referencesCache = new Map<string, Promise<ReferenceWithPreview[]>>();
	private callersCache = new Map<string, Promise<Caller[]>>();
	private lspAvailability = new Map<string, boolean>();
	private disposables: vscode.Disposable[] = [];

	private readonly referenceTimeoutMs = 500;
	private readonly providerProbeTimeoutMs = 1000;
	private readonly referenceLimit = 50;
	private readonly callerLimit = 20;

	constructor(
		private readonly commands = vscode.commands,
		private readonly workspace = vscode.workspace
	) {
		this.disposables.push(
			this.workspace.onDidChangeTextDocument(event => this.invalidateForUri(event.document.uri)),
			this.workspace.onDidCloseTextDocument(doc => this.invalidateForUri(doc.uri))
		);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
		this.clearDerivedCaches();
	}

	private invalidateForUri(uri: vscode.Uri): void {
		const key = uri.toString();
		this.outlineCache.delete(key);
		this.lspAvailability.delete(key);
		this.clearDerivedCaches();
	}

	private clearDerivedCaches(): void {
		this.referencesCache.clear();
		this.callersCache.clear();
	}

	private async isLspAvailable(uri: vscode.Uri): Promise<boolean> {
		const key = uri.toString();
		const cached = this.lspAvailability.get(key);
		if (cached !== undefined) {
			return cached;
		}
		try {
			const doc = await this.workspace.openTextDocument(uri);
			const fallbackPosition =
				doc.lineCount > 0
					? doc.validatePosition(new vscode.Position(0, doc.lineAt(0).firstNonWhitespaceCharacterIndex))
					: new vscode.Position(0, 0);
			await withTimeout(
				() => this.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri),
				this.providerProbeTimeoutMs,
				'document symbol provider'
			);
			await withTimeout(
				() =>
					this.commands.executeCommand('vscode.executeDefinitionProvider', uri, fallbackPosition),
				this.providerProbeTimeoutMs,
				'definition provider'
			);
			await withTimeout(
				() =>
					this.commands.executeCommand('vscode.executeReferenceProvider', uri, fallbackPosition),
				this.providerProbeTimeoutMs,
				'reference provider'
			);
			this.lspAvailability.set(key, true);
			return true;
		} catch {
			this.lspAvailability.set(key, false);
			return false;
		}
	}

	async getOutlineModel(uri: vscode.Uri): Promise<OutlineModel | undefined> {
		if (!(await this.isLspAvailable(uri))) {
			return undefined;
		}
		const key = uri.toString();
		const cached = this.outlineCache.get(key);
		if (cached !== undefined) {
			return cached ?? undefined;
		}
		try {
			const symbols = await this.commands.executeCommand<
				(vscode.DocumentSymbol | vscode.SymbolInformation)[]
			>('vscode.executeDocumentSymbolProvider', uri);
			const normalized = this.normalizeDocumentSymbols(symbols, uri);
			if (!normalized.length) {
				this.outlineCache.set(key, null);
				return undefined;
			}
			const model = new OutlineModel(uri, buildOutlineElements(normalized, uri));
			this.outlineCache.set(key, model);
			return model;
		} catch (err) {
			console.warn('[context-code-text] LspService: getOutlineModel failed', err);
			this.outlineCache.set(key, null);
			return undefined;
		}
	}

	async getOutlineElementFromPosition(uri: vscode.Uri, pos: vscode.Position): Promise<OutlineElement | undefined> {
		const model = await this.getOutlineModel(uri);
		return model?.getItemEnclosingPosition(pos);
	}

	async getDefinitions(
		uri: vscode.Uri,
		pos: vscode.Position,
		limit: number
	): Promise<vscode.Definition | undefined> {
		if (!(await this.isLspAvailable(uri))) {
			throw new Error('Cannot get definitions: LSP is not available');
		}

		type DefLike =
			| vscode.Location
			| vscode.Location[]
			| vscode.LocationLink
			| vscode.LocationLink[];

		const raw = (await this.commands.executeCommand<DefLike | undefined>(
			'vscode.executeDefinitionProvider',
			uri,
			pos
		)) as DefLike | undefined;

		if (!raw) {
			return undefined;
		}

		const toLocation = (value: vscode.Location | vscode.LocationLink): vscode.Location => {
			if (value instanceof vscode.Location) {
				return value;
			}
			const range = value.targetSelectionRange ?? value.targetRange;
			return new vscode.Location(value.targetUri, range);
		};

		let locations: vscode.Location[];
		if (Array.isArray(raw)) {
			locations = raw.map(loc => toLocation(loc));
		} else {
			locations = [toLocation(raw)];
		}

		if (!locations.length) {
			return undefined;
		}

		if (limit <= 1) {
			return locations[0];
		}
		if (locations.length > limit) {
			return locations.slice(0, limit);
		}
		return locations;
	}

	async getReferences(elem: OutlineElement): Promise<ReferenceWithPreview[]> {
		const key = elem.id;
		const cached = this.referencesCache.get(key);
		if (cached) {
			return cached;
		}
		const task = this.fetchReferences(elem);
		this.referencesCache.set(key, task);
		return task;
	}

	async getReferencesAtPosition(uri: vscode.Uri, pos: vscode.Position): Promise<ReferenceWithPreview[]> {
		return this.resolveReferencesForLocation(uri, pos);
	}

	getRootUri(elem: OutlineElement): vscode.Uri | undefined {
		let current: OutlineElement | undefined = elem;
		while (current?.parent) {
			current = current.parent;
		}
		return current?.uri;
	}

	async getCallers(elem: OutlineElement): Promise<Caller[]> {
		const key = elem.id;
		const cached = this.callersCache.get(key);
		if (cached) {
			return cached;
		}
		const task = this.fetchCallers(elem);
		this.callersCache.set(key, task);
		return task;
	}

	async getCallersAtPosition(
		uri: vscode.Uri,
		pos: vscode.Position,
		target: OutlineElement
	): Promise<Caller[]> {
		const rootUri = this.getRootUri(target) ?? uri;
		if (!rootUri) {
			return [];
		}
		return this.resolveCallers(target, rootUri, pos);
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

	async getSymbolKindFromHover(uri: vscode.Uri, pos: vscode.Position): Promise<vscode.SymbolKind> {
		const hoverKind = await inferKindFromHover(uri, pos, this.commands);
		return hoverKind ?? vscode.SymbolKind.Function;
	}

	private async fetchReferences(elem: OutlineElement): Promise<ReferenceWithPreview[]> {
		const rootUri = this.getRootUri(elem) ?? elem.uri;
		const position = elem.symbol.selectionRange?.start ?? elem.symbol.range.start;
		return this.resolveReferencesForLocation(rootUri, position);
	}

	private async fetchCallers(elem: OutlineElement): Promise<Caller[]> {
		const rootUri = this.getRootUri(elem) ?? elem.uri;
		const position = elem.symbol.selectionRange?.start ?? elem.symbol.range.start;
		return this.resolveCallers(elem, rootUri, position);
	}

	private async resolveReferencesForLocation(
		rootUri: vscode.Uri,
		position: vscode.Position
	): Promise<ReferenceWithPreview[]> {
		if (!(await this.isLspAvailable(rootUri))) {
			return [];
		}
		let locations: (vscode.Location | vscode.LocationLink)[] = [];
		try {
			const raw = await withTimeout(
				() =>
					this.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
						'vscode.executeReferenceProvider',
						rootUri,
						position
					),
				this.referenceTimeoutMs,
				'reference provider'
			);
			locations = this.extractReferencesArray(raw) ?? [];
		} catch {
			locations = [];
		}

		if (!locations.length) {
			return [];
		}
		if (locations.length > this.referenceLimit) {
			locations = locations.slice(0, this.referenceLimit);
		}

		const normalized = locations
			.map(normalizeReferenceLocation)
			.filter((loc): loc is NonNullable<ReturnType<typeof normalizeReferenceLocation>> => !!loc);

		const documentCache = new Map<string, vscode.TextDocument>();
		const results: ReferenceWithPreview[] = [];
		for (const loc of normalized) {
			const location = new vscode.Location(loc.uri, loc.range);
			const preview = await this.buildPreview(location, documentCache);
			results.push({ location, codePreview: preview });
		}
		return results;
	}

	private async resolveCallers(
		target: OutlineElement,
		rootUri: vscode.Uri,
		position: vscode.Position
	): Promise<Caller[]> {
		const viaCallHierarchy = await this.resolveCallersViaCallHierarchy(target, rootUri, position);
		if (viaCallHierarchy.length) {
			return viaCallHierarchy;
		}
		return this.resolveCallersFromReferences(target, rootUri, position);
	}

	private async resolveCallersViaCallHierarchy(
		target: OutlineElement,
		rootUri: vscode.Uri,
		position: vscode.Position
	): Promise<Caller[]> {
		if (!(await this.isLspAvailable(rootUri))) {
			return [];
		}

		let roots: vscode.CallHierarchyItem[] | undefined;
		try {
			roots = await this.commands.executeCommand<vscode.CallHierarchyItem[]>(
				'vscode.prepareCallHierarchy',
				rootUri,
				position
			);
		} catch {
			return [];
		}

		if (!roots?.length) {
			return [];
		}

		const item = roots[0];
		let incoming: vscode.CallHierarchyIncomingCall[] | undefined;
		try {
			incoming = await this.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
				'vscode.provideIncomingCalls',
				item
			);
		} catch {
			return [];
		}

		if (!incoming?.length) {
			return [];
		}

		const callers: Caller[] = [];

		for (const call of incoming) {
			if (!call.fromRanges?.length) {
				continue;
			}
			const callRange = call.fromRanges[0];
			const fromItem = call.from;

			const model = await this.getOutlineModel(fromItem.uri);
			if (!model) {
				continue;
			}

			const pos = fromItem.selectionRange?.start ?? fromItem.range.start;
			const source = model.getItemEnclosingPosition(pos);
			if (!source || source === target) {
				continue;
			}

			callers.push({
				type: 'CALLS',
				source,
				target,
				targetRange: callRange
			});

			if (callers.length >= this.callerLimit) {
				break;
			}
		}

		return callers;
	}

	private async resolveCallersFromReferences(
		target: OutlineElement,
		rootUri: vscode.Uri,
		position: vscode.Position
	): Promise<Caller[]> {
		const references = await this.resolveReferencesForLocation(rootUri, position);
		if (!references.length) {
			return [];
		}

		const uniqueUris = new Set<string>(references.map(ref => ref.location.uri.toString()));
		await Promise.all(Array.from(uniqueUris).map(uri => this.getOutlineModel(vscode.Uri.parse(uri))));

		const callers: Caller[] = [];
		for (const ref of references) {
			const { uri, range } = ref.location;
			if (
				rootUri.toString() === uri.toString() &&
				containsRange(target.symbol.selectionRange ?? target.symbol.range, range)
			) {
				continue;
			}
			const model = await this.getOutlineModel(uri);
			if (!model) {
				continue;
			}
			const outline = model.getItemEnclosingPosition(range.start);
			if (!outline) {
				continue;
			}
			if (callers.some(caller => caller.source === outline)) {
				continue;
			}
			if (outline === target || containsRange(outline.symbol.selectionRange ?? outline.symbol.range, range)) {
				continue;
			}
			callers.push({
				type: 'CALLS',
				source: outline,
				target,
				targetRange: range
			});
			if (callers.length >= this.callerLimit) {
				break;
			}
		}
		return callers;
	}

	private extractReferencesArray(
		value: unknown
	): (vscode.Location | vscode.LocationLink)[] | undefined {
		if (!value) {
			return undefined;
		}
		if (Array.isArray(value)) {
			return value as (vscode.Location | vscode.LocationLink)[];
		}
		if (Array.isArray((value as { references?: unknown }).references)) {
			return (value as { references: (vscode.Location | vscode.LocationLink)[] }).references;
		}
		return undefined;
	}

	private async buildPreview(
		location: vscode.Location,
		documents: Map<string, vscode.TextDocument>
	): Promise<ReferenceWithPreview['codePreview']> {
		try {
			const key = location.uri.toString();
			let doc = documents.get(key);
			if (!doc) {
				doc = await this.workspace.openTextDocument(location.uri);
				documents.set(key, doc);
			}
			const line = Math.min(location.range.start.line, Math.max(doc.lineCount - 1, 0));
			const textLine = doc.lineAt(line);
			return {
				fullLine: textLine.text,
				matchStart: Math.min(location.range.start.character, textLine.text.length),
				matchEnd: Math.min(location.range.end.character, textLine.text.length)
			};
		} catch {
			return undefined;
		}
	}

	private normalizeDocumentSymbols(
		symbols: (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined,
		uri: vscode.Uri
	): vscode.DocumentSymbol[] {
		if (!symbols || !Array.isArray(symbols)) {
			return [];
		}

		const toDocumentSymbol = (
			sym: vscode.DocumentSymbol | vscode.SymbolInformation
		): vscode.DocumentSymbol | undefined => {
			if (this.isDocumentSymbolLike(sym)) {
				const range = this.toRange(sym.range ?? sym.selectionRange);
				const selection = this.toRange(sym.selectionRange ?? sym.range);
				if (!range || !selection) {
					return undefined;
				}
				const normalized = new vscode.DocumentSymbol(
					sym.name ?? '',
					sym.detail ?? '',
					sym.kind ?? vscode.SymbolKind.Function,
					range,
					selection
				);
				if (sym.tags) {
					normalized.tags = sym.tags;
				}
				normalized.children = (sym.children ?? [])
					.map(child => toDocumentSymbol(child))
					.filter((child): child is vscode.DocumentSymbol => !!child);
				return normalized;
			}
			if (
				this.isSymbolInformationLike(sym) &&
				sym.location?.range &&
				sym.location?.uri?.toString() === uri.toString()
			) {
				const range = this.toRange(sym.location.range);
				if (!range) {
					return undefined;
				}
				const normalized = new vscode.DocumentSymbol(
					sym.name ?? '',
					(sym as { detail?: string }).detail ?? sym.containerName ?? '',
					sym.kind ?? vscode.SymbolKind.Function,
					range,
					range
				);
				if ((sym as { tags?: readonly vscode.SymbolTag[] }).tags) {
					normalized.tags = (sym as { tags: readonly vscode.SymbolTag[] }).tags;
				}
				return normalized;
			}
			return undefined;
		};

		return symbols
			.map(sym => toDocumentSymbol(sym))
			.filter((sym): sym is vscode.DocumentSymbol => !!sym);
	}

	private toRange(rangeLike: vscode.Range | undefined): vscode.Range | undefined {
		if (!rangeLike) {
			return undefined;
		}
		const start = this.toPosition(rangeLike.start);
		const end = this.toPosition(rangeLike.end);
		if (!start || !end) {
			return undefined;
		}
		return new vscode.Range(start, end);
	}

	private toPosition(posLike: vscode.Position | undefined): vscode.Position | undefined {
		if (!posLike) {
			return undefined;
		}
		if (posLike instanceof vscode.Position) {
			return posLike;
		}
		const candidate = posLike as { line?: number; character?: number };
		if (typeof candidate.line === 'number' && typeof candidate.character === 'number') {
			return new vscode.Position(candidate.line, candidate.character);
		}
		return undefined;
	}

	private isDocumentSymbolLike(sym: unknown): sym is vscode.DocumentSymbol {
		const candidate = sym as vscode.DocumentSymbol | undefined;
		return !!candidate?.name;
	}

	private isSymbolInformationLike(sym: unknown): sym is vscode.SymbolInformation {
		const candidate = sym as vscode.SymbolInformation | undefined;
		return !!candidate?.name && !!candidate?.location;
	}
}
