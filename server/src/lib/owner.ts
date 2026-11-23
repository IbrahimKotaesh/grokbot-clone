import { db } from '../db.js';
import { env } from '../env.js';

/**
 * Who may use the server's own resources: its ChatGPT/Claude logins, Fino's paid models, and the shared bot computer.
 * Private servers trust every allowed account. With PUBLIC_SIGNUP=1 only the owner does: OWNER_EMAIL when set,
 * otherwise the first account created. Everyone else connects their own AI account and starts blank.
 */
export function usesServerResources(userId: string): boolean {
  if (!env.publicSignup) return true;
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (owner) {
    const row = db.prepare('SELECT email FROM users WHERE id=?').get(userId) as { email: string } | undefined;
    return row?.email.toLowerCase() === owner;
  }
  const first = db.prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1').get() as { id: string } | undefined;
  return first?.id === userId;
}
