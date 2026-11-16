import { db } from '../db.js';
import { getBotRow } from '../store.js';

/** Text context for a first session in another provider, or a tool-version refresh. */
export function recentConversation(botId: string): string {
  const bot = getBotRow(botId);
  const rows = (db.prepare("SELECT body FROM rows WHERE bot_id=? AND generation=? AND kind='message' ORDER BY seq DESC LIMIT 120").all(botId, bot.generation) as {body:string}[]).reverse();
  const messages = rows.map(r => JSON.parse(r.body));
  // The last user message is submitted separately as this turn's input.
  if (messages.at(-1)?.role === 'user') messages.pop();
  const transcript=messages.map(m => `${m.role}: ${m.text}${m.images?.length ? '\nAttached photos: '+m.images.map((i:any)=>`${i.name} (image_id: ${i.id}; use view_photo to inspect)`).join(', ') : ''}${m.files?.length ? '\nAttached files: '+m.files.map((f:any)=>`${f.name} (file_id: ${f.id}; use read_file; ${f.url})`).join(', ') : ''}`).join('\n\n');
  return (transcript.length>40_000||rows.length===120?'[Earlier chat is not included in this preview. Use search_conversation to retrieve it.]\n':'')+transcript.slice(-40_000);
}

/** A provider's cached session must not hide messages written while another provider was selected. */
export function invalidateProviderSession(botId:string,provider:string){
 const table=provider==='claude'?'claude_sessions':'codex_threads';
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))db.prepare(`DELETE FROM ${table} WHERE bot_id=?`).run(botId);
}
