import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { RichNode } from '../richNode';
import { renderFileSlice } from '../render';

const MAX_GREP_FILES = 12;
const MAX_GREP_CHARS = 200;

interface RgMatch {
	file: string;
	line: number;
	column: number;
}

function runRipgrep(pattern: string, cwd: string): Promise<RgMatch[]> {
	return new Promise((resolve, reject) => {
		const matches: RgMatch[] = [];
		const args = [
			'--json',
			'--fixed-strings',     // Treat pattern as literal string
			'--line-number',
			'--column',
			'-g', '!node_modules',
			'-g', '!dist',
			'-g', '!out',
			'-g', '!.git',
			pattern
		];

		const rg = spawn(rgPath, args, { cwd });
		let stderr = '';

		rg.stdout.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				try {
					const json = JSON.parse(line);
					if (json.type === 'match') {
						const match = json.data;
						matches.push({
							file: match.path.text,
							line: match.line_number - 1, // 0-based
							column: match.submatches[0]?.start ?? 0
						});
					}
				} catch {
					// Skip malformed JSON lines
				}
			}
		});

		rg.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		rg.on('close', (code) => {
			// ripgrep returns 1 when no matches found, which is not an error
			if (code !== null && code !== 0 && code !== 1) {
				reject(new Error(`ripgrep exited with code ${code}: ${stderr}`));
			} else {
				resolve(matches);
			}
		});

		rg.on('error', (err) => {
			reject(err);
		});
	});
}

export async function runGrep(node: RichNode, mode: 'quick' | 'full'): Promise<string> {
	try {
		const symbol = node.getName();
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return 'No workspace folder found.';
		}

		const title = mode === 'quick' ? `=== Quick Grep Results for '${symbol}' ===` : `=== Grep Results for '${symbol}' ===`;
		const scopeDescription = mode === 'quick' ? 'Quick search (parent folder only)' : 'Full workspace search';
		
		const searchPath = workspaceFolder.uri.fsPath;
		const rgMatches = await runRipgrep(symbol, searchPath);

		if (!rgMatches.length) {
			return `No grep results found for '${symbol}'.`;
		}

		const lines: string[] = [];
		lines.push(title);
		lines.push(`Search query: ${symbol}`);
		lines.push(`${scopeDescription}: Found ${rgMatches.length} match(es)`);
		lines.push('');

		// Group matches by file
		const byFile = new Map<string, RgMatch[]>();
		for (const m of rgMatches) {
			if (!byFile.has(m.file)) {
				byFile.set(m.file, []);
			}
			byFile.get(m.file)!.push(m);
		}

		let shownFiles = 0;
		for (const [file, ms] of byFile) {
			if (shownFiles >= MAX_GREP_FILES) {
				lines.push('... and more matches...');
				break;
			}
			
			try {
				const fileUri = vscode.Uri.file(
					file.startsWith('/') || file.includes(':') 
						? file 
						: `${searchPath}/${file}`
				);
				const doc = await vscode.workspace.openTextDocument(fileUri);
				lines.push(`${fileUri.fsPath} (${ms.length} matches, showing context around first match)`);
				const start = Math.max(0, ms[0].line - 10);
				const end = Math.min(doc.lineCount - 1, ms[0].line + 10);
				lines.push(renderFileSlice(doc, start, end, MAX_GREP_CHARS, 200));
				lines.push('');
				shownFiles += 1;
			} catch {
				// Skip files that can't be opened
				continue;
			}
		}

		return lines.join('\n');
	} catch (err) {
		return `Error retrieving ${mode === 'quick' ? 'quick ' : ''}grep results: ${
			err instanceof Error ? err.message : 'Unknown error'
		}`;
	}
}
