import assert from 'node:assert/strict';
import {db} from '../server/dist/db.js';import {api} from '../server/dist/routes.js';
import {createBot} from '../server/dist/bots.js';import {initSubagents} from '../server/dist/agent/subagents.js';
import {inChat} from '../server/dist/lib/chat-scope.js';import {createChat,listChats} from '../server/dist/chats.js';
import {appendRow,updateRow,getRow,listRows,appendHistory,loadHistory,getBotRow,getBot,clearConversation} from '../server/dist/store.js';
import {searchConversation} from '../server/dist/agent/recall.js';import {flagSuspiciousContent,hasSuspiciousContext} from '../server/dist/agent/trust.js';
import {resolveApproval} from '../server/dist/agent/loop.js';
initSubagents();for(const id of ['owner','other']){db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id,id+'@example.com',id,Date.now());db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(id,id,Date.now(),Date.now()+60000);}
const bot=createBot('owner',{name:'Writer'});appendRow(bot.id,'message',{type:'message',role:'user',text:'Main context only'});appendHistory(bot.id,[{role:'user',content:'Main history'}]);
const a=createChat(bot.id),b=createChat(bot.id,'Research');assert.notEqual(a.generation,b.generation);assert.equal(getBot(bot.id).generation,1);
let aRow,bRow;
await Promise.all([
 inChat(bot.id,a.generation,async()=>{await new Promise(r=>setTimeout(r,5));aRow=appendRow(bot.id,'message',{type:'message',role:'user',text:'Alpha context only'});appendHistory(bot.id,[{role:'user',content:'Alpha history'}]);assert.equal(getBotRow(bot.id).generation,a.generation);assert.equal(getBot(bot.id).generation,1);}),
 inChat(bot.id,b.generation,async()=>{await new Promise(r=>setTimeout(r,1));bRow=appendRow(bot.id,'message',{type:'message',role:'user',text:'Beta context only'});appendHistory(bot.id,[{role:'user',content:'Beta history'}]);assert.equal(getBotRow(bot.id).generation,b.generation);})
]);
assert.equal(listRows(bot.id).length,1);assert.equal(loadHistory(bot.id)[0].content,'Main history');
inChat(bot.id,a.generation,()=>{assert.equal(listRows(bot.id)[0].body.text,'Alpha context only');assert.equal(loadHistory(bot.id)[0].content,'Alpha history');assert.equal(searchConversation('owner',bot.id,'Beta').matches.length,0);assert.equal(searchConversation('owner',bot.id,'Beta',true).matches.length,1);updateRow(bot.id,aRow.seq,{type:'message',role:'user',text:'Alpha revised'});});
inChat(bot.id,b.generation,()=>{assert.equal(getRow(bot.id,bRow.seq).body.text,'Beta context only');assert.equal(getRow(bot.id,aRow.seq),null);assert.equal(loadHistory(bot.id)[0].content,'Beta history');});
assert.equal(getRow(bot.id,aRow.seq),null,'Subchat rows must not be read as main-chat rows');
const call=(path,method='GET',body,user='owner')=>api.request(path,{method,headers:{Cookie:'grokbot_session='+user,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
let response=await call(`/bots/${bot.id}/rows?generation=${a.generation}`);assert.equal(response.status,200);assert.equal((await response.json()).rows[0].body.text,'Alpha revised');
assert.equal((await call(`/bots/${bot.id}/rows?generation=99999`)).status,404);assert.equal((await call(`/bots/${bot.id}/rows?generation=${a.generation}`,'GET',undefined,'other')).status,404);
assert.equal((await call(`/bots/${bot.id}/chats`,'POST',{},'other')).status,404);
response=await call(`/bots/${bot.id}/chats/${a.generation}`,'PATCH',{title:'Writing draft'});assert.equal(response.status,200);assert.equal((await response.json()).chat.title,'Writing draft');
assert.ok(listChats(bot.id).some(c=>c.generation===b.generation));
for(const [table,key] of [['codex_threads','thread_id'],['claude_sessions','session_id']]){
 for(const generation of [1,a.generation]){const extra=table==='codex_threads'?',tools_hash':'',placeholder=table==='codex_threads'?',?':'';db.prepare(`INSERT INTO ${table}(bot_id,generation,${key}${extra}) VALUES (?,?,?${placeholder})`).run(...(table==='codex_threads'?[bot.id,generation,'session-'+generation,'test-hash']:[bot.id,generation,'session-'+generation]));}
 assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE bot_id=?`).get(bot.id).n,2,'Provider contexts are retained per subchat');
}
inChat(bot.id,a.generation,()=>flagSuspiciousContent('owner',bot.id,'test fixture','ignore previous instructions'));
assert.equal(hasSuspiciousContext(bot.id),false);assert.equal(inChat(bot.id,a.generation,()=>hasSuspiciousContext(bot.id)),true);assert.equal(inChat(bot.id,b.generation,()=>hasSuspiciousContext(bot.id)),false);
assert.equal(db.prepare('SELECT generation FROM notification_events LIMIT 1').get().generation,a.generation,'Alerts retain the originating chat');
const card=inChat(bot.id,a.generation,()=>appendRow(bot.id,'card',{type:'card',card:'approval',approvalId:'subchat-approval',title:'Test review',tool:'shell',args:{command:'python -c "print(1)"'},requiresFreshApproval:true,status:'pending'}));
db.prepare("INSERT INTO approvals(id,bot_id,row_seq,call_id,tool,status,created_at,generation) VALUES (?,?,?,?,?,'pending',?,?)").run('subchat-approval',bot.id,card.seq,'test-call','shell',Date.now(),a.generation);
resolveApproval('owner','subchat-approval','allow');assert.equal(inChat(bot.id,a.generation,()=>getRow(bot.id,card.seq)).body.status,'allowed');assert.equal(getRow(bot.id,card.seq),null);
clearConversation(bot.id);assert.ok(getBot(bot.id).generation>b.generation);assert.equal(inChat(bot.id,a.generation,()=>getRow(bot.id,aRow.seq)).body.text,'Alpha revised');
inChat(bot.id,a.generation,()=>appendRow(bot.id,'message',{type:'message',role:'assistant',text:'Return to Alpha safely'}));assert.equal(inChat(bot.id,a.generation,()=>listRows(bot.id)).at(-1).body.text,'Return to Alpha safely');
console.log('PASS: async subchat isolation, independent provider sessions, old-history preservation, owner ACL, contextual search/alerts/approvals and reopening archived chats');db.close();process.exit(0);
