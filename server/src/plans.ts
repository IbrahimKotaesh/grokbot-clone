// Subscription plans. Users bring their own AI model (ChatGPT sign-in or an API key), so plans
// price what Fino itself provides: bots, the cloud computer and voice.
import { db, now } from './db.js';

export type PlanId = 'free' | 'starter' | 'pro' | 'max' | 'enterprise';
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
    highlights: ['Quinn + 1 bot', 'Chat and voice messages', 'Personal marketplace bots'],
  },
  starter: {
    id: 'starter', name: 'Starter', priceUsd: 14.99, bots: 3, computer: false, computerHours: 0, voiceMinutes: 30, marketplace: 'personal',
    highlights: ['Quinn + 3 bots', 'Chat, voice messages and files', 'Personal marketplace bots', 'Use your own AI model'],
  },
  pro: {
    id: 'pro', name: 'Pro', priceUsd: 49.99, bots: 10, computer: true, computerHours: 20, voiceMinutes: 120, marketplace: 'all',
    highlights: ['Quinn + 10 bots', 'Computer use · 20 h/month', 'Every marketplace bot', 'Claude Code on your computer'],
  },
  max: {
    id: 'max', name: 'Max', priceUsd: 199.99, bots: null, computer: true, computerHours: 100, voiceMinutes: 600, marketplace: 'all',
    highlights: ['Unlimited bots', 'Computer use · 100 h/month', 'Every marketplace bot', 'Priority support'],
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
  else if (plan !== 'max' && plan !== 'enterprise' && !renewsAt) renewsAt = now() + 31 * 86400_000;
  db.prepare('UPDATE users SET plan=?, plan_renews_at=? WHERE id=?').run(plan, renewsAt, userId);
}

const monthStart = () => {
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

export class PlanLimitError extends Error {
  constructor(message: string, readonly feature: 'computer' | 'bots' | 'voice') {
    super(message);
  }
}

/** Throws before the computer wakes if the plan has no computer or this month's hours are used up. */
export function assertComputerAllowed(userId: string) {
  const plan = planOf(userId);
  if (!plan.computer) throw new PlanLimitError('Computer use is part of the Pro plan. Upgrade in Account → Plan to give your bots a computer.', 'computer');
  if (plan.computerHours !== null && computerMinutesThisMonth(userId) >= plan.computerHours * 60)
    throw new PlanLimitError(`You've used this month's ${plan.computerHours} computer hours. Upgrade for more, or wait until next month.`, 'computer');
}

export function assertCanCreateBot(userId: string) {
  const plan = planOf(userId);
  if (plan.bots === null) return;
  const count = (db.prepare("SELECT COUNT(*) AS n FROM bots WHERE user_id=? AND is_primary=0 AND parent_bot_id IS NULL AND COALESCE(hidden,0)=0 AND COALESCE(kind,'agent')='agent'").get(userId) as { n: number }).n;
  if (count >= plan.bots) throw new PlanLimitError(`Your ${plan.name} plan includes ${plan.bots} bots besides your main bot. Upgrade to add more.`, 'bots');
}

export function billingSummary(userId: string) {
  const plan = planOf(userId);
  const row = db.prepare('SELECT plan_renews_at FROM users WHERE id=?').get(userId) as { plan_renews_at: number | null };
  const bots = (db.prepare("SELECT COUNT(*) AS n FROM bots WHERE user_id=? AND is_primary=0 AND parent_bot_id IS NULL AND COALESCE(hidden,0)=0 AND COALESCE(kind,'agent')='agent'").get(userId) as { n: number }).n;
  return {
    plan: plan.id,
    renewsAt: row?.plan_renews_at ?? null,
    plans: Object.values(PLANS),
    usage: { bots, computerMinutes: computerMinutesThisMonth(userId) },
  };
}
