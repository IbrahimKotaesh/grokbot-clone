import { useEffect, useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { api, type ApprovalRule, type RuleDecision } from '../../lib/api';
import { useStore } from '../../store';
import { Icon } from '../Icon';

const DECISIONS: { value: RuleDecision; label: string }[] = [
  { value: 'allow', label: 'Just do it' },
  { value: 'ask', label: 'Ask me first' },
  { value: 'never', label: 'Never' },
];
const EXAMPLES = ['reply to an email', 'post on social media', 'delete files', 'add a calendar event', 'send a message on Slack'];

/**
 * Approval rules in plain words: "When a Bot wants to <action> → just do it / ask me first / never".
 * With `botId`: that Bot's rules plus the ones for every Bot, and new rules go to that Bot.
 * Without: every rule, with a picker for which Bot a new rule is for.
 */
export function RulesEditor({ botId, name }: { botId?: string; name?: string }) {
  const allBots = useStore((s) => s.bots);
  const bots = useMemo(() => allBots.filter((b) => b.kind !== 'room'), [allBots]);
  const [rules, setRules] = useState<ApprovalRule[] | null>(null);
  const [action, setAction] = useState('');
  const [decision, setDecision] = useState<RuleDecision>('ask');
  const [forBot, setForBot] = useState<string>(botId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.rules(botId).then((r) => setRules(r.rules)).catch(() => setRules([])); }, [botId]);

  const whoName = (id: string | null) => (id ? bots.find((b) => b.id === id)?.name ?? t('a Bot') : t('any Bot'));
  const add = async () => {
    if (!action.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const { rule } = await api.addRule({ botId: forBot || null, action, decision });
      setRules((r) => [...(r ?? []), rule]);
      setAction('');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const change = (id: string, d: RuleDecision) => {
    setRules((r) => r?.map((x) => (x.id === id ? { ...x, decision: d } : x)) ?? r);
    api.setRule(id, d).catch((e) => setError((e as Error).message));
  };
  const remove = (id: string) => {
    setRules((r) => r?.filter((x) => x.id !== id) ?? r);
    api.deleteRule(id).catch((e) => setError((e as Error).message));
  };

  return (
    <div className="rules">
      <div className="cfg-card">
        {rules === null ? <div className="cfg-empty cfg-empty--flat">{t('Loading…')}</div> : rules.length === 0 ? (
          <div className="cfg-empty cfg-empty--flat">{t('No rules yet. Badr already asks before anything final, and never pays for you. Add a rule for anything else you want a say in.')}</div>
        ) : rules.map((r) => (
          <div key={r.id} className="cfg-row rules__row">
            <div className="cfg-row__text">
              <div className="cfg-row__sub">{t('When {who} wants to', { who: whoName(r.botId) })}</div>
              <div className="cfg-row__title" dir="auto">{r.action}</div>
            </div>
            <select className="cfg-select rules__decision" value={r.decision} aria-label={t('What it should do')} onChange={(e) => change(r.id, e.target.value as RuleDecision)} data-decision={r.decision}>
              {DECISIONS.map((d) => <option key={d.value} value={d.value}>{t(d.label)}</option>)}
            </select>
            <button type="button" className="icon-btn rules__remove" aria-label={t('Remove rule')} title={t('Remove rule')} onClick={() => remove(r.id)}><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>

      <form className="rules__add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className="rules__sentence">
          <span>{t('When')}</span>
          {botId ? <b>{name}</b> : (
            <select className="cfg-select" value={forBot} aria-label={t('Which Bot')} onChange={(e) => setForBot(e.target.value)}>
              <option value="">{t('any Bot')}</option>
              {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <span>{t('wants to')}</span>
        </div>
        <input className="text-input" dir="auto" value={action} maxLength={200} placeholder={t('e.g. reply to an email')} aria-label={t('The action')} onChange={(e) => setAction(e.target.value)} />
        <div className="rules__chips">
          {EXAMPLES.map((x) => <button key={x} type="button" className="starter-chip" onClick={() => setAction(t(x))}>{t(x)}</button>)}
        </div>
        <div className="rules__foot">
          <div className="cfg-seg" role="radiogroup" aria-label={t('What it should do')}>
            {DECISIONS.map((d) => (
              <button key={d.value} type="button" role="radio" aria-checked={decision === d.value} className={decision === d.value ? 'is-active' : ''} onClick={() => setDecision(d.value)}>{t(d.label)}</button>
            ))}
          </div>
          <button type="submit" className="cfg-btn cfg-btn--primary" disabled={!action.trim() || busy}>{t('Add rule')}</button>
        </div>
        {error && <div className="cfg-field__hint is-error" role="alert">{t(error)}</div>}
      </form>
      <p className="rules__note">{t('A rule can make a Bot ask or stop. It can’t turn off Badr’s own safety: paying is never allowed, and final steps still wait for your OK.')}</p>
    </div>
  );
}
