// Web subscriptions through Stripe Checkout.
//
// The plan lives on the Fino account, so it is the same on the web, the Mac app and the phone no
// matter where it was bought. Apple purchases arrive through RevenueCat (billing.ts); web purchases
// arrive here. Each user's plan remembers which store it came from, so one store never cancels a
// plan the other one is still charging for.
//
// Setup: STRIPE_SECRET_KEY (sk_test_… or sk_live_…), and a webhook endpoint at
// <APP_URL>/api/billing/stripe-webhook for checkout.session.completed and
// customer.subscription.created/updated/deleted, with its signing secret in STRIPE_WEBHOOK_SECRET.
// Optional STRIPE_PRICE_STARTER / _PRO / _MAX use Dashboard prices; otherwise prices come from plans.ts.
import type { Context } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { env } from './env.js';
import { PLANS, isPlanId, setPlan, type PlanId } from './plans.js';

const BUYABLE: PlanId[] = ['starter', 'pro', 'max'];
const priceEnv = (plan: PlanId) => process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]?.trim() || undefined;

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim();

for (const col of ['plan_source TEXT', 'stripe_customer_id TEXT', 'stripe_subscription_id TEXT']) {
  const name = col.split(' ')[0];
  if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === name)) db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
}

export type PlanSource = 'apple' | 'google' | 'stripe' | null;
interface BillingRow { plan_source: PlanSource; stripe_customer_id: string | null; stripe_subscription_id: string | null; email: string }
const billingRow = (userId: string) =>
  db.prepare('SELECT plan_source, stripe_customer_id, stripe_subscription_id, email FROM users WHERE id=?').get(userId) as BillingRow | undefined;
export const planSource = (userId: string): PlanSource => billingRow(userId)?.plan_source ?? null;
export const setPlanSource = (userId: string, source: PlanSource) => db.prepare('UPDATE users SET plan_source=? WHERE id=?').run(source, userId);

/** Calls the Stripe REST API with form encoding (no SDK needed). */
async function stripe<T>(method: 'GET' | 'POST', path: string, params?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('Web payments aren’t set up yet.');
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  return json;
}

/** Starts Stripe Checkout for a plan and returns the page to send the user to. */
export async function createCheckout(userId: string, plan: string): Promise<{ url: string }> {
  if (!isPlanId(plan) || !BUYABLE.includes(plan)) throw new Error('Pick Starter, Pro or Max.');
  const row = billingRow(userId);
  if (!row) throw new Error('Account not found.');
  if (row.plan_source === 'apple' || row.plan_source === 'google')
    throw new Error(`Your plan is billed through ${row.plan_source === 'apple' ? 'Apple' : 'Google Play'}. Change it from your phone’s subscription settings.`);
  // Already paying on the web: plan changes and cancelling happen in the billing portal, not a second checkout.
  if (row.plan_source === 'stripe' && row.stripe_subscription_id) return createPortal(userId);
  const p = PLANS[plan];
  const params: Record<string, string> = {
    mode: 'subscription',
    client_reference_id: userId,
    'metadata[user_id]': userId,
    'metadata[plan]': plan,
    'subscription_data[metadata][user_id]': userId,
    'subscription_data[metadata][plan]': plan,
    'line_items[0][quantity]': '1',
    allow_promotion_codes: 'true',
    success_url: `${env.appUrl}/?billing=success`,
    cancel_url: `${env.appUrl}/?billing=cancel`,
  };
  const price = priceEnv(plan);
  if (price) params['line_items[0][price]'] = price;
  else {
    Object.assign(params, {
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(Math.round((p.priceUsd ?? 0) * 100)),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': `Fino ${p.name}`,
    });
  }
  if (row.stripe_customer_id) params.customer = row.stripe_customer_id;
  else params.customer_email = row.email;
  const session = await stripe<{ url: string }>('POST', 'checkout/sessions', params);
  return { url: session.url };
}

/** Stripe's own page for changing card, switching plan, invoices and cancelling. */
export async function createPortal(userId: string): Promise<{ url: string }> {
  const row = billingRow(userId);
  if (!row?.stripe_customer_id) throw new Error('There’s no web subscription on this account yet.');
  const session = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer: row.stripe_customer_id, return_url: `${env.appUrl}/` });
  return { url: session.url };
}

/** Checks the Stripe-Signature header (HMAC-SHA256 of "timestamp.body"), allowing 5 minutes of clock drift. */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowMs / 1000 - Number(t)) > 300) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'));
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected));
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number; price?: { id?: string } }[] };
}

function planForSubscription(sub: StripeSubscription): PlanId | null {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const byPrice = BUYABLE.find((p) => priceId && priceEnv(p) === priceId);
  if (byPrice) return byPrice;
  const meta = sub.metadata?.plan;
  return isPlanId(meta) && BUYABLE.includes(meta) ? meta : null;
}

function userForSubscription(sub: StripeSubscription): string | null {
  const byMeta = sub.metadata?.user_id;
  if (byMeta && db.prepare('SELECT 1 FROM users WHERE id=?').get(byMeta)) return byMeta;
  const byCustomer = db.prepare('SELECT id FROM users WHERE stripe_customer_id=?').get(sub.customer) as { id: string } | undefined;
  return byCustomer?.id ?? null;
}

/** Applies a subscription's current state to its Fino account. */
export function applySubscription(sub: StripeSubscription) {
  const userId = userForSubscription(sub);
  if (!userId) return;
  const row = billingRow(userId);
  // A plan bought through Apple or Google isn't touched by an unrelated web subscription ending.
  const ours = row?.plan_source === 'stripe' && row.stripe_subscription_id === sub.id;
  if (['active', 'trialing', 'past_due'].includes(sub.status)) {
    const plan = planForSubscription(sub);
    if (!plan) return;
    const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    db.prepare('UPDATE users SET stripe_customer_id=?, stripe_subscription_id=?, plan_source=? WHERE id=?').run(sub.customer, sub.id, 'stripe', userId);
    setPlan(userId, plan, end ? end * 1000 : null);
  } else if (ours && ['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
    db.prepare('UPDATE users SET stripe_subscription_id=NULL, plan_source=NULL WHERE id=?').run(userId);
    setPlan(userId, 'free');
  }
}

/** Stripe webhook: verifies the signature and keeps each account's plan in step with its subscription. */
export async function stripeWebhook(c: Context) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
  const raw = await c.req.text();
  if (!verifyStripeSignature(raw, c.req.header('stripe-signature'), secret)) return c.json({ error: 'bad signature' }, 400);
  const event = JSON.parse(raw) as { type: string; data: { object: any } };
  const obj = event.data?.object ?? {};
  try {
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      const userId = obj.client_reference_id ?? obj.metadata?.user_id;
      if (userId && obj.customer) db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(obj.customer, userId);
      // The session only names the subscription; fetch it for its status, plan and renewal date.
      if (obj.subscription && stripeEnabled()) applySubscription(await stripe<StripeSubscription>('GET', `subscriptions/${obj.subscription}`));
    } else if (event.type.startsWith('customer.subscription.')) {
      applySubscription(event.type === 'customer.subscription.deleted' ? { ...obj, status: 'canceled' } : obj);
    }
  } catch (e) {
    console.error('[stripe] webhook', event.type, (e as Error).message);
    return c.json({ error: 'retry' }, 500);
  }
  return c.json({ ok: true });
}
