import { randomBytes } from 'node:crypto';

/**
 * Two faults of some open-model hosts, mended before the owner sees them:
 * 1. The words just before a tool call lose their tail ("…the second one about Real" with "Madrid." gone). The host
 *    drops them, so they can't be recovered: the message is cut back to its last whole sentence, or hidden when none
 *    is left (the Bot's opening note and the live step line already say what is happening).
 * 2. DeepSeek's own tool-call markup ("<｜DSML｜invoke …>") arrives as plain text instead of a tool call. It is turned
 *    back into the real call, and the markup never reaches the chat.
 */
const DSML = /<｜DSML｜/;
const INVOKE = /<｜DSML｜invoke name="([^"]+)">([\s\S]*?)<\/｜DSML｜invoke>/g;
const PARAM = /<｜DSML｜parameter name="([^"]+)"(?:\s+string="(true|false)")?>([\s\S]*?)<\/｜DSML｜parameter>/g;

export function parseDsml(text: string): { before: string; calls: { name: string; args: Record<string, unknown> }[] } | null {
  const at = text.search(DSML);
  if (at < 0) return null;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  for (const m of text.matchAll(INVOKE)) {
    const args: Record<string, unknown> = {};
    for (const p of m[2].matchAll(PARAM)) {
      const raw = p[3];
      if (p[2] === 'true') { args[p[1]] = raw; continue; }
      try { args[p[1]] = JSON.parse(raw); } catch { args[p[1]] = raw; }
    }
    calls.push({ name: m[1], args });
  }
  return { before: text.slice(0, at).trim(), calls };
}

/** Ends like a finished sentence (or a list line, a link, an emoji, a code block). */
const WHOLE = /([.!?؟…)\]»"'`*]|\p{Extended_Pictographic}|\d)\s*$/u;
export function trimCutText(text: string): string {
  const t = text.trimEnd();
  if (!t || WHOLE.test(t)) return t;
  // Cut back to the last sentence end or line break.
  const m = /^[\s\S]*[.!?؟…\n]/.exec(t);
  return m ? m[0].trimEnd() : '';
}

/**
 * Mends one model response in place. `rows` are the chat rows of its message items, in order; `update` rewrites a
 * row's text (an empty text hides it). Returns the output to use.
 */
export function repairOutput(output: any[], rows: number[], update: (seq: number, text: string) => void): any[] {
  const out: any[] = [];
  let m = 0;
  const hasCall = output.some((o) => o?.type === 'function_call');
  for (const item of output) {
    if (item?.type !== 'message') { out.push(item); continue; }
    const seq = rows[m++];
    const text = (item.content ?? []).map((c: any) => c?.text ?? '').join('');
    const dsml = parseDsml(text);
    let fixed = text;
    const extra: any[] = [];
    if (dsml) {
      fixed = dsml.before;
      for (const c of dsml.calls) extra.push({ type: 'function_call', call_id: `call_${randomBytes(9).toString('hex')}`, name: c.name, arguments: JSON.stringify(c.args), status: 'completed' });
    }
    // Words right before a tool call are the ones the host cuts.
    if (hasCall || extra.length) fixed = trimCutText(fixed);
    if (fixed !== text) {
      if (seq !== undefined) update(seq, fixed);
      if (fixed) out.push({ ...item, content: [{ type: 'output_text', text: fixed, annotations: [] }] });
    } else out.push(item);
    out.push(...extra);
  }
  return out;
}
