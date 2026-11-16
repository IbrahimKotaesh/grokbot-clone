import assert from 'node:assert/strict';
import http from 'node:http';
import {transcriptionApi} from '../server/dist/transcription.js';
let status=200,response={text:'مرحبا هذا نص عربي',language:'ar'},received=0;
const server=http.createServer(async(req,res)=>{assert.equal(req.url,'/transcribe');assert.equal(req.method,'POST');const chunks=[];for await(const chunk of req)chunks.push(chunk);received=Buffer.concat(chunks).length;res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(response));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.LOCAL_STT_URL=`http://127.0.0.1:${server.address().port}`;
const call=(body=new Uint8Array(500),type='audio/mp4')=>transcriptionApi.request('/transcribe',{method:'POST',headers:{'Content-Type':type},body});
try{
 let r=await call();assert.equal(r.status,200);assert.deepEqual(await r.json(),{text:'مرحبا هذا نص عربي',language:'ar'});assert.equal(received,500);
 assert.equal((await call(new Uint8Array(50))).status,400);assert.equal((await call(new Uint8Array(500),'text/plain')).status,415);assert.equal((await call(new Uint8Array(8*1024*1024+1))).status,413);
 status=429;response={error:'Busy'};r=await call();assert.equal(r.status,429);assert.equal((await r.json()).error,'Busy');
 status=200;response={text:' '};assert.equal((await call()).status,422);
 console.log('PASS: actual audio bytes proxied privately, Arabic unchanged, Safari format, upload/type limits, busy and no-speech errors');
}finally{server.close();}
