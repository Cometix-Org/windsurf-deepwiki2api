import { OutlineElement } from './types';

export class NodeScoreService {
	calculateOutlineElementScore(elem: OutlineElement): number {
		return elem.children.length;
	}
}
