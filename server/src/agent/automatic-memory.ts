import {db,now} from '../db.js';
import {saveDurableMemory,updateDurableMemory,memoryMatches} from './recall.js';
import {curateMemories} from './memory-curator.js';

// SQLite is canonical. Mem0 is a rebuildable local semantic index; no hosted fallback.
const service=process.env.FINO_MEMORY_URL??'';
const key=process.env.FINO_MEMORY_KEY??'';
export const automaticMemoryEnabled=Boolean(service&&key);
db.exec(`
CREATE TABLE IF NOT EXISTS auto_memory_jobs(
 bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,generation INTEGER NOT NULL,source_seq INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,due_at INTEGER NOT NULL,
 PRIMARY KEY(bot_id,generation,source_seq));
CREATE TABLE IF NOT EXISTS auto_memory_sources(
 memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,generation INTEGER NOT NULL,source_seq INTEGER NOT NULL,evidence TEXT NOT NULL);
`);
type Fact={id:string;text:string};
type Source={seq:number;text:string};
const canonical=(botId:string)=>db.prepare('SELECT id,text FROM memories WHERE bot_id=? ORDER BY created_at DESC LIMIT 500').all(botId) as Fact[];
const scope=(userId:string,botId:string)=>`${userId}:${botId}`;
export async function memoryRequest(path:string,body:unknown,timeout=180_000):Promise<any>{
 const response=await fetch(`${service}${path}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error(`Local memory service ${response.status}`);
 return response.json();
}
export function queueAutomaticMemory(botId:string,generation:number,seq:number){
 if(!automaticMemoryEnabled)return;
 db.prepare('INSERT OR IGNORE INTO auto_memory_jobs(bot_id,generation,source_seq,due_at) VALUES (?,?,?,?)').run(botId,generation,seq,now()+20_000);
}
const forbidden=/(?:كلمة\s*(?:السر|المرور)|مفتاح\s*سري|\b(?:sk|ak)[_-][a-z0-9]{12,}|\b(?:password|api[_ -]?key|access[_ -]?token|secret|كلمة\s*(?:السر|المرور)|مفتاح\s*(?:سري|API))\b|[a-zA-Z0-9_\-]{45,})/iu;
export function safeMemoryText(text:string){return text.length>=8&&text.length<=600&&!forbidden.test(text);}
export function applyAutomaticFacts(botId:string,generation:number,sources:Source[],existing:Fact[],result:unknown){
 const bot=db.prepare('SELECT user_id,generation FROM bots WHERE id=?').get(botId) as any;
 if(!bot||bot.generation!==generation)return 0;
 if(!result||!Array.isArray((result as any).facts))throw Error('Invalid extraction response');
 let saved=0;
 db.transaction(()=>{
  for(const item of (result as any).facts.slice(0,3)){
   const source=sources.find(s=>s.seq===item.seq),evidence=typeof item.evidence==='string'?item.evidence.trim():'';
   // Store the user's own exact quote, not a potentially hallucinated model paraphrase.
   if(!source||!safeMemoryText(evidence)||!source.text.includes(evidence))continue;
   const current=db.prepare('SELECT body FROM rows WHERE bot_id=? AND generation=? AND seq=?').get(botId,generation,source.seq) as any;
   if(!current)continue;const body=JSON.parse(current.body);
   if(body.role!=='user'||body.from||String(body.text??'').slice(0,2000)!==source.text)continue;
   const prior=existing.find(f=>f.id===item.replaces);
   const old=prior?db.prepare('SELECT m.text FROM memories m JOIN auto_memory_sources a ON a.memory_id=m.id WHERE m.id=? AND m.bot_id=?').get(prior.id,botId) as any:null;
   const correction=/(?:بدل|غيّر|غيرت|لم أعد|ما عاد|من الآن|من هلق|صار|changed|instead|no longer|now prefer)/iu.test(evidence);
   let id:string;
   if(prior&&old?.text===prior.text&&correction){updateDurableMemory(bot.user_id,botId,prior.id,evidence,true);id=prior.id;}
   else{const savedFact=saveDurableMemory(bot.user_id,botId,evidence,true);if(!savedFact.created)continue;id=savedFact.id;}
   db.prepare('INSERT OR REPLACE INTO auto_memory_sources VALUES (?,?,?,?)').run(id,generation,source.seq,evidence);saved++;
  }
 })();
 return saved;
}
let running=false;
let busy:(id:string)=>boolean=()=>false;
const indexSignatures=new Map<string,string>();
async function syncIndex(userId:string,botId:string){
 const facts=canonical(botId),signature=JSON.stringify(facts);
 if(indexSignatures.get(botId)===signature)return;
 await memoryRequest('/index',{scope:scope(userId,botId),facts},60_000);indexSignatures.set(botId,signature);
}
export async function automaticMemorySweep(curator=curateMemories){
 if(!automaticMemoryEnabled||running)return;running=true;
 let jobs:any[]=[];
 try{
  const candidates=db.prepare(`SELECT j.*,b.user_id,b.generation AS current_generation FROM auto_memory_jobs j JOIN bots b ON b.id=j.bot_id WHERE j.status='pending' AND j.due_at<=? ORDER BY j.due_at LIMIT 50`).all(now()) as any[];
  const first=candidates.find(j=>!busy(j.bot_id));
  if(first){
   jobs=candidates.filter(j=>j.bot_id===first.bot_id&&j.generation===first.generation).slice(0,3);
   const sources:Source[]=[];
   for(const job of jobs){
    const row=db.prepare('SELECT body FROM rows WHERE bot_id=? AND generation=? AND seq=?').get(job.bot_id,job.generation,job.source_seq) as any;
    if(row&&job.generation===job.current_generation){const body=JSON.parse(row.body);if(body.role==='user'&&!body.from){const text=String(body.text??'').slice(0,2000);if(text.length>=8&&!forbidden.test(text))sources.push({seq:job.source_seq,text});}}
   }
   if(sources.length){
    const all=canonical(first.bot_id);
    const matching=memoryMatches(first.bot_id,sources.map(s=>s.text).join(' '));
    let budget=2500;const existing=[...new Map([...matching,...all.slice(0,10)].map(f=>[f.id,{id:f.id,text:f.text}])).values()].filter(f=>{budget-=f.text.length;return budget>=0;}).slice(0,15);
    const result=await curator(sources,existing);
    applyAutomaticFacts(first.bot_id,first.generation,sources,existing,result);
   }
   db.transaction(()=>{for(const job of jobs)db.prepare("UPDATE auto_memory_jobs SET status='done' WHERE bot_id=? AND generation=? AND source_seq=?").run(job.bot_id,job.generation,job.source_seq);})();
  }
  // Also reconcile manual edits/deletions and existing facts, one bot per tick.
  const bots=db.prepare('SELECT id,user_id FROM bots').all() as any[];
  const stale=bots.find(b=>indexSignatures.get(b.id)!==JSON.stringify(canonical(b.id)));
  if(stale)await syncIndex(stale.user_id,stale.id);
 }catch{
  for(const job of jobs)db.prepare("UPDATE auto_memory_jobs SET attempts=attempts+1,status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,due_at=? WHERE bot_id=? AND generation=? AND source_seq=? AND status='pending'").run(now()+Math.min(600_000,30_000*2**job.attempts),job.bot_id,job.generation,job.source_seq);
  console.warn('[memory] Local background job deferred; chat remains available.');
 }finally{running=false;}
}
export function startAutomaticMemory(isBusy:(id:string)=>boolean){
 if(!automaticMemoryEnabled)return;busy=isBusy;
 // Recover queued writes after restarts; bootstrap up to 60 recent direct user messages per bot.
 for(const b of db.prepare('SELECT id,generation FROM bots').all() as any[]){
  const rows=db.prepare("SELECT seq FROM rows WHERE bot_id=? AND generation=? AND kind='message' AND json_extract(body,'$.role')='user' AND json_extract(body,'$.from') IS NULL ORDER BY seq DESC LIMIT 60").all(b.id,b.generation) as any[];
  for(const r of rows.reverse())queueAutomaticMemory(b.id,b.generation,r.seq);
 }
 const timer=setInterval(()=>void automaticMemorySweep(),10_000);timer.unref();void automaticMemorySweep();
}
export async function semanticMemoryForPrompt(userId:string,botId:string):Promise<string>{
 if(!automaticMemoryEnabled)return '';
 const row=db.prepare("SELECT body FROM rows WHERE bot_id=? AND kind='message' AND json_extract(body,'$.role')='user' ORDER BY generation DESC,seq DESC LIMIT 1").get(botId) as any;
 const query=row?String(JSON.parse(row.body).text??'').slice(0,1800):'';if(!query)return '';
 try{
  const result=await memoryRequest('/search',{scope:scope(userId,botId),query},300);
  if(!Array.isArray(result.ids))return '';
  const facts=canonical(botId),lines:string[]=[];
  for(const id of result.ids.slice(0,5)){const fact=facts.find(f=>f.id===id);if(fact)lines.push(`- [${fact.id}] ${fact.text}`);}
  return lines.join('\n').slice(0,2000);
 }catch{return '';}
}
