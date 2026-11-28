import { appendHistory, appendRow, getBotRow, loadHistory } from '../store.js';
import { TurnMeter } from '../usage-meter.js';
import { currentTurn } from '../lib/turn-id.js';
import { now } from '../db.js';
import { loopClient, type LoopProvider } from './model-clients.js';
import { DEFAULT_HOSTED, hostedProviderPrefs } from '../hosted-models.js';

/**
 * "Got it": within a second of the owner asking for real work, the Bot says what it understood (a few short
 * points) and what it starts with, so nobody stares at "Thinking it through" for half a minute while the main
 * model plans. A light, fast model writes it; small talk and quick questions get no note (the model says SKIP).
 * Only on Badr's own models: a Bot on the owner's ChatGPT or Claude keeps their words on that service.
 */
const SYSTEM = (name: string, lang: string) => `You are ${name}, a Bot on the owner's team in the Badr app. The owner just sent a message. Your only job right now is to show them you understood, before the real work starts.
- If the message asks for work that takes more than a quick reply (research, writing, files, the computer, several steps): write ONE short message: one opening line that you got it, then 2-4 very short bullets of what they want, in their words, then one short line saying what you start with. No headings, no times or promises, no questions, no emojis.
- If it is small talk, a quick question you would answer in a line or two, a thanks, an OK, or a reply to something you asked: reply exactly SKIP.
- ${lang}`;

/** Bots whose current turn opened with this note (by turn id), so the main model is told not to repeat it. */
const acked = new Map<string, string>();
export const ackedThisTurn = (botId: string) => { const t = acked.get(botId); return t !== undefined && t === (currentTurn(botId)?.id ?? ''); };
export const ACK_NOTE = "\nYour last message already told the owner what you understood and what you start with. Don't repeat or rephrase it: start the work now, and send the result (or a short update) when you have it.";

const textOf = (c: any): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? '').join(' ') : '');

export async function sendAck(userId: string, botId: string, provider: string, ownerText: string, signal: AbortSignal): Promise<boolean> {
  const text = ownerText.trim();
  if (text.length < 12 || botId.startsWith('room_')) return false;
  const llm = loopClient(userId, provider as LoopProvider, null);
  if (!llm.hosted) return false;
  const bot = getBotRow(botId);
  // A little of the conversation, so "do the same for Chelsea" is understood; visible words only.
  const before = loadHistory(botId).slice(-9, -1)
    .filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && textOf(h.content).trim() && !/^\[(System notice|Routine)/.test(textOf(h.content)))
    .slice(-4).map((h: any) => ({ role: h.role, content: textOf(h.content).slice(0, 600) }));
  const lang = /[؀-ۿ]/.test(text)
    ? 'The owner writes in Arabic: answer in Arabic, in their own dialect. Start every line with Arabic words.'
    : 'Answer in the exact language the owner wrote in (an English message gets English), never in Arabic unless they wrote Arabic.';
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, 5000);
  const started = now();
  try {
    const r: any = await llm.client.chat.completions.create({
      model: DEFAULT_HOSTED,
      max_tokens: 260,
      messages: [{ role: 'system', content: SYSTEM(bot?.name ?? 'Bot', lang) }, ...before, { role: 'user', content: text.slice(0, 4000) }],
      // @ts-expect-error OpenRouter extras: no thinking (speed), and Badr's usual private hosts.
      reasoning: { enabled: false }, provider: hostedProviderPrefs(), usage: { include: true },
    }, { signal: ctrl.signal });
    const meter = new TurnMeter(userId, botId, 'openrouter', DEFAULT_HOSTED, { turnId: currentTurn(botId)?.id, startedAt: started });
    meter.hosted = true;
    meter.add({ input_tokens: r.usage?.prompt_tokens ?? 0, output_tokens: r.usage?.completion_tokens ?? 0 } as any);
    meter.save();
    const said = String(r.choices?.[0]?.message?.content ?? '').trim();
    if (!said || /^skip\b/i.test(said) || said.length > 900 || signal.aborted) return false;
    appendRow(botId, 'message', { type: 'message', role: 'assistant', text: said, streaming: false });
    // The main model sees it, so it carries on from here instead of saying the same thing again.
    appendHistory(botId, [{ role: 'assistant', content: said }]);
    acked.set(botId, currentTurn(botId)?.id ?? '');
    return true;
  } catch {
    return false; // Too slow or failed: the real reply still comes, just without the note.
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}
