import { useState } from 'react';
import type { Bot } from '@shared/types';
import { configApi } from '../lib/configApi';
import { useStore } from '../store';

export function VoiceSettings({ bot }: { bot: Bot }) {
  const [error, setError] = useState('');
  const save = async (voiceLanguage: string) => {
    try {
      const { bot: updated } = await configApi.updateBot(bot.id, { voiceLanguage });
      useStore.setState(s => ({ bots: s.bots.map(b => b.id === updated.id ? updated : b) }));
      setError('');
    } catch { setError('Could not save dictation language.'); }
  };
  return <div className="panel-card">
    <div className="panel-row panel-row--setting"><span>Dictation language</span><select aria-label="Dictation language" value={bot.voiceLanguage === 'auto' ? '' : bot.voiceLanguage} onChange={e => void save(e.target.value)}>
      <option value="">Device language</option><option value="en-US">English</option><option value="ar-SA">Arabic</option>
    </select></div>
    <p className="panel-row">Tap the message microphone, or use your phone keyboard’s microphone. Review the text before sending. Fino does not upload audio to its server.</p>
    {error && <div className="voice-error">{error}</div>}
  </div>;
}
