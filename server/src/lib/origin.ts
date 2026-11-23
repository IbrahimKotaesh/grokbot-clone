import { env } from '../env.js';

/** True for the app's own web address and any ALLOWED_ORIGINS (like the old address during a move). */
export function allowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  return origin === new URL(env.appUrl).origin || env.extraOrigins.includes(origin);
}
