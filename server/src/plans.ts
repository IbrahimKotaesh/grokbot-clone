import { usesServerResources } from './lib/owner.js';
import { env } from './env.js';
// Subscription plans. Users bring their own AI model (ChatGPT sign-in or an API key), so plans
// price what Fino itself provides: bots, the cloud computer and voice.
import { db, now } from './db.js';

export type PlanId = 'free' | 'starter' | 'pro' | 'max' | 'ultra' | 'enterprise';
export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number | null; // null = contact sales
  bots: number | null; // null = unlimited
  computer: boolean;
  computerHours: number | null; // per calendar month; null = unlimited
  voiceMinutes: number | null;
  marketplace: 'personal' | 'all';
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  // Everyone without an active subscription. Paid plans must clearly add something.
  free: {
    id: 'free', name: 'Free', priceUsd: 0, bots: 1, computer: false, computerHours: 0, voiceMinutes: 10, marketplace: 'personal',
    highlights: ['Badr + 1 bot', 'Chat and voice messages', 'Personal marketplace bots'],
  },
  // Each plan adds to the one before (2026-11-28: $30 / $50 / $100 / $200, no $15 plan). Every limit is set so a
  // customer who uses all of it still leaves a 30% margin: card fees ~3% + $0.30, the computer's disk ~$2 a month and
  // Orgo ~$0.055 an hour, calls ~$0.07 a minute, and Badr's own AI capped per day, week and month (hosted-models.ts).
  starter: {
    id: 'starter', name: 'Starter', priceUsd: 29.99, bots: 5, computer: true, computerHours: 5, voiceMinutes: 60, marketplace: 'personal',
    highlights: ['Badr + 5 bots', 'Ready-to-work bots with superpowers', 'Their own computer · 5 h a month', 'Use your own Claude Code and ChatGPT'],
  },
  pro: {
    id: 'pro', name: 'Pro', priceUsd: 49.99, bots: 15, computer: true, computerHours: 20, voiceMinutes: 120, marketplace: 'all',
    highlights: ['Everything in Starter, plus', 'Badr + 15 bots', 'Their own computer · 20 h a month', 'Every marketplace bot', 'Stronger AI models included'],
  },
  max: {
    id: 'max', name: 'Max', priceUsd: 99.99, bots: 40, computer: true, computerHours: 60, voiceMinutes: 300, marketplace: 'all',
    highlights: ['Everything in Pro, plus', 'Badr + 40 bots', 'Their own computer · 60 h a month', 'Top AI models included', 'Priority support'],
  },
  ultra: {
    id: 'ultra', name: 'Ultra', priceUsd: 199.99, bots: null, computer: true, computerHours: 150, voiceMinutes: 600, marketplace: 'all',
    highlights: ['Everything in Max, plus', 'Unlimited bots', 'Their own computer · 150 h a month', 'The most included AI', 'Early access to new features'],
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise', priceUsd: null, bots: null, computer: true, computerHours: null, voiceMinutes: null, marketplace: 'all',
    highlights: ['Unlimited bots and computers', 'Private marketplace for your team', 'SSO and admin controls', 'Dedicated support'],
  },
};
export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && v in PLANS;

// ---------- storage ----------
if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some((c) => c.name === 'plan')) {
  db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'starter'");
  // Accounts that existed before plans keep full access.
  db.exec("UPDATE users SET plan='max'");
}
if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some((c) => c.name === 'plan_renews_at')) db.exec('ALTER TABLE users ADD COLUMN plan_renews_at INTEGER');
for (const col of ['plan_trial_until INTEGER', 'trial_used_at INTEGER'])
  if (!(db.prepare('PRAGMA table_info(users)').all() as any[]).some((c) => c.name === col.split(' ')[0])) db.exec(`ALTER TABLE users ADD COLUMN ${col}`);

/**
 * The free trial day (Stripe, card on file, charged after a day unless cancelled): the full plan, with a small
 * budget so a trial costs Fino cents. One trial per account.
 */
export const TRIAL = { days: Number(process.env.STRIPE_TRIAL_DAYS ?? 1), chatUsd: 0.25, computerUsd: 0.25, computerMinutes: 30, voiceMinutes: 5 };
/** When the account's free trial ends, or null when it isn't in one. */
export function trialUntil(userId: string): number | null {
  const row = db.prepare('SELECT plan_trial_until FROM users WHERE id=?').get(userId) as { plan_trial_until: number | null } | undefined;
  return row?.plan_trial_until && row.plan_trial_until > now() ? row.plan_trial_until : null;
}
db.exec('CREATE TABLE IF NOT EXISTS computer_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER)');
db.exec('CREATE INDEX IF NOT EXISTS computer_usage_user ON computer_usage(user_id, started_at)');

export function planOf(userId: string): Plan {
  const row = db.prepare('SELECT plan, plan_renews_at FROM users WHERE id=?').get(userId) as { plan?: string; plan_renews_at?: number | null } | undefined;
  // New accounts are stored as starter with no renewal date: that means "never paid", i.e. Free.
  if (!row || !isPlanId(row.plan) || row.plan === 'free' || (row.plan === 'starter' && !row.plan_renews_at)) return PLANS.free;
  return PLANS[row.plan];
}
export function setPlan(userId: string, plan: PlanId, renewsAt: number | null = null) {
  if (plan === 'free') plan = 'starter', renewsAt = null;
  // A paid plan always carries a renewal date so it is never mistaken for Free.
  else if (plan !== 'max' && plan !== 'ultra' && plan !== 'enterprise' && !renewsAt) renewsAt = now() + 31 * 86400_000;
  db.prepare('UPDATE users SET plan=?, plan_renews_at=? WHERE id=?').run(plan, renewsAt, userId);
}

export const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

/** Called on every computer status change: open a usage session when it starts running, close it otherwise. */
export function recordComputerStatus(userId: string, status: string) {
  const open = db.prepare('SELECT id FROM computer_usage WHERE user_id=? AND ended_at IS NULL').get(userId) as { id: number } | undefined;
  if (status === 'running') {
    if (!open) db.prepare('INSERT INTO computer_usage(user_id, started_at) VALUES (?,?)').run(userId, now());
  } else if (open && ['suspending', 'suspended', 'stopped', 'error', 'absent'].includes(status)) {
    db.prepare('UPDATE computer_usage SET ended_at=? WHERE id=?').run(now(), open.id);
  }
}

export function computerMinutesThisMonth(userId: string) {
  const start = monthStart();
  const rows = db.prepare('SELECT started_at, ended_at FROM computer_usage WHERE user_id=? AND (ended_at IS NULL OR ended_at>=?)').all(userId, start) as {
    started_at: number;
    ended_at: number | null;
  }[];
  const ms = rows.reduce((sum, r) => sum + Math.max(0, (r.ended_at ?? now()) - Math.max(r.started_at, start)), 0);
  return Math.round(ms / 60000);
}

// ---------- voice minutes ----------
// Every call is one row from the moment it starts; it closes when the call ends (the page says so, or Badr's
// voice relay sees the line drop). A call left open counts up to now, at most two hours.
db.exec('CREATE TABLE IF NOT EXISTS voice_usage (call_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER)');
db.exec('CREATE INDEX IF NOT EXISTS voice_usage_user ON voice_usage(user_id, started_at)');
const OPEN_CALL_MAX_MS = 2 * 3600_000;
export function recordCallStart(userId: string, callId: string) {
  db.prepare('INSERT OR IGNORE INTO voice_usage(call_id, user_id, started_at) VALUES (?,?,?)').run(callId, userId, now());
}
export function recordCallEnd(callId: string) {
  db.prepare('UPDATE voice_usage SET ended_at=? WHERE call_id=? AND ended_at IS NULL').run(now(), callId);
}
/** Seconds of calls this month (or, in the free trial, since it began). */
export function voiceSecondsThisMonth(userId: string, since = monthStart()) {
  const rows = db.prepare('SELECT started_at, ended_at FROM voice_usage WHERE user_id=? AND (ended_at IS NULL OR ended_at>=?)').all(userId, since) as { started_at: number; ended_at: number | null }[];
  const ms = rows.reduce((sum, r) => sum + Math.max(0, Math.min(r.ended_at ?? now(), r.started_at + OPEN_CALL_MAX_MS) - Math.max(r.started_at, since)), 0);
  return Math.round(ms / 1000);
}
/** The plan's voice minutes for this account right now: the trial day has its own few, the server's owner none. */
function voiceAllowance(userId: string): { minutes: number | null; trial: boolean } {
  if (usesServerResources(userId)) return { minutes: null, trial: false };
  if (trialUntil(userId)) return { minutes: TRIAL.voiceMinutes, trial: true };
  return { minutes: planOf(userId).voiceMinutes, trial: false };
}
/** Minutes used and left this month, for the call button and Settings. null = no limit. */
export function voiceMinutesLeft(userId: string): { used: number; limit: number | null; secondsLeft: number | null } {
  const { minutes } = voiceAllowance(userId);
  const used = voiceSecondsThisMonth(userId);
  if (minutes === null) return { used: Math.floor(used / 60), limit: null, secondsLeft: null };
  return { used: Math.floor(used / 60), limit: minutes, secondsLeft: Math.max(0, minutes * 60 - used) };
}
/** Before a call starts: how many seconds it may run (null = no limit); throws once the minutes are used up. */
export function assertVoiceAllowed(userId: string): number | null {
  const { minutes, trial } = voiceAllowance(userId);
  if (minutes === null) return null;
  const left = minutes * 60 - voiceSecondsThisMonth(userId);
  if (left >= 20) return left;
  const plan = planOf(userId);
  throw new PlanLimitError(trial
    ? `The free trial day includes ${TRIAL.voiceMinutes} minutes of calls. Your full ${plan.voiceMinutes} minutes start when the trial ends.`
    : plan.id === 'free'
      ? `You've used this month's ${minutes} free call minutes. Pick a plan for more.`
      : `You've used this month's ${minutes} call minutes on ${plan.name}. Upgrade for more, or call again next month.`, 'voice');
}

export class PlanLimitError extends Error {
  constructor(message: string, readonly feature: 'computer' | 'bots' | 'voice' | 'plan') {
    super(message);
  }
}

/**
 * Web sign-ups pick a plan before anything else (every plan starts with a free day). Until they do, or after a
 * trial or subscription ends, their bots don't run. Off when Stripe isn't set up (nowhere to pay), and never for
 * the server's owner.
 */
export function planRequired(userId: string | undefined | null): boolean {
  if (!userId || !process.env.STRIPE_SECRET_KEY?.trim()) return false;
  if (usesServerResources(userId)) return false;
  return planOf(userId).id === 'free';
}
export const PLAN_REQUIRED_MESSAGE = 'Pick a plan to start. Every plan begins with a free day.';

/** Throws before the computer wakes if the plan has no computer or this month's hours are used up. */
export function assertComputerAllowed(userId: string) {
  // The local/container desktop is one machine shared by the server's bots, so on a public server only the owner uses it.
  if (env.computerProvider !== 'orgo' && !usesServerResources(userId)) throw new PlanLimitError('The bot computer isn’t available on your account yet. Your bots can still chat and use your connected apps.', 'computer');
  const plan = planOf(userId);
  if (!plan.computer) throw new PlanLimitError('Pick a plan to give your bots their own computer.', 'computer');
  if (trialUntil(userId) && computerMinutesThisMonth(userId) >= TRIAL.computerMinutes)
    throw new PlanLimitError(`The free trial day includes ${TRIAL.computerMinutes} minutes of computer use. Your full ${plan.computerHours} hours start when the trial ends.`, 'computer');
  if (plan.computerHours !== null && computerMinutesThisMonth(userId) >= plan.computerHours * 60)
    throw new PlanLimitError(`You've used this month's ${plan.computerHours} computer hours. Upgrade for more, or wait until next month.`, 'computer');
}

export function assertCanCreateBot(userId: string) {
  const plan = planOf(userId);
  if (plan.bots === null) return;
  const count = (db.prepare("SELECT COUNT(*) AS n FROM bots WHERE user_id=? AND is_primary=0 AND parent_bot_id IS NULL AND COALESCE(hidden,0)=0 AND COALESCE(kind,'agent')='agent'").get(userId) as { n: number }).n;
  if (count >= plan.bots) throw new PlanLimitError(`Your ${plan.name} plan includes ${plan.bots} ${plan.bots === 1 ? "teammate" : "teammates"} besides Badr. Upgrade to add more.`, 'bots');
}

export function billingSummary(userId: string) {
  const plan = planOf(userId);
  const row = db.prepare('SELECT plan_renews_at FROM users WHERE id=?').get(userId) as { plan_renews_at: number | null };
  const bots = (db.prepare("SELECT COUNT(*) AS n FROM bots WHERE user_id=? AND is_primary=0 AND parent_bot_id IS NULL AND COALESCE(hidden,0)=0 AND COALESCE(kind,'agent')='agent'").get(userId) as { n: number }).n;
  return {
    plan: plan.id,
    renewsAt: row?.plan_renews_at ?? null,
    trialUntil: trialUntil(userId),
    plans: Object.values(PLANS),
    usage: { bots, computerMinutes: computerMinutesThisMonth(userId), voiceMinutes: voiceMinutesLeft(userId).used },
  };
}
