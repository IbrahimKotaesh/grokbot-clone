import { useState } from 'react';
import { Phone } from 'lucide-react';
import { t } from '../lib/i18n';
import { startCall } from '../voice/call';
import { Menu } from './Menu';

/** The voices on trial next to the main call button: the full one, and the saver (same voice, about 1/20 of the price). */
export function TrialCallButton({ botId, name }: { botId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="trial-call">
      <button type="button" className="chat__call chat__call--trial" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={t('Call {name} with the trial voice', { name })} title={t('Call {name} with the trial voice', { name })}>
        <Phone size={15} strokeWidth={2.2} /><span>{t('Trial')}</span>
      </button>
      {open && <Menu align="right" onClose={() => setOpen(false)} items={[
        { label: t('Trial voice'), description: t('The most natural voice'), onSelect: () => startCall(botId, 'openai') },
        { label: t('Trial voice · saver'), description: t('Same voice, about 20 times cheaper'), onSelect: () => startCall(botId, 'openai-mini') },
      ]} />}
    </span>
  );
}
