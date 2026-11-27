import { useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronRight, Pause } from 'lucide-react';
import type { Bot, LiveState } from '@shared/types';
import { t } from '../lib/i18n';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useConfigUI } from '../configStore';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { GroupAvatar } from './GroupAvatar';
import { Badr } from './Badr';
import { activityPhrase } from '../lib/phrases';
import { relativeShort } from '../lib/time';
import { BlurWords } from '../lib/motion';
import { eventLabel } from './Transcript';

type Status = { tone: 'paused' | 'needs' | 'working' | 'ready'; text: string };
function statusOf(bot: Bot, live: LiveState | undefined): Status {
  if (bot.paused) return { tone: 'paused', text: t('Paused') };
  if (live?.awaiting || live?.activity?.kind === 'waiting_for_you') return { tone: 'needs', text: t('Needs you') };
  if (live?.isRunning) return { tone: 'working', text: activityPhrase(live, [], 0) };
  return { tone: 'ready', text: t('Ready') };
}

const open = (botId: string) => {
  const st = useStore.getState();
  if (st.selectedBotId === botId) useConfigUI.getState().setView('chat');
  else st.selectBot(botId);
};

function Face({ bot, size }: { bot: Bot; size: number }) {
  if (bot.kind === 'room') return <GroupAvatar room={bot} size={size} />;
  if (bot.isPrimary && bot.avatarShape === 'accountant' && size >= 64) return <Badr mood="wave" size={size} />;
  return <BotAvatarFor bot={bot} size={size} />;
}

/** Home: hand any Bot a task in one place, see what needs you, and what the team is doing. */
export function HomeView() {
  const bots = useStore((s) => s.bots);
  const live = useStore((s) => s.live);
  const agents = useMemo(() => bots.filter((b) => b.kind !== 'room').sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.createdAt - b.createdAt), [bots]);
  const [picked, setPicked] = useState<string | null>(null);
  const target = agents.find((b) => b.id === picked) ?? agents[0];
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);

  const needs = agents.filter((b) => !b.paused && (live[b.id]?.awaiting || live[b.id]?.activity?.kind === 'waiting_for_you'));
  const latest = useMemo(() => bots.filter((b) => b.lastPreview).sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 6), [bots]);

  const send = async () => {
    const value = text.trim();
    if (!value || !target || sending) return;
    setSending(true); setError('');
    try {
      await api.send(target.id, value);
      setText('');
      open(target.id);
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };

  if (!target) return <main className="chat page-view home"><div className="empty-chat"><div className="empty-chat__sub">{t('No Bot selected.')}</div></div></main>;

  return (
    <main className="chat page-view home">
      <div className="page-view__scroll">
        <div className="home__inner">
          <section className="home__hero">
            <div className="home__stage" key={target.id}><Face bot={target} size={96} /></div>
            <BlurWords as="h1" className="home__title" text={t('What should {name} do?', { name: target.name })} />
            <p className="home__sub">{target.paused ? t('{name} is paused. Sending this resumes it.', { name: target.name }) : t('It works on its own and tells you when it’s done.')}</p>
            <form className="home__box" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <textarea
                ref={box}
                autoFocus
                dir="auto"
                rows={2}
                value={text}
                maxLength={20000}
                placeholder={t('Ask {name} to research, plan, write or build something…', { name: target.name })}
                aria-label={t('Message {name}', { name: target.name })}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
              />
              <div className="home__box-foot">
                <div className="home__pick" role="radiogroup" aria-label={t('Who should do it')}>
                  {agents.map((b) => (
                    <button key={b.id} type="button" role="radio" aria-label={b.name} aria-checked={b.id === target.id} className={`home__chip${b.id === target.id ? ' is-on' : ''}`} onClick={() => { setPicked(b.id); box.current?.focus(); }}>
                      <BotAvatarFor bot={b} size={20} /><span dir="auto">{b.name}</span>
                    </button>
                  ))}
                </div>
                <button type="submit" className="home__send" disabled={!text.trim() || sending} aria-label={t('Send')}><ArrowUp size={18} strokeWidth={2.4} /></button>
              </div>
            </form>
            {error && <div className="notice is-error" role="alert">{t(error)}</div>}
          </section>

          {needs.length > 0 && (
            <section className="home__section">
              <h2 className="home__label">{t('Needs you')} <span>{needs.length}</span></h2>
              <div className="home__list">
                {needs.map((b) => (
                  <button key={b.id} type="button" className="home__item is-needs" onClick={() => open(b.id)}>
                    <BotAvatarFor bot={b} size={32} />
                    <span className="home__item-name" dir="auto">{b.name}</span>
                    <span className="home__tag">{t('Needs you')}</span>
                    <span className="home__item-text" dir="auto">{live[b.id]?.awaiting?.reason ?? t('Needs your input')}</span>
                    <ChevronRight className="home__go" size={16} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {latest.length > 0 && (
            <section className="home__section">
              <h2 className="home__label">{t('Latest from your team')}</h2>
              <div className="home__list">
                {latest.map((b) => (
                  <button key={b.id} type="button" className="home__item" onClick={() => open(b.id)}>
                    <Face bot={b} size={32} />
                    <span className="home__item-name" dir="auto">{b.name}</span>
                    {b.unread > 0 && <span className="home__dot" aria-label={t('Unread activity')} />}
                    <span className="home__item-text" dir="auto">{eventLabel(b.lastPreview!).replace(/^Waiting for you: /, `${t('Waiting for you')}: `).replace(/[#*_`>|]/g, '')}</span>
                    <time className="home__time">{relativeShort(b.lastActivityAt)}</time>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="home__section">
            <h2 className="home__label">{t('Your team')} <span>{agents.length}</span></h2>
            <div className="home__grid">
              {agents.map((b, i) => {
                const s = statusOf(b, live[b.id]);
                return (
                  <button key={b.id} type="button" className={`home__card is-${s.tone}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} onClick={() => open(b.id)}>
                    <span className="home__card-face"><BotAvatarFor bot={b} size={44} /></span>
                    <span className="home__card-text">
                      <span className="home__card-name" dir="auto">{b.name}{b.label && <em>{t(b.label)}</em>}</span>
                      {b.description && b.description !== b.label && <span className="home__card-about" dir="auto">{t(b.description)}</span>}
                      <span className="home__status">{s.tone === 'paused' ? <Pause size={11} strokeWidth={2.6} /> : <i />}<span className={s.tone === 'working' ? 'shimmer' : ''}>{s.text}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
