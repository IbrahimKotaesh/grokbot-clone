import { t } from '../lib/i18n';
import { useMemo, useState } from 'react';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { botVars } from '../lib/colors';
import { sortedRows, transcriptKey,useSelectedBot, useStore } from '../store';
import { useConfigUI } from '../configStore';
import { Composer } from './Composer';
import { isMacDesktop } from '../lib/desktop';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { Transcript } from './Transcript';
import { VoiceCallBar } from './VoiceCallBar';
import { Phone } from 'lucide-react';
import { isCallActive, previewVoice, startCall, useVoice } from '../voice/call';
import { voiceApi, type VoiceOptions } from '../voice/api';
import { configApi } from '../lib/configApi';

export function ChatView() {
  const bot = useSelectedBot();
  const generation=useStore(s=>bot?s.selectedChats[bot.id]??bot.generation:1);
  const transcript = useStore((s) => (bot ? s.transcripts[transcriptKey(bot.id,generation)] : undefined));
  const live = useStore((s) => (bot ? s.live[bot.id] : undefined));
  const detailsOpen = useStore((s) => s.detailsOpen);
  const set = useStore((s) => s.set);
  const [menu, setMenu] = useState(false);
  const [voices, setVoices] = useState<VoiceOptions['voices'] | null>(null);
  const calling = useVoice((s) => isCallActive(s));
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
      <Transcript key={`transcript:${bot.id}:${generation}`} bot={bot} rows={rows} live={live&&(!live.generation||live.generation===generation)?live:undefined} loaded={!!transcript?.loaded} generation={generation} />
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
                { label: t("New chat"), onSelect: () => useStore.getState().newChat(bot.id).then(() => flash(t("Started a new chat"))).catch((e) => flash(e.message)) },
                ...(bot.kind !== 'room' ? [{ label: t("Voice"), hint: (bot.voice || 'luna').replace(/^./, (c) => c.toUpperCase()), onSelect: () => { voiceApi.options().then((o) => setVoices(o.voices)).catch(() => flash(t("Voices are unavailable right now"))); } }] : []),
                { label: t("Bot settings"), onSelect: () => useConfigUI.getState().openBotSettings(bot.id) },
              ]}
            />
          )}
          {voices && (
            <Menu
              align="center"
              onClose={() => setVoices(null)}
              items={voices.map((v) => ({
                label: v.name,
                description: v.gender === 'female' ? t("Female voice") : v.gender === 'male' ? t("Male voice") : undefined,
                selected: (bot.voice || 'luna') === v.id,
                onSelect: () => {
                  configApi.updateBot(bot.id, { voice: v.id }).catch((e) => flash(e.message));
                  previewVoice({ botId: bot.id, voice: v.id }).catch(() => flash(t("Preview unavailable")));
                },
              }))}
            />
          )}
        </span>
        <div className="chat__header-right">
          {bot.kind !== 'room' && !calling && (
            <button type="button" className="icon-btn icon-btn--bordered chat__call" onClick={() => startCall(bot.id)} aria-label={t("Call {name}", { name: bot.name })} title={t("Call {name}", { name: bot.name })}>
              <Phone size={18} strokeWidth={1.9} opacity={0.75} />
            </button>
          )}
          {!detailsOpen && bot.kind !== 'room' && !isMacDesktop() && (
            <button type="button" className="icon-btn icon-btn--bordered chat__show-computer" onClick={() => set({ detailsOpen: true })} aria-label={t("Show computer")} title={t("Show computer")}>
              <Icon name="sidebar" opacity={0.66} style={{ transform: 'scaleX(-1)' }} />
            </button>
          )}
        </div>
      </header>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
