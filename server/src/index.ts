import { recoverInterruptedTurns } from './agent/loop.js';
import { allowedOrigin } from './lib/origin.js';
import { contentSecurityPolicy } from './lib/csp.js';
import { revenueCatWebhook } from './billing.js';
import { stripeWebhook } from './stripe.js';
import {attachDesktopDevices} from './desktop-device.js';
import {accessGate} from './lib/access-code.js';
import {accessApi} from './routes-access.js';
import {downloadApi} from './routes-download.js';
import { initPushWorker } from './notifications.js';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { env } from './env.js';
import { api } from './routes.js';
import { attachVncRelay, onHandback } from './vnc.js';
import { attachVoiceRelay } from './fal-voice.js';
import { castExistingVoices } from './voice-cast.js';
import { initRoutines } from './routines.js';
import { initTriggers } from './triggers.js';
import { initProactive } from './proactive.js';
import { initSubagents } from './agent/subagents.js';
import { initRooms } from './agent/rooms.js';
import { checkinsApi } from './routes-proactive.js';
import { roomsApi } from './routes-rooms.js';
import { enqueue, isBotBusy } from './agent/loop.js';
import {startAutomaticMemory} from './agent/automatic-memory.js';
import { desSelfTest } from './lib/des.js';
import { configApi } from './routes-config.js';
import { startIdleWatcher } from './idle.js';
import { startMemoryConsolidation } from './agent/memory.js';

if (!desSelfTest()) throw new Error('DES self-test failed');
initSubagents();
initRooms();

const app = new Hono();
// Every page gets the Content-Security-Policy (lib/csp.ts), unless a route already set its own (with a nonce).
app.use('*', async (c, next) => {
  await next();
  if (/text\/html/i.test(c.res.headers.get('content-type') ?? '') && !c.res.headers.has('Content-Security-Policy')) c.res.headers.set('Content-Security-Policy', contentSecurityPolicy());
});
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin && !allowedOrigin(origin)) return c.json({ error: 'Invalid request origin' }, 403);
  }
  c.header('Cache-Control', 'no-store');
  await next();
});
// The store calls this with its own secret, so it sits before the access gate and sessions.
app.post('/api/billing/webhook', revenueCatWebhook);
app.post('/api/billing/stripe-webhook', stripeWebhook);
// The Mac app download is public: the landing page offers it before sign-in.
app.route('/api/download',downloadApi);
app.use('/api/*',accessGate);
app.route('/api/access',accessApi);
app.use('/sw.js', async (c, next) => { c.header('Cache-Control', 'no-cache'); await next(); });
// Public, so it only says the server is up: which AI and computer providers run behind it is nobody else's business.
app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/checkins', checkinsApi);
app.route('/api/rooms', roomsApi);
app.route('/api', api);
app.route('/api', configApi);

// Serve the built web app in production.
const webDist = path.resolve(new URL('.', import.meta.url).pathname, '../../web/dist');
if (fs.existsSync(webDist)) {
  // Built files have a content hash in their name, so they never change: cache them for good.
  // Everything else (the page itself, icons, sw.js) is checked on every load, so a deploy shows up at once.
  app.use('/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/') || c.res.headers.has('Cache-Control')) return;
    c.res.headers.set('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  });
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), webDist) }));
  app.get('*', (c) => c.html(fs.readFileSync(path.join(webDist, 'index.html'), 'utf8')));
}

const server = serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' }, (info) => console.log(`[grokbot] server on http://localhost:${info.port} (${env.agentProvider}, ${env.computerProvider})`));
attachVncRelay(server as unknown as Server);
attachVoiceRelay(server as unknown as Server);
setTimeout(() => void castExistingVoices(), 15_000).unref();
// When the owner presses "I'm done", a bot that paused for them picks the task back up.
onHandback((_userId, botId) => enqueue(botId, { type: 'system', text: 'The owner pressed "I\'m done" and handed your computer back. Look at the screen first (they may have changed something), then continue the task where you left off.' }));
attachDesktopDevices(server as unknown as Server);
// GROKBOT_NO_SCHEDULER=1 for extra dev/test servers sharing a database copy, so routines and triggers don't fire twice.
if (process.env.GROKBOT_NO_SCHEDULER !== '1') {
  initPushWorker();
  startAutomaticMemory(isBotBusy);
  initRoutines(enqueue);
  void initTriggers(enqueue);
initProactive(enqueue);
} else console.log('[grokbot] scheduler disabled (GROKBOT_NO_SCHEDULER=1)');
startIdleWatcher();
// Bots cut off by the restart pick their work up again once everything is running.
setTimeout(() => { try { recoverInterruptedTurns(); } catch (e) { console.error('[agent] resume after restart failed', e); } }, 8000);
if (env.agentProvider === 'xai') startMemoryConsolidation();
