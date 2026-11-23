import { plural, t } from '../lib/i18n';
import { PlanCard } from './PlanCard';
import {isSilentPlaceholder,visibleTranscriptRows} from '@shared/lib/message-text';
import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Bot, LiveState, MessageBody, Row, ToolCallBody } from '@shared/types';
import { BotAvatar, BotAvatarFor } from '../avatar/BotAvatar';
import { dividerLabel, messageTimestamp } from '../lib/time';
import { useStore } from '../store';
import { ActivityLine } from './ActivityLine';
import { CardRow } from './cards/Cards';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { api } from '../lib/api';
import { startersFor } from '../../../packages/contracts/src/jobs';
import {stepDestination,stepTitle} from '../lib/work-step';
import {MessagePhotos} from './MessagePhotos';

type Item =
  | { kind: 'divider'; key: string; ts: number }
  | { kind: 'group'; key: string; side: 'left' | 'right'; from?: MessageBody['from']; rows: Row[] }
  | { kind: 'steps'; key: string; rows: Row[] }
  | { kind: 'row'; key: string; row: Row };

const DIVIDER_GAP = 60 * 60 * 1000;
const GROUP_GAP = 5 * 60 * 1000;

/** Turns rows into render items: date dividers, grouped bubbles, collapsed tool-call steps, cards, events. */
function buildItems(rows: Row[]): Item[] {
  const items: Item[] = [];
  // A reply being written stays hidden: the activity line counts the seconds, then the whole reply appears at once.
  let prevTs = 0;
  for (const row of visibleTranscriptRows(rows)) {
    if(row.body.type==='message'&&row.body.role==='assistant'&&!row.body.images?.length&&!row.body.files?.length&&(!row.body.text||isSilentPlaceholder(row.body.text)))continue;
    if (!prevTs || row.createdAt - prevTs > DIVIDER_GAP) items.push({ kind: 'divider', key: `d${row.seq}`, ts: row.createdAt });
    prevTs = row.createdAt;
    const last = items[items.length - 1];
    const b = row.body;
    if (b.type === 'tool-call' && (b.name === 'update_plan' || b.name === 'react_to_message')) continue; // plan card / emoji on the message
    if (b.type === 'tool-call') {
      if (last?.kind === 'steps') last.rows.push(row);
      else items.push({ kind: 'steps', key: `s${row.seq}`, rows: [row] });
      continue;
    }
    if (b.type === 'message') {
      if (!b.text && !b.streaming && !b.images?.length && !b.files?.length) continue;
      // The bot thinks first (the activity line counts the seconds); its reply appears whole when it's done.
      if (b.streaming && b.role === 'assistant') continue;
      const side = b.role === 'user' && (!b.from || b.from.kind === 'voice') ? 'right' : 'left';
      const sender = b.from ? `${b.from.kind}:${b.from.id}` : b.role;
      const lastRow = last?.kind === 'group' ? last.rows[last.rows.length - 1] : null;
      const lastBody = lastRow?.body as MessageBody | undefined;
      const lastSender = lastBody ? (lastBody.from ? `${lastBody.from.kind}:${lastBody.from.id}` : lastBody.role) : null;
      if (last?.kind === 'group' && lastSender === sender && row.createdAt - lastRow!.createdAt < GROUP_GAP) last.rows.push(row);
      else items.push({ kind: 'group', key: `g${row.seq}`, side, from: b.from, rows: [row] });
      continue;
    }
    items.push({ kind: 'row', key: `r${row.seq}`, row });
  }
  return items;
}

function cornerClass(i: number, n: number) {
  if (n < 2) return '';
  if (i === 0) return ' is-first';
  if (i === n - 1) return ' is-last';
  return ' is-mid';
}

const SERVER_CAPTIONS = new Set(['Computer · final screenshot']);

const Bubble = memo(function Bubble({ row, side, pos, fresh, onRetry, seenBy }: { row: Row; side: 'left' | 'right'; pos: string; fresh?: boolean; onRetry?: () => void; seenBy?: Bot }) {
  const b = row.body as MessageBody;
  // Fixed captions the server writes (like the final-screenshot label) show in the reader's language.
  const shown = SERVER_CAPTIONS.has(b.text) ? t(b.text) : b.text;
  return (
    <div className={`bubble-wrap is-${side}`} data-seq={row.seq}>
      {b.images?.length ? <MessagePhotos images={b.images}/> : null}
      {(b.text.trim()||b.files?.length||b.streaming||b.citations?.length)?<div className={`bubble is-${side === 'right' ? 'user' : 'agent'}${pos}${b.streaming ? ' is-streaming' : ''}${fresh ? ' is-fresh' : ''}`}>
        {b.files?.length ? <div className="bubble__files">{b.files.map(file=><div className="bubble__document" key={file.id}><div className="bubble__file"><Icon name="file" size={22}/><a href={file.url} target="_blank" rel="noreferrer noopener"><strong dir="auto">{file.name}</strong><small>{file.name.split('.').pop()?.toUpperCase()??t("File")} · {Math.max(1,Math.round(file.size/1024))} KB</small>{file.extractionNote&&<small className="bubble__file-note">{file.extractionNote}</small>}</a><a className="bubble__download" href={`${file.url}?download=1`} aria-label={`Download ${file.name}`} title={t("Download")}>↓</a></div>{file.mime==='application/pdf'&&<details className="pdf-preview"><summary>{t("Preview PDF")}</summary><iframe loading="lazy" src={`${file.url}#toolbar=0`} title={`Preview ${file.name}`} /></details>}</div>)}</div> : null}
        {side === 'right' ? <div className="bubble__plain" dir="auto">{b.text}</div> : <Markdown text={shown || ' '} />}
        {b.citations && b.citations.length > 0 && (
          <div className="bubble__cites">
            {b.citations.slice(0, 6).map((c, i) => {
              let host = c.url;
              try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
              return <a key={i} className="cite-chip" href={c.url} target="_blank" rel="noreferrer noopener" title={c.title ?? c.url}>{host}</a>;
            })}
          </div>
        )}
        {side === 'right' && b.reaction && <span className="bubble__reaction" role="img" aria-label={t('Reacted {emoji}', { emoji: b.reaction })}>{b.reaction}</span>}
      </div>:null}
      <div className="bubble__meta">
        <time className="bubble__time" dateTime={new Date(row.createdAt).toISOString()} title={new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}>{messageTimestamp(row.createdAt)}</time>
        {side === 'left' && !b.streaming && b.text.trim() && <CopyButton text={b.text} />}
        {onRetry && <RetryButton onRetry={onRetry} />}
        {seenBy && b.seenAt && <span className="bubble__seen" title={t('Seen by {name}', { name: seenBy.name })}><BotAvatarFor bot={seenBy} size={14} />{t('Seen')}</span>}
      </div>
    </div>
  );
});

/** Ask for a new answer to the same message; the old reply is set aside. */
function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" className="bubble__copy bubble__retry" onClick={onRetry} aria-label={t('Try again')} title={t('Try again')}>
      <Icon name="refresh" size={13} />
    </button>
  );
}

/** Copy a reply's text; shows "Copied" for a moment. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const ok = () => { setDone(true); setTimeout(() => setDone(false), 1500); };
    try { await navigator.clipboard.writeText(text); ok(); return; } catch { /* some windows (embedded views, the Mac app) refuse; fall back */ }
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(area); area.select();
    try { if (document.execCommand('copy')) ok(); } finally { area.remove(); }
  };
  return (
    <button type="button" className={`bubble__copy${done ? ' is-done' : ''}`} onClick={() => void copy()} aria-label={done ? t('Copied') : t('Copy reply')} title={done ? t('Copied') : t('Copy reply')}>
      <Icon name={done ? 'check' : 'copy'} size={13} />{done && <span>{t('Copied')}</span>}
    </button>
  );
}

function SenderLabel({ from }: { from: NonNullable<MessageBody['from']> }) {
  const bot = useStore((s) => (from.kind === 'bot' ? s.bots.find((b) => b.id === from.id) : undefined));
  return (
    <div className="sender-label">
      {bot ? <BotAvatarFor bot={bot} size={16} /> : from.kind === 'routine' ? <Icon name="clock" size={12} opacity={0.56} /> : from.kind === 'voice' ? <Icon name="voice_a" size={12} opacity={0.56} /> : <BotAvatar shape="blob" color="gray" size={16} />}
      <span>{from.kind === 'routine' ? `Routine · ${from.name}` : from.kind === 'voice' ? t("Asked on a voice call") : `From ${from.name}`}</span>
    </div>
  );
}

function Steps({ rows }: { rows: Row[] }) {
  const calls = rows.map((r) => r.body as ToolCallBody);
  const visible = calls;
  const active=visible.find(c=>c.status==='running');
  if (!visible.length) return null;
  const n = visible.length;
  return (
    <details className="steps">
      <summary className="steps__toggle">
        {active ? t(stepTitle(active)) : plural(n, '{n} step', '{n} steps')}
        {active&&<span className="steps__working" aria-label={t("Working")}/>}
        <Icon name="chev_down" size={10} opacity={0.66} className="steps__chev" />
      </summary>
        <ul className="steps__list">
          {visible.map((c) => (
            <li key={c.callId} className={`step is-${c.status}`}>
              {stepDestination(c)?<img className="step__site-icon" src={stepDestination(c)!.icon} alt="" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>:<span className="step__dot" />}
              <span className="step__label">{stepTitle(c)}</span>
              {c.summary && <span className="step__summary">{c.summary}</span>}
              {c.status === 'error' && <span className="step__summary">{t("Failed")}</span>}
              {c.status === 'denied' && <span className="step__summary">{t("Not allowed")}</span>}
              {c.screenshot && <img className="step__shot" src={c.screenshot} alt="" />}
            </li>
          ))}
        </ul>
    </details>
  );
}

function SystemRow({ row, running }: { row: Row; running: boolean }) {
  const b = row.body;
  if (b.type === 'event') return <div className="system-event">{b.text}</div>;
  if (b.type === 'notice') return <div className={`notice is-${b.tone ?? 'info'}`}>{b.text}</div>;
  if (b.type === 'card') return <CardRow row={row} />;
  if (b.type === 'plan') return <PlanCard body={b} running={running} />;
  return null;
}

interface Props { bot: Bot; rows: Row[]; live: LiveState | undefined; loaded: boolean; generation?: number }

export function Transcript({ bot, rows, live, loaded, generation }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const items = useMemo(() => buildItems(rows), [rows]);

  const running = !!live?.isRunning;
  const waiting = !running && (!!live?.awaiting || live?.activity?.kind === 'waiting_for_you');
  // A reply set aside by "Try again" no longer counts as the latest one.
  const shownRows = useMemo(() => rows.filter((r) => !r.body.replaced), [rows]);
  const last = shownRows[shownRows.length - 1];
  const streamingNow = last?.body.type === 'message' && last.body.role === 'assistant' && !!last.body.streaming;
  // Once the reply is on screen, the text itself shows progress; the status line steps aside until tools run again.
  const replyShowing = last?.body.type === 'message' && last.body.role === 'assistant' && !last.body.streaming && !!last.body.text.trim();
  const showActivity = (running || streamingNow || waiting) && (waiting || !replyShowing);
  // "Try again" sits on the bot's last reply to something the person typed, once the bot is done.
  const retrySeq = useMemo(() => {
    if (running || waiting) return undefined;
    const shown = shownRows.filter((r) => r.body.type === 'message');
    const lastReply = shown[shown.length - 1];
    if (!lastReply || lastReply.body.type !== 'message' || lastReply.body.role !== 'assistant' || lastReply.body.from || !lastReply.body.text.trim()) return undefined;
    const asked = [...shown].reverse().find((r) => r.body.type === 'message' && r.body.role === 'user');
    return asked && asked.body.type === 'message' && !asked.body.from ? lastReply.seq : undefined;
  }, [shownRows, running, waiting]);
  // "Seen" shows under the person's latest message only.
  const lastAskSeq = useMemo(() => [...shownRows].reverse().find((r) => r.body.type === 'message' && r.body.role === 'user' && !r.body.from)?.seq, [shownRows]);
  const [retryError, setRetryError] = useState('');
  const retry = () => {
    setRetryError(''); stick.current = true;
    api.regenerate(bot.id, rows[rows.length - 1]?.generation).catch((e) => setRetryError((e as Error).message));
  };
  // Replies that were written while this chat was open get a soft entrance; old history just sits there.
  const writing = useRef(new Set<string>());
  for (const r of rows) if (r.body.type === 'message' && r.body.role === 'assistant' && r.body.streaming) writing.current.add(`${bot.id}:${r.seq}`);

  // Open every chat already at the bottom: position before the first paint that has messages,
  // so switching bots never flashes the top of the history and then jumps.
  const positioned = useRef(false);
  useLayoutEffect(() => {
    if (positioned.current || !rows.length) return;
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTop = el.scrollHeight;
    positioned.current = true;
  });

  // Images, smooth text and viewport changes can resize the conversation without
  // rerendering Transcript. Keep the bottom pinned only while the user is there.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const col = el?.querySelector('.transcript__col');
    if (!el || !col) return;
    let frame=0;
    const observer = new ResizeObserver(() => {
      if(frame||!stick.current)return;
      frame=requestAnimationFrame(()=>{frame=0;if(stick.current)el.scrollTop=el.scrollHeight;});
    });
    observer.observe(col); observer.observe(el);
    return () => {observer.disconnect();cancelAnimationFrame(frame);};
    // Re-attach once the history has loaded, so the column exists to be watched.
  }, [bot.id, loaded]);

  // Opened from search: bring that message into view and flash it once.
  const focus = useStore((s) => s.focusRow);
  useLayoutEffect(() => {
    if (!focus || focus.botId !== bot.id || !rows.some((r) => r.seq === focus.seq && r.generation === focus.generation)) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-seq="${focus.seq}"]`);
    if (!el) return;
    stick.current = false;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('is-found'); void el.offsetWidth; el.classList.add('is-found');
    positioned.current = true;
    useStore.getState().set({ focusRow: null });
  }, [focus, rows, bot.id]);

  // Sending a message always brings you to the bottom, where the reply will appear.
  const lastSeq = last?.seq;
  useLayoutEffect(() => {
    const b = last?.body;
    if (b?.type !== 'message' || b.role !== 'user' || b.from) return;
    stick.current = true; setShowJump(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeq]);

  const onScroll = () => {
    const el = scrollRef.current!;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = dist < 40;
    setShowJump(dist > 40);
  };

  const jump = () => {
    const el = scrollRef.current!;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="transcript-wrap">
    <div className="transcript" ref={scrollRef} onScroll={onScroll}>
      <div className="transcript__col">
        {loaded && rows.length === 0 && <EmptyChat bot={bot} generation={generation} />}
        {items.map((it) => {
          switch (it.kind) {
            case 'divider':
              return <div key={it.key} className="divider">{dividerLabel(it.ts)}</div>;
            case 'steps':
              return <Steps key={it.key} rows={it.rows} />;
            case 'row':
              return <SystemRow key={it.key} row={it.row} running={running} />;
            case 'group':
              return (
                <div key={it.key} className={`group is-${it.side}`}>
                  {it.from && <SenderLabel from={it.from} />}
                  {it.rows.map((r, i) => (
                    <Fragment key={r.seq}><Bubble row={r} side={it.side} pos={cornerClass(i, it.rows.length)} fresh={writing.current.has(`${bot.id}:${r.seq}`)} onRetry={r.seq === retrySeq ? retry : undefined} seenBy={r.seq === lastAskSeq ? bot : undefined} /></Fragment>
                  ))}
                </div>
              );
          }
        })}
        {retryError && <div className="notice is-error" role="alert">{t(retryError)}</div>}
        {showActivity && live && <ActivityLine bot={bot} live={live} rows={shownRows} writing={streamingNow} />}
      </div>
    </div>
      {showJump && (
        <button type="button" className="jump-btn" onClick={jump} aria-label={t("Scroll to bottom")}>
          <Icon name="arrow_down" size={16} />
        </button>
      )}
    </div>
  );
}

function EmptyChat({ bot, generation }: { bot: Bot; generation?: number }) {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState('');
  const start = (text: string) => {
    if (sent) return;
    setSent(text); setError('');
    api.send(bot.id, text, undefined, undefined, generation).catch((e) => { setSent(null); setError((e as Error).message); });
  };
  return (
    <div className="empty-chat">
      <BotAvatarFor bot={bot} size={72} />
      <div className="empty-chat__title">{bot.name}</div>
      <div className="empty-chat__sub">{(bot.description && t(bot.description)) || (bot.mode === 'teammate' ? t("A Bot for the whole team. Hand it a task and it will see it through.") : t("Your personal assistant. Hand it a task and it will see it through."))}</div>
      {bot.kind !== 'room' && (
        <div className="empty-chat__starters">
          {startersFor(bot).map((s) => (
            <button key={s} type="button" className="starter-chip" dir="auto" disabled={!!sent} onClick={() => start(t(s))}>{t(s)}</button>
          ))}
        </div>
      )}
      {error && <div className="notice is-error" role="alert">{error}</div>}
    </div>
  );
}
