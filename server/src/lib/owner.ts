import { db } from '../db.js';
import { env } from '../env.js';

/**
 * Who may use the server's own resources: its ChatGPT/Claude logins, Fino's paid models, and the shared bot computer.
 * Private servers (PUBLIC_SIGNUP=0) trust every allowed account. Public ones trust only the owner: OWNER_EMAIL, else the
 * emails in ALLOWED_EMAILS (the private-era allowlist), else the first account created. Everyone else brings their own AI.
 */
export function usesServerResources(userId: string): boolean {
  if (!env.publicSignup) return true;
  const owners = (process.env.OWNER_EMAIL || process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (owners.length) {
    const row = db.prepare('SELECT email FROM users WHERE id=?').get(userId) as { email: string } | undefined;
    return !!row && owners.includes(row.email.toLowerCase());
  }
  const first = db.prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1').get() as { id: string } | undefined;
  return first?.id === userId;
}
