import { t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { botVars } from '../lib/colors';
import { useSelectedBot, useStore } from '../store';
import { ComputerViewer } from './ComputerViewer';
import { computerStatusText } from './DetailsPanel';
import { Icon } from './Icon';

/**
 * The right side of the workspace: the selected bot's own computer, live, like the Mac app's Fino Browser panel.
 * One button tucks it into the right edge; it stays hidden until reopened (remembered per browser).
 */
export function ComputerPanel() {
  const bot = useSelectedBot();
  const computer = useStore((s) => s.computer);
  const set = useStore((s) => s.set);
  if (!bot || bot.kind === 'room') return null;
  const running = computer?.status === 'running';
  // Isolate the name so an Arabic name doesn't flip the English title around it.
  const title = t("{name}'s computer", { name: `\u2068${bot.name.trim()}\u2069` });
  const busy = computer?.status === 'starting' || computer?.status === 'resuming' || computer?.status === 'creating';
  return (
    <aside className="computer-panel" style={botVars(bot.avatarColor)} aria-label={title}>
      <header className="computer-panel__bar">
        <BotAvatarFor bot={bot} size={22} />
        <span className="computer-panel__title">{title}</span>
        <span className={`computer-panel__status${running ? ' is-on' : busy ? ' is-busy' : ''}`}><i />{computerStatusText(computer)}</span>
        <button type="button" className="icon-btn computer-panel__hide" onClick={() => set({ detailsOpen: false })} aria-label={t("Hide computer")} title={t("Hide computer")}>
          <Icon name="sidebar" opacity={0.66} style={{ transform: 'scaleX(-1)' }} />
        </button>
      </header>
      <div className="computer-panel__screen">
        <ComputerViewer key={bot.id} panel />
      </div>
    </aside>
  );
}
