import { randomBytes } from 'node:crypto';
import { env } from '../env.js';

// Content-Security-Policy for every page the server sends. The point is the script rule: only Badr's own
// files run, so even if some text ever slipped into a page as HTML, it could not run code for the visitor.
// Everything else is as open as the app needs and no more:
// - images: our own, data: (bot avatars), blob: (previews) and https: (connected-app logos from Composio);
// - connections: our own server (including its websockets for the computer view and calls) and xAI's
//   realtime voice, which the browser reaches directly when calls aren't relayed;
// - blob: scripts only for the microphone's audio worklet, which the app builds in memory;
// - styles allow inline because React and the motion library set style attributes;
// - nobody may put Badr inside a frame, and forms may only post back to Badr.
const wsOf = (origin: string) => origin.replace(/^http/, 'ws');
const own = () => [new URL(env.appUrl).origin, ...env.extraOrigins];

export function contentSecurityPolicy(nonce?: string): string {
  const origins = own();
  return [
    "default-src 'self'",
    `script-src 'self' blob:${nonce ? ` 'nonce-${nonce}'` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' ${origins.map(wsOf).join(' ')} https://api.x.ai wss://api.x.ai`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** For the few small pages the server writes itself with one inline script: that script, and no other, may run. */
export const newNonce = () => randomBytes(16).toString('base64');
