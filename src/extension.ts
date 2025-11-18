import * as vscode from 'vscode';

type RawWord = {
	word: string;
	location: {
		uri: vscode.Uri;
		range: vscode.Range;
	};
};

type OutlineElement = {
	id: string;
	symbol: vscode.DocumentSymbol;
	parent?: OutlineElement;
	children: OutlineElement[];
	uri: vscode.Uri;
};

type RichNodeBacking = OutlineElement | RawWord;

type ReferenceWithPreview = {
	location: vscode.Location;
	codePreview?: {
		fullLine: string;
		matchStart: number;
		matchEnd: number;
	};
};

type Caller = {
	type: 'CALLS' | 'UNKNOWN';
	source: OutlineElement;
	target: OutlineElement;
	targetRange: vscode.Range;
};

type TraceNode = {
	richNode: RichNode;
	parentCandidates: OutlineElement[];
	parentIndex: number;
};

type TraceResult = { trace: TraceNode[] };

function containsRange(outer: vscode.Range, inner: vscode.Range): boolean {
	return outer.start.isBeforeOrEqual(inner.start) && outer.end.isAfterOrEqual(inner.end);
}

function rangesEqual(a: vscode.Range, b: vscode.Range): boolean {
	return a.start.isEqual(b.start) && a.end.isEqual(b.end);
}

function containsPosition(range: vscode.Range, pos: vscode.Position): boolean {
	return range.start.isBeforeOrEqual(pos) && range.end.isAfterOrEqual(pos);
}

function makeIdFromRange(range: vscode.Range): string {
	return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

class OutlineModel {
	constructor(public readonly uri: vscode.Uri, public readonly roots: OutlineElement[]) {}

	getItemEnclosingPosition(pos: vscode.Position): OutlineElement | undefined {
		const find = (nodes: OutlineElement[]): OutlineElement | undefined => {
			for (const n of nodes) {
				if (containsPosition(n.symbol.range, pos)) {
					const child = find(n.children);
					return child ?? n;
				}
			}
			return undefined;
		};
		return find(this.roots);
	}
}

class LspService {
	private outlineCache = new Map<string, OutlineModel>();

	constructor(
		private readonly commands = vscode.commands,
		private readonly workspace = vscode.workspace,
		private readonly languages = vscode.languages
	) {}

	private async isLspAvailable(uri: vscode.Uri): Promise<boolean> {
		try {
			const doc = await this.workspace.openTextDocument(uri);
			const defs = this.languages.getDefinitionProvider ? this.languages.getDefinitionProvider(doc) : [];
			const refs = this.languages.getReferenceProvider ? this.languages.getReferenceProvider(doc) : [];
			const syms = this.languages.getDocumentSymbolProvider
				? this.languages.getDocumentSymbolProvider(doc)
				: [];
			if (!defs || defs.length === 0) return false;
			if (!refs || refs.length === 0) return false;
			if (!syms || syms.length === 0) return false;
			return true;
		} catch {
			return false;
		}
	}

	async getOutlineModel(uri: vscode.Uri): Promise<OutlineModel> {
		if (!(await this.isLspAvailable(uri))) {
			throw new Error('Cannot get outline model: LSP is not available');
		}
		const key = uri.toString();
		const cached = this.outlineCache.get(key);
		if (cached) return cached;
		const symbols = await this.commands.executeCommand<vscode.DocumentSymbol[]>(
			'_executeDocumentSymbolProvider',
			uri
		);
		if (!symbols) {
			throw new Error('No document symbols returned');
		}
		const roots = buildOutlineElements(symbols, uri);
		const model = new OutlineModel(uri, roots);
		this.outlineCache.set(key, model);
		return model;
	}

	async getOutlineElementFromPosition(uri: vscode.Uri, pos: vscode.Position): Promise<OutlineElement | undefined> {
		const model = await this.getOutlineModel(uri);
		return model.getItemEnclosingPosition(pos);
	}

	private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
		let handle: NodeJS.Timeout;
		const timeout = new Promise<never>((_, reject) => {
			handle = setTimeout(() => reject(new Error('Timed out')), ms);
		});
		const result = (await Promise.race([promise, timeout])) as T;
		clearTimeout(handle!);
		return result;
	}

	async getDefinitions(uri: vscode.Uri, pos: vscode.Position, timeoutMs = 300): Promise<vscode.Location[]> {
		if (!(await this.isLspAvailable(uri))) throw new Error('Cannot get definitions: LSP unavailable');
		const defs = await this.withTimeout(
			this.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
				'_executeDefinitionProvider',
				uri,
				pos
			),
			timeoutMs
		);
		if (!defs) return [];
		const normalized: vscode.Location[] = [];
		for (const d of defs as any[]) {
			if ('targetUri' in d) {
				const link = d as vscode.LocationLink;
				normalized.push(new vscode.Location(link.targetUri, link.targetSelectionRange ?? link.targetRange));
			} else if ('uri' in d) {
				const loc = d as vscode.Location;
				normalized.push(loc);
			}
		}
		normalized.sort((a, b) => {
			const uriCmp = a.uri.toString().localeCompare(b.uri.toString());
			if (uriCmp !== 0) return uriCmp;
			const lineCmp = a.range.start.line - b.range.start.line;
			if (lineCmp !== 0) return lineCmp;
			return a.range.start.character - b.range.start.character;
		});
		const dedup: vscode.Location[] = [];
		for (const n of normalized) {
			if (!dedup.some(o => o.uri.toString() === n.uri.toString() && rangesEqual(o.range, n.range))) {
				dedup.push(n);
			}
		}
		return dedup;
	}

	async getReferences(elem: OutlineElement): Promise<ReferenceWithPreview[]> {
		const rootUri = this.getRootUri(elem);
		if (!rootUri || !(await this.isLspAvailable(rootUri))) {
			throw new Error('Cannot get references: LSP unavailable');
		}
		const position = elem.symbol.selectionRange.start;
		const results =
			(await this.commands.executeCommand<{ references?: vscode.Location[] }>(
				'_executeReferenceProvider',
				rootUri,
				position
			))?.references || [];
		const limit = 50;
		const trimmed = results.length > limit ? results.slice(0, limit) : results;
		return Promise.all(
			trimmed.map(async loc => {
				const preview = await this.previewLine(loc.uri, loc.range);
				return { location: loc, codePreview: preview };
			})
		);
	}

	private async previewLine(uri: vscode.Uri, range: vscode.Range) {
		try {
			const doc = await this.workspace.openTextDocument(uri);
			if (range.start.line >= doc.lineCount) return;
			const fullLine = doc.lineAt(range.start.line).text;
			return {
				fullLine,
				matchStart: range.start.character,
				matchEnd: range.end.character
			};
		} catch {
			return;
		}
	}

	private getRootUri(elem: OutlineElement): vscode.Uri | undefined {
		let cur: OutlineElement | undefined = elem;
		while (cur?.parent) cur = cur.parent;
		return cur?.uri;
	}

	private async ensureOutlineModels(uris: Set<string>): Promise<void> {
		await Promise.all(Array.from(uris).map(u => this.getOutlineModel(vscode.Uri.parse(u))));
	}

	async getCallers(elem: OutlineElement): Promise<Caller[]> {
		const rootUri = this.getRootUri(elem);
		if (!rootUri || !(await this.isLspAvailable(rootUri))) {
			throw new Error('Cannot get callers: LSP unavailable');
		}
		const refs = await this.getReferences(elem);
		const uriSet = new Set(refs.map(r => r.location.uri.toString()));
		await this.ensureOutlineModels(uriSet);

		const callers: Caller[] = [];
		for (const ref of refs) {
			const loc = ref.location;
			const model = this.outlineCache.get(loc.uri.toString());
			if (!model) continue;
			const pos = loc.range.start;
			const outline = model.getItemEnclosingPosition(pos);
			if (!outline) continue;
			if (
				rootUri.toString() === loc.uri.toString() &&
				containsRange(elem.symbol.selectionRange ?? elem.symbol.range, loc.range)
			) {
				continue;
			}
			if (callers.some(c => c.source === outline)) continue;
			const isCall = true;
			callers.push({
				type: isCall ? 'CALLS' : 'UNKNOWN',
				source: outline,
				target: elem,
				targetRange: loc.range
			});
			if (callers.length >= 20) break;
		}
		return callers;
	}

	async getSymbolKind(elem: OutlineElement): Promise<vscode.SymbolKind> {
		const baseKind = elem.symbol.kind;
		if (baseKind !== vscode.SymbolKind.Function) return baseKind;
		const rootUri = this.getRootUri(elem);
		if (!rootUri || !(await this.isLspAvailable(rootUri))) return baseKind;
		const name = elem.symbol.name;
		const range = elem.symbol.range;
		const pos = elem.symbol.selectionRange?.start ?? range.start;
		let inferred = vscode.SymbolKind.Function;
		try {
			const defs = await this.getDefinitions(rootUri, pos, 300);
			if (defs && defs.length > 0) {
				const first = defs[0];
				const symbols = await this.commands.executeCommand<any>(
					'_executeDocumentSymbolProvider',
					first.uri
				);
				if (symbols && symbols.length > 0) {
					const findMatching = (list: any[], targetRange: vscode.Range): any | null => {
						for (const s of list) {
							const r: vscode.Range = s.range || s.location?.range;
							if (r && containsPosition(r, targetRange.start)) {
								if (s.children && s.children.length > 0) {
									const child = findMatching(s.children, targetRange);
									if (child) return child;
								}
								if (s.name === name) return s;
							}
						}
						return null;
					};
					const match = findMatching(symbols, first.range);
					if (match?.kind) inferred = match.kind;
				}
			}
		} catch {
			// ignore
		}

		if (inferred === vscode.SymbolKind.Function) {
			try {
				const hover = await this.commands.executeCommand<any>(
					'_executeHoverProvider',
					rootUri,
					pos
				);
				const contents = hover?.[0]?.contents ?? [];
				if (contents.length > 0) {
					const first = contents[0];
					const text = typeof first === 'string' ? first : first?.value ?? '';
					if (
						text.includes('function') ||
						text.includes('def ') ||
						text.includes('func ') ||
						text.includes('method')
					) {
						inferred = vscode.SymbolKind.Method;
					} else if (text.includes('class ')) {
						inferred = vscode.SymbolKind.Class;
					} else if (
						text.includes('const ') ||
						text.includes('let ') ||
						text.includes('var ')
					) {
						inferred = vscode.SymbolKind.Variable;
					}
				}
			} catch {
				// ignore
			}
		}

		if (inferred === vscode.SymbolKind.Function) {
			try {
				const symbols = await this.commands.executeCommand<any>(
					'_executeDocumentSymbolProvider',
					rootUri
				);
				if (symbols && symbols.length > 0) {
					const findByName = (list: any[], n: string): any | null => {
						for (const s of list) {
							if (s.name === n) return s;
							if (s.children && s.children.length > 0) {
								const child = findByName(s.children, n);
								if (child) return child;
							}
						}
						return null;
					};
					const match = findByName(symbols, name);
					if (match?.kind) inferred = match.kind;
				}
			} catch {
				// ignore
			}
		}

		return inferred;
	}
}

class NodeScoreService {
	calculateOutlineElementScore(elem: OutlineElement): number {
		return elem.children.length;
	}
}

class NodeCreatorService {
	constructor(private readonly lsp: LspService) {}

	async getRichNode(uri: vscode.Uri, pos: vscode.Position): Promise<RichNode | undefined> {
		const doc = await vscode.workspace.openTextDocument(uri);
		const wordRange = doc.getWordRangeAtPosition(pos);
		if (!wordRange) return;
		const word = doc.getText(wordRange);

		let defUri: vscode.Uri | undefined;
		let defPos: vscode.Position | undefined;
		try {
			const defs = await this.lsp.getDefinitions(uri, pos, 300);
			if (defs && defs.length > 0) {
				defUri = defs[0].uri;
				defPos = defs[0].range.start;
			}
		} catch {
			// ignore
		}

		if (!defUri || !defPos) {
			return new RichNode({ word, location: { uri, range: new vscode.Range(wordRange.start, wordRange.end) } });
		}

		try {
			const outline = await this.lsp.getOutlineElementFromPosition(defUri, defPos);
			if (outline && containsPosition(outline.symbol.selectionRange ?? outline.symbol.range, defPos)) {
				return new RichNode(outline);
			}
			if (outline) {
				return new RichNode(outline);
			}
		} catch {
			// ignore
		}

		return new RichNode({ word, location: { uri, range: new vscode.Range(wordRange.start, wordRange.end) } });
	}

	getRichNodeFromOutlineElement(elem: OutlineElement): RichNode {
		return new RichNode(elem);
	}
}

class TraceService {
	constructor(
		private readonly score: NodeScoreService,
		private readonly nodeCreator: NodeCreatorService
	) {}

	async getTrace(node: RichNode): Promise<TraceResult> {
		return { trace: await this.build(node, new Set(), 5) };
	}

	private async build(
		node: RichNode,
		visited: Set<string>,
		depth: number
	): Promise<TraceNode[]> {
		if (depth <= 0) return [{ richNode: node, parentCandidates: [], parentIndex: -1 }];
		const key = node.getCacheKey();
		if (visited.has(key)) {
			return [{ richNode: node, parentCandidates: [], parentIndex: -1 }];
		}
		visited.add(key);
		const callers = await node.getCallers();
		if (callers.length === 0) {
			return [{ richNode: node, parentCandidates: [], parentIndex: -1 }];
		}
		const scored = await Promise.all(
			callers.map(async c => ({
				node: c.source,
				quality: this.score.calculateOutlineElementScore(c.source)
			}))
		);
		scored.sort((a, b) => b.quality - a.quality);
		const best = scored[0];
		const parentRich = this.nodeCreator.getRichNodeFromOutlineElement(best.node);
		const rest = await this.build(parentRich, visited, depth - 1);
		return [
			{
				richNode: node,
				parentCandidates: scored.map(s => s.node),
				parentIndex: 0
			},
			...rest
		];
	}
}

class RichNode {
	private a: LspService;
	private traceService: TraceService;
	private nodeContextService: NodeContextService;
	constructor(private readonly backing: RichNodeBacking) {
		this.a = lspSingleton;
		this.traceService = traceSingleton;
		this.nodeContextService = nodeContextSingleton;
	}

	getCacheKey(): string {
		if (this.hasOutlineElement()) {
			return this.getOutlineElement().id;
		}
		const loc = (this.backing as RawWord).location;
		const r = loc.range;
		return `${(this.backing as RawWord).word}:${loc.uri.toString()}:${makeIdFromRange(r)}`;
	}

	equals(other: RichNode): boolean {
		return this.getCacheKey() === other.getCacheKey();
	}

	getName(): string {
		return this.hasOutlineElement() ? this.getOutlineElement().symbol.name : (this.backing as RawWord).word;
	}

	getSelectionRange(): vscode.Range {
		return this.hasOutlineElement()
			? this.getOutlineElement().symbol.selectionRange ?? this.getOutlineElement().symbol.range
			: (this.backing as RawWord).location.range;
	}

	getRange(): vscode.Range {
		return this.hasOutlineElement()
			? this.getOutlineElement().symbol.range
			: (this.backing as RawWord).location.range;
	}

	getUri(): vscode.Uri {
		if (this.hasOutlineElement()) {
			return this.getOutlineElement().uri;
		}
		return (this.backing as RawWord).location.uri;
	}

	getOutlineElement(): OutlineElement {
		if (!this.hasOutlineElement()) throw new Error('Not an outline element');
		return this.backing as OutlineElement;
	}

	hasOutlineElement(): boolean {
		return (this.backing as any).symbol !== undefined;
	}

	getSymbolKind(): Promise<vscode.SymbolKind> {
		return this.hasOutlineElement()
			? this.a.getSymbolKind(this.getOutlineElement())
			: Promise.resolve(vscode.SymbolKind.Function);
	}

	getTrace(): Promise<TraceResult> {
		return this.traceService.getTrace(this);
	}

	getReferences(): Promise<ReferenceWithPreview[]> {
		return this.hasOutlineElement()
			? this.a.getReferences(this.getOutlineElement())
			: Promise.resolve([]);
	}

	getCallers(): Promise<Caller[]> {
		return this.hasOutlineElement()
			? this.a.getCallers(this.getOutlineElement())
			: Promise.resolve([]);
	}

	getGrepContext(): Promise<string> {
		return this.nodeContextService.grepContext(this);
	}

	getQuickGrepContext(): Promise<string> {
		return this.nodeContextService.quickGrepContext(this);
	}

	getFileContext(): Promise<string> {
		return this.nodeContextService.nodeFileContext(this);
	}

	getUsageContext(): Promise<string> {
		return this.nodeContextService.nodeUsageContext(this);
	}

	getTraceContext(): Promise<string> {
		return this.nodeContextService.nodeTraceContext(this);
	}

	getSummaryContext(): Promise<string> {
		return this.nodeContextService.nodeSummaryContext(this);
	}

	getArticleContext(): Promise<string> {
		return this.nodeContextService.nodeArticleContext(this);
	}

	getSymbolKindText(): Promise<string> {
		return this.nodeContextService.getSymbolKindText(this);
	}
}

const lspSingleton = new LspService(vscode.commands, vscode.workspace, vscode.languages);
const nodeScoreSingleton = new NodeScoreService();
const nodeCreatorSingleton = new NodeCreatorService(lspSingleton);
let traceSingleton = new TraceService(nodeScoreSingleton, nodeCreatorSingleton);
let nodeContextSingleton: NodeContextService;

class NodeContextService {
	constructor(
		private readonly nodeCreator: NodeCreatorService,
		private readonly output?: vscode.OutputChannel
	) {}

	async quickGrepContext(node: RichNode): Promise<string> {
		return this.doGrep(node, 'quick');
	}

	async grepContext(node: RichNode): Promise<string> {
		return this.doGrep(node, 'full');
	}

	private async doGrep(node: RichNode, mode: 'quick' | 'full'): Promise<string> {
		try {
			const symbol = node.getName();
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(node.getUri());
			const title =
				mode === 'quick'
					? `=== Quick Grep Results for '${symbol}' ===`
					: `=== Grep Results for '${symbol}' ===`;
			const scopeDescription =
				mode === 'quick'
					? 'Quick search (parent folder only)'
					: 'Full workspace search';
			const matches: {
				resource: vscode.Uri;
				line: number;
				range: vscode.Range;
			}[] = [];

			const options: vscode.FindTextInFilesOptions = {
				include: mode === 'quick' && workspaceFolder ? new vscode.RelativePattern(workspaceFolder, '**/*') : undefined,
				useDefaultExcludes: true
			};

			await vscode.workspace.findTextInFiles({ pattern: symbol }, options, result => {
				for (const range of result.ranges) {
					matches.push({ resource: result.uri, line: range.start.line, range });
				}
			});

			if (matches.length === 0) return `No grep results found for '${symbol}'.`;

			const maxFiles = 12;
			const maxChars = 200;
			const lines: string[] = [];
			lines.push(title);
			lines.push(`Search query: ${symbol}`);
			lines.push(`${scopeDescription}: Found ${matches.length} match(es)`);
			lines.push('');

			const byFile = new Map<string, typeof matches>();
			for (const m of matches) {
				const key = m.resource.toString();
				if (!byFile.has(key)) byFile.set(key, []);
				byFile.get(key)!.push(m);
			}

			let shownFiles = 0;
			for (const [, ms] of byFile) {
				if (shownFiles >= maxFiles) {
					lines.push('... and more matches...');
					break;
				}
				const m0 = ms[0];
				const doc = await vscode.workspace.openTextDocument(m0.resource);
				lines.push(
					`${m0.resource.fsPath} (${ms.length} matches, showing context around first match)`
				);
				const r = ms[0].range;
				const start = Math.max(0, r.start.line - 10);
				const end = Math.min(doc.lineCount - 1, r.end.line + 10);
				lines.push(renderFileSlice(doc, start, end, maxChars, 200));
				lines.push('');
				shownFiles += 1;
			}

			return lines.join('\n');
		} catch (err) {
			return `Error retrieving ${mode === 'quick' ? 'quick ' : ''}grep results: ${
				err instanceof Error ? err.message : 'Unknown error'
			}`;
		}
	}

	async nodeFileContext(node: RichNode): Promise<string> {
		try {
			const uri = node.getUri();
			const range = node.getRange();
			const name = node.getName();
			const lines: string[] = [];
			lines.push(`=== File Context for '${name}' ===`);
			lines.push(`This is the file where the symbol '${name}' is defined.`);
			lines.push('');
			const doc = await vscode.workspace.openTextDocument(uri);
			const total = doc.lineCount;
			let start: number;
			let end: number;
			if (total <= 400) {
				start = 0;
				end = total - 1;
				lines.push('Showing entire file:');
			} else {
				const padding = 100;
				start = Math.max(0, range.start.line - padding);
				end = Math.min(total - 1, range.end.line + padding);
				lines.push(
					`Showing ${end - start + 1} lines around the symbol (lines ${start + 1}-${end + 1}):`
				);
			}
			lines.push('');
			lines.push(renderFileSlice(doc, start, end));
			lines.push('');
			lines.push(`=== Symbol Range: ${name} ===`);
			lines.push(
				`The symbol '${name}' itself is defined at lines ${range.start.line + 1}-${range.end.line + 1}:`
			);
			lines.push('');
			lines.push(renderFileSlice(doc, range.start.line, range.end.line));
			return lines.join('\n');
		} catch (err) {
			return `Error getting file context for ${node.getName()}: ${
				err instanceof Error ? err.message : 'Unknown error'
			}`;
		}
	}

	async nodeUsageContext(node: RichNode): Promise<string> {
		try {
			const name = node.getName();
			const parts: string[] = [];
			parts.push(`=== Usage Context for '${name}' ===`);
			const callers = await node.getCallers();
			const refs = await node.getReferences();
			parts.push(`Found ${callers.length} caller(s) and ${refs.length} reference(s).`);
			parts.push('');

			if (callers.length > 0) {
				parts.push('=== Callers ===');
				const limit = Math.min(3, callers.length);
				for (let i = 0; i < limit; i++) {
					const c = callers[i];
					const callerName = c.source.symbol.name;
					parts.push(`Caller ${i + 1}: ${callerName}`);
					const targetRange = c.targetRange;
					const start = Math.max(0, targetRange.start.line - 4);
					const end = targetRange.end.line + 4;
					const doc = await vscode.workspace.openTextDocument(c.source.uri);
					parts.push(renderFileSlice(doc, start, end));
					parts.push('');
				}
				if (callers.length > 3) {
					parts.push(`... and ${callers.length - 3} more caller(s)`);
					parts.push('');
				}
			}

			if (refs.length > 0) {
				parts.push('=== References ===');
				const limit = Math.min(10, refs.length);
				for (let i = 0; i < limit; i++) {
					const r = refs[i];
					const uri = r.location.uri;
					const range = r.location.range;
					parts.push(`Reference ${i + 1}: ${uri.fsPath}:${range.start.line + 1}`);
					const start = Math.max(0, range.start.line - 4);
					const end = range.end.line + 4;
					const doc = await vscode.workspace.openTextDocument(uri);
					parts.push(renderFileSlice(doc, start, end));
					parts.push('');
				}
				if (refs.length > 10) {
					parts.push(`... and ${refs.length - 10} more reference(s)`);
				}
			}

			if (callers.length === 0 && refs.length === 0) {
				parts.push('No callers or references found for this symbol.');
			}

			return parts.join('\n');
		} catch (err) {
			return `Error getting usage context for ${node.getName()}: ${
				err instanceof Error ? err.message : 'Unknown error'
			}`;
		}
	}

	async nodeTraceContext(node: RichNode): Promise<string> {
		try {
			const name = node.getName();
			const lines: string[] = [];
			lines.push(`=== Trace Context for '${name}' ===`);
			const trace = (await node.getTrace()).trace;
			if (trace.length === 0) {
				lines.push('No trace path found for this symbol.');
				return lines.join('\n');
			}
			lines.push(`Found trace path with ${trace.length} node(s):`);
			lines.push('');
			for (let i = 0; i < trace.length; i++) {
				const tn = trace[i];
				const rn = tn.richNode;
				const rname = rn.getName();
				const uri = rn.getUri();
				const range = rn.getRange();
				const indent = '  '.repeat(i);
				lines.push(`${indent}${i + 1}. ${rname} (${uri.fsPath}:${range.start.line + 1})`);
				if (tn.parentCandidates.length > 0) {
					const parents = tn.parentCandidates.map(p => p.symbol.name).join(', ');
					lines.push(`${indent}   Parent candidates: ${parents}`);
					lines.push(`${indent}   Selected parent index: ${tn.parentIndex}`);
				}
				const start = Math.max(0, range.start.line - 2);
				const end = range.end.line + 2;
				try {
					const doc = await vscode.workspace.openTextDocument(uri);
					const slice = renderFileSlice(doc, start, end);
					for (const line of slice.split('\n')) {
						if (line.trim()) lines.push(`${indent}   ${line}`);
					}
				} catch (err) {
					lines.push(
						`${indent}   (Error getting context: ${err instanceof Error ? err.message : 'Unknown error'})`
					);
				}
				lines.push('');
			}
			return lines.join('\n');
		} catch (err) {
			return `Error getting trace context for ${node.getName()}: ${
				err instanceof Error ? err.message : 'Unknown error'
			}`;
		}
	}

	async nodeArticleContext(node: RichNode): Promise<string> {
		const parts = await Promise.all([
			node.getFileContext(),
			node.getUsageContext(),
			node.getGrepContext(),
			node.getTraceContext()
		]);
		return parts
			.filter(p => p !== '')
			.join('\n' + '='.repeat(40) + '\n');
	}

	async nodeSummaryContext(node: RichNode): Promise<string> {
		const parts = await Promise.all([
			node.getFileContext(),
			node.getUsageContext(),
			node.getTraceContext(),
			node.getQuickGrepContext()
		]);
		return parts
			.filter(p => p !== '')
			.join('\n' + '='.repeat(40) + '\n');
	}

	async getSymbolKindText(node: RichNode): Promise<string> {
		const kind = await node.getSymbolKind();
		return mapSymbolKindToDeepWiki(kind);
	}
}

function mapSymbolKindToDeepWiki(kind: vscode.SymbolKind): string {
	switch (kind) {
		case vscode.SymbolKind.File:
			return 'DEEP_WIKI_SYMBOL_TYPE_FILE';
		case vscode.SymbolKind.Module:
			return 'DEEP_WIKI_SYMBOL_TYPE_MODULE';
		case vscode.SymbolKind.Namespace:
			return 'DEEP_WIKI_SYMBOL_TYPE_NAMESPACE';
		case vscode.SymbolKind.Package:
			return 'DEEP_WIKI_SYMBOL_TYPE_PACKAGE';
		case vscode.SymbolKind.Class:
			return 'DEEP_WIKI_SYMBOL_TYPE_CLASS';
		case vscode.SymbolKind.Method:
			return 'DEEP_WIKI_SYMBOL_TYPE_METHOD';
		case vscode.SymbolKind.Property:
			return 'DEEP_WIKI_SYMBOL_TYPE_PROPERTY';
		case vscode.SymbolKind.Field:
			return 'DEEP_WIKI_SYMBOL_TYPE_FIELD';
		case vscode.SymbolKind.Constructor:
			return 'DEEP_WIKI_SYMBOL_TYPE_CONSTRUCTOR';
		case vscode.SymbolKind.Enum:
			return 'DEEP_WIKI_SYMBOL_TYPE_ENUM';
		case vscode.SymbolKind.Interface:
			return 'DEEP_WIKI_SYMBOL_TYPE_INTERFACE';
		case vscode.SymbolKind.Function:
			return 'DEEP_WIKI_SYMBOL_TYPE_FUNCTION';
		case vscode.SymbolKind.Variable:
			return 'DEEP_WIKI_SYMBOL_TYPE_VARIABLE';
		case vscode.SymbolKind.Constant:
			return 'DEEP_WIKI_SYMBOL_TYPE_CONSTANT';
		case vscode.SymbolKind.String:
			return 'DEEP_WIKI_SYMBOL_TYPE_STRING';
		case vscode.SymbolKind.Number:
			return 'DEEP_WIKI_SYMBOL_TYPE_NUMBER';
		case vscode.SymbolKind.Boolean:
			return 'DEEP_WIKI_SYMBOL_TYPE_BOOLEAN';
		case vscode.SymbolKind.Array:
			return 'DEEP_WIKI_SYMBOL_TYPE_ARRAY';
		case vscode.SymbolKind.Object:
			return 'DEEP_WIKI_SYMBOL_TYPE_OBJECT';
		case vscode.SymbolKind.Key:
			return 'DEEP_WIKI_SYMBOL_TYPE_KEY';
		case vscode.SymbolKind.Null:
			return 'DEEP_WIKI_SYMBOL_TYPE_NULL';
		case vscode.SymbolKind.EnumMember:
			return 'DEEP_WIKI_SYMBOL_TYPE_ENUM_MEMBER';
		case vscode.SymbolKind.Struct:
			return 'DEEP_WIKI_SYMBOL_TYPE_STRUCT';
		case vscode.SymbolKind.Event:
			return 'DEEP_WIKI_SYMBOL_TYPE_EVENT';
		case vscode.SymbolKind.Operator:
			return 'DEEP_WIKI_SYMBOL_TYPE_OPERATOR';
		case vscode.SymbolKind.TypeParameter:
			return 'DEEP_WIKI_SYMBOL_TYPE_TYPE_PARAMETER';
		default:
			return 'DEEP_WIKI_SYMBOL_TYPE_UNSPECIFIED';
	}
}

function truncateByIndent(lines: [string, number][], maxLines: number): [string, number][] {
	if (lines.length <= maxLines) {
		return lines;
	}

	const indentCount = new Map<number, number>();
	const lineIndentCache = new Map<number, number>();

	const computeIndent = (line: string, index: number): number => {
		let indent = 0;
		if (/^\s*$/.test(line)) {
			indent = lineIndentCache.get(index - 1) ?? 0;
		} else {
			const match = line.match(/^\s*/);
			indent = match ? match[0].length : 0;
		}
		lineIndentCache.set(index, indent);
		return indent;
	};

	for (let i = 0; i < lines.length; i++) {
		const [line] = lines[i];
		const indent = computeIndent(line, i);
		indentCount.set(indent, (indentCount.get(indent) ?? 0) + 1);
	}

	let keptIndent = 0;
	let nextIndent = -1;
	let kept = 0;

	for (const [indent, count] of indentCount) {
		if (kept + count <= maxLines) {
			keptIndent = indent;
			kept += count;
		} else {
			nextIndent = indent;
			break;
		}
	}

	const result: [string, number][] = [];
	for (let i = 0; i < lines.length; i++) {
		const [line, number] = lines[i];
		const indent = computeIndent(line, i);
		if (indent <= keptIndent) {
			result.push([line, number]);
		} else if (indent === nextIndent && kept < maxLines) {
			result.push([line, number]);
			kept += 1;
		}
	}

	return result;
}

function renderFileSlice(
	document: vscode.TextDocument,
	startLine: number,
	endLine: number,
	maxLineLength = 200,
	maxLines = 300
): string {
	const lines: [string, number][] = [];
	for (let line = startLine; line <= endLine; line++) {
		const text = document.lineAt(line).text;
		lines.push([text, line + 1]);
	}

	const truncated = truncateByIndent(lines, maxLines);
	const result: string[] = [];

	result.push(`${document.uri.fsPath}:${startLine + 1}-${endLine + 1}`);

	let previousLineNumber: number | undefined;
	for (const [textRaw, lineNumber] of truncated) {
		let text = textRaw;
		if (
			previousLineNumber !== undefined &&
			lineNumber !== previousLineNumber + 1
		) {
			result.push(
				`...truncated lines ${previousLineNumber + 1}-${lineNumber - 1}...`
			);
		}
		previousLineNumber = lineNumber;

		if (text.length > maxLineLength) {
			const extra = text.length - maxLineLength;
			text = `${text.substring(0, maxLineLength)} ... (truncated, ${extra} more chars)`;
		}

		result.push(`${lineNumber}\t|${text}`);
	}

	if (
		previousLineNumber !== undefined &&
		previousLineNumber !== endLine + 1
	) {
		result.push(
			`...truncated lines ${previousLineNumber + 1}-${endLine + 1}...`
		);
	}

	return result.join('\n');
}

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('Context Code Text');
	}
	return outputChannel;
}

async function handleShowSymbolContext(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor for symbol context.');
		return;
	}
	const doc = editor.document;
	const selection = editor.selection;
	const pos = selection.isEmpty ? selection.active : selection.start;
	const wordRange = doc.getWordRangeAtPosition(pos);
	if (!wordRange) {
		vscode.window.showErrorMessage('No symbol selected for context.');
		return;
	}
	const name = doc.getText(wordRange);
	const channel = getOutputChannel();
	channel.clear();
	channel.show(true);
	channel.appendLine(`Collecting contexts for symbol '${name}' at ${doc.uri.fsPath}:${wordRange.start.line + 1}`);
	channel.appendLine('');
	try {
		const rich = await nodeCreatorSingleton.getRichNode(doc.uri, wordRange.start);
		if (!rich) {
			channel.appendLine('No rich node created for selection.');
			return;
		}
		const [
			fileContext,
			usageContext,
			traceContext,
			quickGrepContext,
			fullGrepContext,
			symbolKind
		] = await Promise.all([
			rich.getFileContext(),
			rich.getUsageContext(),
			rich.getTraceContext(),
			rich.getQuickGrepContext(),
			rich.getGrepContext(),
			rich.getSymbolKindText()
		]);

		const separator = '\n' + '='.repeat(40) + '\n';
		const all = [
			fileContext,
			usageContext,
			traceContext,
			quickGrepContext,
			fullGrepContext,
			`=== Symbol Kind ===\n${symbolKind}`
		]
			.filter(Boolean)
			.join(separator);
		channel.appendLine(all);
	} catch (err) {
		channel.appendLine(
			`Error while collecting symbol context: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	nodeContextSingleton = new NodeContextService(nodeCreatorSingleton, outputChannel);
	traceSingleton = new TraceService(nodeScoreSingleton, nodeCreatorSingleton);
	const hello = vscode.commands.registerCommand('context-code-text.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from context-code-text!');
	});
	const show = vscode.commands.registerCommand('context-code-text.showSymbolContext', handleShowSymbolContext);
	context.subscriptions.push(hello, show);
}

export function deactivate(): void {
	if (outputChannel) {
		outputChannel.dispose();
		outputChannel = undefined;
	}
}

function buildOutlineElements(
	symbols: vscode.DocumentSymbol[],
	uri: vscode.Uri,
	parent?: OutlineElement
): OutlineElement[] {
	return symbols.map(sym => {
		const elem: OutlineElement = {
			id: `${uri.toString()}:${makeIdFromRange(sym.range)}`,
			symbol: sym,
			parent,
			children: [],
			uri
		};
		elem.children = buildOutlineElements(sym.children ?? [], uri, elem);
		return elem;
	});
}