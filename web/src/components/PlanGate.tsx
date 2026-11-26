import { useEffect, useState, type ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import { api, type BillingSummary } from '../lib/api';
import { t } from '../lib/i18n';
import { billingReturn } from './config/PlanSection';
import { characterDataUri } from '../../../packages/contracts/src/characters';
import '../styles/plan-gate.css';

const SHOWN = ['starter', 'pro', 'max'];
const FROM_GATE = 'fino.checkoutFromGate';
/** True when this page load is the return from a checkout started on the plan screen (read once). */
export const cameFromGate = (() => {
  try { const v = sessionStorage.getItem(FROM_GATE) === '1'; sessionStorage.removeItem(FROM_GATE); return v && !!billingReturn; } catch { return false; }
})();
const BADR = characterDataUri('accountant', 'yellow');

/**
 * The first thing a new web account sees: the three plans, each starting with a free day.
 * The workspace opens only once a plan (or its free day) is active; the server enforces the same rule.
 * Back from Stripe, it waits for the payment to land, then opens the workspace by itself.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [activating, setActivating] = useState(billingReturn === 'success');
  const [busy, setBusy] = useState('');
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
      <img src={BADR} alt="" width={96} height={96} />
      <p>{activating ? t('Payment received. Activating your plan…') : t('One moment…')}</p>
    </div>
  );

  const start = async (plan: string) => {
    setBusy(plan); setError('');
    try {
      const { url } = await api.checkout(plan);
      try { sessionStorage.setItem(FROM_GATE, '1'); } catch { /* private window: lands on the Plan page instead */ }
      location.href = url;
    }
    catch (e) { setError((e as Error).message); setBusy(''); }
  };
  const trial = !!billing.trialAvailable;
  const plans = billing.plans.filter((p) => SHOWN.includes(p.id));

  return (
    <div className="gate">
      <div className="gate__in">
        <header className="gate__head">
          <img className="gate__badr" src={BADR} alt="" width={84} height={84} />
          <h1>{trial ? t('Pick your plan. The first day is free.') : t('Pick a plan to keep working with your team.')}</h1>
          <p>{trial
            ? t('Your team is ready. Choose a plan to meet them; you pay nothing today, and you can cancel before the day ends in one click.')
            : t('Your free day or plan has ended. Choose a plan and your bots pick up right where they left off.')}</p>
          {billingReturn === 'cancel' && <p className="gate__note" role="status">{t('No problem. Pick a plan whenever you’re ready.')}</p>}
        </header>

        <ul className="gate__plans">
          {plans.map((p) => {
            const pick = p.id === 'pro';
            return (
              <li key={p.id} className={`gate__plan${pick ? ' is-pick' : ''}`}>
                {pick && <em className="gate__tag">{t('Most teams')}</em>}
                <h2>{t(p.name)}</h2>
                <div className="gate__price"><b>${p.priceUsd}</b><span>{t('/month')}</span></div>
                <ul>{p.highlights.map((h) => <li key={h}><Check size={16} strokeWidth={3} aria-hidden />{t(h)}</li>)}</ul>
                <button type="button" className="gate__go" disabled={!!busy} onClick={() => void start(p.id)}>
                  {busy === p.id ? t('Opening…') : trial ? t('Try 1 day free') : t('Choose {plan}', { plan: t(p.name) })}
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="gate__error" role="alert">{error}</p>}
        <footer className="gate__foot">
          <span><Lock size={14} aria-hidden /> {t('Secure payment by Stripe. Cancel anytime. Your plan works on the web, Mac and iPhone.')}</span>
          <button type="button" onClick={() => void api.logout().finally(() => location.assign('/welcome'))}>{t('Sign out')}</button>
        </footer>
      </div>
    </div>
  );
}
