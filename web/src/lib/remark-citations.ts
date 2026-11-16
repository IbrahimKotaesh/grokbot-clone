import type { Root } from 'mdast';

/** Codex citation IDs are not URLs. Hide unusable control tokens, never invent links. */
export function remarkCitations() {
  return (tree: Root) => {
    let unavailable = false;
    type Node = { type: string; value?: string; children?: Node[] };
    const visit = (node: Node) => {
      if (node.type === 'code' || node.type === 'inlineCode') return;
      if (node.type === 'text' && node.value) {
        node.value = node.value.replace(/\uE200(?:cite|filecite)\uE202[^\uE201\r\n]*(?:\uE201|(?=\r?\n|$))/gu, () => { unavailable = true; return ''; });
        // Streaming may pause halfway through a control token. Don't flash it in the UI.
        node.value = node.value.replace(/\uE200[^\uE201\r\n]*$/u, '');
      }
      node.children?.forEach(visit);
    };
    visit(tree);
    if (unavailable) tree.children.push({ type: 'paragraph', data: { hProperties: { className: ['md__source-note'] } }, children: [{ type: 'text', value: 'Some source links are unavailable for this message.' }] });
  };
}

/** Keep timestamps/year ranges in their written order inside Arabic paragraphs. */
export function remarkBidiRanges() {
  return (tree: Root) => {
    type Node = { type: string; value?: string; children?: Node[]; data?: unknown };
    const visit = (node: Node) => {
      if (node.type === 'code' || node.type === 'inlineCode' || !node.children) return;
      node.children.forEach(visit);
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value) return [child];
        const value = child.value;
        const matches = [...value.matchAll(/(?:[€$£]\s*[+-]?[0-9٠-٩]+(?:[.,٬٫][0-9٠-٩]+)*|[0-9٠-٩]+(?:[.,٬٫][0-9٠-٩]+)*\s*(?:€|\$|£|USD\b|EUR\b|GBP\b)|\b\d{1,4}(?::\d{2}|\.\d+)?\s*[–—-]\s*\d{1,4}(?::\d{2}|\.\d+)?\b)/gu)];
        if (!matches.length) return [child];
        const parts: Node[] = []; let start = 0;
        for (const match of matches) {
          if (match.index! > start) parts.push({ type: 'text', value: value.slice(start, match.index) });
          parts.push({ type: 'finoLtrRange', data: { hName: 'bdi', hProperties: { dir: 'ltr', className:['md__number'] } }, children: [{ type: 'text', value: match[0] }] });
          start = match.index! + match[0].length;
        }
        if (start < value.length) parts.push({ type: 'text', value: value.slice(start) });
        return parts;
      });
    };
    visit(tree);
  };
}
