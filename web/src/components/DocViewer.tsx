import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { t } from '../lib/i18n';
import { readDoc, type DocBlock, type Run } from '../lib/doc-read';

const runs = (rs: Run[]): ReactNode => rs.map((r, i) => {
  let n: ReactNode = r.text.includes('\n') ? r.text.split('\n').map((s, j) => <Fragment key={j}>{j > 0 && <br />}{s}</Fragment>) : r.text;
  if (r.bold) n = <strong>{n}</strong>;
  if (r.italic) n = <em>{n}</em>;
  if (r.underline) n = <u>{n}</u>;
  return <Fragment key={i}>{n}</Fragment>;
});

/** Lists come as separate paragraphs in Word: neighbours of the same kind are drawn as one list. */
function render(blocks: DocBlock[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'heading') {
      const H = (`h${Math.min(4, b.level + 1)}`) as 'h2' | 'h3' | 'h4';
      out.push(<H key={i} dir={b.rtl ? 'rtl' : 'auto'}>{runs(b.runs)}</H>);
    } else if (b.kind === 'table') {
      out.push(<div key={i} className="docv__table-wrap"><table className="docv__table" dir={b.rtl ? 'rtl' : 'ltr'}><tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => ri === 0 ? <th key={ci} dir="auto">{runs(c)}</th> : <td key={ci} dir="auto">{runs(c)}</td>)}</tr>)}</tbody></table></div>);
    } else if (b.list) {
      const items: { b: typeof b; i: number }[] = [];
      let j = i;
      while (j < blocks.length) { const x = blocks[j]; if (x.kind !== 'para' || x.list !== b.list) break; items.push({ b: x, i: j }); j++; }
      const L = b.list === 'number' ? 'ol' : 'ul';
      out.push(<L key={i} dir={b.rtl ? 'rtl' : 'auto'}>{items.map(({ b: x, i: k }) => <li key={k} style={x.depth ? { marginInlineStart: `${x.depth * 1.2}em` } : undefined}>{runs(x.runs)}</li>)}</L>);
      i = j - 1;
    } else {
      const empty = !b.runs.some((r) => r.text.trim());
      out.push(empty ? <div key={i} className="docv__gap" aria-hidden /> : <p key={i} dir={b.rtl ? 'rtl' : 'auto'}>{runs(b.runs)}</p>);
    }
  }
  return out;
}

/** Opens a Word document right in the chat, as a clean page: headings, paragraphs, lists and tables. */
export function DocViewer({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const [blocks, setBlocks] = useState<DocBlock[] | null>(null);
  const [error, setError] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    fetch(url, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((buf) => readDoc(buf))
      .then((b) => { if (live) setBlocks(b); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [url]);

  const close = () => { setClosing(true); setTimeout(onClose, 160); };
  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={`sheetv${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={name} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sheetv__panel">
        <header className="sheetv__head">
          <span className="sheetv__icon docv__icon" aria-hidden>DOC</span>
          <span className="sheetv__name" dir="auto">{name}</span>
          <a className="sheetv__btn" href={`${url}?download=1`} aria-label={t('Download')} title={t('Download')}><Download size={18} /></a>
          <button ref={closeBtn} type="button" className="sheetv__btn" onClick={close} aria-label={t('Close')} title={t('Close')}><X size={18} /></button>
        </header>
        <div className="sheetv__body">
          {error ? (
            <div className="sheetv__empty">{t("Couldn't open this file here.")} <a href={`${url}?download=1`}>{t('Download it instead')}</a></div>
          ) : !blocks ? (
            <div className="sheetv__empty"><span className="sheetv__spin" aria-hidden /> {t('Opening…')}</div>
          ) : !blocks.length ? (
            <div className="sheetv__empty">{t('This document is empty.')}</div>
          ) : (
            <div className="docv__scroll" tabIndex={0}><article className="docv__page">{render(blocks)}</article></div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
