import { t } from '../../lib/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BotAvatarFor } from '../../avatar/BotAvatar';
import { displayName, useStore } from '../../store';
import { Icon } from '../Icon';
import { Modal } from './Modal';
import { api } from '../../lib/api';
import { relativeShort } from '../../lib/time';

type Hit = Awaited<ReturnType<typeof api.search>>['results'][number];

export function SearchModal() {
  const bots = useStore((s) => s.bots);
  const setModal = useStore((s) => s.setModal);
  const selectBot = useStore((s) => s.selectBot);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setModal(null), [setModal]);

  // Messages in every chat, fetched a moment after typing stops.
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    let gone = false;
    const timer = setTimeout(() => {
      api.search(needle).then((r) => { if (!gone) setHits(r.results); }).catch(() => { if (!gone) setHits([]); }).finally(() => { if (!gone) setSearching(false); });
    }, 220);
    return () => { gone = true; clearTimeout(timer); };
  }, [q]);

  const results = useMemo(() => {
    const ordered = [...bots].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.lastActivityAt - a.lastActivityAt);
    const needle = q.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter((b) => `${b.name} ${b.label} ${b.description}`.toLowerCase().includes(needle));
  }, [bots, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (id: string) => { selectBot(id); close(); };
  const openHit = (h: Hit) => {
    const st = useStore.getState();
    st.set({ focusRow: { botId: h.botId, generation: h.generation, seq: h.seq } });
    selectBot(h.botId); st.selectChat(h.botId, h.generation); close();
    // A message too old to be loaded just opens its chat; don't keep the target around.
    setTimeout(() => { if (useStore.getState().focusRow?.seq === h.seq) useStore.getState().set({ focusRow: null }); }, 8000);
  };
  const total = results.length + hits.length;
  const pick = (i: number) => (i < results.length ? open(results[i].id) : hits[i - results.length] && openHit(hits[i - results.length]));

  return (
    <Modal onClose={close} className="search-modal" label={t("Search")}>
      <div className="search-modal__field">
        <span className="search-modal__icon"><Icon name="search" size={18} opacity={0.56} /></span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search bots and messages")}
          aria-label={t("Search")}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, total - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && active < total) { e.preventDefault(); pick(active); }
          }}
        />
      </div>
      <div className="search-modal__results" ref={listRef} role="listbox">
        {results.length > 0 && <div className="search-modal__section">{t("Bots")}</div>}
        {results.map((b, i) => (
          <button
            key={b.id}
            type="button"
            role="option"
            aria-selected={i === active}
            data-idx={i}
            className={`search-row${i === active ? ' is-active' : ''}`}
            onMouseMove={() => setActive(i)}
            onClick={() => open(b.id)}
          >
            <BotAvatarFor bot={b} size={28} />
            <span className="search-row__text">
              <span className="search-row__name">{displayName(b)}</span>
              <span className="search-row__sub">{b.lastPreview ?? (b.description || t("No messages yet"))}</span>
            </span>
          </button>
        ))}
        {hits.length > 0 && <div className="search-modal__section">{t("Messages")}</div>}
        {hits.map((h, j) => {
          const i = results.length + j;
          const b = bots.find((x) => x.id === h.botId);
          if (!b) return null;
          return (
            <button key={`${h.botId}:${h.generation}:${h.seq}`} type="button" role="option" aria-selected={i === active} data-idx={i}
              className={`search-row search-row--hit${i === active ? ' is-active' : ''}`} onMouseMove={() => setActive(i)} onClick={() => openHit(h)}>
              <BotAvatarFor bot={b} size={28} />
              <span className="search-row__text">
                <span className="search-row__name">{displayName(b)}<small>{[h.from ? t('From {name}', { name: h.from }) : h.role === 'user' ? t('You') : '', h.chat && h.chat !== 'New chat' ? h.chat : '', relativeShort(h.createdAt)].filter(Boolean).join(' · ')}</small></span>
                <span className="search-row__snippet" dir="auto"><Highlight text={h.snippet} q={q.trim()} /></span>
              </span>
            </button>
          );
        })}
        {total === 0 && !searching && <div className="search-modal__empty">{t('Nothing matches “{q}”', { q })}</div>}
        {total === 0 && searching && <div className="search-modal__empty">{t('Searching…')}</div>}
      </div>
    </Modal>
  );
}

/** The snippet with the searched words marked. */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase(), needle = q.toLowerCase();
  let from = 0, at = lower.indexOf(needle), k = 0;
  while (at >= 0) {
    parts.push(text.slice(from, at), <mark key={k++}>{text.slice(at, at + q.length)}</mark>);
    from = at + q.length; at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
