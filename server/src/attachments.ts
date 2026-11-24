import { db, now } from './db.js';
import { newId } from './lib/ids.js';
import { appendRow } from './store.js';
import { saveImages, validateImages } from './images.js';

export const MAX_ATTACHMENT_BYTES=10*1024*1024;
db.exec(`CREATE TABLE IF NOT EXISTS message_files (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL
)`);
const OFFICE_MIME:Record<string,string>={
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export function publishAttachment(userId:string,botId:string,name:string,data:Buffer,caption='') {
  const bot=db.prepare('SELECT user_id FROM bots WHERE id=?').get(botId) as {user_id:string}|undefined;
  if(bot?.user_id!==userId)throw new Error('Attachment not found.');
  if(!data.length||data.length>MAX_ATTACHMENT_BYTES)throw new Error('Attachments must be under 10 MB.');
  name=name.replace(/[\r\n\x00]/g,'').slice(0,120)||'File';
  return db.transaction(()=>{
    // PDFs, and Office files (zip containers) made by make_spreadsheet / make_document, go in as file cards.
    const office=data.subarray(0,4).toString('binary')==='PK\x03\x04'?OFFICE_MIME[(name.split('.').pop()??'').toLowerCase()]:undefined;
    if(data.subarray(0,5).toString()==='%PDF-'||office) {
      const mime=office??'application/pdf';
      const id=newId('file');
      db.prepare('INSERT INTO message_files VALUES (?,?,?,?,?,?,?)').run(id,userId,botId,name,mime,data,now());
      const file={id,name,mime,size:data.length,url:`/api/bots/${botId}/attachments/${id}`};
      appendRow(botId,'message',{type:'message',role:'assistant',text:caption,files:[file]});
      return file;
    }
    const mime=data[0]===255&&data[1]===216?'image/jpeg':data.subarray(0,4).toString()==='RIFF'?'image/webp':'image/png';
    const [image]=saveImages(userId,botId,validateImages([{name,dataUrl:`data:${mime};base64,${data.toString('base64')}`} ]));
    appendRow(botId,'message',{type:'message',role:'assistant',text:caption,images:[image]});
    return {...image,mime,size:data.length};
  })();
}
