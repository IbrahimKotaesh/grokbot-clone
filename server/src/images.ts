import { db, now } from './db.js';
import { newId } from './lib/ids.js';
import type { MessageBody } from './types.js';

export const MAX_IMAGES = 3;
const MAX_BYTES = 3 * 1024 * 1024;
db.exec(`CREATE TABLE IF NOT EXISTS message_images (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL
)`);
export function validateImages(value: unknown): {name:string; mime:string; data:Buffer}[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IMAGES) throw new Error('Attach up to 3 photos.');
  return value.map(image => {
    if (!image || typeof image.dataUrl !== 'string' || image.dataUrl.length > MAX_BYTES * 4 / 3 + 100) throw new Error('Each photo must be under 3 MB.');
    const m = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);
    if (!m) throw new Error('Choose a JPEG, PNG or WebP photo.');
    const data = Buffer.from(m[1], 'base64');
    // The phone's label can be wrong (pickers re-encode photos), so the bytes decide the type.
    const mime = data[0]===255 && data[1]===216 && data[2]===255 ? 'image/jpeg'
      : data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : data.subarray(0,4).toString()==='RIFF' && data.subarray(8,12).toString()==='WEBP' ? 'image/webp' : null;
    if (!mime) throw new Error('Choose a JPEG, PNG or WebP photo (HEIC photos: set Camera → Formats → Most Compatible).');
    if (data.length > MAX_BYTES) throw new Error('Each photo must be under 3 MB.');
    return {name: typeof image.name === 'string' ? image.name.replace(/[\r\n\x00]/g,'').slice(0,120) : 'Photo',mime,data};
  });
}
export function saveImages(userId:string,botId:string,images:ReturnType<typeof validateImages>): NonNullable<MessageBody['images']> {
  return images.map(image => {
    const id=newId('img');
    db.prepare('INSERT INTO message_images VALUES (?,?,?,?,?,?,?)').run(id,userId,botId,image.name,image.mime,image.data,now());
    return {id,name:image.name,url:`/api/bots/${botId}/images/${id}`};
  });
}
export function imageInputs(userId:string,ids:string[] = []): string[] {
  if (ids.length > MAX_IMAGES) throw new Error('Too many photos.');
  return ids.map(id=>{
    const image=db.prepare('SELECT mime,data FROM message_images WHERE id=? AND user_id=?').get(id,userId) as {mime:string;data:Buffer}|undefined;
    if(!image) throw new Error('Photo unavailable.');
    return `data:${image.mime};base64,${image.data.toString('base64')}`;
  });
}
