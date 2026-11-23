import { t } from '../lib/i18n';
import type { PlanBody } from '@shared/types';

/** The bot's live checklist for a multi-step request: done steps get a check, the current one spins. */
export function PlanCard({ body, running }: { body: PlanBody; running: boolean }) {
  const done = body.steps.filter((s) => s.status === 'done').length;
  return (
    <div className="plan-card" role="group" aria-label={body.title || t('Plan')}>
      <div className="plan-card__head">
        <span>{body.title || t('Plan')}</span>
        <small>{t('{done} of {total}', { done, total: body.steps.length })}</small>
      </div>
      <ol className="plan-card__steps">
        {body.steps.map((step, i) => {
          const current = step.status === 'in_progress';
          return (
            <li key={i} className={`plan-step is-${step.status}`}>
              <span className="plan-step__mark" aria-hidden="true">
                {step.status === 'done' ? <svg viewBox="0 0 20 20" width="18" height="18"><circle cx="10" cy="10" r="9" fill="var(--plan-green)" /><path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : current && running ? <span className="plan-spinner" /> : <span className={current ? 'plan-dot is-current' : 'plan-dot'} />}
              </span>
              <span className="plan-step__text">{step.text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
