import assert from 'node:assert/strict';
import {db} from '../server/dist/db.js';
import {createBot} from '../server/dist/bots.js';
import {appendRow,updateRow,toBot,getBotRow} from '../server/dist/store.js';
import {isSilentPlaceholder,visibleTranscriptRows} from '../server/dist/lib/message-text.js';
import {hideQuietRoutine} from '../server/dist/agent/loop.js';
import {listRows} from '../server/dist/store.js';
db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('quiet-owner','quiet@example.com','Test',Date.now());
const bot=createBot('quiet-owner',{name:'Kamel'});
for(const text of ['.','...','…',' . \n . ','••','<br>','<br/>',' <br> ','&nbsp;','<p></p>']){
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
const empty=appendRow(bot.id,'event',{type:'event',event:'routine-run',text:'Running routine: inbox'});
const step=appendRow(bot.id,'tool-call',{type:'tool-call',callId:'s2',name:'search_email',label:'Searching',status:'done',args:{}});
for(const text of ['No new important emails.','Nothing new to report.','ما في شي جديد بالإيميل.','لا يوجد جديد.'])
 assert.deepEqual(visibleTranscriptRows([empty,step,{...step,body:{type:'message',role:'assistant',text}}]),[],`"${text}" from a routine is quiet`);
assert.deepEqual(visibleTranscriptRows([empty,step]),[],'A finished routine run with only steps is quiet');
assert.equal(visibleTranscriptRows([empty,{...step,body:{...step.body,status:'running'}}]).length,2,'A run still working stays visible');
assert.equal(visibleTranscriptRows([empty,step,{...step,body:{type:'message',role:'assistant',text:'No new emails from Sami, but your invoice from Acme arrived: €1,250 due Friday.'}}]).length,3,'A real finding is kept');
const asked=appendRow(bot.id,'message',{type:'message',role:'user',text:'Any new emails?'});
assert.equal(visibleTranscriptRows([asked,{...step,body:{type:'message',role:'assistant',text:'No new emails.'}}]).length,2,'A direct answer to the person is never hidden');
// End of a quiet routine turn: its rows are hidden for every client (web, Mac, phone) and the list preview.
const tidy=createBot('quiet-owner',{name:'Tidy'});
const kept=appendRow(tidy.id,'message',{type:'message',role:'assistant',text:'Earlier real update.'});
appendRow(tidy.id,'event',{type:'event',event:'routine-run',text:'Running routine: inbox',ref:'rt_1'});
appendRow(tidy.id,'tool-call',{type:'tool-call',callId:'q',name:'search_email',label:'Searching',status:'done',args:{}});
appendRow(tidy.id,'message',{type:'message',role:'assistant',text:'<br>'});
hideQuietRoutine(tidy.id,'rt_1');
assert.deepEqual(listRows(tidy.id).filter(r=>!r.body.replaced).map(r=>r.seq),[kept.seq],'Only the earlier real update remains');
assert.equal(toBot(getBotRow(tidy.id)).lastPreview,'Earlier real update.','The list preview is not "Running routine"');
appendRow(tidy.id,'event',{type:'event',event:'routine-run',text:'Running routine: inbox',ref:'rt_1'});
appendRow(tidy.id,'message',{type:'message',role:'assistant',text:'Invoice from Acme arrived: €1,250 due Friday.'});
hideQuietRoutine(tidy.id,'rt_1');
assert.equal(listRows(tidy.id).filter(r=>!r.body.replaced).length,3,'A useful run stays');
console.log('PASS: quiet placeholders suppressed on append/update/preview; user text and useful Arabic preserved');db.close();
