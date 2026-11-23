import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Bot } from '@shared/types';
import { useStore } from '../store';
import { computerStatusText, useLiveShot } from './DetailsPanel';

/**
 * The bot's computer, live, at the top of the chat whenever the side panel is closed (always on phones),
 * so you can watch computer use as it happens. Tap to open the full viewer; X hides it until the computer
 * next wakes up or you switch bots.
 */
export function ComputerPip({ bot }: { bot: Bot }) {
  const computer = useStore((s) => s.computer);
  const set = useStore((s) => s.set);
  const running = computer?.status === 'running';
  const shot = useLiveShot(bot.id, running);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(false); }, [bot.id, running]);
  if (!running || !shot || hidden) return null;
  return (
    <div className="computer-pip">
      <button type="button" className="computer-pip__open" onClick={() => set({ viewerOpen: true })} aria-label={t('Open computer')}>
        <img src={shot} alt={t("Bot's screen")} />
        <span className="computer-hero__badge"><span className="status-dot is-working" />{computerStatusText(computer)}</span>
      </button>
      <button type="button" className="computer-pip__close" onClick={() => setHidden(true)} aria-label={t('Close computer')} title={t('Close computer')}><X size={14} /></button>
    </div>
  );
}
