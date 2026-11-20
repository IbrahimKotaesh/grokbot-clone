import {db,now} from './db.js';
import type {BotChat} from './types.js';
export function ensureChats(botId:string,history=true){
 const bot=db.prepare('SELECT generation,created_at FROM bots WHERE id=?').get(botId) as any;if(!bot)throw Error('Bot not found.');
 db.prepare("INSERT OR IGNORE INTO bot_chats(bot_id,generation,title,created_at,updated_at) VALUES (?,?, 'Main chat',?,?)").run(botId,bot.generation,bot.created_at,bot.created_at);
 if(history)db.prepare("INSERT OR IGNORE INTO bot_chats(bot_id,generation,title,created_at,updated_at) SELECT bot_id,generation,'Previous chat '||generation,MIN(created_at),MAX(created_at) FROM rows WHERE bot_id=? GROUP BY generation").run(botId);
 return bot;
}
export function validChat(botId:string,generation:number):boolean{
 if(!Number.isSafeInteger(generation)||generation<1)return false;
 const bot=db.prepare('SELECT generation FROM bots WHERE id=?').get(botId) as any;
 return !!bot&&(bot.generation===generation||!!db.prepare('SELECT 1 FROM bot_chats WHERE bot_id=? AND generation=?').get(botId,generation));
}
export function listChats(botId:string):BotChat[]{
 const bot=ensureChats(botId);
 return (db.prepare(`SELECT c.*,COUNT(r.seq) message_count FROM bot_chats c LEFT JOIN rows r ON r.bot_id=c.bot_id AND r.generation=c.generation AND r.kind='message' WHERE c.bot_id=? GROUP BY c.generation ORDER BY (c.generation=?) DESC,c.updated_at DESC,c.generation DESC`).all(botId,bot.generation) as any[]).map(r=>({botId,generation:r.generation,title:r.title,createdAt:r.created_at,updatedAt:r.updated_at,messageCount:r.message_count,isMain:r.generation===bot.generation}));
}
export function createChat(botId:string,title='New chat'):BotChat{
 return db.transaction(()=>{
  ensureChats(botId);
  const generation=(db.prepare('SELECT MAX(generation) n FROM bot_chats WHERE bot_id=?').get(botId) as any).n+1,t=now();
  db.prepare('INSERT INTO bot_chats VALUES (?,?,?,?,?)').run(botId,generation,title.trim().slice(0,80)||'New chat',t,t);
  return {botId,generation,title:title.trim().slice(0,80)||'New chat',createdAt:t,updatedAt:t,messageCount:0,isMain:false};
 })();
}
export function renameChat(botId:string,generation:number,title:string){
 if(!validChat(botId,generation))throw Error('Chat not found.');ensureChats(botId);
 const clean=title.trim().slice(0,80);if(!clean)throw Error('Enter a chat name.');
 db.prepare('UPDATE bot_chats SET title=?,updated_at=? WHERE bot_id=? AND generation=?').run(clean,now(),botId,generation);
 return listChats(botId).find(c=>c.generation===generation)!;
}
