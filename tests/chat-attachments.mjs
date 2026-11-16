import assert from 'node:assert/strict';
import {db} from '../server/dist/db.js';
import {api} from '../server/dist/routes.js';
import {createBot} from '../server/dist/bots.js';
import {publishAttachment} from '../server/dist/attachments.js';
import {initSubagents} from '../server/dist/agent/subagents.js';
initSubagents();
for(const id of ['owner','other']) {
 db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id,`${id}@example.com`,id,Date.now());
 db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(id,id,Date.now(),Date.now()+60000);
}
const bot=createBot('owner',{name:'Writer'}),second=createBot('owner',{name:'Other'});
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
const file=publishAttachment('owner',bot.id,'عرض.pdf',pdf,'Your PDF');
const body=JSON.parse(db.prepare("SELECT body FROM rows WHERE bot_id=? AND kind='message' ORDER BY seq DESC LIMIT 1").get(bot.id).body);
assert.equal(body.role,'assistant');assert.equal(body.files[0].id,file.id);assert.equal(body.text,'Your PDF');
const get=(url,user)=>api.request(url.replace('/api',''),{headers:user?{Cookie:`grokbot_session=${user}`}:{}});
assert.equal((await get(file.url)).status,401);assert.equal((await get(file.url,'other')).status,404);assert.equal((await get(file.url.replace(bot.id,second.id),'owner')).status,404);
const open=await get(file.url,'owner');assert.equal(open.status,200);assert.equal(open.headers.get('Content-Type'),'application/pdf');assert.match(open.headers.get('Content-Disposition'),/^inline;/);assert.match(open.headers.get('Content-Disposition'),/filename\*=UTF-8/);assert.deepEqual(Buffer.from(await open.arrayBuffer()),pdf);
assert.match((await get(file.url+'?download=1','owner')).headers.get('Content-Disposition'),/^attachment;/);
assert.throws(()=>publishAttachment('other',bot.id,'bad.pdf',pdf),/not found/);
assert.throws(()=>publishAttachment('owner',bot.id,'bad.svg',Buffer.from('<svg/>')));
assert.throws(()=>publishAttachment('owner',bot.id,'big.pdf',Buffer.alloc(11*1024*1024)),/10 MB/);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=','base64');
const image=publishAttachment('owner',bot.id,'preview.png',png);
const imageBody=JSON.parse(db.prepare("SELECT body FROM rows WHERE bot_id=? AND kind='message' ORDER BY seq DESC LIMIT 1").get(bot.id).body);
assert.equal(imageBody.images[0].id,image.id);assert.equal(imageBody.text,'');
console.log('PASS: assistant PDF/image messages, inline/open/download responses, Unicode filenames, ownership boundaries and unsafe/oversized rejection');
db.close();process.exit(0);
