import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { t } from '../lib/i18n';
import { readSheets, type Sheet } from '../lib/sheet-read';

/** Opens an Excel or CSV file right in the chat: every sheet as a scrollable table, with the header row pinned. */
export function SheetViewer({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState(0);
  const [closing, setClosing] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    fetch(url, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((buf) => readSheets(buf, name))
      .then((s) => { if (live) setSheets(s); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [url, name]);

  const close = () => { setClosing(true); setTimeout(onClose, 160); };
  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheet = sheets?.[tab];
  const [head, ...body] = sheet?.rows ?? [];
  return createPortal(
    <div className={`sheetv${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={name} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sheetv__panel">
        <header className="sheetv__head">
          <span className="sheetv__icon" aria-hidden>XLS</span>
          <span className="sheetv__name" dir="auto">{name}</span>
          <a className="sheetv__btn" href={`${url}?download=1`} aria-label={t('Download')} title={t('Download')}><Download size={18} /></a>
          <button ref={closeBtn} type="button" className="sheetv__btn" onClick={close} aria-label={t('Close')} title={t('Close')}><X size={18} /></button>
        </header>
        {sheets && sheets.length > 1 && (
          <div className="sheetv__tabs" role="tablist" aria-label={t('Sheets')}>
            {sheets.map((s, i) => <button key={i} type="button" role="tab" aria-selected={i === tab} className={i === tab ? 'is-on' : ''} onClick={() => setTab(i)} dir="auto">{s.name}</button>)}
          </div>
        )}
        <div className="sheetv__body">
          {error ? (
            <div className="sheetv__empty">{t("Couldn't open this file here.")} <a href={`${url}?download=1`}>{t('Download it instead')}</a></div>
          ) : !sheets ? (
            <div className="sheetv__empty"><span className="sheetv__spin" aria-hidden /> {t('Opening…')}</div>
          ) : !sheet || !sheet.rows.length ? (
            <div className="sheetv__empty">{t('This sheet is empty.')}</div>
          ) : (
            <div className="sheetv__scroll" dir={sheet.rtl ? 'rtl' : 'ltr'} tabIndex={0}>
              <table className="sheetv__table">
                <thead><tr><th className="sheetv__n" aria-hidden />{head.map((c, i) => <th key={i} dir="auto">{c}</th>)}</tr></thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri}><td className="sheetv__n" aria-hidden>{ri + 2}</td>{r.map((c, ci) => <td key={ci} dir="auto" className={/^[-€$£]?[\d,.]+%?$/.test(c) ? 'is-num' : ''}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {sheet.truncated && <div className="sheetv__more">{t('Showing the first 2,000 rows. Download the file to see everything.')}</div>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
