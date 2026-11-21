import { createHash, randomBytes } from 'node:crypto';
import { db, now } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS native_login_tickets (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL, expires_at INTEGER NOT NULL
)`);
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
db.exec(`CREATE TABLE IF NOT EXISTS native_connection_tickets (
 hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 slug TEXT NOT NULL, expires_at INTEGER NOT NULL
)`);
export function issueConnectionTicket(userId:string,slug:string){
 db.prepare('DELETE FROM native_connection_tickets WHERE expires_at<=?').run(now());
 const code=randomBytes(32).toString('base64url');
 db.prepare('INSERT INTO native_connection_tickets VALUES (?,?,?,?)').run(hash(code),userId,slug,now()+15*60_000);
 return code;
}
export function redeemConnectionTicket(code:string,slug:string):string|null{
 if(!validChallenge(code))return null;
 return db.transaction(()=>{const r=db.prepare('SELECT user_id FROM native_connection_tickets WHERE hash=? AND slug=? AND expires_at>?').get(hash(code),slug,now()) as {user_id:string}|undefined;if(!r)return null;db.prepare('DELETE FROM native_connection_tickets WHERE hash=?').run(hash(code));return r.user_id;})();
}
export const validChallenge = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export function issueNativeTicket(userId: string, challenge: string) {
  if (!validChallenge(challenge)) throw new Error('Invalid PKCE challenge');
  db.prepare('DELETE FROM native_login_tickets WHERE expires_at<=?').run(now());
  const code = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO native_login_tickets VALUES (?,?,?,?)').run(hash(code), userId, challenge, now() + 60_000);
  return code;
}
export function redeemNativeTicket(code: string, verifier: string): string | null {
  if (!validChallenge(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null;
  return db.transaction(() => {
    const ticket = db.prepare('SELECT * FROM native_login_tickets WHERE hash=? AND expires_at>?').get(hash(code), now()) as any;
    if (!ticket || ticket.challenge !== hash(verifier)) return null;
    db.prepare('DELETE FROM native_login_tickets WHERE hash=?').run(hash(code));
    return ticket.user_id as string;
  })();
}
