import { t } from '../lib/i18n';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Bot } from '@shared/types';
import { useStore } from '../store';

/**
 * A list of Bots you can rearrange by dragging the whole card (no handle, no text selection).
 * Mouse: press and move. Touch: press and hold a moment, then move. The card lifts and follows you, a line shows
 * where it lands, and a folder ([data-folder-drop]) lights up when you're over it; letting go there moves the Bot in.
 * Keyboard: Alt+↑/↓ on a Bot moves it. `fullOrder` maps this list's new order into the order of every Bot.
 */
export function BotRoster({ bots, collapsed, render, fullOrder, onDropToFolder, zone = '' }: {
  bots: Bot[]; collapsed: boolean; render: (bot: Bot) => ReactNode; fullOrder?: (ids: string[]) => string[];
  onDropToFolder?: (botId: string, folderId: string | null) => void;
  /** Which folder this list shows ('' for Bots outside folders). */
  zone?: string;
}) {
  const root = useRef<HTMLDivElement>(null), positions = useRef(new Map<string, number>());
  const drag = useRef<{ id: string; x: number; y: number; dx: number; dy: number; w: number; active: boolean; timer?: number; el: HTMLElement; pointerId: number; over?: string; before?: boolean; folder?: string | null } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [mark, setMark] = useState<{ id: string; before: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number } | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);

  // Rows glide to their new place after a reorder.
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const el of root.current?.querySelectorAll<HTMLElement>('[data-bot-sort-id]') ?? []) {
      const id = el.dataset.botSortId!, top = el.getBoundingClientRect().top, old = positions.current.get(id); next.set(id, top);
      if (old !== undefined && old !== top && !matchMedia('(prefers-reduced-motion: reduce)').matches) el.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.22,.68,0,1)' });
    }
    positions.current = next;
  }, [bots.map((b) => b.id).join('|')]);

  const persist = async (subset: string[]) => {
    const ids = fullOrder ? fullOrder(subset) : subset;
    setSaving(true); setError('');
    useStore.setState((s) => ({ bots: s.bots.map((b) => (ids.includes(b.id) ? { ...b, sortOrder: ids.indexOf(b.id) } : b)) }));
    try {
      const r = await fetch('/api/bots/reorder', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      const result = await r.json(); if (!r.ok) throw Error(result.error ?? t('Could not save the order.'));
      useStore.setState({ bots: result.bots });
    } catch (e) { setError((e as Error).message); await useStore.getState().loadBots().catch(() => {}); } finally { setSaving(false); }
  };
  const move = (id: string, index: number) => { const ids = bots.map((b) => b.id), from = ids.indexOf(id); if (from < 0 || index < 0 || index >= ids.length || from === index) return; ids.splice(from, 1); ids.splice(index, 0, id); void persist(ids); };

  // While a drag is on: no text selection, no page scroll on touch, a grabbing cursor.
  const stopTouchScroll = useRef((e: TouchEvent) => { if (drag.current?.active) e.preventDefault(); });
  const lit = useRef<HTMLElement | null>(null);
  const light = (el: HTMLElement | null) => { if (lit.current !== el) { lit.current?.classList.remove('is-drop'); el?.classList.add('is-drop'); lit.current = el; } };
  const end = () => {
    const d = drag.current; drag.current = null;
    if (d?.timer) clearTimeout(d.timer);
    document.body.classList.remove('is-bot-dragging');
    document.removeEventListener('touchmove', stopTouchScroll.current);
    light(null); setDragging(null); setMark(null); setGhost(null);
    return d;
  };
  useEffect(() => () => { end(); }, []);

  const activate = () => {
    const d = drag.current; if (!d || d.active) return;
    d.active = true;
    try { d.el.setPointerCapture(d.pointerId); } catch { /* pointer already gone */ }
    document.body.classList.add('is-bot-dragging');
    document.addEventListener('touchmove', stopTouchScroll.current, { passive: false });
    navigator.vibrate?.(8);
    setDragging(d.id); setGhost({ x: d.x - d.dx, y: d.y - d.dy, w: d.w });
  };

  const down = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (collapsed || saving || e.button !== 0) return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    // A mouse press must not start selecting text; a touch press must still be able to scroll the list.
    if (e.pointerType === 'mouse') e.preventDefault();
    drag.current = { id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, active: false, el, pointerId: e.pointerId };
    if (e.pointerType !== 'mouse') drag.current.timer = window.setTimeout(activate, 260);
  };

  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const far = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!d.active) {
      if (e.pointerType === 'mouse' && far > 5) activate();
      else if (e.pointerType !== 'mouse' && far > 8) { end(); return; } // moved before the hold: it's a scroll
      if (!drag.current?.active) return;
    }
    setGhost({ x: e.clientX - d.dx, y: e.clientY - d.dy, w: d.w });
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const row = hit?.closest<HTMLElement>('[data-bot-sort-id]');
    const box = onDropToFolder ? hit?.closest<HTMLElement>('[data-folder-drop]') ?? null : null;
    const home = bots.find((b) => b.id === d.id)?.folderId ?? '';
    if (row && row.dataset.roster === zone && row.dataset.botSortId !== d.id) {
      // Over a Bot in this same list: show where it would land.
      const r = row.getBoundingClientRect(); d.over = row.dataset.botSortId!; d.before = e.clientY < r.top + r.height / 2; d.folder = undefined;
      setMark({ id: d.over, before: d.before }); light(null);
    } else if (box && (box.dataset.folderDrop ?? '') !== home) {
      // Over another folder (or the list outside folders): it would move there.
      d.over = undefined; d.folder = box.dataset.folderDrop || null; setMark(null); light(box);
    } else { d.over = undefined; d.folder = undefined; setMark(null); light(null); }
    const scroll = root.current?.closest('.sidebar__scroll');
    if (scroll) { const r = scroll.getBoundingClientRect(); if (e.clientY < r.top + 36) scroll.scrollBy(0, -10); else if (e.clientY > r.bottom - 36) scroll.scrollBy(0, 10); }
  };

  const up = () => {
    const d = end(); if (!d?.active) return;
    // The press was a drag, so the card underneath must not also open on this release.
    const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
    if (d.folder !== undefined) { onDropToFolder?.(d.id, d.folder); return; }
    if (!d.over) return;
    const ids = bots.map((b) => b.id).filter((id) => id !== d.id);
    let index = ids.indexOf(d.over); if (index < 0) return; if (!d.before) index++;
    ids.splice(index, 0, d.id); void persist(ids);
  };

  const keys = (e: KeyboardEvent<HTMLDivElement>, i: number, id: string) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(id, i + (e.key === 'ArrowUp' ? -1 : 1)); }
  };
  const dragged = bots.find((b) => b.id === dragging);

  return (
    <div ref={root} className="bot-roster">
      {bots.map((b, i) => (
        <div key={b.id} data-bot-sort-id={b.id} data-roster={zone}
          className={`bot-sort-item${dragging === b.id ? ' is-dragging' : ''}${mark?.id === b.id ? (mark.before ? ' is-drop-before' : ' is-drop-after') : ''}`}
          title={collapsed ? undefined : t('Drag to move · Alt+↑/↓')}
          onPointerDown={(e) => down(e, b.id)} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={() => end()} onKeyDown={(e) => keys(e, i, b.id)}>
          {render(b)}
        </div>
      ))}
      {error && <p className="bot-order-error" role="alert">{error}</p>}
      {dragged && ghost && createPortal(
        <div className="bot-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w }} aria-hidden>{render(dragged)}</div>,
        document.body,
      )}
    </div>
  );
}
