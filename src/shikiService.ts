import * as vscode from 'vscode';

// Shiki Highlighter 接口 - 定义我们需要使用的方法
interface ShikiHighlighter {
	loadLanguage(lang: string): Promise<void>;
	codeToHtml(code: string, options: { lang: string; theme: string }): string;
}

type BundledLanguage = string;

// 语言别名映射（常见的别名 -> Shiki bundled 语言名）
const langAliasMap: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	jsx: 'jsx',
	tsx: 'tsx',
	py: 'python',
	rb: 'ruby',
	rs: 'rust',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	yml: 'yaml',
	md: 'markdown',
};

/** 将语言名称规范化为 Shiki bundled 语言名 */
function normalizeLanguage(lang: string): string {
	const lower = lang.toLowerCase().trim();
	if (langAliasMap[lower]) {
		return langAliasMap[lower];
	}
	return lower;
}

// 缓存 bundledLanguages
let bundledLanguagesCache: Record<string, unknown> | null = null;

/** 获取 bundledLanguages（动态导入） */
async function getBundledLanguages(): Promise<Record<string, unknown>> {
	if (bundledLanguagesCache) {
		return bundledLanguagesCache;
	}
	const shiki = await import('shiki');
	bundledLanguagesCache = shiki.bundledLanguages;
	return bundledLanguagesCache;
}

/** 检查语言是否在 Shiki bundled 语言列表中 */
async function isBundledLanguage(lang: string): Promise<boolean> {
	const bundled = await getBundledLanguages();
	return lang in bundled;
}

/**
 * Shiki Highlighter 服务 - 在扩展端进行语法高亮
 */
export class ShikiService {
	private highlighter: ShikiHighlighter | null = null;
	private loadedLangs = new Set<string>();
	private currentTheme: string | null = null;
	private initPromise: Promise<void> | null = null;

	/** 获取当前 VS Code 主题对应的 Shiki 主题名 */
	public getCurrentTheme(): string {
		const config = vscode.workspace.getConfiguration('context-code-text');
		const darkTheme = config.get<string>('shikiThemeDark', 'github-dark-default');
		const lightTheme = config.get<string>('shikiThemeLight', 'github-light-default');
		const kind = vscode.window.activeColorTheme.kind;
		const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
		return isDark ? darkTheme : lightTheme;
	}

	/** 初始化或重新初始化 highlighter */
	private async initHighlighter(theme: string): Promise<void> {
		if (this.highlighter && this.currentTheme === theme) {
			return;
		}

		try {
			const shiki = await import('shiki');
			const hl = await shiki.createHighlighter({
				themes: [theme],
				langs: [] // 按需加载语言
			});
			this.highlighter = hl as unknown as ShikiHighlighter;
			this.currentTheme = theme;
			this.loadedLangs.clear();
		} catch (err) {
			console.error('[ShikiService] Failed to create highlighter:', err);
			throw err;
		}
	}

	/** 确保 highlighter 已初始化 */
	private async ensureHighlighter(): Promise<ShikiHighlighter> {
		const theme = this.getCurrentTheme();
		
		if (!this.highlighter || this.currentTheme !== theme) {
			// 避免并发初始化
			if (!this.initPromise) {
				this.initPromise = this.initHighlighter(theme).finally(() => {
					this.initPromise = null;
				});
			}
			await this.initPromise;
		}

		if (!this.highlighter) {
			throw new Error('Highlighter not initialized');
		}

		return this.highlighter;
	}

	/** 加载语言（如果尚未加载） */
	private async loadLanguage(lang: string): Promise<boolean> {
		const normalized = normalizeLanguage(lang);

		if (this.loadedLangs.has(normalized)) {
			return true;
		}

		const isBundled = await isBundledLanguage(normalized);
		if (!isBundled) {
			console.warn(`[ShikiService] Language '${lang}' not found in bundled languages`);
			return false;
		}

		const hl = await this.ensureHighlighter();

		try {
			await hl.loadLanguage(normalized as BundledLanguage);
			this.loadedLangs.add(normalized);
			return true;
		} catch (err) {
			console.error(`[ShikiService] Failed to load language '${normalized}':`, err);
			return false;
		}
	}

	/** 从 markdown 中提取所有代码块语言 */
	public extractLanguages(markdown: string): string[] {
		const langs = new Set<string>();
		const codeBlockRegex = /```(\w+)/g;
		let match;
		while ((match = codeBlockRegex.exec(markdown)) !== null) {
			const lang = match[1];
			if (lang) {
				langs.add(normalizeLanguage(lang));
			}
		}
		return Array.from(langs);
	}

	/** 预加载 markdown 中所有代码块需要的语言 */
	public async preloadLanguages(markdown: string): Promise<void> {
		const langs = this.extractLanguages(markdown);
		await Promise.all(langs.map(lang => this.loadLanguage(lang)));
	}

	/** 高亮代码块 */
	public async highlightCode(code: string, lang: string): Promise<string> {
		const normalized = normalizeLanguage(lang);
		const hl = await this.ensureHighlighter();
		const theme = this.getCurrentTheme();

		// 尝试加载语言
		const loaded = await this.loadLanguage(normalized);

		if (loaded && this.loadedLangs.has(normalized)) {
			try {
				return hl.codeToHtml(code, { lang: normalized, theme });
			} catch (err) {
				console.error(`[ShikiService] Failed to highlight code for lang '${normalized}':`, err);
			}
		}

		// 回退到纯文本（无高亮）
		const escaped = code
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		return `<pre class="shiki" style="background-color:var(--vscode-editor-background,#1e1e1e)"><code>${escaped}</code></pre>`;
	}

	/** 销毁 highlighter */
	public dispose(): void {
		this.highlighter = null;
		this.loadedLangs.clear();
		this.currentTheme = null;
	}
}

// 单例实例
let shikiServiceInstance: ShikiService | null = null;

/** 获取 ShikiService 单例 */
export function getShikiService(): ShikiService {
	if (!shikiServiceInstance) {
		shikiServiceInstance = new ShikiService();
	}
	return shikiServiceInstance;
}

/** 销毁 ShikiService 单例 */
export function disposeShikiService(): void {
	if (shikiServiceInstance) {
		shikiServiceInstance.dispose();
		shikiServiceInstance = null;
	}
}
