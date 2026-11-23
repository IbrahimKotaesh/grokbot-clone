import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';

/**
 * Drag handles between the three columns (bots | chat | computer). Widths live in CSS variables on
 * <html> and are remembered per device; double-click puts a column back to its default width.
 */
type Edge = 'sidebar' | 'panel';
const KEY: Record<Edge, string> = { sidebar: 'fino.width.sidebar', panel: 'fino.width.panel' };
const VAR: Record<Edge, string> = { sidebar: '--sidebar-w', panel: '--panel-w' };
const MIN: Record<Edge, number> = { sidebar: 220, panel: 300 };
const MIN_CHAT = 380;

function apply(edge: Edge, px: number | null) {
  const root = document.documentElement.style;
  if (px == null) root.removeProperty(VAR[edge]); else root.setProperty(VAR[edge], `${Math.round(px)}px`);
}

/** Restore saved widths once at start-up. */
export function restoreColumnWidths() {
  for (const edge of ['sidebar', 'panel'] as Edge[]) {
    try { const v = Number(localStorage.getItem(KEY[edge])); if (v > 0) apply(edge, v); } catch { /* private window */ }
  }
}

export function ResizeHandle({ edge }: { edge: Edge }) {
  const drag = useRef<{ startX: number; startW: number; rtl: boolean; last: number } | null>(null);

  useEffect(() => () => document.body.classList.remove('is-resizing'), []);

  const target = () => document.querySelector<HTMLElement>(edge === 'sidebar' ? '.app > .sidebar' : '.app > .computer-panel');
  const other = () => document.querySelector<HTMLElement>(edge === 'sidebar' ? '.app > .computer-panel' : '.app > .sidebar');

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = target(); if (!el) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = el.getBoundingClientRect().width;
    drag.current = { startX: e.clientX, startW: w, rtl: document.documentElement.dir === 'rtl', last: w };
    document.body.classList.add('is-resizing');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    // The sidebar grows when dragged away from it; the computer panel grows when dragged toward the chat.
    let dx = e.clientX - d.startX;
    if (d.rtl) dx = -dx;
    const want = edge === 'sidebar' ? d.startW + dx : d.startW - dx;
    const max = window.innerWidth - (other()?.getBoundingClientRect().width ?? 0) - MIN_CHAT;
    d.last = Math.max(MIN[edge], Math.min(want, max));
    apply(edge, d.last);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove('is-resizing');
    try { localStorage.setItem(KEY[edge], String(Math.round(d.last))); } catch { /* private window */ }
  };
  const reset = () => { apply(edge, null); try { localStorage.removeItem(KEY[edge]); } catch { /* private window */ } };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const el = target(); if (!el) return;
    e.preventDefault();
    const rtl = document.documentElement.dir === 'rtl';
    const right = (e.key === 'ArrowRight') !== rtl;
    const step = e.shiftKey ? 48 : 16;
    const w = el.getBoundingClientRect().width + (edge === 'sidebar' ? (right ? step : -step) : (right ? -step : step));
    const max = window.innerWidth - (other()?.getBoundingClientRect().width ?? 0) - MIN_CHAT;
    const next = Math.max(MIN[edge], Math.min(w, max));
    apply(edge, next);
    try { localStorage.setItem(KEY[edge], String(Math.round(next))); } catch { /* private window */ }
  };

  return (
    <div
      className={`col-resize col-resize--${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={edge === 'sidebar' ? t('Resize bot list') : t('Resize computer panel')}
      title={t('Drag to resize · double-click to reset')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={reset}
      onKeyDown={onKey}
    />
  );
}
