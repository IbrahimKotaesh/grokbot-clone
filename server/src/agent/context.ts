import { db } from '../db.js';
import { getBotRow } from '../store.js';

/** Text context for a first session in another provider, or a tool-version refresh. */
export function recentConversation(botId: string): string {
  const bot = getBotRow(botId);
  const rows = (db.prepare("SELECT body FROM rows WHERE bot_id=? AND generation=? AND kind='message' ORDER BY seq DESC LIMIT 120").all(botId, bot.generation) as {body:string}[]).reverse();
  const messages = rows.map(r => JSON.parse(r.body));
  // The last user message is submitted separately as this turn's input.
  if (messages.at(-1)?.role === 'user') messages.pop();
  return messages.map(m => `${m.role}: ${m.text}${m.images?.length ? '\nAttached photos: '+m.images.map((i:any)=>`${i.name} (image_id: ${i.id}; use view_photo to inspect)`).join(', ') : ''}`).join('\n\n').slice(-40_000);
}
