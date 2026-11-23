import { useEffect, useState } from 'react';
import type { Bot, LiveState, Row } from '@shared/types';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { activityPhrase } from '../lib/phrases';
import { t } from '../lib/i18n';

/** A real seconds counter: 7s, 42s, 1:05, 12:30. */
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`; };

/** The single live "activity line": avatar mark + shimmering phrase + elapsed time. */
export function ActivityLine({ bot, live, rows, writing = false }: { bot: Bot; live: LiveState; rows: Row[]; writing?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const since = live.startedAt ?? live.activity?.since ?? live.awaiting?.since ?? now;
  const tick = Math.floor((now - (live.activity?.since ?? since)) / 6000);
  const phrase = writing ? t('Writing the reply') : activityPhrase(live, rows, tick);
  const waiting = !live.isRunning && (live.awaiting || live.activity?.kind === 'waiting_for_you');
  return (
    <div className={`activity-line${waiting ? ' is-waiting' : ''}`} role="status" aria-live="polite">
      <span className="activity-line__mark"><BotAvatarFor bot={bot} size={20} /></span>
      <span className="activity-line__text shimmer" key={phrase}>{phrase}</span>
      {!waiting && <span className="activity-line__time">· {clock(now - since)}</span>}
      {waiting && live.awaiting?.reason && <span className="activity-line__time">· {live.awaiting.reason}</span>}
    </div>
  );
}
