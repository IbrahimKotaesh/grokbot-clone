/**
 * Wait for `p`, but give up the moment `signal` aborts (throws "Stopped."). The work behind `p` may still finish
 * in the background; its result is simply ignored. Used so Stop takes effect right away instead of after the step.
 */
export function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) { p.catch(() => {}); return Promise.reject(new Error('Stopped.')); }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { p.catch(() => {}); reject(new Error('Stopped.')); };
    signal.addEventListener('abort', onAbort, { once: true });
    p.then((v) => { signal.removeEventListener('abort', onAbort); resolve(v); }, (e) => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}
