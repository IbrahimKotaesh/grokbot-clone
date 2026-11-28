import { t } from './i18n';
import type { ActivityKind, LiveState, Row } from '@shared/types';

/** textKind → phrase table from docs/research/03-ui-design.md §2.4. Arrays rotate. */
const PHRASES: Record<string, string[]> = {
  thinking: ['Thinking it through', 'Mulling it over', 'Putting it together'],
  working: ['Getting it done', 'Making progress', 'Working on it', 'Handling it', 'Chipping away'],
  searching_web: ['Digging around'],
  reading_web: ['Doing some reading'],
  browsing_web: ['Clicking through pages'],
  reading_file: ['Reading the file'],
  drafting_file: ['Jotting it down'],
  organizing_files: ['Moving files over'],
  on_your_computer: ['Working on your computer'],
  on_its_computer: ['Clicking around'],
  running_commands: ['Running a few commands'],
  waiting_on_command: ['Waiting on results'],
  coding: ['Writing some code'],
  generating_photo: ['Sketching something up'],
  generating_video: ['Filming a clip'],
  messaging_assistant: ['Checking with another Bot'],
  messaging: ['Sending a message'],
  connecting_app: ['Working in a connected app'],
  waiting_for_you: ['Needs your input'],
  checking_usage: ['Checking your usage'],
  remembering: ['Making a note of it'],
};

const nice = (s?: string) => !!s && !/[_]/.test(s) && !/^[a-z0-9-]+$/.test(s);

const hostOf = (u: unknown) => { try { return new URL(String(u)).host.replace(/^www\./, ''); } catch { return ''; } };
const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * What the Bot is really doing right now, in words the owner recognises: the step of its plan ("2/3 · Writing the
 * three skills") or the page it is reading. Null when there is nothing concrete, so the line falls back to a phrase.
 */
export function progressPhrase(live: LiveState, rows: Row[]): string | null {
  if (!live.isRunning) return null;
  // Only this turn: everything after the owner's last message.
  let from = rows.length - 1;
  while (from >= 0 && !(rows[from].body.type === 'message' && (rows[from].body as { role?: string }).role === 'user')) from--;
  const turn = rows.slice(from + 1);
  const running = [...turn].reverse().find((r) => r.body.type === 'tool-call' && r.body.status === 'running');
  if (running?.body.type === 'tool-call') {
    const args = (running.body.args ?? {}) as Record<string, unknown>;
    const site = hostOf(args.url);
    if (site && /read|browse|navigate|open|fetch/i.test(running.body.name)) return t('Reading {site}', { site });
    if (typeof args.query === 'string' && /search|recall/i.test(running.body.name) && args.query.trim()) return t('Searching “{query}”', { query: clip(args.query.trim(), 40) });
  }
  const plan = [...turn].reverse().find((r) => r.body.type === 'plan');
  if (plan?.body.type === 'plan' && plan.body.steps.length > 1) {
    const steps = plan.body.steps;
    const i = steps.findIndex((s) => s.status === 'in_progress');
    if (i >= 0) return `${i + 1}/${steps.length} · ${clip(steps[i].text)}`;
  }
  return null;
}

/** Phrase for the activity line. `tick` rotates multi-phrase kinds. */
export function activityPhrase(live: LiveState, rows: Row[], tick: number): string {
  const real = progressPhrase(live, rows);
  if (real) return real;
  const a = live.activity;
  if (!a) return t(live.awaiting ? 'Needs your input' : 'Working on it');
  const kind = a.kind as ActivityKind;
  if (kind === 'messaging_named') {
    const running = [...rows].reverse().find((r) => r.body.type === 'tool-call' && r.body.status === 'running');
    const args = running?.body.type === 'tool-call' ? (running.body.args as Record<string, unknown> | undefined) : undefined;
    const name = typeof args?.bot_name === 'string' ? args.bot_name : nice(a.detail) ? a.detail : null;
    return name ? t('Checking with {name}', { name }) : t('Checking with another Bot');
  }
  if (kind === 'connecting_service') return nice(a.detail) ? t('Working in {name}', { name: a.detail! }) : t('Working in a connected app');
  const list = PHRASES[kind] ?? PHRASES.working;
  // The clock can lag the server by a moment (a step that started "in the future"): never index below zero.
  const i = Number.isFinite(tick) ? ((Math.trunc(tick) % list.length) + list.length) % list.length : 0;
  return t(list[i]);
}
