/**
 * 文件扩展名到图标的简化映射（供扩展端使用）
 * 图标名称对应 assets/icons 下的 SVG 文件名（不含 .svg 后缀）
 */

// 语言/扩展名 -> 图标名称
export const languageIconMap: Record<string, string> = {
	// Web 前端
	'html': 'html',
	'htm': 'html',
	'css': 'css',
	'scss': 'sass',
	'sass': 'sass',
	'less': 'less',
	'stylus': 'stylus',
	'styl': 'stylus',

	// JavaScript/TypeScript
	'javascript': 'javascript',
	'js': 'javascript',
	'mjs': 'javascript',
	'cjs': 'javascript',
	'typescript': 'typescript',
	'ts': 'typescript',
	'mts': 'typescript',
	'cts': 'typescript',
	'jsx': 'react',
	'tsx': 'react_ts',

	// 框架
	'vue': 'vue',
	'svelte': 'svelte',
	'astro': 'astro',
	'angular': 'angular',

	// 数据格式
	'json': 'json',
	'jsonc': 'json',
	'json5': 'json',
	'yaml': 'yaml',
	'yml': 'yaml',
	'xml': 'xml',
	'toml': 'toml',
	'ini': 'settings',
	'csv': 'table',

	// Markdown
	'markdown': 'markdown',
	'md': 'markdown',
	'mdx': 'mdx',

	// Python
	'python': 'python',
	'py': 'python',
	'pyw': 'python',
	'pyi': 'python',

	// Java/JVM
	'java': 'java',
	'kotlin': 'kotlin',
	'kt': 'kotlin',
	'scala': 'scala',
	'groovy': 'groovy',

	// C/C++
	'c': 'c',
	'h': 'c',
	'cpp': 'cpp',
	'cc': 'cpp',
	'cxx': 'cpp',
	'hpp': 'hpp',
	'c++': 'cpp',

	// C#/F#
	'csharp': 'csharp',
	'cs': 'csharp',
	'fsharp': 'fsharp',
	'fs': 'fsharp',

	// Go
	'go': 'go',
	'golang': 'go',

	// Rust
	'rust': 'rust',
	'rs': 'rust',

	// Ruby
	'ruby': 'ruby',
	'rb': 'ruby',
	'erb': 'ruby',

	// PHP
	'php': 'php',

	// Shell
	'shell': 'console',
	'bash': 'console',
	'sh': 'console',
	'zsh': 'console',
	'fish': 'console',
	'powershell': 'powershell',
	'ps1': 'powershell',

	// Database
	'sql': 'database',
	'mysql': 'database',
	'postgresql': 'database',
	'sqlite': 'database',

	// Config
	'dockerfile': 'docker',
	'docker': 'docker',
	'makefile': 'makefile',
	'cmake': 'cmake',
	'gradle': 'groovy',

	// 其他语言
	'swift': 'swift',
	'dart': 'dart',
	'elixir': 'elixir',
	'ex': 'elixir',
	'erlang': 'erlang',
	'erl': 'erlang',
	'haskell': 'haskell',
	'hs': 'haskell',
	'lua': 'lua',
	'perl': 'perl',
	'pl': 'perl',
	'r': 'r',
	'julia': 'julia',
	'jl': 'julia',
	'clojure': 'clojure',
	'clj': 'clojure',
	'elm': 'elm',
	'ocaml': 'ocaml',
	'ml': 'ocaml',
	'nim': 'nim',
	'zig': 'zig',
	'v': 'vlang',
	'odin': 'odin',

	// 文档
	'tex': 'tex',
	'latex': 'tex',
	'rst': 'markdown',
	'asciidoc': 'asciidoc',
	'adoc': 'asciidoc',

	// 配置文件
	'graphql': 'graphql',
	'gql': 'graphql',
	'proto': 'proto',
	'prisma': 'prisma',

	// 其他
	'diff': 'diff',
	'patch': 'diff',
	'log': 'log',
	'txt': 'document',
	'text': 'document',
	'plaintext': 'document',
};

/**
 * 根据语言或文件扩展名获取图标名称
 */
export function getIconForLanguage(language: string): string {
	const normalized = language.toLowerCase().trim();
	return languageIconMap[normalized] || 'document';
}

/**
 * 根据文件路径获取图标名称
 */
export function getIconForFile(filePath: string): string {
	const fileName = filePath.split(/[\/\\]/).pop() || '';
	const ext = fileName.split('.').pop()?.toLowerCase() || '';
	return languageIconMap[ext] || 'document';
}
