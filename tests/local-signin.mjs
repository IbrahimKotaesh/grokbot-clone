// Exercises the existing local owner account; creates no user or Bot.
import assert from 'node:assert/strict';
const base=process.argv[2] ?? 'http://127.0.0.1:8787';
const me=await fetch(`${base}/api/auth/me`).then(r=>r.json());
assert.equal(me.devLogin,true,'This check needs local sign-in enabled');
assert.ok(me.localAccount?.email,'An existing local account must be suggested');
if(!me.googleLogin) {
  const google=await fetch(`${base}/api/auth/google/start`,{redirect:'manual'});
  assert.equal(google.status,302,'Unconfigured Google login must not return 500');
  assert.equal(new URL(google.headers.get('location')).searchParams.get('login'),'google-unavailable');
}
const login=await fetch(`${base}/api/auth/dev`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(me.localAccount)});
assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
assert.ok(cookie);
const authenticated=await fetch(`${base}/api/auth/me`,{headers:{cookie}}).then(r=>r.json());
assert.equal(authenticated.user.email,me.localAccount.email);
const bots=await fetch(`${base}/api/bots`,{headers:{cookie}}).then(r=>r.json());
assert.ok(bots.bots.some(b=>b.isPrimary),'The existing owner must retain their primary Bot');
await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie}});
console.log('PASS: sign-in capabilities, safe Google fallback, existing local account login, retained Bots');
