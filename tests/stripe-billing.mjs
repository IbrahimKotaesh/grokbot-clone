// Web subscriptions: Stripe webhook signatures, plan changes, and Apple/Stripe never cancelling each other's plan.
// Throwaway database, no network: the webhook is called with signed test events.
//   DB_PATH=$(mktemp -d)/t.db STRIPE_WEBHOOK_SECRET=whsec_test REVENUECAT_WEBHOOK_SECRET=rc_test node --env-file=.env tests/stripe-billing.mjs   (after npm run build)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { db } from '../server/dist/db.js';
import { planOf } from '../server/dist/plans.js';
import { stripeWebhook, verifyStripeSignature, planSource, createCheckout } from '../server/dist/stripe.js';
import { revenueCatWebhook } from '../server/dist/billing.js';

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
assert.equal(SECRET, 'whsec_test', 'run with STRIPE_WEBHOOK_SECRET=whsec_test');
const app = new Hono();
app.post('/stripe', stripeWebhook);
app.post('/rc', revenueCatWebhook);

for (const id of ['web', 'phone']) db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id, `${id}@example.com`, id, Date.now());

const sign = (body, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const send = (event, header) => {
  const body = JSON.stringify(event);
  return app.request('/stripe', { method: 'POST', body, headers: { 'content-type': 'application/json', 'stripe-signature': header ?? sign(body) } });
};
const sub = (over) => ({ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { user_id: 'web', plan: 'pro' }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] }, ...over });

// Signatures
const raw = '{"a":1}';
assert.ok(verifyStripeSignature(raw, sign(raw), SECRET), 'a correct signature passes');
assert.ok(!verifyStripeSignature(raw, sign(raw, undefined, 'whsec_other'), SECRET), 'a signature from another secret fails');
assert.ok(!verifyStripeSignature(raw, sign(raw, Math.floor(Date.now() / 1000) - 3600), SECRET), 'an old signature fails');
assert.ok(!verifyStripeSignature('{"a":2}', sign(raw), SECRET), 'a changed body fails');
assert.equal((await send({ type: 'customer.subscription.created', data: { object: sub() } }, 't=1,v1=bad')).status, 400, 'unsigned events are refused');
assert.equal(planOf('web').id, 'free', 'a refused event changes nothing');

// Buying Pro on the web
assert.equal((await send({ type: 'customer.subscription.created', data: { object: sub() } })).status, 200);
assert.equal(planOf('web').id, 'pro', 'the web purchase turns on Pro');
assert.equal(planSource('web'), 'stripe');
const row = db.prepare('SELECT stripe_customer_id, stripe_subscription_id, plan_renews_at FROM users WHERE id=?').get('web');
assert.equal(row.stripe_customer_id, 'cus_1');
assert.equal(row.stripe_subscription_id, 'sub_1');
assert.ok(row.plan_renews_at > Date.now() + 29 * 86400_000, 'renewal date comes from Stripe');

// Switching to Max, then a payment hiccup keeps the plan
await send({ type: 'customer.subscription.updated', data: { object: sub({ metadata: { user_id: 'web', plan: 'max' } }) } });
assert.equal(planOf('web').id, 'max', 'a plan change applies');
await send({ type: 'customer.subscription.updated', data: { object: sub({ status: 'past_due', metadata: { user_id: 'web', plan: 'max' } }) } });
assert.equal(planOf('web').id, 'max', 'a failed renewal Stripe is retrying keeps the plan');

// While paying on the web, a second checkout is not started (it goes to the portal instead), and an Apple expiry doesn't touch it
const rc = (event) => app.request('/rc', { method: 'POST', body: JSON.stringify({ event }), headers: { 'content-type': 'application/json', authorization: process.env.REVENUECAT_WEBHOOK_SECRET } });
assert.equal((await rc({ type: 'EXPIRATION', app_user_id: 'web', entitlement_ids: ['pro'] })).status, 200);
assert.equal(planOf('web').id, 'max', 'an old Apple subscription expiring leaves the web plan alone');

// Cancelling on the web ends the plan
await send({ type: 'customer.subscription.deleted', data: { object: sub({ status: 'canceled' }) } });
assert.equal(planOf('web').id, 'free', 'cancelling ends the plan');
assert.equal(planSource('web'), null);

// Phone subscriber: Apple sets the source, the web refuses a second checkout, and a stray Stripe cancel can't end it
await rc({ type: 'INITIAL_PURCHASE', app_user_id: 'phone', entitlement_ids: ['pro'], store: 'APP_STORE', expiration_at_ms: Date.now() + 30 * 86400_000 });
assert.equal(planOf('phone').id, 'pro');
assert.equal(planSource('phone'), 'apple');
await assert.rejects(createCheckout('phone', 'max'), /billed through Apple/, 'an Apple subscriber is sent to their phone settings, not charged twice');
await send({ type: 'customer.subscription.deleted', data: { object: sub({ id: 'sub_other', customer: 'cus_other', status: 'canceled', metadata: { user_id: 'phone', plan: 'pro' } }) } });
assert.equal(planOf('phone').id, 'pro', 'a web subscription that was never theirs ending leaves the Apple plan alone');
await rc({ type: 'EXPIRATION', app_user_id: 'phone', entitlement_ids: ['pro'], store: 'APP_STORE' });
assert.equal(planOf('phone').id, 'free', 'the Apple plan ends when Apple says so');

await assert.rejects(createCheckout('web', 'enterprise'), /Pick Starter, Pro, Max or Ultra/);
console.log('PASS: Stripe signatures checked; web purchase, plan change, past-due and cancel apply; Apple and Stripe never end each other’s plan');
db.close(); process.exit(0);
