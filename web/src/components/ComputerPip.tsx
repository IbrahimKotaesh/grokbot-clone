import { t } from '../lib/i18n';
import type { Bot } from '@shared/types';
import { useStore } from '../store';
import { computerStatusText, useLiveShot } from './DetailsPanel';

/**
 * The bot's computer, live, at the top of the chat whenever the side panel is closed (always on phones),
 * so you can watch computer use as it happens. Tap to open the full viewer.
 */
export function ComputerPip({ bot }: { bot: Bot }) {
  const computer = useStore((s) => s.computer);
  const set = useStore((s) => s.set);
  const running = computer?.status === 'running';
  const shot = useLiveShot(bot.id, running);
  if (!running || !shot) return null;
  return (
    <button type="button" className="computer-pip" onClick={() => set({ viewerOpen: true })} aria-label={t('Open computer')}>
      <img src={shot} alt={t("Bot's screen")} />
      <span className="computer-hero__badge"><span className="status-dot is-working" />{computerStatusText(computer)}</span>
    </button>
  );
}
