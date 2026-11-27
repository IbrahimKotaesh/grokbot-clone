import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; hint?: string; icon?: ReactNode; description?: string; selected?: boolean; section?: string; locked?: boolean }

/** Small popover menu anchored by its parent (position: relative). Closes on outside click / Escape. */
export function Menu({ items, onClose, align = 'left', placement = 'below', children }: { items: MenuItem[]; onClose: () => void; align?: 'left' | 'right' | 'center'; placement?: 'below' | 'above'; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // It eases out before it goes, like a macOS menu, instead of vanishing.
  const [closing, setClosing] = useState(false);
  const shut = useRef(false);
  const close = useCallback(() => {
    if (shut.current) return; shut.current = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    setClosing(true); setTimeout(onClose, 130);
  }, [onClose]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const t = setTimeout(() => document.addEventListener('mousedown', down));
    document.addEventListener('keydown', key, true);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [close]);
  return (
    <>
    {/* On phones the composer's menus open as a sheet from the bottom over a soft scrim (CSS decides). */}
    <div className={`menu-scrim${closing ? ' is-closing' : ''}`} aria-hidden />
    <div ref={ref} className={`menu is-${align} is-${placement}${closing ? ' is-closing' : ''}`} role="menu">
      {children}
      {items.map((it, i) => (
        <Fragment key={it.label}>
        {it.section && <div className="menu__section">{it.section}</div>}
        <button type="button" style={{ '--i': i } as CSSProperties} role={it.selected===undefined?'menuitem':'menuitemradio'} aria-checked={it.selected} className={`menu__item${it.selected?' is-selected':''}${it.danger ? ' is-danger' : ''}${it.locked ? ' is-locked' : ''}`} onClick={() => { it.onSelect(); close(); }}>
          <span className="menu__label">{it.icon}<span>{it.label}{it.description && <small>{it.description}</small>}</span></span>
          {it.hint && <span className="menu__hint">{it.hint}</span>}
        </button>
        </Fragment>
      ))}
    </div>
    </>
  );
}
