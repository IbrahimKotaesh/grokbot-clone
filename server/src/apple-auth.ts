// Sign in with Apple for the native app (App Store guideline 4.8).
// The app sends Apple's identity token; we verify its signature against Apple's published keys,
// its issuer, audience (our bundle id) and expiry, then sign the user in by the email Apple vouches for.
import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';

const ISSUER = 'https://appleid.apple.com';
const AUDIENCES = (process.env.APPLE_BUNDLE_IDS ?? 'com.ibkopixels.fino,com.ibkopixels.fino.dev').split(',').map((s) => s.trim()).filter(Boolean);

let keys: { at: number; list: (JsonWebKey & { kid: string; alg: string })[] } | null = null;
async function appleKeys() {
  if (keys && Date.now() - keys.at < 60 * 60_000) return keys.list;
  const r = await fetch(`${ISSUER}/auth/keys`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error('Apple sign-in is unavailable right now.');
  const body = (await r.json()) as { keys: (JsonWebKey & { kid: string; alg: string })[] };
  keys = { at: Date.now(), list: body.keys };
  return body.keys;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export interface AppleIdentity {
  sub: string;
  email: string | null;
}

export async function verifyAppleIdentityToken(token: string): Promise<AppleIdentity> {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple sign-in.');
  const header = JSON.parse(b64url(parts[0]).toString('utf8')) as { kid?: string; alg?: string };
  const payload = JSON.parse(b64url(parts[1]).toString('utf8')) as {
    iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean | string;
  };
  if (header.alg !== 'RS256') throw new Error('Invalid Apple sign-in.');
  let jwk = (await appleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = null; // Apple rotated keys; refresh once.
    jwk = (await appleKeys()).find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error('Invalid Apple sign-in.');
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), b64url(parts[2]));
  if (!ok) throw new Error('Invalid Apple sign-in.');
  if (payload.iss !== ISSUER || !payload.aud || !AUDIENCES.includes(payload.aud)) throw new Error('Invalid Apple sign-in.');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('Apple sign-in expired. Please try again.');
  if (!payload.sub) throw new Error('Invalid Apple sign-in.');
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  return { sub: payload.sub, email: payload.email && verified ? payload.email.toLowerCase() : null };
}
