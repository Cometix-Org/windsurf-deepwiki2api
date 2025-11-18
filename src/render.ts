import * as vscode from 'vscode';

function truncateByIndent(lines: [string, number][], maxLines: number): [string, number][] {
	if (lines.length <= maxLines) {
		return lines;
	}

	const indentCount = new Map<number, number>();
	const indentCache = new Map<number, number>();

	const computeIndent = (line: string, index: number): number => {
		const cached = indentCache.get(index);
		if (cached !== undefined) {
			return cached;
		}
		let indent = 0;
		if (/^\s*$/.test(line)) {
			indent = indentCache.get(index - 1) ?? 0;
		} else {
			const match = line.match(/^\s*/);
			indent = match ? match[0].length : 0;
		}
		indentCache.set(index, indent);
		return indent;
	};

	lines.forEach(([line], i) => {
		const indent = computeIndent(line, i);
		indentCount.set(indent, (indentCount.get(indent) ?? 0) + 1);
	});

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
		if (indent <= keptIndent || (indent === nextIndent && kept < maxLines)) {
			result.push([line, number]);
			kept += indent === nextIndent ? 1 : 0;
		}
	}

	return result;
}

export function renderFileSlice(
	document: vscode.TextDocument,
	startLine: number,
	endLine: number,
	maxLineLength = 200,
	maxLines = 300
): string {
	const lines: [string, number][] = [];
	for (let line = startLine; line <= endLine && line < document.lineCount; line++) {
		lines.push([document.lineAt(line).text, line + 1]);
	}

	const truncated = truncateByIndent(lines, maxLines);
	const result: string[] = [];
	let previous: number | undefined;

	for (const [rawLine, lineNumber] of truncated) {
		if (previous !== undefined && previous !== lineNumber - 1) {
			result.push(`...truncated lines ${previous + 1}-${lineNumber - 1}...`);
		}
		const text =
			rawLine.length > maxLineLength
				? `${rawLine.slice(0, maxLineLength)} ... (truncated, ${rawLine.length - maxLineLength} more chars)`
				: rawLine;
		result.push(`${lineNumber}\t|${text}`);
		previous = lineNumber;
	}

	if (previous !== undefined && previous !== endLine + 1) {
		result.push(`...truncated lines ${previous + 1}-${endLine + 1}...`);
	}

	return result.join('\n');
}
