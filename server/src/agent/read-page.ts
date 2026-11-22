// read_page: fetch a public web page on the server and hand the model its readable text and links,
// so simple lookups don't need the bot's computer. Only public http(s) addresses are allowed:
// every hop (including redirects) is resolved and private/internal networks are refused.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { extractText } from '../documents.js';
import { ocrPdf, hasNoText } from '../pdf-ocr.js';

const MAX_BYTES = 2_000_000;
const MAX_PDF_BYTES = 10_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

async function assertPublic(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https pages can be read.');
  if (url.username || url.password) throw new Error('Addresses with a username or password are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new Error('That address is not public.');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error('That address is not public.');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Turn an HTML page into a title, readable text and its main links. */
export function htmlToText(html: string, base: URL) {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim());
  let body = html.replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  // Prefer the page's main content over menus and footers when the page marks it.
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1] ?? /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(body)?.[1];
  if (main && main.replace(/<[^>]+>/g, '').trim().length > 500) body = main;
  body = body.replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const links: { text: string; url: string }[] = [];
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    try {
      const u = new URL(decode(m[1]), base);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && text && text.length < 120 && !links.some((l) => l.url === u.href)) links.push({ text, url: u.href });
    } catch {}
    if (links.length >= 40) break;
  }
  body = body
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|table|ul|ol|blockquote|pre)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text, links };
}

export async function readPage(rawUrl: string, maxChars = 12_000) {
  let url: URL;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new Error('That is not a valid web address.');
  }
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FinoReader/1.0)', accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) break;
    url = new URL(next, url);
    if (hop === MAX_REDIRECTS) throw new Error('Too many redirects.');
  }
  if (!res) throw new Error('The page could not be read.');
  if (!res.ok) throw new Error(`The site answered ${res.status}.`);
  const type = res.headers.get('content-type') ?? '';
  const isPdf = /application\/pdf/i.test(type) || (/octet-stream/i.test(type) && /\.pdf$/i.test(url.pathname));
  if (!isPdf && !/text\/|html|xml|json/i.test(type)) throw new Error(`This file type can't be read here (${type || 'unknown type'}).`);
  // Read at most MAX_BYTES so a huge page can't exhaust memory.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
    if (size >= (isPdf ? MAX_PDF_BYTES : MAX_BYTES)) {
      await reader.cancel();
      break;
    }
  }
  const bytes = Buffer.concat(chunks);
  let page: { title: string; text: string; links: { text: string; url: string }[] };
  if (isPdf) {
    // PDFs: the same extractor as uploaded files; scanned ones go through OCR.
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('This link is not a valid PDF.');
    const name = decodeURIComponent(url.pathname.split('/').pop() || 'document.pdf');
    let { text } = await extractText('pdf', bytes, name);
    let note = '';
    if (hasNoText(text)) {
      text = await ocrPdf(bytes, name);
      note = text ? '[Scanned PDF: text read with OCR, check numbers that matter.]\n' : '';
      if (!text) throw new Error('This PDF has no readable text and OCR is not available.');
    }
    page = { title: name, text: note + text, links: [] };
  } else {
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    page = /html|xml/i.test(type) ? htmlToText(raw, url) : { title: '', text: raw, links: [] };
  }
  const limit = Math.max(2000, Math.min(Number(maxChars) || 12_000, 40_000));
  const truncated = page.text.length > limit;
  return {
    url: url.href,
    title: page.title,
    text: page.text.slice(0, limit) + (truncated ? `\n[…page continues; ${page.text.length - limit} more characters. Ask for a larger max_chars if needed.]` : ''),
    links: page.links.slice(0, 25),
  };
}
