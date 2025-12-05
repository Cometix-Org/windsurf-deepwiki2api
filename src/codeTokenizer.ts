import * as fs from 'fs';
import { getIconForLanguage, getIconForFile } from './config/fileIconMap';

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Token 类型，对应 CSS class
 * 使用 VS Code webview 中可用的 CSS 变量来设置颜色
 */
type TokenType = 
	| 'default'    // 默认文本
	| 'keyword'    // 关键字
	| 'string'     // 字符串
	| 'number'     // 数字
	| 'comment'    // 注释
	| 'function'   // 函数名
	| 'type'       // 类型名
	| 'variable'   // 变量
	| 'operator'   // 操作符
	| 'punctuation'; // 标点

interface Token {
	text: string;
	type: TokenType;
}

/**
 * 简单的代码 tokenizer
 * 将代码转换为带有 token 类型的 HTML
 */
export function tokenizeCode(code: string, languageId: string): string {
	const lines = code.split('\n');
	const htmlLines: string[] = [];
	
	for (const line of lines) {
		const tokens = tokenizeLine(line, languageId);
		const lineHtml = tokens.map(t => 
			t.type === 'default' 
				? escapeHtml(t.text)
				: `<span class="token-${t.type}">${escapeHtml(t.text)}</span>`
		).join('');
		htmlLines.push(`<div class="code-line">${lineHtml || '&nbsp;'}</div>`);
	}
	
	return `<div class="tokenized-code">${htmlLines.join('')}</div>`;
}

/**
 * 对单行代码进行 tokenize
 */
function tokenizeLine(line: string, languageId: string): Token[] {
	const tokens: Token[] = [];
	const keywords = getKeywords(languageId);
	const typeKeywords = getTypeKeywords(languageId);
	
	let remaining = line;
	
	while (remaining.length > 0) {
		// 空白
		const wsMatch = remaining.match(/^(\s+)/);
		if (wsMatch) {
			tokens.push({ text: wsMatch[1], type: 'default' });
			remaining = remaining.slice(wsMatch[1].length);
			continue;
		}
		
		// 单行注释
		if (remaining.startsWith('//') || (languageId === 'python' && remaining.startsWith('#'))) {
			tokens.push({ text: remaining, type: 'comment' });
			break;
		}
		
		// 字符串
		for (const quote of ['"', "'", '`']) {
			if (remaining.startsWith(quote)) {
				const endIdx = findStringEnd(remaining, quote);
				const str = remaining.slice(0, endIdx + 1);
				tokens.push({ text: str, type: 'string' });
				remaining = remaining.slice(endIdx + 1);
				break;
			}
		}
		if (remaining.length === 0 || remaining !== line.slice(line.length - remaining.length)) {
			continue;
		}
		
		// 数字
		const numMatch = remaining.match(/^(\d+\.?\d*)/);
		if (numMatch) {
			tokens.push({ text: numMatch[1], type: 'number' });
			remaining = remaining.slice(numMatch[1].length);
			continue;
		}
		
		// 标识符/关键字
		const idMatch = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
		if (idMatch) {
			const word = idMatch[1];
			let type: TokenType = 'default';
			
			if (keywords.has(word)) {
				type = 'keyword';
			} else if (typeKeywords.has(word)) {
				type = 'type';
			} else if (remaining.slice(word.length).trimStart().startsWith('(')) {
				type = 'function';
			} else if (/^[A-Z]/.test(word)) {
				type = 'type';
			} else {
				type = 'variable';
			}
			
			tokens.push({ text: word, type });
			remaining = remaining.slice(word.length);
			continue;
		}
		
		// 操作符
		const opMatch = remaining.match(/^([+\-*/%=<>!&|^~?:]+)/);
		if (opMatch) {
			tokens.push({ text: opMatch[1], type: 'operator' });
			remaining = remaining.slice(opMatch[1].length);
			continue;
		}
		
		// 标点
		const punctMatch = remaining.match(/^([;,.\(\)\{\}\[\]])/);
		if (punctMatch) {
			tokens.push({ text: punctMatch[1], type: 'punctuation' });
			remaining = remaining.slice(punctMatch[1].length);
			continue;
		}
		
		// 其他字符
		tokens.push({ text: remaining[0], type: 'default' });
		remaining = remaining.slice(1);
	}
	
	return tokens;
}

function findStringEnd(str: string, quote: string): number {
	let i = 1;
	while (i < str.length) {
		if (str[i] === '\\') {
			i += 2;
			continue;
		}
		if (str[i] === quote) {
			return i;
		}
		i++;
	}
	return str.length - 1;
}

function getKeywords(languageId: string): Set<string> {
	const jsKeywords = new Set([
		'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
		'return', 'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof',
		'instanceof', 'in', 'of', 'with', 'debugger', 'default', 'yield', 'await',
		'async', 'class', 'extends', 'super', 'this', 'static', 'get', 'set',
		'import', 'export', 'from', 'as', 'const', 'let', 'var', 'function',
		'interface', 'type', 'enum', 'namespace', 'module', 'declare', 'abstract',
		'implements', 'private', 'protected', 'public', 'readonly', 'override',
	]);
	
	if (languageId === 'python') {
		return new Set([
			'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'return',
			'try', 'except', 'finally', 'raise', 'with', 'as', 'import', 'from',
			'class', 'def', 'lambda', 'pass', 'assert', 'yield', 'global', 'nonlocal',
			'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None', 'async', 'await',
		]);
	}
	
	if (languageId === 'go') {
		return new Set([
			'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
			'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
			'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
			'var',
		]);
	}
	
	return jsKeywords;
}

function getTypeKeywords(languageId: string): Set<string> {
	const common = new Set([
		'string', 'number', 'boolean', 'object', 'any', 'void', 'null', 'undefined',
		'never', 'unknown', 'bigint', 'symbol', 'int', 'float', 'double', 'char',
		'byte', 'short', 'long', 'bool', 'true', 'false',
	]);
	
	if (languageId === 'go') {
		return new Set([
			'bool', 'string', 'int', 'int8', 'int16', 'int32', 'int64',
			'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
			'byte', 'rune', 'float32', 'float64', 'complex64', 'complex128',
			'error', 'nil', 'true', 'false', 'iota',
		]);
	}
	
	return common;
}

/**
 * 解析代码块第一行的文件路径和行号
 * 支持格式：
 * - "98:101:/path/to/file.ts" (startLine:endLine:filePath)
 * - "98:/path/to/file.ts" (line:filePath)
 * - "/path/to/file.ts" (仅路径)
 * 
 * @returns 解析结果，包含文件路径、起始行、结束行，以及剩余代码
 */
function parseCodeBlockHeader(code: string): {
	filePath: string | null;
	startLine: number | null;
	endLine: number | null;
	remainingCode: string;
} {
	const lines = code.split('\n');
	if (lines.length === 0) {
		return { filePath: null, startLine: null, endLine: null, remainingCode: code };
	}
	
	const firstLine = lines[0].trim();
	
	if (firstLine.startsWith('//') || firstLine.startsWith('#')) {
		return { filePath: null, startLine: null, endLine: null, remainingCode: code };
	}
	
	// 尝试匹配 startLine:endLine:/path 格式
	// 例如: 98:101:/e:/AiCreatedProjects/xxx/file.ts
	const fullMatch = firstLine.match(/^(\d+):(\d+):(.+)$/);
	if (fullMatch) {
		const startLine = parseInt(fullMatch[1], 10);
		const endLine = parseInt(fullMatch[2], 10);
		const filePath = fullMatch[3].trim();
		// 验证路径看起来像文件路径
		if (filePath.includes('/') || filePath.includes('\\')) {
			return {
				filePath,
				startLine,
				endLine,
				remainingCode: lines.slice(1).join('\n')
			};
		}
	}
	
	// 尝试匹配 line:/path 格式
	// 例如: 98:/e:/AiCreatedProjects/xxx/file.ts
	const linePathMatch = firstLine.match(/^(\d+):(.+)$/);
	if (linePathMatch) {
		const line = parseInt(linePathMatch[1], 10);
		const filePath = linePathMatch[2].trim();
		if (filePath.includes('/') || filePath.includes('\\')) {
			return {
				filePath,
				startLine: line,
				endLine: null,
				remainingCode: lines.slice(1).join('\n')
			};
		}
	}
	
	// 尝试匹配纯路径格式（以 / 或盘符开头）
	// 例如: /path/to/file.ts 或 e:/path/to/file.ts
	const pathMatch = firstLine.match(/^([a-zA-Z]:)?[\/\\](?![\/\\]).+\.\w+$/);
	if (pathMatch) {
		return {
			filePath: firstLine,
			startLine: null,
			endLine: null,
			remainingCode: lines.slice(1).join('\n')
		};
	}
	
	// 没有匹配到任何格式
	return { filePath: null, startLine: null, endLine: null, remainingCode: code };
}

function isExistingFilePath(filePath: string | null): boolean {
	if (!filePath) {
		return false;
	}
	try {
		const candidates: string[] = [filePath];
		if (/^\/[a-zA-Z]:[\/\\]/.test(filePath)) {
			candidates.push(filePath.slice(1));
		}
		return candidates.some(p => fs.existsSync(p));
	} catch {
		return false;
	}
}

/**
 * 生成代码块头部 HTML
 * 使用 {{ICON:iconName}} 占位符，会在 contextView 中替换为实际的 webview URI
 */
function generateCodeHeader(
	language: string,
	filePath: string | null,
	startLine: number | null,
	endLine: number | null
): string {
	// 获取图标名称
	const iconName = filePath ? getIconForFile(filePath) : getIconForLanguage(language);
	
	// 没有文件信息时，仅显示语言图标和语言名
	if (!filePath) {
		return `<div class="code-header">
			<img class="code-icon" src="{{ICON:${iconName}}}" alt="${escapeHtml(language)}" />
			<span class="code-lang">${escapeHtml(language)}</span>
		</div>`;
	}
	
	// 提取文件名
	const fileName = filePath.split(/[\/\\]/).pop() || filePath;
	
	// 构建行号显示
	let lineInfo = '';
	if (startLine !== null && endLine !== null) {
		lineInfo = `L${startLine}-${endLine}`;
	} else if (startLine !== null) {
		lineInfo = `L${startLine}`;
	}
	
	// 构建 vscode 链接的 data 属性
	const linkData = JSON.stringify({
		path: filePath,
		startLine: startLine ?? 1,
		endLine: endLine ?? startLine ?? 1
	});
	
	const lineDisplay = lineInfo ? `<span class="code-line-info">${lineInfo}</span>` : '';
	
	// 结构：<语言图标><文件名>(可选行数范围)
	return `<div class="code-header">
		<a class="code-file-link" href="javascript:void(0)" data-vscode-link='${escapeHtml(linkData)}' title="${escapeHtml(filePath)}">
			<img class="code-icon" src="{{ICON:${iconName}}}" alt="${escapeHtml(language)}" />
			<span class="code-file-name">${escapeHtml(fileName)}</span>
			${lineDisplay}
		</a>
	</div>`;
}

/**
 * 处理 Markdown 文本，将代码块转换为带语法高亮的 HTML
 * 
 * @param markdown 原始 Markdown 文本
 * @returns 处理后的 Markdown（代码块已转换为 HTML）
 */
export function processMarkdownCodeBlocks(markdown: string): string {
	// 匹配 ``` 代码块
	const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
	
	return markdown.replace(codeBlockRegex, (_, lang, code) => {
		const language = lang || 'plaintext';
		
		let { filePath, startLine, endLine, remainingCode } = parseCodeBlockHeader(code);
		
		if (filePath && !isExistingFilePath(filePath)) {
			filePath = null;
			startLine = null;
			endLine = null;
			remainingCode = code;
		}
		
		const headerHtml = generateCodeHeader(language, filePath, startLine, endLine);
		
		const tokenizedHtml = tokenizeCode(remainingCode.trimEnd(), language);
		
		return `<div class="code-window">${headerHtml}<div class="code-content">${tokenizedHtml}</div></div>`;
	});
}
