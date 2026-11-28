// Read an Excel (.xlsx) or CSV/TSV file in the browser, for the in-chat viewer. No library: an .xlsx is a zip of
// XML files, unzipped with the browser's own DecompressionStream and read with DOMParser.

export interface Sheet { name: string; rows: string[][]; rtl: boolean; truncated: boolean }
const MAX_ROWS = 2000, MAX_COLS = 60;

// ---------- zip ----------
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + size);
    out.set(name, dec.decode(method === 0 ? raw : await inflate(raw)));
  }
  return out;
}

// ---------- xlsx ----------
const xml = (s: string | undefined) => new DOMParser().parseFromString(s ?? '<x/>', 'application/xml');
const byTag = (d: Document | Element, tag: string) => Array.from(d.getElementsByTagNameNS('*', tag));
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const BUILTIN_DATE = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function fromSerial(serial: number, time: boolean): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  const pad = (x: number) => String(x).padStart(2, '0');
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return time && serial % 1 ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}
function formatNumber(raw: string, fmt: string | undefined, isDate: boolean): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (isDate) return fromSerial(n, /h|s/i.test(fmt ?? ''));
  if (fmt?.includes('%')) return `${+(n * 100).toFixed(2)}%`;
  const decimals = /0\.(0+)/.exec(fmt ?? '')?.[1].length ?? (Number.isInteger(n) ? 0 : Math.min(4, (raw.split('.')[1] ?? '').length));
  const s = n.toLocaleString('en-US', { minimumFractionDigits: Math.min(decimals, 4), maximumFractionDigits: Math.min(Math.max(decimals, 0), 4) });
  const cur = /[€$£]/.exec(fmt ?? '')?.[0];
  return cur ? `${cur}${s}` : s;
}

// Formulas saved without a result (files made by openpyxl, like the Bots' spreadsheets) are worked out here:
// SUM/AVERAGE/MIN/MAX/COUNT over ranges and + - * / with cell references. Anything else shows its formula.
type Num = (ref: string) => number | undefined;
function evaluate(formula: string, num: Num): number | undefined {
  const src = formula.replace(/^=/, '').replace(/\$/g, '').toUpperCase();
  let i = 0;
  const peek = () => src[i], skip = () => { while (src[i] === ' ') i++; };
  const range = (a: string, b: string): number[] => {
    const [c1, r1] = [colIndex(a), Number(a.replace(/^[A-Z]+/, ''))], [c2, r2] = [colIndex(b), Number(b.replace(/^[A-Z]+/, ''))];
    const out: number[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2) && out.length < 100000; r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const v = num(colName(c) + r); if (v !== undefined) out.push(v);
    }
    return out;
  };
  const args = (): number[] => {
    const vals: number[] = [];
    do {
      skip();
      const m = /^([A-Z]+\d+):([A-Z]+\d+)/.exec(src.slice(i));
      if (m) { i += m[0].length; vals.push(...range(m[1], m[2])); } else { const v = expr(); if (v === undefined) throw 0; vals.push(v); }
      skip();
    } while (peek() === ',' && ++i);
    if (peek() !== ')') throw 0; i++;
    return vals;
  };
  const atom = (): number | undefined => {
    skip();
    if (peek() === '(') { i++; const v = expr(); skip(); if (peek() !== ')') throw 0; i++; return v; }
    if (peek() === '-') { i++; const v = atom(); return v === undefined ? undefined : -v; }
    const fn = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(/.exec(src.slice(i));
    if (fn) { i += fn[0].length; const v = args(); return fn[1] === 'SUM' ? v.reduce((a, b) => a + b, 0) : fn[1] === 'COUNT' ? v.length : !v.length ? 0 : fn[1] === 'AVERAGE' ? v.reduce((a, b) => a + b, 0) / v.length : fn[1] === 'MIN' ? Math.min(...v) : Math.max(...v); }
    const ref = /^[A-Z]+\d+/.exec(src.slice(i));
    if (ref) { i += ref[0].length; return num(ref[0]) ?? 0; }
    const n = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (n) { i += n[0].length; return Number(n[0]); }
    throw 0;
  };
  const term = (): number | undefined => { let v = atom(); for (skip(); peek() === '*' || peek() === '/'; skip()) { const op = src[i++]; const w = atom(); if (v === undefined || w === undefined) return undefined; v = op === '*' ? v * w : v / w; } return v; };
  function expr(): number | undefined { let v = term(); for (skip(); peek() === '+' || peek() === '-'; skip()) { const op = src[i++]; const w = term(); if (v === undefined || w === undefined) return undefined; v = op === '+' ? v + w : v - w; } return v; }
  try { const v = expr(); skip(); return i === src.length && v !== undefined && Number.isFinite(v) ? v : undefined; } catch { return undefined; }
}
const colName = (i: number) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const files = await unzip(buf, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || n === 'xl/styles.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const strings = byTag(xml(files.get('xl/sharedStrings.xml')), 'si').map((si) => byTag(si, 't').map((t) => t.textContent ?? '').join(''));
  // Styles: which cell styles are dates, and their number formats.
  const styles = xml(files.get('xl/styles.xml'));
  const custom = new Map(byTag(styles, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '']));
  const xfs = byTag(styles, 'cellXfs')[0] ? byTag(byTag(styles, 'cellXfs')[0], 'xf') : [];
  const fmtOf = (s: string | null) => { const id = Number(xfs[Number(s ?? -1)]?.getAttribute('numFmtId') ?? 0); const code = custom.get(id); return { code: code ?? (id === 9 || id === 10 ? '0%' : id === 2 || id === 4 ? '0.00' : undefined), date: BUILTIN_DATE.has(id) || (!!code && /(^|[^\\"])[dmy]/i.test(code.replace(/"[^"]*"/g, '')) && !/^[#0.,%]+$/.test(code)) }; };

  const rels = new Map(byTag(xml(files.get('xl/_rels/workbook.xml.rels')), 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
  const book = byTag(xml(files.get('xl/workbook.xml')), 'sheet');
  const sheets: Sheet[] = [];
  for (const s of book) {
    const target = rels.get(s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id'));
    const path = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : '';
    const doc = xml(files.get(path));
    const rows: string[][] = [];
    let truncated = false;
    // Numbers by cell (A1 → 12.5), and formulas that came without a result, worked out after reading the sheet.
    const nums = new Map<string, number>();
    const pending: { r: number; col: number; ref: string; formula: string; style: string | null }[] = [];
    for (const row of byTag(doc, 'row')) {
      const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
      if (r >= MAX_ROWS) { truncated = true; break; }
      const cells: string[] = [];
      for (const c of byTag(row, 'c')) {
        const col = colIndex(c.getAttribute('r') ?? 'A1');
        if (col >= MAX_COLS) { truncated = true; continue; }
        const t = c.getAttribute('t'), v = byTag(c, 'v')[0]?.textContent ?? '';
        let text = '';
        if (t === 's') text = strings[Number(v)] ?? '';
        else if (t === 'inlineStr') text = byTag(c, 't').map((x) => x.textContent ?? '').join('');
        else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') text = v;
        else if (v !== '') { const f = fmtOf(c.getAttribute('s')); text = formatNumber(v, f.code, f.date); nums.set(c.getAttribute('r') ?? '', Number(v)); }
        else { const formula = byTag(c, 'f')[0]?.textContent; if (formula) pending.push({ r, col, ref: c.getAttribute('r') ?? '', formula, style: c.getAttribute('s') }); }
        cells[col] = text;
      }
      rows[r] = Array.from(cells, (x) => x ?? '');
    }
    for (let pass = 0; pass < 3; pass++) for (const p of pending) {
      if (nums.has(p.ref)) continue;
      const v = evaluate(p.formula, (ref) => nums.get(ref));
      if (v === undefined) { if (pass === 2) (rows[p.r] ??= [])[p.col] = `=${p.formula}`; continue; }
      nums.set(p.ref, v);
      const f = fmtOf(p.style);
      (rows[p.r] ??= [])[p.col] = formatNumber(String(+v.toFixed(10)), f.code, f.date);
    }
    const filled = Array.from(rows, (x) => x ?? []);
    const width = Math.max(0, ...filled.map((r) => r.length));
    sheets.push({ name: s.getAttribute('name') ?? `Sheet ${sheets.length + 1}`, rows: filled.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')), rtl: byTag(doc, 'sheetView').some((x) => x.getAttribute('rightToLeft') === '1'), truncated });
  }
  return sheets;
}

// ---------- csv ----------
function readDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; continue; }
    if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length >= MAX_ROWS) break; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const width = Math.min(MAX_COLS, Math.max(0, ...rows.map((r) => r.length)));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

export const isSheetFile = (name: string, mime = '') => /\.(xlsx|csv|tsv)$/i.test(name) || /spreadsheetml|text\/csv|tab-separated/.test(mime);

/** All sheets of an .xlsx, or one sheet for a CSV/TSV file. */
export async function readSheets(buf: ArrayBuffer, name: string): Promise<Sheet[]> {
  if (/\.xlsx$/i.test(name) || new Uint8Array(buf, 0, 2).join() === '80,75') return readXlsx(buf);
  const text = new TextDecoder().decode(buf).replace(/^﻿/, '');
  const sep = /\.tsv$/i.test(name) || (text.split('\t').length > text.split(',').length && !text.includes(';')) ? '\t' : (text.split(';').length > text.split(',').length ? ';' : ',');
  const rows = readDelimited(text, sep);
  return [{ name: name.replace(/\.[^.]+$/, ''), rows, rtl: /[؀-ۿ]/.test(rows[0]?.join('') ?? ''), truncated: rows.length >= MAX_ROWS }];
}
