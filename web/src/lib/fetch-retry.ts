/**
 * fetch that rides out a server restart (each update restarts it for a couple of seconds).
 * While the server is down the proxy answers 502/503/504, which means the request never reached Badr,
 * so it's safe to send again, even a message. A network error (no answer at all) is only retried for reads,
 * since a write might have arrived. Gives up after about 10 seconds and returns the last answer.
 */
const WAITS = [700, 1200, 1800, 2500, 3500];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchThroughRestart(url: string, init: RequestInit = {}): Promise<Response> {
  const read = !init.method || init.method === 'GET' || init.method === 'HEAD';
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, init);
      if ((res.status === 502 || res.status === 503 || res.status === 504) && i < WAITS.length) { await sleep(WAITS[i]); continue; }
      return res;
    } catch (e) {
      if (!read || i >= WAITS.length) throw e;
      await sleep(WAITS[i]);
    }
  }
}
