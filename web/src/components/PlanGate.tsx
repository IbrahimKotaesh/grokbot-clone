import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { api, type BillingSummary } from '../lib/api';
import { locale, t } from '../lib/i18n';
import { billingReturn } from './config/PlanSection';
import { characterDataUri } from '../../../packages/contracts/src/characters';
import '../styles/plan-gate.css';

const SHOWN = ['starter', 'pro', 'max'];
const BADR = characterDataUri('accountant', 'yellow');
const FROM_GATE = 'fino.checkoutFromGate';
/** True when this page load is the return from a checkout started on the plan screen (read once). */
export const cameFromGate = (() => {
  try { const v = sessionStorage.getItem(FROM_GATE) === '1'; sessionStorage.removeItem(FROM_GATE); return v && !!billingReturn; } catch { return false; }
})();

/**
 * The first thing a new web account sees: pick one of three plans, then one button starts its free day.
 * The workspace opens only once a plan (or its free day) is active; the server enforces the same rule.
 * Back from Stripe, it waits for the payment to land, then opens the team by itself.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [activating, setActivating] = useState(billingReturn === 'success');
  const [picked, setPicked] = useState('pro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false, tries = 0;
    const load = () => api.billing().then((b) => {
      if (stop) return;
      setBilling(b);
      // Stripe tells the server a few seconds after its page closes; keep checking for up to a minute.
      if (activating && b.planRequired && ++tries < 30) setTimeout(load, 2000);
      else setActivating(false);
    }).catch(() => { if (!stop) setFailed(true); });
    load();
    return () => { stop = true; };
  }, []);

  // If billing can't be read, don't lock anyone out: the server still refuses bot turns without a plan.
  if (failed || (billing && !billing.planRequired)) return <>{children}</>;
  if (!billing || activating) return (
    <div className="gate gate--wait" role="status">
      <img src={BADR} alt="" width={88} height={88} />
      <p>{activating ? t('Payment received. Activating your plan…') : t('One moment…')}</p>
    </div>
  );

  const plans = billing.plans.filter((p) => SHOWN.includes(p.id));
  const plan = plans.find((p) => p.id === picked) ?? plans[0];
  const trial = !!billing.trialAvailable;
  const price = `$${plan.priceUsd}`;
  const tomorrow = new Date(Date.now() + 86400_000).toLocaleDateString(locale, { day: 'numeric', month: 'long' });

  const start = async () => {
    setBusy(true); setError('');
    try {
      const { url } = await api.checkout(plan.id);
      try { sessionStorage.setItem(FROM_GATE, '1'); } catch { /* private window: lands on the Plan page instead */ }
      location.href = url;
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="gate">
      <main className="gate__in">
        <header className="gate__head">
          <img className="gate__badr" src={BADR} alt="" width={76} height={76} />
          <h1>{trial ? t('Pick your plan. The first day is free.') : t('Pick a plan to keep working with your team.')}</h1>
          <p>{trial
            ? t('Your team is ready. Choose a plan to meet them; you pay nothing today, and you can cancel before the day ends in one click.')
            : t('Your free day or plan has ended. Choose a plan and your bots pick up right where they left off.')}</p>
          {billingReturn === 'cancel' && <p className="gate__note" role="status">{t('No problem. Pick a plan whenever you’re ready.')}</p>}
        </header>

        <div className="gate__plans" role="radiogroup" aria-label={t('Plans')}>
          {plans.map((p) => {
            const on = p.id === plan.id;
            return (
              <label key={p.id} className={`gate__plan${on ? ' is-on' : ''}`}>
                <input type="radio" name="gate-plan" value={p.id} checked={on} onChange={() => setPicked(p.id)} />
                <span className="gate__row">
                  <span className="gate__dot" aria-hidden />
                  <span className="gate__name">{t(p.name)}</span>
                  {p.id === 'pro' && <span className="gate__tag">{t('Most teams')}</span>}
                  <span className="gate__price"><b>${p.priceUsd}</b><small>{t('/month')}</small></span>
                </span>
                <ul className="gate__feats">
                  {p.highlights.map((h) => <li key={h}><span className="gate__tick" aria-hidden><Check size={12} strokeWidth={3.4} /></span>{t(h)}</li>)}
                </ul>
              </label>
            );
          })}
        </div>

        <div className="gate__cta">
          <button type="button" className="gate__go" disabled={busy} onClick={() => void start()}>
            <span>{busy ? t('Opening…') : trial ? t('Try {plan} free for 1 day', { plan: t(plan.name) }) : t('Continue with {plan}', { plan: t(plan.name) })}</span>
            {!busy && <ArrowRight size={20} strokeWidth={2.6} aria-hidden />}
          </button>
          <p className="gate__then">{trial
            ? t('Nothing to pay today. From {date}, {price} a month. Cancel anytime in one click.', { date: tomorrow, price })
            : t('{price} a month. Cancel anytime in one click.', { price })}</p>
          {error && <p className="gate__error" role="alert">{error}</p>}
        </div>

        <footer className="gate__foot">
          <span><Lock size={13} strokeWidth={2.4} aria-hidden /> {t('Secure payment by Stripe. Your plan works on the web, Mac and iPhone.')}</span>
          <button type="button" onClick={() => void api.logout().finally(() => location.assign('/welcome'))}>{t('Sign out')}</button>
        </footer>
      </main>
    </div>
  );
}
