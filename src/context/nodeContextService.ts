import { RichNode } from '../richNode';
import { mapSymbolKindToDeepWiki } from '../symbolKindText';
import { runGrep } from './grep';
import { getFileContext } from './fileContext';
import { getUsageContext } from './usageContext';
import { getTraceContext } from './traceContext';

export class NodeContextService {
	async quickGrepContext(node: RichNode): Promise<string> {
		return runGrep(node, 'quick');
	}

	async grepContext(node: RichNode): Promise<string> {
		return runGrep(node, 'full');
	}

	async nodeFileContext(node: RichNode): Promise<string> {
		return getFileContext(node);
	}

	async nodeUsageContext(node: RichNode): Promise<string> {
		return getUsageContext(node);
	}

	async nodeTraceContext(node: RichNode): Promise<string> {
		return getTraceContext(node);
	}

	async nodeArticleContext(node: RichNode): Promise<string> {
		const parts = await Promise.all([
			node.getFileContext(),
			node.getUsageContext(),
			node.getGrepContext(),
			node.getTraceContext()
		]);
		return parts.filter(Boolean).join('\n' + '='.repeat(40) + '\n');
	}

	async nodeSummaryContext(node: RichNode): Promise<string> {
		const parts = await Promise.all([
			node.getFileContext(),
			node.getUsageContext(),
			node.getTraceContext(),
			node.getQuickGrepContext()
		]);
		return parts.filter(Boolean).join('\n' + '='.repeat(40) + '\n');
	}

	async getSymbolKindText(node: RichNode): Promise<string> {
		const kind = await node.getSymbolKind();
		return mapSymbolKindToDeepWiki(kind);
	}
}
