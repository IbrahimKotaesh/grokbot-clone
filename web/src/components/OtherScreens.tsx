import { useEffect, useState } from 'react';
import type { Bot } from '@shared/types';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { t } from '../lib/i18n';
import { useStore } from '../store';
import { useLiveShot } from './DetailsPanel';

/**
 * Small live screens of the other bots, under the main one. Tap one to make it the main screen
 * (that also opens that bot's chat). Bots working right now come first.
 */
export function OtherScreens({ current }: { current: string }) {
  const bots = useStore((s) => s.bots);
  const live = useStore((s) => s.live);
  const running = useStore((s) => s.computer?.status === 'running');
  const [withScreens, setWithScreens] = useState<string[]>([]);
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const load = () => fetch('/api/screens', { credentials: 'include' }).then((r) => r.json()).then((d: { botIds: string[] }) => { if (alive) setWithScreens(d.botIds ?? []); }).catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, [running]);
  if (!running) return null;
  const others = bots
    .filter((b) => b.id !== current && b.kind !== 'room' && withScreens.includes(b.id))
    .sort((a, b) => Number(!!live[b.id]?.isRunning) - Number(!!live[a.id]?.isRunning))
    .slice(0, 3);
  if (!others.length) return null;
  return (
    <div className="other-screens" role="list" aria-label={t('Other bots’ computers')}>
      {others.map((b) => <OtherScreen key={b.id} bot={b} working={!!live[b.id]?.isRunning} />)}
    </div>
  );
}

function OtherScreen({ bot, working }: { bot: Bot; working: boolean }) {
  const shot = useLiveShot(bot.id, true, 5000);
  return (
    <button type="button" role="listitem" className={`other-screen${working ? ' is-working' : ''}`} onClick={() => useStore.getState().selectBot(bot.id)} title={t('Show {name}’s computer', { name: bot.name })}>
      <span className="other-screen__img">{shot ? <img src={shot} alt="" /> : <i />}</span>
      <span className="other-screen__name"><BotAvatarFor bot={bot} size={16} /><span dir="auto">{bot.name}</span>{working && <em aria-label={t('Working')} />}</span>
    </button>
  );
}
