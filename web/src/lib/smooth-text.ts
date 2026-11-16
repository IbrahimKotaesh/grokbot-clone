import { useEffect, useRef, useState } from 'react';
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Reveal a small part of a provider chunk without cutting Arabic marks or emoji. */
export function revealNext(current: string, target: string): string {
  if (!target.startsWith(current)) return target;
  const rest = target.slice(current.length);
  if (!rest) return current;
  const count = Math.max(1, Math.ceil(Array.from(rest).length / 6));
  let chunk = '', n = 0;
  const segments = graphemes ? [...graphemes.segment(rest)].map(s => s.segment) : Array.from(rest);
  for (const segment of segments) { chunk += segment; if (++n >= count) break; }
  return current + chunk;
}

export function useSmoothText(text: string, streaming: boolean) {
  const [shown, setShown] = useState(streaming ? '' : text);
  const current = useRef(shown);
  const animated = useRef(streaming);
  useEffect(() => {
    if (streaming) animated.current = true;
    if (!animated.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = text; setShown(text); animated.current = false; return;
    }
    let frame = 0, last = 0;
    const tick = (time: number) => {
      if (time - last >= 24) {
        last = time;
        current.current = revealNext(current.current, text);
        setShown(current.current);
      }
      if (current.current !== text) frame = requestAnimationFrame(tick);
      else if (!streaming) animated.current = false;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, streaming]);
  return shown;
}
