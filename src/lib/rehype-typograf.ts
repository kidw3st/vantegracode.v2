import { t } from './typograf.ts';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

/** Не трогаем код и всё, что не является текстом для чтения */
const SKIP = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style']);

function walk(node: HastNode): void {
  if (node.type === 'element' && node.tagName && SKIP.has(node.tagName)) return;
  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = t(node.value);
    return;
  }
  node.children?.forEach(walk);
}

/** rehype-плагин: типограф для текстовых узлов Markdown (статьи, услуги) */
export function rehypeTypograf() {
  return (tree: HastNode) => {
    walk(tree);
  };
}
