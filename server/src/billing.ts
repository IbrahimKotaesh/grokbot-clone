// Plan endpoints for the apps, plus the store webhook that actually changes a user's plan.
//
// Purchases happen in the store (Apple In-App Purchase through RevenueCat, or Stripe on the web).
// The store tells us about them here; the app never sets its own plan in production.
import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { env } from './env.js';
import type { AuthVars } from './lib/auth.js';
import { billingSummary, isPlanId, setPlan, type PlanId } from './plans.js';

export const billingApi = new Hono<AuthVars>();

billingApi.get('/', (c) => c.json(billingSummary(c.get('user').id)));

/** Development only: switch plans without a store, so every plan can be tried locally. */
billingApi.post('/dev-plan', async (c) => {
  if (!env.devLogin) return c.json({ error: 'Plans change through the App Store.' }, 403);
  const { plan } = await c.req.json<{ plan?: string }>().catch(() => ({ plan: '' }));
  if (!isPlanId(plan)) return c.json({ error: 'Unknown plan' }, 400);
  setPlan(c.get('user').id, plan);
  return c.json(billingSummary(c.get('user').id));
});

// RevenueCat entitlement identifiers → plans. Configure the same ids in the RevenueCat dashboard.
const ENTITLEMENTS: Record<string, PlanId> = { starter: 'starter', pro: 'pro', max: 'max', enterprise: 'enterprise' };
const RANK: PlanId[] = ['starter', 'pro', 'max', 'enterprise'];

/**
 * RevenueCat webhook (https://www.revenuecat.com/docs/integrations/webhooks).
 * Set REVENUECAT_WEBHOOK_SECRET and use it as the webhook's Authorization header.
 * The app passes the Fino user id as RevenueCat's app_user_id.
 */
export async function revenueCatWebhook(c: Context) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const got = c.req.header('authorization') ?? '';
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ event?: any }>().catch(() => ({}) as { event?: any });
  const e = body.event;
  if (!e?.app_user_id) return c.json({ ok: true });
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(String(e.app_user_id)) as { id: string } | undefined;
  if (!user) return c.json({ ok: true });
  const plans = ((e.entitlement_ids ?? []) as string[]).map((id) => ENTITLEMENTS[id]).filter(Boolean);
  const best = plans.sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0];
  if (['EXPIRATION', 'CANCELLATION_EXPIRED'].includes(e.type)) setPlan(user.id, 'free');
  else if (best && ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE'].includes(e.type))
    setPlan(user.id, best, typeof e.expiration_at_ms === 'number' ? e.expiration_at_ms : null);
  return c.json({ ok: true });
}
