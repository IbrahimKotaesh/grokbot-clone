import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Clock, MessageSquare, Zap } from 'lucide-react';
import type { Bot, Routine } from '@shared/types';
import { t } from '../lib/i18n';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { useConfigUI } from '../configStore';
import { scheduleText } from '../lib/schedule';

/** True while the screen is narrower than `px` (phones get a top-to-bottom flow instead of lines). */
function useNarrow(px = 760) {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const on = () => setNarrow(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, [q]);
  return narrow;
}

const isEvent = (r: Routine) => r.schedule.startsWith('event:');
const curve = (x1: number, y1: number, x2: number, y2: number) => { const dx = Math.max(24, (x2 - x1) / 2); return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; };

function When({ r }: { r: Routine }) {
  return (
    <div className={`flow-card flow-when${r.enabled ? '' : ' is-off'}${isEvent(r) ? ' is-event' : ''}`} data-when>
      <span className="flow-card__icon" aria-hidden>{isEvent(r) ? <Zap size={14} strokeWidth={2.3} /> : <Clock size={14} strokeWidth={2.3} />}</span>
      <span className="flow-card__text"><b dir="auto">{scheduleText(r)}</b>{!r.enabled && <small>{t('Off')}</small>}</span>
    </div>
  );
}

function Does({ r, bot }: { r: Routine; bot: Bot }) {
  return (
    <button type="button" className={`flow-card flow-does${r.enabled ? '' : ' is-off'}`} data-does onClick={() => useConfigUI.getState().openBotSettings(bot.id, 'routines')} title={r.prompt}>
      <span className="flow-card__text">
        <b dir="auto">{r.name}</b>
        <small dir="auto" className="flow-does__prompt">{r.prompt}</small>
        <small className="flow-does__out"><MessageSquare size={11} strokeWidth={2.3} aria-hidden /> {t('Reports in your chat with {name}', { name: bot.name })}</small>
      </span>
    </button>
  );
}

function BotNode({ bot, count }: { bot: Bot; count: number }) {
  return (
    <div className="flow-bot">
      <BotAvatarFor bot={bot} size={44} />
      <b dir="auto">{bot.name}</b>
      <small dir="auto">{bot.label ? t(bot.label) : bot.isPrimary ? t('Chief of Staff') : ''}{bot.label || bot.isPrimary ? ' · ' : ''}{count === 1 ? t('1 automation') : t('{n} automations', { n: count })}</small>
    </div>
  );
}

/** One Bot's lane: its triggers on the left, the Bot in the middle, what it does on the right, joined by lines. */
function Lane({ bot, items }: { bot: Bot; items: Routine[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; off: boolean; event: boolean }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const draw = () => {
      const b = el.getBoundingClientRect(), node = el.querySelector('.flow-bot')?.getBoundingClientRect();
      if (!node) return;
      const out: { d: string; off: boolean; event: boolean }[] = [];
      const mid = node.top + node.height / 2 - b.top;
      el.querySelectorAll<HTMLElement>('[data-when]').forEach((w, i) => { const r = w.getBoundingClientRect(); out.push({ d: curve(r.right - b.left, r.top + r.height / 2 - b.top, node.left - b.left, mid), off: !items[i]?.enabled, event: !!items[i] && isEvent(items[i]) }); });
      el.querySelectorAll<HTMLElement>('[data-does]').forEach((w, i) => { const r = w.getBoundingClientRect(); out.push({ d: curve(node.right - b.left, mid, r.left - b.left, r.top + r.height / 2 - b.top), off: !items[i]?.enabled, event: false }); });
      setPaths(out); setSize({ w: b.width, h: b.height });
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(el);
    return () => ro.disconnect();
  }, [items]);
  return (
    <section className="flow-lane" ref={box} style={{ gridTemplateRows: `repeat(${items.length}, auto)` }}>
      <svg className="flow-lines" width={size.w} height={size.h} aria-hidden>
        {paths.map((p, i) => <path key={i} d={p.d} className={`${p.off ? 'is-off' : ''}${p.event ? ' is-event' : ''}`} />)}
      </svg>
      {items.map((r, i) => <div key={`w${r.id}`} className="flow-cell flow-cell--when" style={{ gridRow: i + 1 }}><When r={r} /></div>)}
      <div className="flow-cell flow-cell--bot" style={{ gridRow: `1 / span ${items.length}` }}><BotNode bot={bot} count={items.length} /></div>
      {items.map((r, i) => <div key={`d${r.id}`} className="flow-cell flow-cell--does" style={{ gridRow: i + 1 }}><Does r={r} bot={bot} /></div>)}
    </section>
  );
}

/** On a phone: the Bot, then each automation as "when ↓ what it does". */
function MobileLane({ bot, items }: { bot: Bot; items: Routine[] }) {
  return (
    <section className="flow-mlane">
      <BotNode bot={bot} count={items.length} />
      {items.map((r) => (
        <div key={r.id} className="flow-mstep">
          <When r={r} />
          <span className="flow-mstep__arrow" aria-hidden><ArrowDown size={14} strokeWidth={2.4} /></span>
          <Does r={r} bot={bot} />
        </div>
      ))}
    </section>
  );
}

/** Workflow as a diagram: for every Bot, what starts each automation and what the Bot does with it. */
export function WorkflowDiagram({ lanes }: { lanes: { bot: Bot; items: Routine[] }[] }) {
  const narrow = useNarrow();
  return (
    <div className="flow-diagram">
      {!narrow && (
        <div className="flow-heads" aria-hidden>
          <span>{t('When')}</span><span>{t('Who')}</span><span>{t('What it does')}</span>
        </div>
      )}
      {lanes.map(({ bot, items }) => (narrow ? <MobileLane key={bot.id} bot={bot} items={items} /> : <Lane key={bot.id} bot={bot} items={items} />))}
    </div>
  );
}
