import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, MessageSquareText, Mic, MicOff } from 'lucide-react';
import { t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { botVars } from '../lib/colors';
import { useStore } from '../store';
import { callLevels, endCall, setCallExpanded, toggleMute, useVoice } from '../voice/call';
import { EASE } from '../lib/motion';

const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function HangUp() {
  return <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 9.5c-2.6 0-5.1.5-7.3 1.6-.7.3-1.2 1-1.2 1.8v2.3c0 .8.7 1.4 1.5 1.3l3-.4c.7-.1 1.2-.7 1.2-1.4v-1.6c1.8-.5 3.8-.5 5.6 0v1.6c0 .7.5 1.3 1.2 1.4l3 .4c.8.1 1.5-.5 1.5-1.3v-2.3c0-.8-.5-1.5-1.2-1.8-2.2-1.1-4.7-1.6-7.3-1.6Z" /></svg>;
}

/** A call with a Bot, laid out like a phone call: who, how long, the voice, and the big red button. */
export function CallScreen() {
  const v = useVoice();
  const bot = useStore((s) => s.bots.find((b) => b.id === v.botId));
  const [now, setNow] = useState(Date.now());
  const [transcript, setTranscript] = useState(false);
  const face = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const open = v.expanded && (v.status === 'connecting' || v.status === 'live' || v.status === 'error') && !!bot;

  useEffect(() => { if (v.status !== 'live') return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [v.status]);
  // The avatar breathes with the voice: Badr's level grows the rings, yours lights them.
  useEffect(() => {
    if (!open) return;
    let raf = 0, out = 0, mic = 0;
    const tick = () => {
      const l = callLevels();
      out = out * 0.75 + l.out * 0.25; mic = mic * 0.75 + Math.min(1, l.mic * 3) * 0.25;
      face.current?.style.setProperty('--out', out.toFixed(3)); face.current?.style.setProperty('--mic', mic.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useLayoutEffect(() => { if (transcript && log.current) log.current.scrollTop = log.current.scrollHeight; }, [transcript, v.captions]);
  // Escape shrinks the call to the bar; it keeps going.
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCallExpanded(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);

  const working = v.working.length > 0;
  const status = v.status === 'connecting' ? t('Calling…')
    : v.status === 'error' ? (v.error ?? t('Call ended'))
    : v.startedAt ? fmt(now - v.startedAt) : '';
  const sub = v.status !== 'live' ? '' : v.speaking ? t('Speaking') : working ? t('Working on it…') : v.muted ? t('You’re muted.') : v.listening ? t('Listening') : '';
  const lines = v.captions.filter((c) => c.text.trim());
  const last = lines.slice(-1)[0];

  return (
    <AnimatePresence>
      {open && bot && (
        <motion.div key="call" className={`call-screen is-${v.status}${v.speaking ? ' is-speaking' : ''}`} style={botVars(bot.avatarColor)} role="dialog" aria-modal="true" aria-label={t('Call with {name}', { name: bot.name })}
          initial={{ opacity: 0, scale: 1.04, filter: 'blur(12px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.97, filter: 'blur(10px)' }} transition={{ duration: 0.45, ease: EASE }}>
          <div className="call-screen__bg" aria-hidden />
          <header className="call-screen__top">
            <button type="button" className="call-screen__min" onClick={() => setCallExpanded(false)} aria-label={t('Back to chat')} title={t('Back to chat')}><ChevronDown size={24} /></button>
          </header>

          <div className="call-screen__who">
            <h2 dir="auto">{bot.name}</h2>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={status === t('Calling…') ? 'calling' : v.status} className="call-screen__status" initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }} transition={{ duration: 0.3, ease: EASE }}>{status}</motion.p>
            </AnimatePresence>
          </div>

          <div className="call-screen__face" ref={face}>
            <span className="call-screen__ring" /><span className="call-screen__ring call-screen__ring--2" /><span className="call-screen__ring call-screen__ring--3" />
            <span className="call-screen__avatar"><BotAvatarFor bot={bot} size={148} /></span>
          </div>

          <div className="call-screen__say" aria-live="polite">
            {transcript ? (
              <div className="call-screen__log" ref={log}>
                {lines.length ? lines.map((c) => <p key={c.id} className={`is-${c.role}`} dir="auto"><b>{c.role === 'user' ? t('You') : bot.name}</b> {c.text}</p>) : <p className="is-empty">{t('Nothing said yet.')}</p>}
              </div>
            ) : (
              <>
                {sub && <span className={`call-screen__sub${working ? ' is-working' : ''}`}>{sub}{working && <em dir="auto"> · {v.working[v.working.length - 1].request}</em>}</span>}
                {last && <p className={`call-screen__caption is-${last.role}`} dir="auto">{last.text}</p>}
              </>
            )}
          </div>

          <div className="call-screen__keys">
            <button type="button" className={`call-key${v.muted ? ' is-on' : ''}`} onClick={toggleMute} disabled={v.status !== 'live'} aria-pressed={v.muted}>
              <span>{v.muted ? <MicOff size={26} /> : <Mic size={26} />}</span>{v.muted ? t('Unmute') : t('Mute')}
            </button>
            <button type="button" className={`call-key${transcript ? ' is-on' : ''}`} onClick={() => setTranscript(!transcript)} disabled={v.status !== 'live'} aria-pressed={transcript}>
              <span><MessageSquareText size={26} /></span>{t('Transcript')}
            </button>
            <button type="button" className="call-key" onClick={() => setCallExpanded(false)}>
              <span><ChevronDown size={26} /></span>{t('Chat')}
            </button>
          </div>

          {v.status === 'error'
            ? <button type="button" className="call-screen__end call-screen__end--close" onClick={() => useVoice.setState({ status: 'idle', botId: null, error: null })} aria-label={t('Close')}>✕</button>
            : <button type="button" className="call-screen__end" onClick={endCall} aria-label={t('End call')}><HangUp /></button>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
