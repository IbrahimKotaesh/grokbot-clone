import assert from 'node:assert/strict';
const base=process.env.FINO_QA_URL??'http://127.0.0.1:8791';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Only run this mutation test on isolated loopback QA');
const login=await fetch(base+'/api/auth/dev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'native-api@fino.local',name:'Native API test',native:true})});assert.equal(login.status,200);const {session}=await login.json();assert.ok(session);const headers={Authorization:`Bearer ${session}`,'Content-Type':'application/json'};
assert.equal((await fetch(base+'/api/bots')).status,401);
const me=await fetch(base+'/api/auth/me',{headers}).then(r=>r.json());assert.equal(me.user.email,'native-api@fino.local');
const {bots}=await fetch(base+'/api/bots',{headers}).then(r=>r.json());assert.ok(bots.length);const id=bots[0].id;
for(const fruit of ['watermelon','orange','olive','fig']){const response=await fetch(base+`/api/bots/${id}`,{method:'PATCH',headers,body:JSON.stringify({avatarShape:fruit})});assert.equal(response.status,200);assert.equal((await response.json()).bot.avatarShape,fruit);}
const chats=await fetch(base+`/api/bots/${id}/chats`,{method:'POST',headers,body:'{}'});assert.equal(chats.status,201);const {chat}=await chats.json();assert.ok(chat.generation);
const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),5000);const events=await fetch(base+'/api/events',{headers,signal:abort.signal});assert.equal(events.status,200);const reader=events.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/hello/);abort.abort();clearTimeout(timeout);
assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers})).status,200);assert.equal((await fetch(base+'/api/bots',{headers})).status,401);assert.equal((await fetch(base+'/api/auth/native/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'invalid',verifier:'invalid'})})).status,401);
console.log('PASS: bearer sessions, unauthorized rejection, native SSE, fruit persistence, subchats, logout revocation and invalid PKCE exchange');
