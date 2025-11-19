import * as vscode from 'vscode';

export type NormalizedReferenceLocation = { uri: vscode.Uri; range: vscode.Range };

export function normalizeReferenceLocation(
	location: vscode.Location | vscode.LocationLink
): NormalizedReferenceLocation | undefined {
	let uri: vscode.Uri;
	let range: vscode.Range | any;

	// Handle LocationLink (raw or instance)
	if ('targetUri' in location) {
		const link = location as vscode.LocationLink;
		uri = link.targetUri;
		range =
			link.targetSelectionRange ??
			link.targetRange ??
			(link as any).originSelectionRange ??
			link.targetRange;
	} else {
		// Handle Location (raw or instance)
		const loc = location as vscode.Location;
		uri = loc.uri;
		range = loc.range;
	}

	if (!uri || !range) {
		return undefined;
	}

	// Hydrate URI: handles both real instances and plain JSON objects
	const hydratedUri =
		uri instanceof vscode.Uri
			? uri
			: vscode.Uri.from(uri as { scheme: string; authority?: string; path: string; query?: string; fragment?: string });

	let hydratedRange: vscode.Range;
	if (range instanceof vscode.Range) {
		hydratedRange = range;
	} else {
		const r = range as any;
		if (!r.start || !r.end) {
			return undefined;
		}
		hydratedRange = new vscode.Range(
			new vscode.Position(r.start.line, r.start.character),
			new vscode.Position(r.end.line, r.end.character)
		);
	}

	return { uri: hydratedUri, range: hydratedRange };
}
