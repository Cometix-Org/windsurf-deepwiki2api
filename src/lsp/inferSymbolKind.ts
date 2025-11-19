import * as vscode from 'vscode';
import { findSymbolByName, findSymbolByTarget } from './documentSymbols';
import { inferKindFromHover } from './hoverKind';

type Target = { name: string; range: vscode.Range; position: vscode.Position };
type DefFetcher = (uri: vscode.Uri, pos: vscode.Position, limit: number) => Promise<vscode.Definition | undefined>;

export async function inferSymbolKind(
	target: Target,
	rootUri: vscode.Uri,
	commands: typeof vscode.commands,
	getDefinitions: DefFetcher
): Promise<vscode.SymbolKind> {
	const defKind = await inferFromDefinitions(target, rootUri, commands, getDefinitions);
	if (defKind) {
		return defKind;
	}
	const hoverKind = await inferKindFromHover(rootUri, target.position, commands);
	if (hoverKind) {
		return hoverKind;
	}
	const docKind = await inferFromDocumentSymbols(rootUri, target.name, commands);
	return docKind ?? vscode.SymbolKind.Function;
}

async function inferFromDefinitions(
	target: Target,
	rootUri: vscode.Uri,
	commands: typeof vscode.commands,
	getDefinitions: DefFetcher
): Promise<vscode.SymbolKind | undefined> {
	try {
		const defs = await getDefinitions(rootUri, target.position, 300);
		const first = Array.isArray(defs) ? defs[0] : defs;
		const link = normalizeDefinition(first);
		if (!link) {
			return undefined;
		}
		const symbols = await commands.executeCommand<any>('vscode.executeDocumentSymbolProvider', link.targetUri);
		if (!symbols?.length) {
			return undefined;
		}
		const match = findSymbolByTarget(symbols, link.targetRange.start, target.name);
		return match?.kind;
	} catch {
		return undefined;
	}
}

async function inferFromDocumentSymbols(
	rootUri: vscode.Uri,
	name: string,
	commands: typeof vscode.commands
): Promise<vscode.SymbolKind | undefined> {
	try {
		const symbols = await commands.executeCommand<any>('vscode.executeDocumentSymbolProvider', rootUri);
		if (!symbols?.length) {
			return undefined;
		}
		return findSymbolByName(symbols, name)?.kind;
	} catch {
		return undefined;
	}
}

function normalizeDefinition(
	def: vscode.Definition | undefined
): { targetUri: vscode.Uri; targetRange: vscode.Range } | undefined {
	if (!def) {
		return undefined;
	}
	if (Array.isArray(def)) {
		return normalizeDefinition(def[0]);
	}
	if (isLocationLink(def)) {
		const range = def.targetSelectionRange ?? def.targetRange;
		if (!range) {
			return undefined;
		}
		return { targetUri: def.targetUri, targetRange: range };
	}
	return { targetUri: def.uri, targetRange: def.range };
}

function isLocationLink(value: vscode.Location | vscode.LocationLink): value is vscode.LocationLink {
	return (value as vscode.LocationLink).targetUri !== undefined;
}
