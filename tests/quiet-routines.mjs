import assert from 'node:assert/strict';
import {db} from '../server/dist/db.js';
import {createBot} from '../server/dist/bots.js';
import {appendRow,updateRow,toBot,getBotRow} from '../server/dist/store.js';
import {isSilentPlaceholder,visibleTranscriptRows} from '../server/dist/lib/message-text.js';
db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('quiet-owner','quiet@example.com','Test',Date.now());
const bot=createBot('quiet-owner',{name:'Kamel'});
for(const text of ['.','...','…',' . \n . ','••']){
 assert.equal(isSilentPlaceholder(text),true);
 const row=appendRow(bot.id,'message',{type:'message',role:'assistant',text});assert.equal(row.body.text,'');
 assert.equal(toBot(getBotRow(bot.id)).lastPreview,null);
}
const user=appendRow(bot.id,'message',{type:'message',role:'user',text:'...'});assert.equal(user.body.text,'...');
const meaningful=appendRow(bot.id,'message',{type:'message',role:'assistant',text:'تم. وصل إيميل مهم.'});assert.equal(meaningful.body.text,'تم. وصل إيميل مهم.');
const changed=updateRow(bot.id,meaningful.seq,{type:'message',role:'assistant',text:'…',streaming:false});assert.equal(changed.body.text,'');
assert.equal(isSilentPlaceholder('نسخة 1.2 جاهزة.'),false);
const start=appendRow(bot.id,'event',{type:'event',event:'routine-run',text:'Running routine: test'});
const silent=appendRow(bot.id,'tool-call',{type:'tool-call',callId:'silent',name:'stay_silent',label:'Quiet',status:'done',args:{}});
const dot={...silent,body:{type:'message',role:'assistant',text:'.'}};
assert.deepEqual(visibleTranscriptRows([start,silent,dot]),[],'Quiet routine event, steps and dot are hidden together');
assert.equal(visibleTranscriptRows([start,silent,meaningful]).length,3,'A useful result keeps its routine log');
assert.equal(visibleTranscriptRows([start,{...silent,body:{...silent.body,status:'error'}}]).length,2,'Errors remain visible');
console.log('PASS: quiet placeholders suppressed on append/update/preview; user text and useful Arabic preserved');db.close();
