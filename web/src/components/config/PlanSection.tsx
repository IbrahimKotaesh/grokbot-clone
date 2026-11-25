import { useEffect, useState } from 'react';
import { api, type BillingSummary } from '../../lib/api';
import { lang, t } from '../../lib/i18n';

const BUYABLE = ['starter', 'pro', 'max', 'ultra'];

/** "success" or "cancel" when Stripe Checkout sent the user back here; read once, then cleared from the address bar. */
export const billingReturn = (() => {
  const params = new URLSearchParams(location.search);
  const v = params.get('billing');
  if (!v) return null;
  params.delete('billing');
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
  return v === 'success' ? 'success' : 'cancel';
})();

/** Settings → Plan: your plan, and buying or managing it on the web through Stripe. */
export function PlanSection() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState(billingReturn === 'success' ? t('Payment received. Activating your plan…') : '');
  useEffect(() => {
    let tries = 0, stop = false;
    const load = () => api.billing().then((b) => {
      if (stop) return;
      setBilling(b);
      // Stripe tells the server a moment after the payment page closes; keep checking for a short while.
      if (billingReturn === 'success' && b.source !== 'stripe' && ++tries < 10) setTimeout(load, 2000);
      else if (billingReturn === 'success') setNote(b.source === 'stripe' ? t('You’re all set. Your new plan is active.') : t('Your payment went through. Your plan will show here in a minute.'));
    }).catch((e) => setError((e as Error).message));
    load();
    return () => { stop = true; };
  }, []);

  const go = async (key: string, call: () => Promise<{ url: string }>) => {
    setBusy(key); setError('');
    try { location.href = (await call()).url; }
    catch (e) { setError((e as Error).message); setBusy(''); }
  };

  if (!billing) return (
    <>
      <Head />
      {error && <div className="cfg-field__hint" role="alert">{error}</div>}
    </>
  );
  const current = billing.plans.find((p) => p.id === billing.plan);
  const date = billing.renewsAt ? new Date(billing.renewsAt).toLocaleDateString(lang === 'ar' ? 'ar' : lang === 'nl' ? 'nl-NL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const store = billing.source === 'apple' ? 'Apple' : billing.source === 'google' ? 'Google Play' : null;
  const paid = billing.plan !== 'free';

  return (
    <>
      <Head />
      {note && <div className="plan-note" role="status">{note}</div>}
      <section className="cfg-section">
        <div className="cfg-card">
          <div className="cfg-row">
            <div className="cfg-row__text">
              <div className="cfg-row__title">{t('{plan} plan', { plan: t(current?.name ?? 'Free') })}</div>
              <div className="cfg-row__sub">
                {store
                  ? t('Billed through {store}. Change or cancel it from your phone’s subscription settings.', { store })
                  : billing.trialUntil
                    ? t('Free trial until {date}. Your card is charged then, unless you cancel before.', { date: new Date(billing.trialUntil).toLocaleString(lang === 'ar' ? 'ar' : lang === 'nl' ? 'nl-NL' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) })
                  : billing.source === 'stripe' && date
                    ? t('Renews on {date}.', { date })
                    : paid ? (date ? t('Active until {date}.', { date }) : t('Your plan is active.')) : t('Upgrade for more bots and a cloud computer for your team.')}
              </div>
            </div>
            {billing.source === 'stripe' && (
              <button type="button" className="cfg-btn cfg-btn--secondary" disabled={!!busy} onClick={() => void go('portal', api.billingPortal)}>
                {busy === 'portal' ? t('Opening…') : t('Manage subscription')}
              </button>
            )}
          </div>
        </div>
      </section>
      {!store && billing.source !== 'stripe' && (
        <section className="cfg-section">
          <div className="cfg-section__label">{t('Plans')}</div>
          <div className="plan-grid">
            {billing.plans.filter((p) => BUYABLE.includes(p.id)).map((p) => {
              const isCurrent = p.id === billing.plan;
              return (
                <div key={p.id} className={`plan-card${p.id === 'pro' ? ' is-featured' : ''}`}>
                  <div className="plan-card__name">{t(p.name)}</div>
                  <div className="plan-card__price">${p.priceUsd}<span>{t('/month')}</span></div>
                  <ul className="plan-card__list">{p.highlights.map((h) => <li key={h}>{t(h)}</li>)}</ul>
                  <button
                    type="button"
                    className={`cfg-btn ${p.id === 'pro' ? 'cfg-btn--primary' : 'cfg-btn--secondary'}`}
                    disabled={isCurrent || !!busy || !billing.webCheckout}
                    onClick={() => void go(p.id, () => api.checkout(p.id))}
                  >
                    {isCurrent ? t('Current plan') : busy === p.id ? t('Opening…') : billing.trialAvailable ? t('Try 1 day free') : t('Choose {plan}', { plan: t(p.name) })}
                  </button>
                </div>
              );
            })}
          </div>
          {!billing.webCheckout && <div className="cfg-field__hint">{t('Web payments are coming soon. You can subscribe in the Fino iPhone app.')}</div>}
          {billing.webCheckout && billing.trialAvailable && <div className="plan-note">{t('Try any plan free for 1 day. Your card is charged after the free day unless you cancel before; you can cancel in one click.')}</div>}
          {billing.webCheckout && <div className="cfg-field__hint">{t('Secure payment by Stripe. Cancel anytime. Your plan works on the web, Mac and iPhone.')}</div>}
        </section>
      )}
      {error && <div className="cfg-field__hint" role="alert">{error}</div>}
    </>
  );
}

function Head() {
  return (
    <div className="app-settings__head">
      <h1>{t('Plan')}</h1>
      <p>{t('One plan for your whole Fino account, on every device.')}</p>
    </div>
  );
}
