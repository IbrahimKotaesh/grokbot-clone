import { t } from '../lib/i18n';
import { useMemo, useState } from 'react';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { botVars } from '../lib/colors';
import { sortedRows, transcriptKey,useSelectedBot, useStore } from '../store';
import { useConfigUI } from '../configStore';
import { Composer } from './Composer';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { Transcript } from './Transcript';
import { VoiceCallBar } from './VoiceCallBar';

export function ChatView() {
  const bot = useSelectedBot();
  const generation=useStore(s=>bot?s.selectedChats[bot.id]??bot.generation:1);
  const transcript = useStore((s) => (bot ? s.transcripts[transcriptKey(bot.id,generation)] : undefined));
  const live = useStore((s) => (bot ? s.live[bot.id] : undefined));
  const detailsOpen = useStore((s) => s.detailsOpen);
  const set = useStore((s) => s.set);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rows = useMemo(() => sortedRows(transcript), [transcript]);

  if (!bot) {
    return (
      <main className="chat chat--empty">
        <div className="empty-chat"><div className="empty-chat__sub">{t("No Bot selected.")}</div></div>
      </main>
    );
  }

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2000); };

  return (
    <main className="chat" style={botVars(bot.avatarColor)}>
      <Transcript key={`transcript:${bot.id}:${generation}`} bot={bot} rows={rows} live={live&&(!live.generation||live.generation===generation)?live:undefined} loaded={!!transcript?.loaded} />
      <VoiceCallBar />
      <Composer key={`composer:${bot.id}:${generation}`} bot={bot} generation={generation} running={!!live?.isRunning&&(!live.generation||live.generation===generation)} />
      <header className="chat__header">
        <span className="chat__pill-anchor">
          <button type="button" className="chat__pill" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
            <BotAvatarFor bot={bot} size={24} />
            <span className="chat__pill-name">{bot.name}</span>
          </button>
          {menu && (
            <Menu
              align="center"
              onClose={() => setMenu(false)}
              items={[
                { label: detailsOpen ? t("Hide details") : t("Show details"), hint: '⇧⌘,', onSelect: () => set({ detailsOpen: !detailsOpen }) },
                { label: t("Open computer"), onSelect: () => set({ viewerOpen: true }) },
                { label: t("New chat"), onSelect: () => useStore.getState().newChat(bot.id).then(() => flash(t("Started a new chat"))).catch((e) => flash(e.message)) },
                { label: t("Bot settings"), onSelect: () => useConfigUI.getState().openBotSettings(bot.id) },
              ]}
            />
          )}
        </span>
        <div className="chat__header-right">
          {!detailsOpen && (
            <button type="button" className="icon-btn icon-btn--bordered" onClick={() => set({ detailsOpen: true })} aria-label={t("Show details")} title={t("Show details")}>
              <Icon name="sidebar" opacity={0.66} style={{ transform: 'scaleX(-1)' }} />
            </button>
          )}
          <button type="button" className="share-btn" onClick={() => flash(t("Sharing isn’t available in Fino yet"))}>{t("Share")}</button>
        </div>
      </header>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
