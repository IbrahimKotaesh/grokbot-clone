// Every Bot gets its own voice: a woman's for a woman's name, a man's for a man's, and no two Bots of one
// owner share a voice while the shortlist lasts. The owner can change it in Bot settings.
import OpenAI from 'openai';
import { db } from './db.js';
import { hostedKey } from './hosted-models.js';
import { hub } from './lib/hub.js';

/** The shortlist offered in Settings: four women's and four men's voices, best first. */
export const CAST: { id: string; name: string; gender: 'female' | 'male' }[] = [
  { id: 'ara', name: 'Ara', gender: 'female' }, { id: 'eve', name: 'Eve', gender: 'female' },
  { id: 'luna', name: 'Luna', gender: 'female' }, { id: 'celeste', name: 'Celeste', gender: 'female' },
  { id: 'leo', name: 'Leo', gender: 'male' }, { id: 'rex', name: 'Rex', gender: 'male' },
  { id: 'orion', name: 'Orion', gender: 'male' }, { id: 'atlas', name: 'Atlas', gender: 'male' },
];

db.exec('CREATE TABLE IF NOT EXISTS voice_cast (bot_id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
/** Marks a Bot's voice as chosen (by us or the owner) so it is never re-cast. */
export const markVoiceChosen = (botId: string) => db.prepare('INSERT OR IGNORE INTO voice_cast(bot_id, at) VALUES (?, ?)').run(botId, Date.now());

const llm = hostedKey() ? new OpenAI({ apiKey: hostedKey()!, baseURL: 'https://openrouter.ai/api/v1', timeout: 20_000 }) : null;

/** Whether a Bot's name reads as a woman's or a man's (Arabic, English, Dutch…). Defaults to male when unclear. */
async function genderOf(name: string, label: string): Promise<'female' | 'male'> {
  if (!llm) return 'male';
  try {
    const r = await llm.chat.completions.create({
      model: 'deepseek/deepseek-v4.1-flash', max_tokens: 5, temperature: 0,
      messages: [
        { role: 'system', content: 'You classify an assistant persona by its name. Answer with exactly one word: female or male. If the name is not clearly a woman\'s name, answer male.' },
        { role: 'user', content: `Name: ${name}\nRole: ${label}` },
      ],
    });
    return /female/i.test(r.choices[0]?.message?.content ?? '') ? 'female' : 'male';
  } catch { return 'male'; }
}

/** Gives a Bot a voice of the right gender that none of the owner's other Bots uses yet. */
export async function castVoice(botId: string) {
  const bot = db.prepare('SELECT id, user_id, name, label FROM bots WHERE id=?').get(botId) as { id: string; user_id: string; name: string; label: string } | undefined;
  if (!bot || db.prepare('SELECT 1 FROM voice_cast WHERE bot_id=?').get(botId)) return;
  const gender = await genderOf(bot.name, bot.label ?? '');
  const taken = (db.prepare("SELECT voice FROM bots WHERE user_id=? AND id<>? AND kind<>'room' AND id IN (SELECT bot_id FROM voice_cast)").all(bot.user_id, botId) as { voice: string }[]).map((r) => r.voice);
  const pool = CAST.filter((v) => v.gender === gender);
  const count = (id: string) => taken.filter((t) => t === id).length;
  const voice = pool.reduce((best, v) => (count(v.id) < count(best.id) ? v : best), pool[0]).id;
  db.prepare('UPDATE bots SET voice=? WHERE id=?').run(voice, botId);
  markVoiceChosen(botId);
  hub.emit(bot.user_id, { type: 'roster' });
}

/** Once: Bots made before voices were cast all still have the old default; give each its own. */
export async function castExistingVoices() {
  const rows = db.prepare("SELECT id FROM bots WHERE kind<>'room' AND COALESCE(hidden,0)=0 AND id NOT IN (SELECT bot_id FROM voice_cast) ORDER BY is_primary DESC, created_at").all() as { id: string }[];
  for (const r of rows) await castVoice(r.id).catch((e) => console.warn('[voice] cast failed', r.id, e?.message));
  if (rows.length) console.log(`[voice] gave ${rows.length} Bots their own voice`);
}
