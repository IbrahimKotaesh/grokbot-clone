// Run on the server after deployment. Uses a short-lived session for the existing owner.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import WebSocket from 'ws';
const base=process.env.APP_URL;
assert.ok(base?.startsWith('https://'));
const db=new Database(process.env.DB_PATH);
const owner=db.prepare('SELECT id FROM users WHERE lower(email)=?').get(process.env.ALLOWED_EMAILS.toLowerCase());
assert.ok(owner,'The authorized owner must exist');
const token=crypto.randomBytes(32).toString('hex');
db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(token,owner.id,Date.now(),Date.now()+10*60_000);
const headers={Cookie:`grokbot_session=${token}`,Origin:base,'Content-Type':'application/json'};
try {
  assert.equal((await fetch(`${base}/api/bots`)).status,401);
  assert.equal((await fetch(`${base}/api/auth/dev`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"email":"stranger@example.com"}'})).status,403);
  const me=await fetch(`${base}/api/auth/me`).then(r=>r.json());
  assert.equal(me.devLogin,false);assert.equal(me.localAccount,null);assert.equal(me.googleLogin,true);
  assert.equal((await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{...headers,Origin:'https://unrelated.example'}})).status,403);
  const manifest=await fetch(`${base}/manifest.webmanifest`).then(r=>r.json());
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons) assert.equal((await fetch(`${base}${icon.src}`)).status,200);
  assert.match(await fetch(`${base}/sw.js`).then(r=>r.text()),/Never cache account data/);
  const bots=await fetch(`${base}/api/bots`,{headers}).then(r=>r.json());
  const bot=bots.bots.find(b=>b.isPrimary);assert.ok(bot);
  const appList=await fetch(`${base}/api/apps?search=gmail`,{headers}).then(r=>r.json());
  assert.equal(appList.configured,true);assert.ok(appList.apps.some(a=>a.slug==='gmail'));
  // Reopening the viewer must not poison the desktop relay with invalid health probes.
  for (let connection=0; connection<3; connection++) {
  const socket=new WebSocket(`${base.replace('https:','wss:')}/api/bots/${bot.id}/screen`,['binary'],{headers});
  await new Promise((resolve,reject)=>{
    let state=0,buffer=Buffer.alloc(0);
    const timer=setTimeout(()=>{socket.terminate();reject(new Error('VNC handshake timed out'));},60_000);
    socket.on('error',e=>{clearTimeout(timer);reject(e);});
    socket.on('message',data=>{
      buffer=Buffer.concat([buffer,Buffer.from(data)]);
      if(state===0 && buffer.length>=12){assert.match(buffer.subarray(0,12).toString(),/^RFB/);buffer=buffer.subarray(12);socket.send(Buffer.from('RFB 003.008\n'));state=1;}
      if(state===1 && buffer.length>=2){buffer=buffer.subarray(2);socket.send(Buffer.from([1]));state=2;}
      if(state===2 && buffer.length>=4){assert.equal(buffer.readUInt32BE(),0);buffer=buffer.subarray(4);socket.send(Buffer.from([1]));state=3;}
      if(state===3 && buffer.length>=24){assert.equal(buffer.readUInt16BE(0),1280);assert.equal(buffer.readUInt16BE(2),800);clearTimeout(timer);socket.close();resolve();state=4;}
    });
  });
  }
  const image=Buffer.from(await fetch(`${base}/api/bots/${bot.id}/screenshot`,{headers}).then(r=>{assert.equal(r.status,200);return r.arrayBuffer();}));
  assert.equal(image.subarray(1,4).toString(),'PNG');
  console.log('PASS: HTTPS, owner-only access, disabled dev login, CSRF, PWA assets, Gmail catalog, WSS/VNC relay and desktop screenshot');
  console.log('BOTS',bots.bots.map(b=>({name:b.name,provider:b.agentProvider})));
  console.log('CONNECTED_APPS',appList.connected);
} finally {
  db.prepare('DELETE FROM auth_sessions WHERE token=?').run(token);db.close();
}
