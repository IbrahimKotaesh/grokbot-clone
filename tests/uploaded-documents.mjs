import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {db} from '../server/dist/db.js';
import {api} from '../server/dist/routes.js';
import {initRooms,createRoom} from '../server/dist/agent/rooms.js';
import {initSubagents} from '../server/dist/agent/subagents.js';
import {createBot} from '../server/dist/bots.js';
import {validateDocuments,extractDocuments,readDocument,fileContext} from '../server/dist/documents.js';
initSubagents();initRooms();
for(const id of ['owner','other']){db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id,`${id}@example.com`,id,Date.now());db.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(id,id,Date.now(),Date.now()+60000);}
const room=createRoom('owner','File test',[]),another=createRoom('owner','Other room',[]),member=createBot('owner',{name:'Member'});
// A small, valid PDF with real selectable text and an xref table.
function pdf(text){const stream=`BT /F1 16 Tf 50 740 Td (${text}) Tj ET`;const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out);}
const fixture=pdf('FINO_PDF_842. Item A: 17 EUR. Item B: 25 EUR. Total: 42 EUR.');
await fs.mkdir(new URL('../data/verification/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../data/verification/fino-upload-check.pdf',import.meta.url),fixture);
const input=(name,data)=>({name,dataUrl:`data:application/octet-stream;base64,${Buffer.from(data).toString('base64')}`});
const pdfInput=input('fino-upload-check.pdf',fixture),csv=input('أرقام.csv','اسم,مبلغ\nألف,17\nباء,25');
const post=files=>api.request(`/bots/${room}/messages`,{method:'POST',headers:{Cookie:'grokbot_session=owner','Content-Type':'application/json'},body:JSON.stringify({text:'',files})});
for(const files of [[input('bad.exe','a')],[input('fake.pdf','not pdf')],[input('fake.docx','not office')],[...Array(4)].map(()=>csv),[input('big.txt',Buffer.alloc(11*1024*1024))]])assert.equal((await post(files)).status,400);
assert.equal(db.prepare('SELECT COUNT(*) n FROM message_files').get().n,0);
const res=await post([pdfInput,csv]);assert.equal(res.status,200);const {row}=await res.json();assert.equal(row.body.files.length,2);assert.equal(row.body.text,'');assert.ok(!JSON.stringify(row).includes('FINO_PDF_842'),'SSE carries file metadata, not private extracted contents');
const [attached,textFile]=row.body.files;assert.match(readDocument('owner',room,attached.id).text,/FINO_PDF_842/);assert.match(readDocument('owner',room,textFile.id).text,/ألف/);assert.match(fileContext('owner',room,[attached.id]),/untrusted source material/);
assert.throws(()=>readDocument('other',room,attached.id));assert.throws(()=>readDocument('owner',another,attached.id));
db.prepare('UPDATE bots SET members=? WHERE id=?').run(JSON.stringify([member.id]),room);assert.match(readDocument('owner',member.id,attached.id).text,/42 EUR/);
const get=(url,user='owner')=>api.request(url.replace('/api',''),{headers:user?{Cookie:`grokbot_session=${user}`}:{}});
assert.equal((await get(attached.url,null)).status,401);assert.equal((await get(attached.url,'other')).status,404);assert.equal((await get(attached.url.replace(room,another))).status,404);assert.match((await get(attached.url)).headers.get('Content-Disposition'),/^inline/);assert.match((await get(textFile.url)).headers.get('Content-Disposition'),/^attachment/);
const html=await post([input('safe.html','<script>plain source only</script>')]);assert.equal(html.status,200);assert.match((await get((await html.json()).row.body.files[0].url)).headers.get('Content-Disposition'),/^attachment/);
const long=await post([input('long.txt','A'.repeat(30000))]);const longId=(await long.json()).row.body.files[0].id;assert.equal(readDocument('owner',room,longId).next_offset,12000);assert.equal(readDocument('owner',room,longId,12000).text.length,12000);
const office=JSON.parse(execFileSync(process.env.DOCUMENT_PYTHON??'/opt/fino-documents/venv/bin/python',[new URL('./fixtures/document-fixtures.py',import.meta.url).pathname],{encoding:'utf8',maxBuffer:1024*1024}));
const prepared=await extractDocuments(validateDocuments([input('sample.docx',Buffer.from(office.docx,'base64')),input('sample.xlsx',Buffer.from(office.xlsx,'base64'))]));
assert.match(prepared[0].text,/FINO_WORD_615 مرحبا/);assert.match(prepared[1].text,/Budget/);assert.match(prepared[1].text,/A1=FINO_SHEET_927\tB1=42/);
for(const value of [office.bomb,office.entities])await assert.rejects(()=>extractDocuments(validateDocuments([input('unsafe.docx',Buffer.from(value,'base64'))])));
const empty=await extractDocuments(validateDocuments([input('empty.txt',' ')]));assert.match(empty[0].note,/no readable text/);
console.log('PASS: real PDF/Arabic CSV extraction, file-only posts, safe downloads, upload limits, private reads, group membership and paginated context');db.close();process.exit(0);
