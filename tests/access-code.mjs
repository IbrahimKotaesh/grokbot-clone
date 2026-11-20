import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fino-code-test-'));process.env.FINO_ACCESS_FILE=path.join(dir,'access-secret.json');
const {db}=await import('../server/dist/db.js');
const {Hono}=await import('hono');const {accessGate,accessAllowed}=await import('../server/dist/lib/access-code.js');const {accessApi}=await import('../server/dist/routes-access.js');const {requireUser,userFromCookieHeader}=await import('../server/dist/lib/auth.js');
const app=new Hono();app.use('/api/*',accessGate);app.route('/api/access',accessApi);app.get('/api/private',requireUser,c=>c.json({ok:true}));
for(const [id,t] of [['owner',1],['other',2]]){db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id,id+'@example.com',id,t);db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(id,id,Date.now(),Date.now()+60000);}
const call=(route,body,cookie='',ip='test')=>app.request('/api/'+route,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Forwarded-For':ip},body:body===undefined?undefined:JSON.stringify(body)});
try{
 assert.equal((await call('access/setup',{code:'684297'},'grokbot_session=other')).status,403);
 let r=await call('access/setup',{code:'684297'},'grokbot_session=owner');assert.equal(r.status,200);const gate=r.headers.getSetCookie()[0].split(';')[0];
 const content=await fs.readFile(process.env.FINO_ACCESS_FILE,'utf8');assert.ok(!content.includes('684297'));assert.equal((await fs.stat(process.env.FINO_ACCESS_FILE)).mode&0o777,0o600);
 assert.equal((await call('private',undefined,'grokbot_session=owner')).status,401,'Google session alone cannot bypass the code');
 assert.equal((await call('private',undefined,gate)).status,401,'Code alone does not replace account sign-in');
 assert.equal((await call('private',undefined,gate+'; grokbot_session=owner')).status,200);
 assert.equal(userFromCookieHeader('grokbot_session=owner'),null,'VNC uses the same code gate');
 assert.equal(accessAllowed(gate+'x'),false);
 assert.equal((await call('access/unlock',{code:'684298'})).status,401);
 r=await call('access/unlock',{code:'684297'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/i);
 for(let i=0;i<5;i++)assert.equal((await call('access/unlock',{code:'999999'},'','limited-ip')).status,401);
 assert.equal((await call('access/unlock',{code:'684297'},'','limited-ip')).status,429,'Correct code cannot bypass a locked attempt window');
 assert.equal((await call('access/setup',{code:'937428',currentCode:'wrong'},gate+'; grokbot_session=owner')).status,403);
 assert.equal((await call('access/setup',{code:'937428',currentCode:'684297'},gate+'; grokbot_session=owner')).status,200);
 assert.equal(accessAllowed(gate),false,'Changing the code revokes previous browser unlocks');
 await fs.unlink(process.env.FINO_ACCESS_FILE);process.env.FINO_ACCESS_REQUIRED='1';assert.equal(accessAllowed(gate),false,'Required gate fails closed if its private file is missing');assert.equal((await call('private',undefined,'grokbot_session=owner')).status,401);
 console.log('PASS: owner enrollment, hashed private storage, separate code/account gates, tamper rejection, rate limiting and rotation');
}finally{db.close();await fs.rm(dir,{recursive:true,force:true});}
