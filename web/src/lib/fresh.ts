// Keeps a long-open tab on the latest Fino. A browser tab can stay open for days and keep running the
// code it loaded then, so every few minutes (and whenever the tab comes back into view) we ask for the
// page and compare its script with ours. When a new version is out, the tab reloads itself the next time
// it comes back into view, unless the person has typed something they haven't sent yet.

const scriptOf = (html: string) => /\/assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? '';
const current = () => [...document.scripts].map((s) => s.src).map((src) => scriptOf(src)).find(Boolean) ?? '';

let stale = false;
let checking = false;

async function check() {
  if (checking || stale || !navigator.onLine) return;
  const mine = current();
  if (!mine) return; // dev server: nothing to compare
  checking = true;
  try {
    const html = await fetch('/', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : ''));
    const live = scriptOf(html);
    if (live && live !== mine) stale = true;
  } catch { /* offline or blocked: try again later */ } finally { checking = false; }
}

/** Something typed and not sent yet in a message box: never throw that away. */
const unsentText = () => [...document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type=text]')].some((el) => el.value.trim().length > 0);

// Reloading the moment someone comes back felt like the site dropping out (updates ship often). So a new version
// only swaps in after a long break, when nobody is in the middle of anything; otherwise the next visit picks it up.
const LONG_AWAY = 5 * 60 * 1000;
let hiddenAt = 0;
function maybeReload() {
  if (stale && !unsentText() && hiddenAt && Date.now() - hiddenAt >= LONG_AWAY) location.reload();
}

export function keepFresh() {
  setInterval(() => { void check(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
    // Back in view after a long break: the moment to swap in the new version, before they start reading again.
    void check().then(maybeReload).then(() => { hiddenAt = 0; });
  });
  window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) void check().then(maybeReload); });
}
