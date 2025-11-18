import * as vscode from 'vscode';

const KIND_MAP: Record<number, string> = {
	[vscode.SymbolKind.File]: 'DEEP_WIKI_SYMBOL_TYPE_FILE',
	[vscode.SymbolKind.Module]: 'DEEP_WIKI_SYMBOL_TYPE_MODULE',
	[vscode.SymbolKind.Namespace]: 'DEEP_WIKI_SYMBOL_TYPE_NAMESPACE',
	[vscode.SymbolKind.Package]: 'DEEP_WIKI_SYMBOL_TYPE_PACKAGE',
	[vscode.SymbolKind.Class]: 'DEEP_WIKI_SYMBOL_TYPE_CLASS',
	[vscode.SymbolKind.Method]: 'DEEP_WIKI_SYMBOL_TYPE_METHOD',
	[vscode.SymbolKind.Property]: 'DEEP_WIKI_SYMBOL_TYPE_PROPERTY',
	[vscode.SymbolKind.Field]: 'DEEP_WIKI_SYMBOL_TYPE_FIELD',
	[vscode.SymbolKind.Constructor]: 'DEEP_WIKI_SYMBOL_TYPE_CONSTRUCTOR',
	[vscode.SymbolKind.Enum]: 'DEEP_WIKI_SYMBOL_TYPE_ENUM',
	[vscode.SymbolKind.Interface]: 'DEEP_WIKI_SYMBOL_TYPE_INTERFACE',
	[vscode.SymbolKind.Function]: 'DEEP_WIKI_SYMBOL_TYPE_FUNCTION',
	[vscode.SymbolKind.Variable]: 'DEEP_WIKI_SYMBOL_TYPE_VARIABLE',
	[vscode.SymbolKind.Constant]: 'DEEP_WIKI_SYMBOL_TYPE_CONSTANT',
	[vscode.SymbolKind.String]: 'DEEP_WIKI_SYMBOL_TYPE_STRING',
	[vscode.SymbolKind.Number]: 'DEEP_WIKI_SYMBOL_TYPE_NUMBER',
	[vscode.SymbolKind.Boolean]: 'DEEP_WIKI_SYMBOL_TYPE_BOOLEAN',
	[vscode.SymbolKind.Array]: 'DEEP_WIKI_SYMBOL_TYPE_ARRAY',
	[vscode.SymbolKind.Object]: 'DEEP_WIKI_SYMBOL_TYPE_OBJECT',
	[vscode.SymbolKind.Key]: 'DEEP_WIKI_SYMBOL_TYPE_KEY',
	[vscode.SymbolKind.Null]: 'DEEP_WIKI_SYMBOL_TYPE_NULL',
	[vscode.SymbolKind.EnumMember]: 'DEEP_WIKI_SYMBOL_TYPE_ENUM_MEMBER',
	[vscode.SymbolKind.Struct]: 'DEEP_WIKI_SYMBOL_TYPE_STRUCT',
	[vscode.SymbolKind.Event]: 'DEEP_WIKI_SYMBOL_TYPE_EVENT',
	[vscode.SymbolKind.Operator]: 'DEEP_WIKI_SYMBOL_TYPE_OPERATOR',
	[vscode.SymbolKind.TypeParameter]: 'DEEP_WIKI_SYMBOL_TYPE_TYPE_PARAMETER'
};

export function mapSymbolKindToDeepWiki(kind: vscode.SymbolKind): string {
	return KIND_MAP[kind] ?? 'DEEP_WIKI_SYMBOL_TYPE_UNSPECIFIED';
}
