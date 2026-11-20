import {attachDesktopDevices} from './desktop-device.js';
import {accessGate} from './lib/access-code.js';
import {accessApi} from './routes-access.js';
import { initPushWorker } from './notifications.js';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { env } from './env.js';
import { api } from './routes.js';
import { attachVncRelay } from './vnc.js';
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
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(env.appUrl).origin) return c.json({ error: 'Invalid request origin' }, 403);
  }
  c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/api/*',accessGate);
app.route('/api/access',accessApi);
app.use('/sw.js', async (c, next) => { c.header('Cache-Control', 'no-cache'); await next(); });
app.get('/api/health', (c) => c.json({ ok: true, model: env.agentProvider === 'codex' ? env.codexModel ?? 'codex-default' : env.agentProvider === 'claude' ? env.claudeModel ?? 'claude-default' : env.xaiModel, provider: env.agentProvider, computer: env.computerProvider }));
app.route('/api/checkins', checkinsApi);
app.route('/api/rooms', roomsApi);
app.route('/api', api);
app.route('/api', configApi);

// Serve the built web app in production.
const webDist = path.resolve(new URL('.', import.meta.url).pathname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), webDist) }));
  app.get('*', (c) => c.html(fs.readFileSync(path.join(webDist, 'index.html'), 'utf8')));
}

const server = serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' }, (info) => console.log(`[grokbot] server on http://localhost:${info.port} (${env.agentProvider}, ${env.computerProvider})`));
attachVncRelay(server as unknown as Server);
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
if (env.agentProvider === 'xai') startMemoryConsolidation();
