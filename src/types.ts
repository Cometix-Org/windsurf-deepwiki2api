import * as vscode from 'vscode';

export type RawWord = {
	word: string;
	location: {
		uri: vscode.Uri;
		range: vscode.Range;
	};
};

export type OutlineElement = {
	id: string;
	symbol: vscode.DocumentSymbol;
	parent?: OutlineElement;
	children: OutlineElement[];
	uri: vscode.Uri;
};

export type RichNodeBacking = OutlineElement | RawWord;

export type ReferenceWithPreview = {
	location: vscode.Location;
	codePreview?: {
		fullLine: string;
		matchStart: number;
		matchEnd: number;
	};
};

export type Caller = {
	type: 'CALLS' | 'UNKNOWN';
	source: OutlineElement;
	target: OutlineElement;
	targetRange: vscode.Range;
};

export type TraceNode = {
	richNode: import('./richNode').RichNode;
	parentCandidates: OutlineElement[];
	parentIndex: number;
};

export type TraceResult = { trace: TraceNode[] };

export type ServiceRegistry = {
	lsp: import('./lspService').LspService;
	trace: import('./traceService').TraceService;
	nodeContext: import('./context/nodeContextService').NodeContextService;
};
