import { Phone } from 'lucide-react';
import { t } from '../lib/i18n';
import { startCall } from '../voice/call';

/**
 * The voice on trial next to the main call button: OpenAI's gpt-audio, the most natural one tested.
 * (The cheaper gpt-audio-mini was tried on 2026-11-28 and dropped: it misunderstood requests and needed repeats.)
 */
export function TrialCallButton({ botId, name }: { botId: string; name: string }) {
  return (
    <button type="button" className="chat__call chat__call--trial" onClick={() => startCall(botId, 'openai')}
      aria-label={t('Call {name} with the trial voice', { name })} title={t('Call {name} with the trial voice', { name })}>
      <Phone size={15} strokeWidth={2.2} /><span>{t('Trial')}</span>
    </button>
  );
}
