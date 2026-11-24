import {executionEnvironment, isMacDesktop} from './desktop';
import {disableDevicePush} from './push';
import type { Bot, BotChat, ComputerState, LiveState, Routine, Row, Toolkit, User } from '@shared/types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface BillingPlan { id: string; name: string; priceUsd: number | null; bots: number | null; computer: boolean; computerHours: number | null; highlights: string[] }
export interface BillingSummary { plan: string; renewsAt: number | null; trialUntil?: number | null; trialAvailable?: boolean; plans: BillingPlan[]; usage: { bots: number; computerMinutes: number }; source: 'apple' | 'google' | 'stripe' | null; webCheckout: boolean }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* not json */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AppsResponse { configured?: boolean; apps: Toolkit[]; connected: string[]; categories: string[]; total: number }

export interface RoomMember { id: string; name: string; label: string; avatarShape: string; avatarColor: string }

export const api = {
  me: () => req<{ user: User | null; devLogin: boolean; googleLogin: boolean; passwordLogin?: boolean; localAccount: {email:string;name:string} | null }>('GET', '/auth/me'),
  devLogin: (email: string, name?: string) => req<{ ok: true }>('POST', '/auth/dev', { email, name }),
  logout: async () => {await disableDevicePush().catch(()=>{});return req<{ok:true}>('POST','/auth/logout');},

  bots: () => req<{ bots: Bot[]; live: LiveState[] }>('GET', '/bots'),
  createBot: (b: Pick<Bot, 'name' | 'avatarShape' | 'avatarColor' | 'mode'> & Partial<Pick<Bot, 'label' | 'description' | 'instructions'>>) => req<{ bot: Bot }>('POST', '/bots', b),
  markRead: (id: string) => req<{ ok: true }>('POST', `/bots/${id}/read`),
  rows: (id: string,generation?:number) => req<{ generation: number; rows: Row[] }>('GET', `/bots/${id}/rows${generation===undefined?'':'?generation='+generation}`),
  send: (id: string, text: string, images?: {name:string;dataUrl:string}[], files?: {name:string;dataUrl:string}[],generation?:number) => req<{ row: Row }>('POST', `/bots/${id}/messages`, { text,generation,...executionEnvironment(), ...(images?.length ? {images} : {}), ...(files?.length ? {files} : {}) }),
  chats:(id:string)=>req<{chats:BotChat[]}>('GET',`/bots/${id}/chats`),
  createChat:(id:string,title?:string)=>req<{chat:BotChat}>('POST',`/bots/${id}/chats`,{title}),
  renameChat:(id:string,generation:number,title:string)=>req<{chat:BotChat}>('PATCH',`/bots/${id}/chats/${generation}`,{title}),
  search: (q: string) => req<{ results: { botId: string; generation: number; seq: number; createdAt: number; role: 'user' | 'assistant'; from: string | null; chat: string | null; snippet: string }[] }>('GET', `/search?q=${encodeURIComponent(q)}`),
  weekStats: () => req<{ steps: number; replies: number; tasksDone: number; minutes: number }>('GET', '/stats/week'),
  billing: () => req<BillingSummary>('GET', '/billing'),
  checkout: (plan: string) => req<{ url: string }>('POST', '/billing/checkout', { plan }),
  billingPortal: () => req<{ url: string }>('POST', '/billing/portal'),
  morningBrief: () => req<{ available: boolean; enabled: boolean; hour: number }>('GET', '/morning-brief'),
  setMorningBrief: (enabled: boolean, hour: number) => req<{ enabled: boolean; hour: number }>('PUT', '/morning-brief', { enabled, hour, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  regenerate: (id: string, generation?: number) => req<{ ok: true }>('POST', `/bots/${id}/regenerate`, { generation, ...executionEnvironment() }),
  interrupt: (id: string,generation?:number) => req<{ ok: true }>('POST', `/bots/${id}/interrupt`,{generation}),
  fresh: (id: string) => req<{ ok: true }>('POST', `/bots/${id}/fresh`),

  approve: (approvalId: string, decision: 'allow' | 'always' | 'deny') => req<{ ok: true }>('POST', `/approvals/${approvalId}`, { decision }),
  answer: (id: string, seq: number, answer: string,generation?:number) => req<{ ok: true }>('POST', `/bots/${id}/cards/${seq}/answer`, { answer,generation,...executionEnvironment() }),
  dismiss: (id: string, seq: number,generation?:number) => req<{ ok: true }>('POST', `/bots/${id}/cards/${seq}/dismiss`,{generation}),

  routines: (id: string) => req<{ routines: Routine[] }>('GET', `/bots/${id}/routines`),
  setRoutine: (rid: string, enabled: boolean) => req<{ routine: Routine }>('PATCH', `/routines/${rid}`, { enabled }),

  computer: () => req<{ computer: ComputerState }>('GET', '/computer'),
  ensureComputer: () => req<{ computer: ComputerState }>('POST', '/computer/ensure'),
  restartBotComputer: (botId: string) => req<{ ok: boolean }>('POST', `/bots/${botId}/computer/restart`),

  apps: (search = '', category = '') => req<AppsResponse>('GET', `/apps?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`),
  connect: (slug: string, botId?: string, seq?: number,generation?:number) => req<{ redirectUrl: string }>('POST', `/apps/${slug}/connect`, { botId, seq,generation }),
  disconnect: (slug: string) => req<{ ok: true }>('DELETE', `/apps/${slug}`),

  roomMembers: (id: string) => req<{ members: RoomMember[] }>('GET', `/rooms/${id}/members`),
  setRoomMembers: (id: string, botIds: string[]) => req<{ ok: true; members: string[] }>('PUT', `/rooms/${id}/members`, { botIds }),
  createRoom: (name: string, botIds: string[]) => req<{ id: string }>('POST', '/rooms', { name, botIds }),
};

/**
 * Open an app's sign-in (Google Calendar, Gmail…) to connect it. In a browser the window opens straight at
 * Fino's own /connect/go address, which redirects to the sign-in page: no blank window that has to be
 * filled in after a request (Safari can leave that one empty). The Mac app opens links in the default
 * browser, where you're not signed in to Fino, so there it asks the server first and opens the sign-in page itself.
 */
export async function connectApp(slug: string, ctx: { botId?: string; seq?: number; generation?: number } = {}) {
  if (!isMacDesktop()) {
    const q = new URLSearchParams();
    if (ctx.botId) q.set('bot', ctx.botId);
    if (ctx.seq) q.set('seq', String(ctx.seq));
    if (ctx.generation !== undefined) q.set('generation', String(ctx.generation));
    const popup = openPopup(`/api/apps/${encodeURIComponent(slug)}/connect/go${q.toString() ? `?${q}` : ''}`);
    if (popup) return;
  }
  // Mac app, or the browser blocked the window: get the sign-in address and open it.
  const { redirectUrl } = await api.connect(slug, ctx.botId, ctx.seq, ctx.generation);
  window.open(redirectUrl, '_blank');
}

/** Open a Composio redirect in a centered popup. */
export function openPopup(url: string) {
  const w = 520, h = 680;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  return window.open(url, 'grokbot-connect', `width=${w},height=${h},left=${left},top=${top}`);
}
