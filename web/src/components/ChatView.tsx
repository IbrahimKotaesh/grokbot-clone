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
        <div className="empty-chat"><div className="empty-chat__sub">No Bot selected.</div></div>
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
            <span className="chat__pill-name">{bot.label || bot.name}</span>
          </button>
          {menu && (
            <Menu
              align="center"
              onClose={() => setMenu(false)}
              items={[
                { label: detailsOpen ? 'Hide details' : 'Show details', hint: '⇧⌘,', onSelect: () => set({ detailsOpen: !detailsOpen }) },
                { label: 'Open computer', onSelect: () => set({ viewerOpen: true }) },
                { label: 'New chat', onSelect: () => useStore.getState().newChat(bot.id).then(() => flash('Started a new chat')).catch((e) => flash(e.message)) },
                { label: 'Bot settings', onSelect: () => useConfigUI.getState().openBotSettings(bot.id) },
              ]}
            />
          )}
        </span>
        <div className="chat__header-right">
          {!detailsOpen && (
            <button type="button" className="icon-btn icon-btn--bordered" onClick={() => set({ detailsOpen: true })} aria-label="Show details" title="Show details">
              <Icon name="sidebar" opacity={0.66} style={{ transform: 'scaleX(-1)' }} />
            </button>
          )}
          <button type="button" className="share-btn" onClick={() => flash('Sharing isn’t available in Fino yet')}>Share</button>
        </div>
      </header>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
