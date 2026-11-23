import type { ServerEvent } from '@shared/types';
import { useStore } from '../store';

/**
 * One EventSource for the whole app. EventSource retries on its own, but a server restart
 * can leave it CLOSED, so we also reconnect manually with backoff and resync on reconnect.
 */
export function startEvents(): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let retry = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let everConnected = false;
  // The server pings every 20s. A proxy can keep a dead stream "open" after a server restart without
  // ever reporting an error, so silence for 50s means: drop it and reconnect (which also resyncs).
  let lastSeen = Date.now();
  const watchdog = setInterval(() => {
    if (stopped || !es || Date.now() - lastSeen < 50_000) return;
    es.close(); es = null; useStore.getState().set({ sseConnected: false });
    clearTimeout(timer); open();
  }, 10_000);

  const resync = () => {
    const st = useStore.getState();
    st.loadBots().catch(() => {});
    st.loadComputer().catch(() => {});
    if (st.selectedBotId) { st.loadRows(st.selectedBotId).catch(() => {}); st.loadRoutines(st.selectedBotId).catch(() => {}); }
  };

  const open = () => {
    if (stopped) return;
    lastSeen = Date.now();
    es = new EventSource('/api/events', { withCredentials: true });
    es.onopen = () => {
      retry = 1000;
      useStore.getState().set({ sseConnected: true });
      if (everConnected) resync();
      everConnected = true;
    };
    es.onmessage = (m) => {
      lastSeen = Date.now();
      try { useStore.getState().handleEvent(JSON.parse(m.data) as ServerEvent); } catch (e) { console.warn('bad event', e); }
    };
    es.onerror = () => {
      useStore.getState().set({ sseConnected: false });
      if (es?.readyState === EventSource.CLOSED) {
        es = null;
        timer = setTimeout(open, retry);
        retry = Math.min(retry * 2, 15_000);
      }
    };
  };
  open();
  return () => { stopped = true; clearTimeout(timer); clearInterval(watchdog); es?.close(); };
}
