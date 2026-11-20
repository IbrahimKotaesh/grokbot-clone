import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {build} from 'esbuild';
const output=new URL('../data/verification/subchat-store-test.mjs',import.meta.url);await fs.mkdir(new URL('.',output),{recursive:true});
await build({stdin:{contents:"export {useStore,transcriptKey} from './web/src/store.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',define:{'import.meta.env.DEV':'false'},outfile:output.pathname});
const saved=new Map();globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};globalThis.window={matchMedia:()=>({matches:false})};
const row=(generation,text,updatedSeq=1)=>({botId:'bot_test',generation,seq:1,updatedSeq,kind:'message',createdAt:1,body:{type:'message',role:'assistant',text}});
let resolveOld;
globalThis.fetch=async(url,options)=>{
 const parsed=new URL(url,'http://test.local'),generation=Number(parsed.searchParams.get('generation'));
 if(parsed.pathname.endsWith('/chats')&&options?.method==='POST')return Response.json({chat:{botId:'bot_test',generation:3,title:'New chat'}});
 if(parsed.pathname.endsWith('/chats'))return Response.json({chats:[{botId:'bot_test',generation:1,title:'Main chat',isMain:true},{botId:'bot_test',generation:2,title:'Draft'},{botId:'bot_test',generation:3,title:'New chat'}]});
 if(parsed.pathname.endsWith('/rows')&&generation===1)return new Promise(resolve=>{resolveOld=()=>resolve(Response.json({generation:1,rows:[row(1,'stale main response')]}));});
 if(parsed.pathname.endsWith('/rows'))return Response.json({generation,rows:[row(generation,'chat '+generation)]});
 throw Error('Unexpected test request '+url);
};
try{
 const {useStore,transcriptKey}=await import(output.href);const s=useStore.getState();useStore.setState({bots:[{id:'bot_test',generation:1}],selectedBotId:'bot_test',selectedChats:{bot_test:2}});
 s.upsertRows('bot_test',1,[row(1,'main')]);s.upsertRows('bot_test',2,[row(2,'draft')]);assert.equal(useStore.getState().transcripts[transcriptKey('bot_test',2)].bySeq[1].body.text,'draft');
 const old=s.loadRows('bot_test',1);s.selectChat('bot_test',2);await new Promise(r=>setTimeout(r,0));
 s.upsertRows('bot_test',1,[row(1,'newer streamed main',9)]);resolveOld();await old;
 assert.equal(useStore.getState().selectedChats.bot_test,2,'Late fetches must not switch the selected chat');
 assert.equal(useStore.getState().transcripts[transcriptKey('bot_test',1)].bySeq[1].body.text,'newer streamed main','A stale fetch cannot overwrite a newer stream revision');
 assert.equal(useStore.getState().transcripts[transcriptKey('bot_test',2)].bySeq[1].body.text,'chat 2');
 await s.newChat('bot_test');await new Promise(r=>setTimeout(r,0));assert.equal(useStore.getState().selectedChats.bot_test,3);assert.equal(JSON.parse(saved.get('fino.selectedChats')).bot_test,3);
 assert.equal(useStore.getState().bots[0].generation,1,'Selecting a subchat does not change the main-chat pointer');
 console.log('PASS: separate client caches, stale response isolation, SSE revision merge and persistent subchat selection');
}finally{delete globalThis.fetch;delete globalThis.localStorage;delete globalThis.window;await fs.unlink(output);}
