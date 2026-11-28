// The owner's money rule: a Bot browses billing pages and prepares everything, never presses the button that pays,
// and asks before it cancels a plan.   DB_PATH=:memory: node --env-file=.env tests/pay-button.mjs
import assert from 'node:assert/strict';
const { payDecision } = await import('../server/dist/agent/employee-rules.js');
const on = (label, payPage = true, submit = false) => payDecision(label, { payPage, submit });

// Getting ready on a billing page is fine: signing in, opening plans, filling details, managing the subscription.
for (const l of ['Sign in', 'Continue', 'Manage subscription', 'Billing details', 'Next', 'Add to cart', 'Change plan', 'Email address'])
  assert.equal(on(l), null, `"${l}" is allowed on a billing page`);
assert.equal(on('Buy', false, false), null, 'a plain "Buy" menu link in a shop only opens the shop');

// The button that pays is always blocked.
for (const l of ['Pay now', 'Buy now', 'Place order', 'Place your order', 'Complete purchase', 'Confirm payment', 'Pay €9.99', 'Nu betalen', 'ادفع الآن'])
  assert.equal(on(l, false), 'block', `"${l}" is blocked anywhere`);
for (const l of ['Pay', 'Subscribe', 'Upgrade', 'Start membership', 'Renew', 'Checkout', 'Afrekenen'])
  assert.equal(on(l), 'block', `"${l}" is blocked on a billing page`);
assert.equal(on('Buy', false, true), 'block', 'a "Buy" button that submits a form pays');

// Cancelling waits for the owner's OK, then the Bot does it.
for (const l of ['Cancel subscription', 'Cancel plan', 'Opzeggen', 'Turn off auto-renew', 'End membership', 'إلغاء الاشتراك'])
  assert.equal(on(l), 'ask', `"${l}" needs the owner's OK`);
assert.equal(on('', true, true), 'ask', 'an unnamed submit on a billing page could pay: the owner decides');
assert.equal(on('Unsubscribe from emails', false), null, 'email unsubscribe is not a payment');
console.log('PASS: billing pages open, only the pay button is blocked, cancelling asks first');
