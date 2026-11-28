// Read a Word (.docx) file in the browser, for the in-chat viewer. No library: a .docx is a zip of XML files
// (unzipped like the sheet reader), and word/document.xml holds the text, read here with DOMParser.
import { unzip } from './sheet-read';

export interface Run { text: string; bold?: boolean; italic?: boolean; underline?: boolean }
export type DocBlock =
  | { kind: 'heading'; level: number; runs: Run[]; rtl: boolean }
  | { kind: 'para'; runs: Run[]; rtl: boolean; list?: 'bullet' | 'number'; depth?: number }
  | { kind: 'table'; rows: Run[][][]; rtl: boolean };

export const isDocFile = (name: string, mime = '') => /\.docx$/i.test(name) || /wordprocessingml\.document/.test(mime);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const ARABIC = /[֐-ࣿ]/;
const kids = (el: Element, local: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === local);
const kid = (el: Element | undefined, local: string) => (el ? kids(el, local)[0] : undefined);
const val = (el: Element | undefined) => el?.getAttributeNS(W, 'val') ?? el?.getAttribute('w:val') ?? null;
const on = (el: Element | undefined) => !!el && val(el) !== '0' && val(el) !== 'false';

function runsOf(p: Element): Run[] {
  const out: Run[] = [];
  const walk = (el: Element) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      if (e.localName === 'r') {
        const pr = kid(e, 'rPr');
        let text = '';
        for (const c of Array.from(e.childNodes)) {
          if (c.nodeType !== 1) continue;
          const ce = c as Element;
          if (ce.localName === 't') text += ce.textContent ?? '';
          else if (ce.localName === 'tab') text += '\t';
          else if (ce.localName === 'br' || ce.localName === 'cr') text += '\n';
        }
        if (text) out.push({ text, bold: on(kid(pr, 'b')), italic: on(kid(pr, 'i')), underline: !!kid(pr, 'u') && val(kid(pr, 'u')) !== 'none' });
      } else if (e.localName === 'hyperlink' || e.localName === 'ins' || e.localName === 'smartTag' || e.localName === 'sdt' || e.localName === 'sdtContent' || e.localName === 'fldSimple') walk(e);
    }
  };
  walk(p);
  return out;
}

/** Heading level from the paragraph style: "Heading1", "Title", or the style's own name in styles.xml. */
function headingLevel(styleId: string | null, styles: Map<string, string>): number {
  if (!styleId) return 0;
  const name = (styles.get(styleId) ?? styleId).toLowerCase().replace(/\s+/g, '');
  if (name === 'title') return 1;
  const m = /^heading(\d)$/.exec(name) ?? /^(?:kop|berschrift|titre)(\d)$/.exec(name);
  return m ? Math.min(4, Number(m[1])) : 0;
}

export async function readDoc(buf: ArrayBuffer): Promise<DocBlock[]> {
  const files = await unzip(buf, (n) => n === 'word/document.xml' || n === 'word/styles.xml' || n === 'word/numbering.xml');
  const xml = files.get('word/document.xml');
  if (!xml) throw new Error('not a Word document');
  const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
  const styles = new Map<string, string>();
  const st = files.get('word/styles.xml');
  if (st) for (const s of Array.from(parse(st).getElementsByTagNameNS(W, 'style'))) {
    const id = s.getAttributeNS(W, 'styleId') ?? s.getAttribute('w:styleId');
    const name = val(kid(s, 'name'));
    if (id && name) styles.set(id, name);
  }
  // Which numbering ids are bullets (the rest count 1, 2, 3).
  const bulletNums = new Set<string>();
  const num = files.get('word/numbering.xml');
  if (num) {
    const doc = parse(num);
    const bulletAbstract = new Set<string>();
    for (const a of Array.from(doc.getElementsByTagNameNS(W, 'abstractNum'))) {
      const lvl = kid(a, 'lvl');
      if (val(kid(lvl, 'numFmt')) === 'bullet') bulletAbstract.add(a.getAttributeNS(W, 'abstractNumId') ?? a.getAttribute('w:abstractNumId') ?? '');
    }
    for (const n of Array.from(doc.getElementsByTagNameNS(W, 'num'))) {
      if (bulletAbstract.has(val(kid(n, 'abstractNumId')) ?? '')) bulletNums.add(n.getAttributeNS(W, 'numId') ?? n.getAttribute('w:numId') ?? '');
    }
  }
  const body = parse(xml).getElementsByTagNameNS(W, 'body')[0];
  if (!body) return [];
  const blocks: DocBlock[] = [];
  const textOf = (runs: Run[]) => runs.map((r) => r.text).join('');
  const para = (p: Element): DocBlock | null => {
    const pr = kid(p, 'pPr');
    const runs = runsOf(p);
    const text = textOf(runs);
    const rtl = !!kid(pr, 'bidi') || ARABIC.test(text);
    const level = headingLevel(val(kid(pr, 'pStyle')), styles);
    if (level && text.trim()) return { kind: 'heading', level, runs, rtl };
    const numPr = kid(pr, 'numPr');
    const style = (styles.get(val(kid(pr, 'pStyle')) ?? '') ?? '').toLowerCase();
    if (numPr || /list ?bullet|list ?number/.test(style)) {
      const id = val(kid(numPr, 'numId')) ?? '';
      const list = bulletNums.has(id) || /bullet/.test(style) || (!num && !/number/.test(style)) ? 'bullet' : 'number';
      return { kind: 'para', runs, rtl, list, depth: Number(val(kid(numPr, 'ilvl')) ?? 0) };
    }
    return { kind: 'para', runs, rtl };
  };
  for (const el of Array.from(body.childNodes)) {
    if (el.nodeType !== 1) continue;
    const e = el as Element;
    if (e.localName === 'p') { const b = para(e); if (b) blocks.push(b); }
    else if (e.localName === 'tbl') {
      const rows = kids(e, 'tr').map((tr) => kids(tr, 'tc').map((tc) => kids(tc, 'p').flatMap((p, i) => (i ? [{ text: '\n' }, ...runsOf(p)] : runsOf(p)))));
      const rtl = rows.some((r) => r.some((c) => ARABIC.test(textOf(c))));
      if (rows.length) blocks.push({ kind: 'table', rows, rtl });
    } else if (e.localName === 'sdt') {
      for (const p of Array.from(e.getElementsByTagNameNS(W, 'p'))) { const b = para(p); if (b) blocks.push(b); }
    }
  }
  // Drop runs of empty paragraphs at the ends; keep single blank lines in between as spacing.
  while (blocks.length && blocks[0].kind === 'para' && !textOf((blocks[0] as { runs: Run[] }).runs).trim()) blocks.shift();
  while (blocks.length && blocks.at(-1)!.kind === 'para' && !textOf((blocks.at(-1) as { runs: Run[] }).runs).trim()) blocks.pop();
  return blocks.slice(0, 5000);
}
