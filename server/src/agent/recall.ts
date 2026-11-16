import {db,now} from '../db.js';
import {newId} from '../lib/ids.js';
import {hub} from '../lib/hub.js';
/** Unicode-aware matching, including Arabic diacritics and common letter variants. */
export function normalizeRecall(text:string){return text.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();}
export function recallTokens(text:string){return new Set(normalizeRecall(text).match(/[\p{L}\p{N}]{2,}/gu)??[]);}
export function memoryMatches(botId:string,query:string){
 const all=db.prepare('SELECT id,text,created_at FROM memories WHERE bot_id=? ORDER BY created_at DESC').all(botId) as {id:string;text:string;created_at:number}[];
 const words=recallTokens(query),phrase=normalizeRecall(query);
 return all.map((m,i)=>({m,score:(phrase&&normalizeRecall(m.text).includes(phrase)?10:0)+[...words].filter(w=>recallTokens(m.text).has(w)).length,recency:i})).filter(r=>!phrase||r.score>0).sort((a,b)=>b.score-a.score||a.recency-b.recency).slice(0,20).map(r=>r.m);
}
export function searchMemories(botId:string,query:string){return memoryMatches(botId,query).map(m=>m.text);}
export function searchConversation(userId:string,botId:string,query:string,includeEarlier=false){
 const bot=db.prepare('SELECT user_id,generation FROM bots WHERE id=?').get(botId) as any;if(bot?.user_id!==userId)throw Error('Conversation unavailable.');
 const phrase=normalizeRecall(query),tokens=recallTokens(query);if(!tokens.size)throw Error('Use a word or phrase to search your conversation.');
 const rows=db.prepare(`SELECT seq,generation,created_at,body FROM rows WHERE bot_id=? AND kind='message' ${includeEarlier?'':'AND generation=?'} ORDER BY created_at DESC,seq DESC LIMIT 5000`).all(...(includeEarlier?[botId]:[botId,bot.generation])) as any[];
 const matches=rows.map((r,i)=>{const b=JSON.parse(r.body),text=String(b.text??''),normalized=normalizeRecall(text);const hits=[...tokens].filter(w=>normalized.includes(w));return {r,b,text,score:(normalized.includes(phrase)?10:0)+hits.length,recency:i};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.recency-b.recency).slice(0,10);
 return {scope:includeEarlier?'All saved conversations for this bot':'Current conversation for this bot',searched_messages:rows.length,search_limited:rows.length===5000,matches:matches.map(({r,b,text})=>{const positions=[query,...query.split(/\s+/)].map(w=>text.toLowerCase().indexOf(w.toLowerCase())).filter(n=>n>=0);const start=Math.max(0,(positions.length?Math.min(...positions):0)-250);return {seq:r.seq,generation:r.generation,at:new Date(r.created_at).toISOString(),role:b.role,text:text.slice(start,start+1800),excerpt:start>0||text.length>1800};})};
}

export function saveDurableMemory(userId:string,botId:string,value:unknown,automatic=false){
 const bot=db.prepare('SELECT user_id FROM bots WHERE id=?').get(botId) as any;if(bot?.user_id!==userId)throw Error('Memory unavailable.');
 const text=typeof value==='string'?value.trim():'';if(!text||text.length>2000)throw Error('Save one concise memory, under 2000 characters.');
 const existing=(db.prepare('SELECT id,text FROM memories WHERE bot_id=?').all(botId) as {id:string;text:string}[]).find(m=>normalizeRecall(m.text)===normalizeRecall(text));
 if(existing){if(!automatic&&db.prepare("SELECT 1 FROM sqlite_master WHERE name='auto_memory_sources'").get())db.prepare('DELETE FROM auto_memory_sources WHERE memory_id=?').run(existing.id);return {id:existing.id,created:false};}
 const id=newId('mem');db.prepare('INSERT INTO memories(id,bot_id,text,created_at) VALUES (?,?,?,?)').run(id,botId,text,now());hub.emit(userId,{type:'memories',botId});return {id,created:true};
}

db.exec(`CREATE TABLE IF NOT EXISTS memory_revisions(id TEXT PRIMARY KEY,memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,previous_text TEXT NOT NULL,changed_at INTEGER NOT NULL)`);
export function updateDurableMemory(userId:string,botId:string,id:string,value:unknown,automatic=false){
 const bot=db.prepare('SELECT user_id FROM bots WHERE id=?').get(botId) as any;
 const memory=db.prepare('SELECT text FROM memories WHERE id=? AND bot_id=?').get(id,botId) as any;
 if(bot?.user_id!==userId||!memory)throw Error('Memory unavailable.');
 const text=typeof value==='string'?value.trim():'';if(!text||text.length>2000)throw Error('Save one concise memory, under 2000 characters.');
 if(memory.text===text)return {id,updated:false};
 db.transaction(()=>{db.prepare('INSERT INTO memory_revisions VALUES (?,?,?,?)').run(newId('rev'),id,memory.text,now());db.prepare('UPDATE memories SET text=?,created_at=? WHERE id=? AND bot_id=?').run(text,now(),id,botId);if(!automatic&&db.prepare("SELECT 1 FROM sqlite_master WHERE name='auto_memory_sources'").get())db.prepare('DELETE FROM auto_memory_sources WHERE memory_id=?').run(id);})();hub.emit(userId,{type:'memories',botId});return {id,updated:true};
}
