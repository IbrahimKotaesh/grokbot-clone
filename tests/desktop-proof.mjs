import assert from 'node:assert/strict';
import {db} from '../server/dist/db.js';
import {createBot} from '../server/dist/bots.js';
import {finishDesktopWork} from '../server/dist/agent/desktop-proof.js';
import {createChat} from '../server/dist/chats.js';
import {inChat} from '../server/dist/lib/chat-scope.js';
import {listRows} from '../server/dist/store.js';
for(const id of ['owner','other'])db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id,id+'@example.com',id,Date.now());
const bot=createBot('owner',{name:'Desktop worker'}),chat=createChat(bot.id);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=','base64');
let captures=0;const capture=async()=>{captures++;return png;};
const ctx=()=>({userId:'owner',botId:bot.id,desktopProof:{used:true}});
for(const [completed,blocked,deferred,used] of [[false,false,false,true],[true,true,false,true],[true,false,true,true],[true,false,false,false]]){
 const c=ctx();Object.assign(c.desktopProof,{deferred,used});assert.equal(await finishDesktopWork(c,completed,blocked,capture),false);
}
assert.equal(captures,0,'Plain chats, stopped/failed tasks, pending approvals and questions must not capture a desktop');
const c=ctx();await inChat(bot.id,chat.generation,()=>finishDesktopWork(c,true,false,capture));assert.equal(captures,1);assert.equal(listRows(bot.id).length,0);
const rows=inChat(bot.id,chat.generation,()=>listRows(bot.id));assert.equal(rows.length,1);assert.equal(rows[0].body.images.length,1);assert.equal(rows[0].body.text,'Computer · final screenshot');
assert.equal(await finishDesktopWork(c,true,false,capture),false,'Finalization is idempotent');
await inChat(bot.id,chat.generation,()=>finishDesktopWork(ctx(),true,false,async()=>{throw Error('offline');}));
assert.equal(inChat(bot.id,chat.generation,()=>listRows(bot.id)).at(-1).body.type,'notice');
assert.equal(await finishDesktopWork({...ctx(),userId:'other'},true,false,capture),false,'Another owner cannot publish a screenshot into this bot');
assert.equal(db.prepare('SELECT COUNT(*) n FROM message_images').get().n,1);
console.log('PASS: final desktop screenshots attach once to the originating subchat; no capture for plain/pending/stopped tasks; capture failures and owner isolation');db.close();process.exit(0);
