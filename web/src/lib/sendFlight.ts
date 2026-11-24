// The sent message flies from the composer into the chat (a FLIP animation): the composer records where the
// text was, and the new bubble starts there and glides to its place.
let flight: { botId: string; text: string; rect: DOMRect; rtl: boolean; at: number } | null = null;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isRtl = (s: string) => /^[^A-Za-z]*[֐-ࣿ]/.test(s);

/** Called by the composer as the message is sent. */
export function launch(botId: string, text: string, from: HTMLElement | null) {
  const t = text.trim();
  if (!from || !t || reduced()) { flight = null; return; }
  flight = { botId, text: t, rect: from.getBoundingClientRect(), rtl: isRtl(t), at: performance.now() };
}

/** Called when a user bubble mounts: if it is the message just sent, it flies in from the composer. */
export function land(botId: string, text: string, el: HTMLElement | null) {
  const f = flight;
  if (!f || !el || f.botId !== botId || f.text !== text.trim() || performance.now() - f.at > 6000) return;
  flight = null;
  el.style.opacity = '0';
  // Measure after the list has scrolled to the new message, so the flight ends exactly in place.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const to = el.getBoundingClientRect();
    const pad = 14; // the composer's text inset, so the words seem to lift straight out of the box
    const dx = f.rtl ? f.rect.right - pad - to.right : f.rect.left + pad - to.left;
    const dy = f.rect.top + 6 - to.top;
    el.style.opacity = '';
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(.97)`, opacity: 0.35, offset: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 1 },
      ],
      { duration: 480, easing: 'cubic-bezier(.2, .85, .25, 1)' },
    );
  }));
}
