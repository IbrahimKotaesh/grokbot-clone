import { useStore } from '../store';

/** Sidebar folders: group Bots by area. Every change reloads the list so all views agree. */
async function req(method: string, path: string, body?: unknown) {
  const r = await fetch(`/api${path}`, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'Something went wrong.');
  await useStore.getState().loadBots().catch(() => {});
  return d;
}
export const foldersApi = {
  create: (name: string) => req('POST', '/folders', { name }) as Promise<{ folder: { id: string; name: string } }>,
  rename: (id: string, name: string) => req('PATCH', `/folders/${id}`, { name }),
  remove: (id: string) => req('DELETE', `/folders/${id}`),
  move: (botId: string, folderId: string | null) => req('POST', `/bots/${botId}/folder`, { folderId }),
};
