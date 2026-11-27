import { useEffect, useState } from 'react';
import type { Bot } from '@shared/types';
import { api } from '../lib/api';
import { useStore } from '../store';
import { BotAvatarFor } from '../avatar/BotAvatar';

const cache = new Map<string, string[]>();

/** The Bots in a group chat (cached, so every place that shows the group asks once). */
export function useRoomMembers(room: Bot | undefined): Bot[] {
  const all = useStore((s) => s.bots);
  const id = room?.kind === 'room' ? room.id : undefined;
  const [ids, setIds] = useState<string[]>(() => (id ? cache.get(id) ?? [] : []));
  useEffect(() => {
    if (!id) { setIds([]); return; }
    setIds(cache.get(id) ?? []);
    api.roomMembers(id).then((r) => { const v = r.members.map((m) => m.id); cache.set(id, v); setIds(v); }).catch(() => {});
  }, [id]);
  return ids.map((x) => all.find((b) => b.id === x)).filter((b): b is Bot => !!b);
}

/** A group's picture: its first Bots' faces overlapping, like a group chat in Messages. */
export function GroupAvatar({ room, size = 44 }: { room: Bot; size?: number }) {
  const members = useRoomMembers(room).slice(0, 3);
  if (!members.length) return <BotAvatarFor bot={room} size={size} />;
  const each = Math.round(size * (members.length === 1 ? 1 : 0.62));
  return (
    <span className={`group-avatar is-${members.length}`} style={{ width: size, height: size }} aria-hidden>
      {members.map((b) => <span key={b.id} className="group-avatar__face"><BotAvatarFor bot={b} size={each} /></span>)}
    </span>
  );
}
