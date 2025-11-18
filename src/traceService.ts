import { NodeCreatorService } from './nodeCreatorService';
import { NodeScoreService } from './nodeScoreService';
import { TraceNode, TraceResult } from './types';
import { RichNode } from './richNode';

export class TraceService {
	constructor(
		private readonly score: NodeScoreService,
		private readonly nodeCreator: NodeCreatorService
	) {}

	async getTrace(node: RichNode): Promise<TraceResult> {
		return { trace: await this.build(node, new Set(), 5) };
	}

	private async build(node: RichNode, visited: Set<string>, depth: number): Promise<TraceNode[]> {
		if (depth <= 0) {
			return [{ richNode: node, parentCandidates: [], parentIndex: -1 }];
		}
		const key = node.getCacheKey();
		if (visited.has(key)) {
			return [{ richNode: node, parentCandidates: [], parentIndex: -1 }];
		}
		visited.add(key);
		const callers = await node.getCallers();
		if (callers.length === 0) {
			return [{ richNode: node, parentCandidates: [], parentIndex: -1 }];
		}
		const scored = await Promise.all(
			callers.map(async c => ({
				node: c.source,
				quality: this.score.calculateOutlineElementScore(c.source)
			}))
		);
		scored.sort((a, b) => b.quality - a.quality);
		const best = scored[0];
		const parentRich = this.nodeCreator.getRichNodeFromOutlineElement(best.node);
		const rest = await this.build(parentRich, visited, depth - 1);
		return [
			{
				richNode: node,
				parentCandidates: scored.map(s => s.node),
				parentIndex: 0
			},
			...rest
		];
	}
}
