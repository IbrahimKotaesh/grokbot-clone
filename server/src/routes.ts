import { createHash, randomBytes } from 'node:crypto';
import { verifyAppleIdentityToken } from './apple-auth.js';
import { hostedSummary } from './hosted-models.js';
import { accountApi } from './account.js';
import { claudeCodeApi } from './claude-code.js';
import { assertCanCreateBot, PlanLimitError } from './plans.js';
import { billingApi } from './billing.js';
import { credentialsApi } from './credentials.js';
import {resolveDesktopTarget,type DesktopTarget} from './desktop-device.js';
import {inChat} from './lib/chat-scope.js';
import {createChat,listChats,renameChat,validChat,ensureChats} from './chats.js';
import {invalidateProviderSession} from './agent/context.js';
import {queueAutomaticMemory} from './agent/automatic-memory.js';
import { pushApi } from './notifications.js';
import { issueNativeTicket, redeemNativeTicket, validChallenge,issueConnectionTicket,redeemConnectionTicket } from './lib/native-auth.js';
import './attachments.js';
import { validateDocuments,extractDocuments,saveDocuments } from './documents.js';
import { sheetPreview, SheetError } from './sheets.js';
import { bodyLimit } from 'hono/body-limit';
import { validateImages, saveImages } from './images.js';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db, now } from './db.js';
import { env } from './env.js';
import { newId } from './lib/ids.js';
import { hub } from './lib/hub.js';
import { createSession, destroySession, requireUser, userFromRequest, userFromCookieHeader, type AuthVars } from './lib/auth.js';
import { reorderBots, allLive, appendRow, clearConversation, emitBot, getLive, getBot, getBotRow, getRow, listBots, listRoutines, listRows, listTasks, toRoutine, updateRow } from './store.js';
import { enqueue, interrupt, isBotBusy, resolveApproval } from './agent/loop.js';
import { closeBotBrowser, computerState, ensureComputer, refreshComputer, restartBotComputer, suspendComputer } from './computer.js';
import { orgo } from './orgo.js';
import { catalog, connectedToolkits, deleteConnection, disconnect, googleProfile, startConnect, startGoogleLogin, toolkitInfo } from './composio.js';
import { runRoutine, scheduleRoutine, unscheduleRoutine } from './routines.js';
import { deleteEventTrigger } from './triggers.js';
import { dispatchRoomMessage } from './agent/rooms.js';
import { voiceApi } from './voice.js';
import { transcriptionApi } from './transcription.js';
import { createBot } from './bots.js';
import type { Toolkit } from './types.js';
import { passwordApi, emailProven } from './routes-password.js';

export const api = new Hono<AuthVars>();

function findOrCreateUser(email: string, name?: string, preferId?: string) {
  const existing = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email) as any;
  if (existing) return { id: existing.id as string, isNew: false };
  const id = preferId ?? newId('usr');
  db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id, email, name ?? email.split('@')[0], now());
  createBot(id, { name: 'Bart', label: 'Chief of Staff', description: 'Your main point of contact. Checks in proactively and coordinates work with your other Bots.', avatarShape: 'accountant', avatarColor: 'yellow', isPrimary: true });
  return { id, isNew: true };
}

// ---------- auth ----------

api.route('/auth/password', passwordApi(findOrCreateUser));

api.get('/auth/me', (c) => {
  const user = userFromRequest(c);
  const localAccount = env.devLogin && env.computerProvider === 'local'
    ? db.prepare('SELECT email, name FROM users ORDER BY created_at ASC LIMIT 1').get() ?? null : null;
  return c.json({ user, devLogin: env.devLogin, googleLogin: googleDirect() || env.composioKey !== 'disabled', passwordLogin: true, localAccount });
});

const googleDirect = () => !!(env.googleClientId && env.googleClientSecret);
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

api.get('/auth/google/start', async (c) => {
  if (!googleDirect() && env.composioKey === 'disabled') return c.redirect(`${env.appUrl}/?login=google-unavailable`);
  try {
    const nativeChallenge = c.req.query('native_challenge') ?? '';
    if (nativeChallenge && !validChallenge(nativeChallenge)) return c.json({ error: 'invalid challenge' }, 400);
    const attemptId = newId('login');
    const provisional = newId('usr');
    // Direct "Sign in with Google": only the name and email (openid email profile), with PKCE and a nonce.
    if (googleDirect()) {
      const verifier = b64url(randomBytes(32)), nonce = b64url(randomBytes(16));
      db.prepare('INSERT INTO login_attempts(id,provisional_user_id,connected_account_id,created_at,native_challenge,code_verifier,nonce) VALUES (?,?,?,?,?,?,?)')
        .run(attemptId, provisional, null, now(), nativeChallenge || null, verifier, nonce);
      const q = new URLSearchParams({
        client_id: env.googleClientId,
        redirect_uri: `${env.serverUrl}/api/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: attemptId,
        nonce,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    }
    const cb = `${env.serverUrl}/api/auth/google/callback?attempt=${attemptId}`;
    const { redirectUrl, connectedAccountId } = await startGoogleLogin(provisional, cb);
    db.prepare('INSERT INTO login_attempts(id,provisional_user_id,connected_account_id,created_at) VALUES (?,?,?,?)').run(attemptId, provisional, connectedAccountId ?? null, now());
    if (nativeChallenge) db.prepare('UPDATE login_attempts SET native_challenge=? WHERE id=?').run(nativeChallenge, attemptId);
    return c.redirect(redirectUrl);
  } catch (error: any) {
    console.warn('[auth] Google sign-in could not start; provider status:', error?.status ?? 'unavailable');
    return c.redirect(`${env.appUrl}/?login=google-failed`);
  }
});

/** Exchanges Google's code for the ID token and returns the verified email and name. */
async function googleIdentity(code: string, attempt: { code_verifier: string; nonce: string }): Promise<{ email: string; name?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.googleClientId, client_secret: env.googleClientSecret, redirect_uri: `${env.serverUrl}/api/auth/google/callback`, grant_type: 'authorization_code', code_verifier: attempt.code_verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  const token = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!res.ok || !token.id_token) throw new Error(`Google token exchange failed (${res.status})`);
  // The ID token comes straight from Google's token endpoint over TLS with our secret, so its claims are trusted
  // (OpenID Connect Core 3.1.3.7); we still check who it is for, who issued it, freshness, the nonce and the email.
  const claims = JSON.parse(Buffer.from(token.id_token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  const okIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!okIssuer || claims.aud !== env.googleClientId || !(claims.exp * 1000 > Date.now()) || claims.nonce !== attempt.nonce) throw new Error('Google ID token rejected');
  if (!claims.email || claims.email_verified !== true) throw new Error('Google account email is not verified');
  return { email: String(claims.email), name: typeof claims.name === 'string' ? claims.name : undefined };
}

api.get('/auth/google/callback', async (c) => {
  // Direct Google sign-in comes back with ?code&state; the Composio flow with ?attempt.
  if (c.req.query('state')) {
    const attempt = db.prepare('SELECT * FROM login_attempts WHERE id=?').get(c.req.query('state') ?? '') as any;
    const code = c.req.query('code');
    if (!attempt || !attempt.code_verifier || now() - attempt.created_at > 15 * 60_000 || !code) return c.redirect(`${env.appUrl}/?login=failed`);
    db.prepare('DELETE FROM login_attempts WHERE id=?').run(attempt.id);
    try {
      const profile = await googleIdentity(code, attempt);
      if (env.allowedEmails.length && !env.allowedEmails.includes(profile.email.toLowerCase())) return c.redirect(`${env.appUrl}/?login=not-allowed`);
      const { id, isNew } = findOrCreateUser(profile.email, profile.name, attempt.provisional_user_id);
      if (!isNew) emailProven(id);
      if (attempt.native_challenge) return c.redirect(`fino://auth?code=${encodeURIComponent(issueNativeTicket(id, attempt.native_challenge))}`);
      createSession(c, id);
      return c.redirect(`${env.appUrl}/`);
    } catch (e: any) {
      console.error('[auth] google sign-in', e?.message ?? e);
      return c.redirect(`${env.appUrl}/?login=failed`);
    }
  }
  const attempt = db.prepare('SELECT * FROM login_attempts WHERE id=?').get(c.req.query('attempt') ?? '') as any;
  const caId = c.req.query('connected_account_id') ?? attempt?.connected_account_id;
  if (!attempt || now() - attempt.created_at > 15 * 60_000 || c.req.query('status') === 'failed' || !caId) return c.redirect(`${env.appUrl}/?login=failed`);
  if (attempt.connected_account_id && caId !== attempt.connected_account_id) return c.redirect(`${env.appUrl}/?login=failed`);
  db.prepare('DELETE FROM login_attempts WHERE id=?').run(attempt.id);
  try {
    const profile = await googleProfile(caId, attempt.provisional_user_id);
    if (env.allowedEmails.length && !env.allowedEmails.includes(profile.email.toLowerCase())) {
      await deleteConnection(caId);
      return c.redirect(`${env.appUrl}/?login=not-allowed`);
    }
    const { id, isNew } = findOrCreateUser(profile.email, profile.name, attempt.provisional_user_id);
    // Existing user: the Gmail connection made for sign-in belongs to a throwaway id; remove it.
    if (!isNew && id !== attempt.provisional_user_id) await deleteConnection(caId);
    if (!isNew) emailProven(id);
    if (attempt.native_challenge) {
      const code = issueNativeTicket(id, attempt.native_challenge);
      return c.redirect(`fino://auth?code=${encodeURIComponent(code)}`);
    }
    createSession(c, id);
    return c.redirect(`${env.appUrl}/`);
  } catch (e: any) {
    console.error('[auth] google callback', e);
    return c.redirect(`${env.appUrl}/?login=failed`);
  }
});

api.post('/auth/native/exchange', async (c) => {
  const body = await c.req.parseBody();
  const id = redeemNativeTicket(String(body.code ?? ''), String(body.verifier ?? ''));
  const owner = id ? db.prepare('SELECT email FROM users WHERE id=?').get(id) as any : null;
  if (!owner || (env.allowedEmails.length && !env.allowedEmails.includes(owner.email.toLowerCase()))) return c.json({ error: 'invalid or expired login' }, 401);
  createSession(c, id!);
  return c.redirect(`${env.appUrl}/`, 303);
});

// React Native exchanges the same short-lived PKCE ticket without a WebView.
// No provider credentials or long-lived session ever enter the callback URL.
api.post('/auth/native/session', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = redeemNativeTicket(String(body.code ?? ''), String(body.verifier ?? ''));
  const owner = id ? db.prepare('SELECT email FROM users WHERE id=?').get(id) as {email:string}|undefined : null;
  if (!owner || (env.allowedEmails.length && !env.allowedEmails.includes(owner.email.toLowerCase()))) return c.json({error:'invalid or expired login'},401);
  const session = createSession(c,id!);
  return c.json({session});
});

// Sign in with Apple (native). Accounts are matched by Apple's stable user id, then by email.
if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some((col) => col.name === 'apple_sub')) db.exec('ALTER TABLE users ADD COLUMN apple_sub TEXT');
api.post('/auth/apple', async (c) => {
  const body = await c.req.json<{ identityToken?: string; fullName?: string }>().catch(() => ({}) as { identityToken?: string; fullName?: string });
  let who;
  try {
    who = await verifyAppleIdentityToken(String(body.identityToken ?? ''));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 401);
  }
  const linked = db.prepare('SELECT id, email FROM users WHERE apple_sub=?').get(who.sub) as { id: string; email: string } | undefined;
  let id = linked?.id;
  let email = linked?.email ?? who.email;
  if (!id) {
    if (!email) return c.json({ error: 'Apple did not share an email address. Try again and choose to share or hide your email.' }, 400);
    id = findOrCreateUser(email, String(body.fullName ?? '').trim().slice(0, 80) || undefined).id;
    db.prepare('UPDATE users SET apple_sub=? WHERE id=?').run(who.sub, id);
    if (who.email) emailProven(id);
  }
  if (env.allowedEmails.length && !env.allowedEmails.includes(String(email).toLowerCase())) return c.json({ error: 'This account is not allowed on this server.' }, 403);
  return c.json({ session: createSession(c, id) });
});

api.post('/auth/dev', async (c) => {
  if (!env.devLogin) return c.json({ error: 'disabled' }, 403);
  const { email, name, native } = await c.req.json<{ email: string; name?: string; native?: boolean }>();
  if (!email?.includes('@')) return c.json({ error: 'email required' }, 400);
  const { id } = findOrCreateUser(email, name);
  const session = createSession(c, id);
  return c.json(native ? {ok:true,session} : { ok: true });
});

api.post('/auth/logout', (c) => { destroySession(c); return c.json({ ok: true }); });

// everything below requires a session
api.use('/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/') || c.req.path.startsWith('/api/apps/callback') || c.req.path === '/api/health') return next();
  return requireUser(c, next);
});

// ---------- events (SSE) ----------

api.get('/events', (c) => {
  const user = c.get('user');
  return streamSSE(c, async (stream) => {
    const queue: string[] = [];
    let wake: (() => void) | null = null;
    const unsub = hub.subscribe(user.id, (ev) => { queue.push(JSON.stringify(ev)); wake?.(); });
    stream.onAbort(() => { unsub(); wake?.(); });
    await stream.writeSSE({ data: JSON.stringify({ type: 'hello', serverTime: now() }) });
    while (!stream.aborted&&userFromRequest(c)?.id===user.id) {
      if (!queue.length) {
        await Promise.race([new Promise<void>((r) => (wake = r)), new Promise((r) => setTimeout(r, 20_000))]);
        wake = null;
        if (!queue.length) { await stream.writeSSE({ data: JSON.stringify({ type: 'ping' }) }); continue; }
      }
      if(userFromRequest(c)?.id!==user.id)break;
      while (queue.length) await stream.writeSSE({ data: queue.shift()! });
    }
    unsub();
  });
});

// ---------- bots ----------

const ownBot = (userId: string, id: string) => {
  const b = getBotRow(id);
  return b && b.user_id === userId ? b : null;
};

api.get('/bots', (c) => c.json({ bots: listBots(c.get('user').id), live: allLive(c.get('user').id) }));

api.post('/bots/reorder',async c=>{const body=await c.req.json().catch(()=>({}));if(!Array.isArray(body.ids)||body.ids.length>1000||body.ids.some((id:unknown)=>typeof id!=='string'))return c.json({error:'Invalid bot order.'},400);try{return c.json({bots:reorderBots(c.get('user').id,body.ids)});}catch{return c.json({error:'The bot list changed. Refresh and try again.'},409);}});

api.post('/bots', async (c) => {
  try {
    assertCanCreateBot(c.get('user').id);
  } catch (e) {
    if (e instanceof PlanLimitError) return c.json({ error: e.message, code: 'plan_limit', feature: e.feature }, 402);
    throw e;
  }
  const body = await c.req.json();
  return c.json({ bot: createBot(c.get('user').id, body) });
});

api.patch('/bots/:id', async (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  const p = await c.req.json();
  if (p.permissionMode !== undefined && !['read_only','balanced','ask','autonomous'].includes(p.permissionMode)) return c.json({error:'Invalid permissions.'},400);
  if (p.agentProvider !== undefined && !['codex', 'claude', 'claude-code', 'xai', 'openrouter', 'groq'].includes(p.agentProvider)) return c.json({error:'Choose a supported model provider.'},400);
  if (p.model !== undefined && (typeof p.model !== 'string' || p.model.length > 100 || /[\r\n]/.test(p.model))) return c.json({error:'Invalid model.'},400);
  if (p.label !== undefined && (typeof p.label !== 'string' || p.label.length > 60 || /[\r\n]/.test(p.label))) return c.json({error:'Keep the job title to one short line.'},400);
  if ((p.agentProvider !== undefined || p.model !== undefined) && getLive(b.id).isRunning) return c.json({error:'Wait for the current turn to finish before changing models.'},409);
  if(p.agentProvider!==undefined&&p.agentProvider!==(b.agent_provider??env.agentProvider))invalidateProviderSession(b.id,p.agentProvider);
  const cols: Record<string, string> = { permissionMode: 'permission_mode', agentProvider: 'agent_provider', model: 'model', name: 'name', label: 'label', description: 'description', instructions: 'instructions', avatarShape: 'avatar_shape', avatarColor: 'avatar_color', mode: 'mode', effort: 'effort', pinned: 'pinned', voice: 'voice', voiceSpeed: 'voice_speed', voiceLanguage: 'voice_language' };
  for (const [k, col] of Object.entries(cols)) {
    if (p[k] !== undefined) db.prepare(`UPDATE bots SET ${col}=?, updated_at=? WHERE id=?`).run(typeof p[k] === 'boolean' ? (p[k] ? 1 : 0) : p[k], now(), b.id);
  }
  emitBot(b.id);
  return c.json({ bot: getBot(b.id) });
});

api.delete('/bots/:id', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  for (const r of listRoutines(b.id)) unscheduleRoutine(r.id);
  const lease = db.prepare('SELECT screen_id FROM screens WHERE bot_id=?').get(b.id) as { screen_id: string } | undefined;
  void closeBotBrowser(c.get('user').id, b.id, lease?.screen_id);
  db.prepare('DELETE FROM screens WHERE bot_id=?').run(b.id);
  db.prepare('DELETE FROM bots WHERE id=?').run(b.id);
  hub.emit(c.get('user').id, { type: 'roster' });
  return c.json({ ok: true });
});

api.post('/bots/:id/primary', (c) => {
  const user = c.get('user');
  const b = ownBot(user.id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  db.prepare('UPDATE bots SET is_primary = (id = ?) WHERE user_id=?').run(b.id, user.id);
  hub.emit(user.id, { type: 'roster' });
  return c.json({ ok: true });
});

api.post('/bots/:id/read', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  db.prepare('UPDATE bots SET unread=0 WHERE id=?').run(b.id);
  emitBot(b.id);
  return c.json({ ok: true });
});

// ---------- conversation ----------

api.get('/bots/:id/chats',c=>{const b=ownBot(c.get('user').id,c.req.param('id'));if(!b)return c.json({error:'not found'},404);return c.json({chats:listChats(b.id)});});
api.post('/bots/:id/chats',async c=>{const b=ownBot(c.get('user').id,c.req.param('id'));if(!b)return c.json({error:'not found'},404);if(b.kind==='room')return c.json({error:'Group chats already have their own conversation.'},400);const input=await c.req.json().catch(()=>({}));const chat=createChat(b.id,typeof input.title==='string'?input.title:'New chat');return c.json({chat},201);});
api.patch('/bots/:id/chats/:generation',async c=>{const b=ownBot(c.get('user').id,c.req.param('id'));if(!b)return c.json({error:'not found'},404);const generation=Number(c.req.param('generation'));if(!validChat(b.id,generation))return c.json({error:'Chat not found.'},404);const input=await c.req.json().catch(()=>({}));if(typeof input.title!=='string'||!input.title.trim())return c.json({error:'Enter a chat name.'},400);return c.json({chat:renameChat(b.id,generation,input.title)});});

api.get('/bots/:id/rows', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  const beforeSeq = c.req.query('beforeSeq') ? Number(c.req.query('beforeSeq')) : undefined;
  ensureChats(b.id);const generation=Number(c.req.query('generation')??b.generation);if(!validChat(b.id,generation))return c.json({error:'Chat not found.'},404);
  return inChat(b.id,generation,()=>c.json({ generation, rows: listRows(b.id, { beforeSeq, limit: Number(c.req.query('limit') ?? 200) }) }));
});

api.get('/bots/:id/attachments/:fileId', (c) => {
  if(!ownBot(c.get('user').id,c.req.param('id')))return c.json({error:'not found'},404);
  const file=db.prepare('SELECT name,mime,data FROM message_files WHERE id=? AND bot_id=? AND user_id=?').get(c.req.param('fileId'),c.req.param('id'),c.get('user').id) as {name:string;mime:string;data:Buffer}|undefined;
  if(!file)return c.json({error:'not found'},404);
  const disposition=c.req.query('download')==='1'||file.mime!=='application/pdf'?'attachment':'inline';
  return c.body(file.data,200,{'Content-Type':file.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${disposition}; filename="document"; filename*=UTF-8''${encodeURIComponent(file.name)}`});
});

api.get('/bots/:id/images/:imageId', (c) => {
  if (!ownBot(c.get('user').id,c.req.param('id'))) return c.json({error:'not found'},404);
  const image=db.prepare('SELECT mime,data FROM message_images WHERE id=? AND bot_id=? AND user_id=?').get(c.req.param('imageId'),c.req.param('id'),c.get('user').id) as {mime:string;data:Buffer}|undefined;
  if(!image) return c.json({error:'not found'},404);
  return c.body(image.data,200,{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
});

api.get('/hosted-models', (c) => c.json(hostedSummary(c.get('user').id)));

api.post('/bots/:id/messages', bodyLimit({maxSize:42*1024*1024,onError:c=>c.json({error:'Attachments are too large. Files: 10 MB each, 20 MB total; photos: 3 MB each.'},413)}), async (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  let body;
  try { body=await c.req.json(); } catch { return c.json({error:'Invalid message.'},400); }
  if(!body || typeof body !== 'object' || Array.isArray(body)) return c.json({error:'Invalid message.'},400);
  const generation=body.generation??b.generation;if(!validChat(b.id,generation))return c.json({error:'Chat not found.'},404);
  let desktopTarget:DesktopTarget|null;try{desktopTarget=resolveDesktopTarget(c.get('user').id,body.desktopEnvironment);}catch(e){return c.json({error:(e as Error).message},409);}
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  let photos,documents;
  try { photos=validateImages(body.images); documents=await extractDocuments(validateDocuments(body.files)); } catch(e) { return c.json({error:(e as Error).message},400); }
  if (!text && !photos.length && !documents.length) return c.json({ error: 'empty' }, 400);
  const {row,images,files}=inChat(b.id,generation,()=>db.transaction(()=>{
    const files=saveDocuments(c.get('user').id,b.id,documents);
    const images=saveImages(c.get('user').id,b.id,photos);
    const row=appendRow(b.id,'message',{type:'message',role:'user',text,...(images.length?{images}:{}),...(files.length?{files}:{})});
    return {row,images,files};
  })());
  const imageIds=images.map(image=>image.id);
  queueAutomaticMemory(b.id,generation,row.seq);
  const fileIds=files.map(file=>file.id);
  const prompt=text || (files.length?'Read and summarize the attached documents.':'Describe the attached photo.');
  if (b.kind === 'room') dispatchRoomMessage(b.id,prompt,enqueue,imageIds,fileIds);
  else enqueue(b.id, { type: 'user',generation,desktopTarget, text:prompt,imageIds,fileIds });
  return c.json({ row });
});

// Try the last reply again: the old reply is set aside (kept, not shown) and the bot answers the same message anew.
api.post('/bots/:id/regenerate', async (c) => {
  const user = c.get('user');
  const b = ownBot(user.id, c.req.param('id'));
  if (!b || b.kind === 'room') return c.json({ error: 'not found' }, 404);
  const input = await c.req.json().catch(() => ({}));
  const generation = input.generation ?? b.generation;
  if (!validChat(b.id, generation)) return c.json({ error: 'Chat not found.' }, 404);
  if (getLive(b.id).isRunning || isBotBusy(b.id)) return c.json({ error: 'Wait for the bot to finish first.' }, 409);
  let desktopTarget: DesktopTarget | null;
  try { desktopTarget = resolveDesktopTarget(user.id, input.desktopEnvironment); } catch (e) { return c.json({ error: (e as Error).message }, 409); }
  const result = inChat(b.id, generation, () => {
    const rows = listRows(b.id, { limit: 300 }).filter((r) => !r.body.replaced);
    let i = rows.length - 1;
    while (i >= 0 && !(rows[i].body.type === 'message' && (rows[i].body as any).role === 'user')) i--;
    const asked = rows[i];
    const after = rows.slice(i + 1);
    if (!asked || (asked.body as any).from || !after.some((r) => r.body.type === 'message' && (r.body as any).role === 'assistant')) return null;
    for (const r of after) updateRow(b.id, r.seq, { ...r.body, replaced: true });
    return asked.body as any;
  });
  if (!result) return c.json({ error: 'There is no reply to try again.' }, 400);
  const text = result.text || (result.files?.length ? 'Read and summarize the attached documents.' : 'Describe the attached photo.');
  enqueue(b.id, {
    type: 'user', generation, desktopTarget,
    text: `${text}\n\n[The person asked you to try again: write a new, better reply to this same message. Don't mention this note.]`,
    imageIds: (result.images ?? []).map((x: any) => x.id), fileIds: (result.files ?? []).map((x: any) => x.id),
  });
  return c.json({ ok: true });
});

api.post('/bots/:id/interrupt', async (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  const input=await c.req.json().catch(()=>({}));
  if(input.generation!==undefined&&(!validChat(b.id,input.generation)||(getLive(b.id).generation!==undefined&&getLive(b.id).generation!==input.generation)))return c.json({error:'This bot is working in another chat.'},409);
  interrupt(b.id);
  return c.json({ ok: true });
});

api.post('/bots/:id/fresh', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  interrupt(b.id);
  clearConversation(b.id);
  emitBot(b.id);
  return c.json({ ok: true });
});

api.post('/approvals/:id', async (c) => {
  const { decision } = await c.req.json<{ decision: 'allow' | 'always' | 'deny' }>();
  try { resolveApproval(c.get('user').id, c.req.param('id'), decision); } catch { return c.json({ error: 'not found' }, 404); }
  return c.json({ ok: true });
});

api.post('/bots/:id/cards/:seq/answer',async c=>{
 const b=ownBot(c.get('user').id,c.req.param('id'));if(!b)return c.json({error:'not found'},404);
 const input=await c.req.json().catch(()=>({})),generation=input.generation??b.generation;
 let desktopTarget:DesktopTarget|null;try{desktopTarget=resolveDesktopTarget(c.get('user').id,input.desktopEnvironment);}catch(e){return c.json({error:(e as Error).message},409);}
 if(!validChat(b.id,generation))return c.json({error:'Chat not found.'},404);
 return inChat(b.id,generation,()=>{
  const row=getRow(b.id,Number(c.req.param('seq'))),answer=String(input.answer??'').trim();
  if(!row||row.body.type!=='card'||row.body.card!=='question'||!answer)return c.json({error:'not a question or empty answer'},400);
  updateRow(b.id,row.seq,{...row.body,status:'answered',answer});const answerRow=appendRow(b.id,'message',{type:'message',role:'user',text:answer});queueAutomaticMemory(b.id,generation,answerRow.seq);
  enqueue(b.id,{type:'user',generation,desktopTarget,text:`[Answer to "${row.body.question}"] ${answer}`});return c.json({ok:true});
 });
});
api.post('/bots/:id/cards/:seq/dismiss',async c=>{
 const b=ownBot(c.get('user').id,c.req.param('id'));if(!b)return c.json({error:'not found'},404);
 const input=await c.req.json().catch(()=>({})),generation=input.generation??b.generation;if(!validChat(b.id,generation))return c.json({error:'Chat not found.'},404);
 return inChat(b.id,generation,()=>{const row=getRow(b.id,Number(c.req.param('seq')));if(!row||row.body.type!=='card')return c.json({error:'not a card'},400);
  updateRow(b.id,row.seq,{...row.body,status:row.body.card==='connect'?'skipped':'dismissed'} as any);
  if(row.body.card==='connect')enqueue(b.id,{type:'system',generation,text:`The user skipped connecting ${row.body.toolkitName}. Continue without it.`});return c.json({ok:true});
 });
});

// ---------- routines / tasks / memories ----------

api.get('/bots/:id/routines', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  return b ? c.json({ routines: listRoutines(b.id) }) : c.json({ error: 'not found' }, 404);
});

api.patch('/routines/:id', async (c) => {
  const r = db.prepare('SELECT r.* FROM routines r JOIN bots b ON b.id=r.bot_id WHERE r.id=? AND b.user_id=?').get(c.req.param('id'), c.get('user').id) as any;
  if (!r) return c.json({ error: 'not found' }, 404);
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  db.prepare('UPDATE routines SET enabled=? WHERE id=?').run(enabled ? 1 : 0, r.id);
  const next = toRoutine(db.prepare('SELECT * FROM routines WHERE id=?').get(r.id));
  enabled ? scheduleRoutine(next) : unscheduleRoutine(r.id);
  hub.emit(c.get('user').id, { type: 'routines', botId: r.bot_id });
  return c.json({ routine: next });
});

// ---------- search across every chat ----------
// Finds words in anything the person or their bots wrote, in every chat, newest first.
api.get('/search', (c) => {
  const userId = c.get('user').id;
  const q = String(c.req.query('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return c.json({ results: [] });
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = db.prepare(`SELECT r.bot_id, r.generation, r.seq, r.created_at, json_extract(r.body,'$.role') AS role, json_extract(r.body,'$.text') AS text, json_extract(r.body,'$.from.name') AS from_name, ch.title AS chat
    FROM rows r JOIN bots b ON b.id=r.bot_id LEFT JOIN bot_chats ch ON ch.bot_id=r.bot_id AND ch.generation=r.generation
    WHERE b.user_id=? AND r.kind='message' AND json_extract(r.body,'$.text') LIKE ? ESCAPE '\\' AND coalesce(json_extract(r.body,'$.replaced'),0)=0
    ORDER BY r.created_at DESC LIMIT 40`).all(userId, like) as any[];
  const lower = q.toLowerCase();
  const results = rows.map((r) => {
    const text = String(r.text ?? '').replace(/\s+/g, ' ');
    const at = Math.max(0, text.toLowerCase().indexOf(lower));
    const start = Math.max(0, at - 50);
    const snippet = (start ? '…' : '') + text.slice(start, at + q.length + 90) + (at + q.length + 90 < text.length ? '…' : '');
    return { botId: r.bot_id, generation: r.generation, seq: r.seq, createdAt: r.created_at, role: r.role, from: r.from_name ?? null, chat: r.chat ?? null, snippet };
  });
  return c.json({ results });
});

// ---------- this week's work ----------
// What the bots actually did in the last 7 days, and a plain estimate of the time it saved:
// each step (a search, a page read, an email, a click on the computer) ≈ 2 minutes of a person's work,
// each reply ≈ 1 minute. Internal bookkeeping steps don't count.
const QUIET_STEPS = new Set(['react_to_message', 'update_plan', 'stay_silent', 'remember', 'recall', 'update_memory', 'team_updates', 'search_conversation', 'list_routines', 'list_event_triggers', 'list_subagents']);
api.get('/stats/week', (c) => {
  const userId = c.get('user').id;
  const since = now() - 7 * 24 * 3600 * 1000;
  const counts = db.prepare(`SELECT r.kind AS kind, json_extract(r.body,'$.name') AS name, count(*) AS n FROM rows r JOIN bots b ON b.id=r.bot_id
    WHERE b.user_id=? AND r.created_at>=? AND (
      (r.kind='tool-call' AND json_extract(r.body,'$.status')='done') OR
      (r.kind='message' AND json_extract(r.body,'$.role')='assistant' AND coalesce(json_extract(r.body,'$.replaced'),0)=0 AND length(coalesce(json_extract(r.body,'$.text'),''))>0))
    GROUP BY r.kind, name`).all(userId, since) as { kind: string; name: string | null; n: number }[];
  let steps = 0, replies = 0;
  for (const r of counts) {
    if (r.kind === 'message') replies += r.n;
    else if (!QUIET_STEPS.has(r.name ?? '')) steps += r.n;
  }
  const done = (db.prepare("SELECT count(*) AS n FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE b.user_id=? AND t.state='done' AND t.updated_at>=?").get(userId, since) as any).n as number;
  return c.json({ steps, replies, tasksDone: done, minutes: steps * 2 + replies });
});

// ---------- morning brief ----------
// A daily note from the Chief of Staff: what each teammate did since yesterday and what waits for the person.
// It is an ordinary routine on the primary bot, so it also shows (and can be paused) in that bot's routines.
const BRIEF_NAME = 'Morning brief';
const BRIEF_PROMPT = 'Write my morning brief. Call team_updates once with an empty query to see what every teammate did and found recently (one call covers the whole team; only look again for something specific), and check your own recent work. Reply with a short brief in three parts: Done, In progress, Waiting for you (decisions, approvals or replies I owe). One line per item, name the bot. If nothing happened, say so in one line. Never mention tools or limits. Write in the language I usually write to you in. Do not start new work.';
const primaryBot = (userId: string) => db.prepare("SELECT id FROM bots WHERE user_id=? AND is_primary=1 AND coalesce(kind,'agent')!='room'").get(userId) as { id: string } | undefined;
const briefRoutine = (botId: string) => db.prepare('SELECT * FROM routines WHERE bot_id=? AND name=?').get(botId, BRIEF_NAME) as any;

api.get('/morning-brief', (c) => {
  const p = primaryBot(c.get('user').id);
  const r = p && briefRoutine(p.id);
  const hour = r ? Number(String(r.schedule).split(' ')[1]) : 8;
  return c.json({ available: !!p, enabled: !!r?.enabled, hour: Number.isInteger(hour) ? hour : 8 });
});

api.put('/morning-brief', async (c) => {
  const userId = c.get('user').id;
  const p = primaryBot(userId);
  if (!p) return c.json({ error: 'not found' }, 404);
  const input = await c.req.json().catch(() => ({}));
  const hour = Math.min(23, Math.max(0, Math.round(Number(input.hour ?? 8)) || 0));
  let timezone = typeof input.timezone === 'string' ? input.timezone : 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { timezone = 'UTC'; }
  const schedule = `0 ${hour} * * *`;
  let r = briefRoutine(p.id);
  if (r) {
    db.prepare('UPDATE routines SET schedule=?, timezone=?, enabled=?, prompt=? WHERE id=?').run(schedule, timezone, input.enabled ? 1 : 0, BRIEF_PROMPT, r.id);
  } else if (input.enabled) {
    const id = newId('rt');
    db.prepare('INSERT INTO routines(id,bot_id,name,prompt,schedule,timezone,enabled,created_at) VALUES (?,?,?,?,?,?,1,?)').run(id, p.id, BRIEF_NAME, BRIEF_PROMPT, schedule, timezone, now());
    r = { id };
  }
  if (r) {
    const next = toRoutine(db.prepare('SELECT * FROM routines WHERE id=?').get(r.id));
    next.enabled ? scheduleRoutine(next) : unscheduleRoutine(next.id);
    hub.emit(userId, { type: 'routines', botId: p.id });
  }
  return c.json({ enabled: !!input.enabled, hour });
});

api.post('/routines/:id/run', (c) => {
  const r = db.prepare('SELECT r.* FROM routines r JOIN bots b ON b.id=r.bot_id WHERE r.id=? AND b.user_id=?').get(c.req.param('id'), c.get('user').id) as any;
  if (!r) return c.json({ error: 'not found' }, 404);
  runRoutine(r.id);
  return c.json({ ok: true });
});

api.delete('/routines/:id', async (c) => {
  const r = db.prepare('SELECT r.* FROM routines r JOIN bots b ON b.id=r.bot_id WHERE r.id=? AND b.user_id=?').get(c.req.param('id'), c.get('user').id) as any;
  if (!r) return c.json({ error: 'not found' }, 404);
  unscheduleRoutine(r.id);
  await deleteEventTrigger(r.id);
  db.prepare('DELETE FROM routines WHERE id=?').run(r.id);
  hub.emit(c.get('user').id, { type: 'routines', botId: r.bot_id });
  return c.json({ ok: true });
});

api.get('/bots/:id/tasks', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  return b ? c.json({ tasks: listTasks(b.id) }) : c.json({ error: 'not found' }, 404);
});

api.get('/tasks', (c) => {
  const rows = db.prepare('SELECT t.* FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE b.user_id=? ORDER BY t.updated_at DESC LIMIT 200').all(c.get('user').id) as any[];
  return c.json({ tasks: rows.map((r) => ({ id: r.id, botId: r.bot_id, title: r.title, state: r.state, note: r.note, updatedAt: r.updated_at })) });
});

api.get('/bots/:id/memories', (c) => {
  const b = ownBot(c.get('user').id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  const rows = db.prepare('SELECT * FROM memories WHERE bot_id=? ORDER BY created_at DESC').all(b.id) as any[];
  return c.json({ memories: rows.map((m) => ({ id: m.id, botId: m.bot_id, text: m.text, createdAt: m.created_at })) });
});

api.delete('/memories/:id', (c) => {
  db.prepare('DELETE FROM memories WHERE id=? AND bot_id IN (SELECT id FROM bots WHERE user_id=?)').run(c.req.param('id'), c.get('user').id);
  return c.json({ ok: true });
});

// ---------- computer ----------

api.get('/computer', async (c) => c.json({ computer: await refreshComputer(c.get('user').id) }));

api.post('/computer/ensure', async (c) => {
  const userId = c.get('user').id;
  try {
    await ensureComputer(userId);
    return c.json({ computer: computerState(userId) });
  } catch (e) {
    if (e instanceof PlanLimitError) return c.json({ error: e.message, code: 'plan_limit', feature: e.feature }, 402);
    console.warn('[computer] ensure failed', (e as Error).message);
    return c.json({ error: 'The computer could not start. Please try again.' },503);
  }
});

api.post('/computer/suspend', async (c) => {
  await suspendComputer(c.get('user').id);
  return c.json({ computer: computerState(c.get('user').id) });
});

// Restart one bot's screen when it froze (its browser and desktop). Other bots keep working.
api.post('/bots/:id/computer/restart', async (c) => {
  const user = c.get('user');
  const b = ownBot(user.id, c.req.param('id'));
  if (!b || b.kind === 'room') return c.json({ error: 'not found' }, 404);
  try {
    await restartBotComputer(user.id, b.id);
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof PlanLimitError) return c.json({ error: e.message, code: 'plan_limit', feature: e.feature }, 402);
    console.warn('[computer] restart failed', (e as Error).message);
    return c.json({ error: 'The computer could not restart. Please try again.' }, 503);
  }
});

// Which of my bots have their own screen on the computer (for the small screens under the main one).
api.get('/screens', (c) => {
  const rows = db.prepare('SELECT s.bot_id AS botId FROM screens s JOIN bots b ON b.id=s.bot_id WHERE b.user_id=?').all(c.get('user').id) as { botId: string }[];
  return c.json({ botIds: rows.map((r) => r.botId) });
});

api.get('/bots/:id/screenshot', async (c) => {
  const user = c.get('user');
  const b = ownBot(user.id, c.req.param('id'));
  if (!b) return c.json({ error: 'not found' }, 404);
  const comp = db.prepare("SELECT orgo_id FROM computers WHERE user_id=? AND status='running'").get(user.id) as any;
  const scr = db.prepare('SELECT screen_id FROM screens WHERE bot_id=?').get(b.id) as any;
  if (!comp?.orgo_id || !scr) return c.body(null, 204);
  try {
    const s = await orgo.screenshot(comp.orgo_id, scr.screen_id);
    const b64 = s.image.replace(/^data:[^,]+,/, '');
    return c.body(Buffer.from(b64, 'base64'), 200, { 'Content-Type': s.mime_type ?? 'image/jpeg', 'Cache-Control': 'no-store' });
  } catch {
    return c.body(null, 204);
  }
});

// ---------- apps (Composio marketplace) ----------

api.get('/apps', async (c) => {
  const user = c.get('user');
  const search = (c.req.query('search') ?? '').toLowerCase();
  const category = c.req.query('category') ?? '';
  const [all, connected] = await Promise.all([catalog(), connectedToolkits(user.id).catch(() => new Set<string>())]);
  let items: Toolkit[] = all.map((t) => ({ ...t, connected: connected.has(t.slug) }));
  if (search) items = items.filter((t) => t.name.toLowerCase().includes(search) || t.slug.includes(search) || t.description?.toLowerCase().includes(search));
  if (category) items = items.filter((t) => t.categories.some((x) => x.toLowerCase() === category.toLowerCase()));
  const categories = [...new Set(all.flatMap((t) => t.categories))].sort();
  const connectedApps = all.filter((t) => connected.has(t.slug)).map((t) => ({ ...t, connected: true }));
  return c.json({ configured: env.composioKey !== 'disabled', apps: items.slice(0, Number(c.req.query('limit') ?? 120)), connected: [...connected], connectedApps, categories, total: items.length });
});

/** Start connecting an app for this user; the callback returns to the chat card that asked, if any. */
async function beginConnect(userId: string, slug: string, o: { botId?: string; seq?: number; generation?: number; native?: boolean }) {
  const cb = new URL(`${env.serverUrl}/api/apps/callback`);
  cb.searchParams.set('slug', slug);
  if (o.native) cb.searchParams.set('native_ticket', issueConnectionTicket(userId, slug));
  if (o.botId) cb.searchParams.set('bot', o.botId);
  if (o.seq) cb.searchParams.set('seq', String(o.seq));
  if (o.generation !== undefined) {
    if (!o.botId || !ownBot(userId, o.botId) || !validChat(o.botId, o.generation)) throw Object.assign(new Error('Chat not found.'), { status: 404 });
    cb.searchParams.set('generation', String(o.generation));
  }
  return startConnect(userId, slug, cb.toString());
}

api.post('/apps/:slug/connect', async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');
  const { botId, seq,generation,native } = await c.req.json<{ botId?: string; seq?: number;generation?:number;native?:boolean }>().catch(() => ({} as any));
  try { return c.json(await beginConnect(user.id, slug, { botId, seq, generation, native })); }
  catch (e: any) { if (e?.status === 404) return c.json({ error: e.message }, 404); throw e; }
});

// The web app opens its connect window straight at this address (no blank window filled in later, which
// Safari can leave empty), and the server sends it on to the app's sign-in page or shows what went wrong.
api.get('/apps/:slug/connect/go', async (c) => {
  // Only from Fino's own pages: another site must not start connections for a signed-in user.
  const site = c.req.header('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return c.text('Open this from Fino.', 403);
  const user = c.get('user');
  const slug = c.req.param('slug');
  const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));
  try {
    const r = await beginConnect(user.id, slug, { botId: c.req.query('bot') || undefined, seq: num(c.req.query('seq')), generation: num(c.req.query('generation')) });
    return c.redirect(r.redirectUrl, 302);
  } catch (e: any) {
    const msg = String(e?.message ?? 'Something went wrong.').replace(/[<>&"]/g, '');
    return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fino</title><body style="font-family:-apple-system,system-ui,sans-serif;padding:40px 24px;text-align:center;color:#1f1e1d;background:#faf9f5"><h2 style="font-weight:600">Couldn’t start the connection</h2><p style="color:#6f6d66">${msg}</p><p><button onclick="window.close()" style="font:inherit;padding:10px 18px;border-radius:999px;border:0;background:#2f6fe0;color:#fff">Close</button></p></body>`, e?.status === 404 ? 404 : 502);
  }
});

api.get('/apps/callback', async (c) => {
  const slug = c.req.query('slug') ?? '';
  const nativeTicket=c.req.query('native_ticket');
  const userId = (nativeTicket?redeemConnectionTicket(nativeTicket,slug):userFromCookieHeader(c.req.header('cookie'))?.id) ?? '';
  const botId = c.req.query('bot');
  const seq = Number(c.req.query('seq') ?? 0);
  const ok = c.req.query('status') !== 'failed';
  const userExists = db.prepare('SELECT 1 FROM users WHERE id=?').get(userId);
  let verifiedConnection=false;
  if (userExists && ok) {
    const connected = await connectedToolkits(userId).catch(() => new Set<string>());
    if (connected.has(slug)) {
      verifiedConnection=true;
      hub.emit(userId, { type: 'connections' });
      const generation=Number(c.req.query('generation')??(botId?getBot(botId)?.generation:0));
      if (botId && ownBot(userId, botId)&&validChat(botId,generation)) {
        const info = await toolkitInfo(slug);
        if (seq) {
          const row = inChat(botId,generation,()=>getRow(botId, seq));
          if (row?.body.type === 'card' && row.body.card === 'connect'){const body=row.body;inChat(botId,generation,()=>updateRow(botId, seq, { ...body, status: 'connected' }));}
        }
        enqueue(botId, { type: 'system',generation, text: `The user connected ${info?.name ?? slug}. Continue with what you were doing.` });
      }
    }
  }
  if(nativeTicket)return c.redirect(`fino://connected?slug=${encodeURIComponent(slug)}&status=${verifiedConnection?'complete':'failed'}`);
  return c.html(`<!doctype html><meta charset="utf-8"><title>Connected</title><body style="font-family:system-ui;padding:40px;text-align:center">${ok ? 'Connected. You can close this window.' : 'Connection failed.'}<script>try{window.opener&&window.opener.postMessage({type:'grokbot-connected',slug:${JSON.stringify(slug)},ok:${ok}},'*')}catch(e){};setTimeout(()=>window.close(),800)</script></body>`);
});

api.delete('/apps/:slug', async (c) => {
  await disconnect(c.get('user').id, c.req.param('slug'));
  hub.emit(c.get('user').id, { type: 'connections' });
  return c.json({ ok: true });
});

api.get('/policies', (c) => c.json({ policies: db.prepare('SELECT tool, mode FROM policies WHERE user_id=?').all(c.get('user').id) }));
api.delete('/policies/:tool', (c) => {
  db.prepare('DELETE FROM policies WHERE user_id=? AND tool=?').run(c.get('user').id, c.req.param('tool'));
  return c.json({ ok: true });
});

// Private transcription works with either subscription provider.
api.route('/voice', transcriptionApi);
api.use('/voice/*', async (c, next) => {
  if (env.agentProvider !== 'xai') return c.json({ error: 'Voice is not configured for subscription runtimes.' }, 503);
  await next();
});
api.route('/voice', voiceApi);

api.get('/sheets/:id/preview', async c => {
  c.header('Cache-Control','no-store');
  try {return c.json(await sheetPreview(c.get('user').id,c.req.param('id'),c.req.query('tab')));}
  catch(e){return c.json({error:e instanceof SheetError?e.message:'Google Sheets preview is unavailable.'},(e instanceof SheetError?e.status:502) as 400);}
});

api.route('/billing', billingApi);
api.route('/credentials', credentialsApi);
api.route('/claude-code', claudeCodeApi);
api.route('/account', accountApi);
api.route('/push',pushApi);
