// Password sign-up with an email service: no account exists until the emailed link is opened; the link works
// once; signing in before confirming says so; too many sign-ups are refused. Also: the CSP on pages, and that
// without an email service sign-up still works at once. Resend is simulated (nothing is sent).
//   DB_PATH=:memory: node --env-file=.env tests/password-confirm.mjs
process.env.RESEND_API_KEY = 'test-key';
process.env.MAIL_FROM = 'Badr <test@example.com>';
import assert from 'node:assert/strict';
const { db } = await import('../server/dist/db.js');
const { api } = await import('../server/dist/routes.js');
const { contentSecurityPolicy } = await import('../server/dist/lib/csp.js');

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com/')) { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
  return realFetch(url, init);
};
const post = (path, body, ip = '203.0.113.7') => api.request(`/auth/password/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const email = `new.${Date.now()}@example.com`;
const userCount = () => db.prepare('SELECT COUNT(*) n FROM users WHERE lower(email)=?').get(email).n;

// Sign up: a link is emailed, no account and no session yet.
let r = await post('signup', { email, password: 'correct horse', name: 'New Person' });
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { ok: true, confirm: true });
assert.equal(r.headers.get('set-cookie'), null, 'no session before confirming');
assert.equal(userCount(), 0, 'no account before confirming');
assert.equal(sent.length, 1);
assert.equal(sent[0].to, email);
assert.match(sent[0].subject, /Badr/);
const token = /\?confirm=([A-Za-z0-9_-]+)/.exec(sent[0].html)?.[1];
assert.ok(token, 'the email carries the confirm link');

// Signing in before confirming explains why; a wrong password stays a plain "incorrect".
r = await post('login', { email, password: 'correct horse' });
assert.equal(r.status, 403);
assert.equal((await r.json()).code, 'confirm');
r = await post('login', { email, password: 'wrong password' });
assert.equal(r.status, 401);

// A made-up token does nothing; the real one makes the account, signs in, and works only once.
r = await post('confirm', { token: 'not-a-real-token' });
assert.equal(r.status, 400);
r = await post('confirm', { token });
assert.equal(r.status, 200);
assert.match(r.headers.get('set-cookie') ?? '', /grokbot_session=/);
assert.equal(userCount(), 1);
const row = db.prepare('SELECT p.verified FROM user_passwords p JOIN users u ON u.id=p.user_id WHERE lower(u.email)=?').get(email);
assert.equal(row.verified, 1, 'a confirmed password counts as proven');
r = await post('confirm', { token });
assert.equal(r.status, 400, 'the link works once');

// Now the password signs in, and signing up again says the account exists.
r = await post('login', { email, password: 'correct horse' });
assert.equal(r.status, 200);
r = await post('signup', { email, password: 'another one', name: 'X' });
assert.equal(r.status, 409);

// Flooding: the 11th sign-up for one address within 15 minutes is refused.
const victim = `victim.${Date.now()}@example.com`;
for (let i = 0; i < 10; i++) assert.equal((await post('signup', { email: victim, password: 'password ' + i }, `198.51.100.${i}`)).status, 200);
assert.equal((await post('signup', { email: victim, password: 'password x' }, '198.51.100.99')).status, 429);

// Without an email service, sign-up works at once (the old behaviour), so local testing isn't blocked.
delete process.env.RESEND_API_KEY;
const quick = `quick.${Date.now()}@example.com`;
r = await post('signup', { email: quick, password: 'correct horse' }, '192.0.2.1');
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { ok: true });
assert.match(r.headers.get('set-cookie') ?? '', /grokbot_session=/);

// The CSP: only our own scripts (plus a nonce when given), no framing, no plugins.
const csp = contentSecurityPolicy('abc');
assert.match(csp, /script-src 'self' blob: 'nonce-abc'/);
assert.doesNotMatch(csp.split(';').find((d) => d.trim().startsWith('script-src')), /unsafe/);
assert.match(csp, /frame-ancestors 'none'/);
assert.match(csp, /object-src 'none'/);

// The app-connection page: a hostile slug can't reach the page, and its script carries the nonce the header allows.
const { Hono } = await import('hono');
const site = new Hono().route('/api', api);
r = await site.request('/api/apps/callback?slug=%3C/script%3E%3Cb%3Ex%3C/b%3E');
const html = await r.text();
assert.doesNotMatch(html, /<\/script><b>/);
const nonce = /nonce="([^"]+)"/.exec(html)?.[1];
assert.ok(nonce && r.headers.get('content-security-policy')?.includes(`'nonce-${nonce}'`));

console.log('PASS: email-confirmed sign-up (no account before the link, one-time link, flood limit), quick sign-up without email, CSP and the connection page');
