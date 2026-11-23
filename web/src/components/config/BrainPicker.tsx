import { t } from '../../lib/i18n';
import type { Bot } from '@shared/types';
import { DEFAULT_MODEL, ModelLogo, tierName, useHostedModels } from '../../lib/models';
import { ProviderLogo } from '../ProviderLogo';

type Provider = NonNullable<Bot['agentProvider']>;

/** The bot's brain: Fino's included models (locked ones show their plan), then the user's own subscriptions. */
export function BrainPicker({ provider, model, onChange }: { provider: Provider; model: string; onChange: (p: Provider, model: string) => void }) {
  const hosted = useHostedModels();
  const row = (key: string, on: boolean, logo: React.ReactNode, title: string, sub: string, pick: () => void, locked = false) => (
    <button key={key} type="button" role="radio" aria-checked={on} className={`brain-row${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`} onClick={pick}>
      {logo}
      <span className="brain-row__text"><strong>{title}</strong><small>{sub}</small></span>
      <span className="brain-row__mark" aria-hidden="true">{locked ? '🔒' : on ? '●' : '○'}</span>
    </button>
  );
  return (
    <div className="brain-list" role="radiogroup" aria-label={t("Brain")}>
      <div className="brain-list__head">{t('Your own subscription')}</div>
      {row('codex', provider === 'codex', <ProviderLogo provider="codex" />, 'ChatGPT', t('Your ChatGPT subscription'), () => onChange('codex', ''))}
      {row('claude', provider === 'claude', <ProviderLogo provider="claude" />, 'Claude Code', t('Your Claude subscription'), () => onChange('claude', ''))}
      {hosted?.available && <div className="brain-list__head">{t('Included in your plan')}</div>}
      {hosted?.available && hosted.models.map((m) =>
        row(m.id, provider === 'openrouter' && (model || DEFAULT_MODEL) === m.id, <ModelLogo model={m.id} dim={!m.allowed} />, m.name,
          m.allowed ? t(m.note) : t('Included in {name} · upgrade in the Fino app', { name: tierName(m.tier) }), () => { if (m.allowed) onChange('openrouter', m.id); }, !m.allowed))}
    </div>
  );
}
