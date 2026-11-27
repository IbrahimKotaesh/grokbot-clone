import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Opens and closes its content smoothly, the way iOS lists do: the height eases open while the content fades in,
 * and eases shut on the way out (CSS grid rows 0fr ↔ 1fr, so no measuring). Closed content can't be tabbed into.
 */
export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.inert = !open; }, [open]);
  return (
    <div ref={ref} className={`collapse${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`} aria-hidden={!open}>
      <div className="collapse__inner">{children}</div>
    </div>
  );
}
