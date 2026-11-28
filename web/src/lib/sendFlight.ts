// The sent message arrives in the chat with a soft rise. The composer marks which message was just sent, so
// only that bubble animates (not every message when a chat opens).
let flight: { botId: string; text: string; at: number } | null = null;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Called by the composer as the message is sent. */
export function launch(botId: string, text: string, from: HTMLElement | null) {
  const t = text.trim();
  if (!from || !t || reduced()) { flight = null; return; }
  flight = { botId, text: t, at: performance.now() };
}

/**
 * Called when a user bubble mounts: if it is the message just sent, it rises softly into its own place from the
 * corner it belongs to, like a messaging app. (It used to fly across from the composer; when the list scrolled
 * mid-flight the path bent, so the bubble went to the middle first and then to the right.)
 */
export function land(botId: string, text: string, el: HTMLElement | null) {
  const f = flight;
  if (!f || !el || f.botId !== botId || f.text !== text.trim() || performance.now() - f.at > 6000) return;
  flight = null;
  const bubble = (el.querySelector('.bubble') as HTMLElement | null) ?? el;
  bubble.animate(
    [
      { transform: 'translateY(12px) scale(.94)', opacity: 0, filter: 'blur(4px)' },
      { opacity: 1, filter: 'blur(0)', offset: 0.45 },
      { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'blur(0)' },
    ],
    // A soft spring that settles without a bounce; it grows from the bottom corner on the sender's side.
    { duration: 420, easing: 'cubic-bezier(.2, .9, .25, 1)', fill: 'backwards' },
  );
  bubble.style.transformOrigin = 'bottom right';
}
