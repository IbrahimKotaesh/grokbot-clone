// Measures what each bot turn costs: tokens in/out (and how many were cached), plus how many computer
// steps and seconds it took. Used to price computer use per hour. Stores counts only, never content.
import { db, now } from './db.js';
import { costOf, type Usage } from './hosted-models.js';

db.exec(`CREATE TABLE IF NOT EXISTS model_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, bot_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0, cached_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  model_calls INTEGER NOT NULL DEFAULT 0, computer_steps INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL)`);

for (const [col, def] of [['kind', "TEXT NOT NULL DEFAULT 'chat'"], ['hosted', 'INTEGER NOT NULL DEFAULT 0'], ['cost_usd', 'REAL NOT NULL DEFAULT 0'], ['turn_id', 'TEXT']] as const)
  if (!(db.prepare('PRAGMA table_info(model_usage)').all() as { name: string }[]).some((c) => c.name === col)) db.exec(`ALTER TABLE model_usage ADD COLUMN ${col} ${def}`);

const COMPUTER_TOOLS = /^(computer_|open_browser)/;

export class TurnMeter {
  input = 0;
  cached = 0;
  output = 0;
  calls = 0;
  computerSteps = 0;
  perCall: number[] = [];
  cost = 0;
  /** True when Fino's own key paid for this (so it counts against the plan's budget). */
  hosted = false;
  toolCalls = 0;
  private started: number;
  private turnId: string | null;
  /** `turnId` groups the model calls of one message; `startedAt` is when the call (or turn) began. */
  constructor(private userId: string, private botId: string, private provider: string, public model: string | null, opts: { turnId?: string; startedAt?: number } = {}) {
    this.started = opts.startedAt ?? now();
    this.turnId = opts.turnId ?? null;
  }
  /** Add one model call's usage (Responses API shape). */
  add(u: Usage | undefined) {
    if (!u) return;
    this.cost += costOf(this.model ?? '', u);
    this.input += u.input_tokens ?? 0;
    this.output += u.output_tokens ?? 0;
    this.cached += u.input_tokens_details?.cached_tokens ?? 0;
    this.perCall.push(u.input_tokens ?? 0);
    this.calls++;
  }
  /** Replace with running totals (Codex reports cumulative usage for the turn). */
  setTotals(input: number, cached: number, output: number, calls?: number) {
    this.input = input;
    this.cached = cached;
    this.output = output;
    if (calls !== undefined) this.calls = calls;
  }
  tool(name: string) {
    this.toolCalls++;
    if (COMPUTER_TOOLS.test(name)) this.computerSteps++;
  }
  save() {
    if (!this.input && !this.output && !this.cost) return;
    try {
      db.prepare(
        'INSERT INTO model_usage (user_id,bot_id,provider,model,input_tokens,cached_tokens,output_tokens,model_calls,computer_steps,tool_calls,started_at,ended_at,kind,hosted,cost_usd,turn_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(this.userId, this.botId, this.provider, this.model, this.input, this.cached, this.output, this.calls, this.computerSteps, this.toolCalls, this.started, now(), this.computerSteps ? 'computer' : 'chat', this.hosted ? 1 : 0, this.cost, this.turnId);
      console.log(
        `[usage] ${this.provider}/${this.model ?? 'default'} in=${this.input} cached=${this.cached} out=${this.output} calls=${this.calls} computer_steps=${this.computerSteps} cost=${this.cost.toFixed(4)}${this.hosted ? ' hosted' : ''} ${Math.round((now() - this.started) / 1000)}s per_call=${this.perCall.join(',')}`,
      );
    } catch (e) {
      console.warn('[usage] could not save:', (e as Error).message);
    }
  }
}
