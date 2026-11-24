// Direct "Sign in with Google" (OpenID Connect): only openid/email/profile, PKCE and nonce, no Composio and no
// Gmail permission; the phone/Mac flow gets a one-time code. Google's token endpoint is simulated.
//   GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret DB_PATH=:memory: SESSION_SECRET=x node tests/google-login.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { db } from '../server/dist/db.js';
import { api } from '../server/dist/routes.js';
import { env } from '../server/dist/env.js';
assert.equal(env.googleClientId, 'test-client', 'run with GOOGLE_CLIENT_ID=test-client');

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let nextClaims = null, tokenRequests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
    tokenRequests.push(new URLSearchParams(init.body));
    return new Response(JSON.stringify({ id_token: `${b64url({ alg: 'RS256' })}.${b64url(nextClaims)}.sig` }), { status: 200 });
  }
  return realFetch(url, init);
};

async function start(query = '') {
  const r = await api.request(`/auth/google/start${query}`);
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get('location'));
  return to;
}
const claimsFor = (to, over = {}) => ({ iss: 'https://accounts.google.com', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 600, nonce: to.searchParams.get('nonce'), email: 'new.person@gmail.com', email_verified: true, name: 'New Person', ...over });

// Start: straight to Google, name and email only, PKCE
let to = await start();
assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth', 'goes to Google, not Composio');
assert.equal(to.searchParams.get('scope'), 'openid email profile', 'no Gmail permission');
assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
assert.equal(to.searchParams.get('client_id'), 'test-client');

// Callback: a new account is created and signed in
nextClaims = claimsFor(to);
let r = await api.request(`/auth/google/callback?state=${to.searchParams.get('state')}&code=abc`);
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), `${env.appUrl}/`);
assert.match(r.headers.get('set-cookie') ?? '', /grokbot_session=/, 'signed in');
const verifier = tokenRequests.at(-1).get('code_verifier');
assert.equal(createHash('sha256').update(verifier).digest('base64url'), to.searchParams.get('code_challenge'), 'PKCE verifier matches');
const user = db.prepare("SELECT * FROM users WHERE email='new.person@gmail.com'").get();
assert.equal(user.name, 'New Person');

// The same state cannot be used twice
r = await api.request(`/auth/google/callback?state=${to.searchParams.get('state')}&code=abc`);
assert.match(r.headers.get('location'), /login=failed/, 'a replayed state is refused');

// Rejections: wrong audience, wrong nonce, unverified email
for (const bad of [{ aud: 'someone-else' }, { nonce: 'forged' }, { email_verified: false }, { iss: 'https://evil.example' }, { exp: 1 }]) {
  to = await start();
  nextClaims = claimsFor(to, bad);
  r = await api.request(`/auth/google/callback?state=${to.searchParams.get('state')}&code=abc`);
  assert.match(r.headers.get('location'), /login=failed/, `rejected: ${JSON.stringify(bad)}`);
}

// Phone / Mac: comes back to the app with a one-time code, and the existing account is reused
to = await start('?native_challenge=' + 'a'.repeat(43));
nextClaims = claimsFor(to);
r = await api.request(`/auth/google/callback?state=${to.searchParams.get('state')}&code=abc`);
assert.match(r.headers.get('location'), /^fino:\/\/auth\?code=/, 'the app gets its one-time code');
assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email='new.person@gmail.com'").get().n, 1, 'no duplicate account');

globalThis.fetch = realFetch;
console.log('PASS: Google sign-in asks only for name and email (PKCE + nonce), creates or reuses the account, refuses replays and bad tokens, and works for the apps');
process.exit(0);
