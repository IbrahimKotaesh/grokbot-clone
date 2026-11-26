// Image generation for every bot, through fal.ai: Z-Image Turbo (open source, photo-realistic, about $0.005 a 1-megapixel
// image). High quality is the same model at about 2.4 megapixels (about $0.012), and only when the owner asks for it in
// words ("جودة عالية", "high quality", "HD", "4K"…); the bot can't pick it on its own.
// The picture appears in the chat (and the Library when asked). Arabic lettering inside generated images comes out
// broken on every model, so for Arabic text the bot generates the picture clean and writes the text over it itself.
// Each plan has a monthly image allowance; a high-quality image counts as 2.
import { db, now } from '../db.js';
import { scopedGeneration } from '../lib/chat-scope.js';
import { publishAttachment } from '../attachments.js';
import { planOf, trialUntil, type PlanId } from '../plans.js';
import { runPy, type OfficeCtx } from './office-tools.js';

const MODEL = { path: 'fal-ai/z-image/turbo', name: 'Z-Image Turbo' };
const SIZES: Record<string, string> = { square: 'square_hd', portrait: 'portrait_4_3', landscape: 'landscape_16_9', story: 'portrait_16_9' };
const HQ_SIZES: Record<string, { width: number; height: number }> = {
  square: { width: 1536, height: 1536 }, portrait: { width: 1344, height: 1792 }, landscape: { width: 2048, height: 1152 }, story: { width: 1152, height: 2048 },
};
/** Words that mean the owner asked for high quality (Arabic, English, Dutch). */
const HQ_WORDS = /جود[ةه]\s*عالي[ةه]|عالي(?:ة|ه)?\s*الجود[ةه]|دق[ةه]\s*عالي[ةه]|high[\s-]*(?:quality|res(?:olution)?)|\bhd\b|\b4k\b|\b8k\b|hoge\s*(?:kwaliteit|resolutie)/i;
/** Image units per calendar month (a high-quality image is 2 units). null = no limit. */
const MONTHLY_UNITS: Record<PlanId, number | null> = { free: 0, starter: 100, pro: 500, max: 1500, ultra: 3000, enterprise: null };
const TRIAL_UNITS = 10;

db.exec('CREATE TABLE IF NOT EXISTS image_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, bot_id TEXT, model TEXT NOT NULL, units INTEGER NOT NULL, created_at INTEGER NOT NULL)');
db.exec('CREATE INDEX IF NOT EXISTS image_usage_user ON image_usage(user_id, created_at)');

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
function unitsUsed(userId: string) {
  return (db.prepare('SELECT COALESCE(SUM(units),0) AS n FROM image_usage WHERE user_id=? AND created_at>=?').get(userId, monthStart()) as { n: number }).n;
}
/** True when the owner's latest message in this chat asks for high quality in words. */
function ownerAskedForHq(botId: string): boolean {
  const gen = scopedGeneration(botId, (db.prepare('SELECT generation FROM bots WHERE id=?').get(botId) as { generation: number }).generation);
  const rows = db.prepare("SELECT body FROM rows WHERE bot_id=? AND generation=? AND kind='message' ORDER BY seq DESC LIMIT 12").all(botId, gen) as { body: string }[];
  for (const r of rows) {
    try { const b = JSON.parse(r.body); if (b.role === 'user') return HQ_WORDS.test(String(b.text ?? '')); } catch { /* skip */ }
  }
  return false;
}
function allowance(userId: string): number | null {
  return trialUntil(userId) ? TRIAL_UNITS : MONTHLY_UNITS[planOf(userId).id];
}

async function falGenerate(path: string, input: Record<string, unknown>) {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error('Image generation is not set up on this server yet.');
  const r = await fetch(`https://fal.run/${path}`, {
    method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    signal: AbortSignal.timeout(120_000),
  });
  const data: any = await r.json().catch(() => ({}));
  if (r.status === 403 && /balance|locked/i.test(String(data?.detail ?? ''))) throw new Error("Image generation is paused: Badr's image service has no credit right now. Tell the owner; it works again as soon as credit is added.");
  if (!r.ok) throw new Error(`The image service did not accept it: ${String(data?.detail ? JSON.stringify(data.detail) : r.status).slice(0, 200)}`);
  return data;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const IMAGE_TOOLS = [
  {
    name: 'generate_image',
    description: 'Create a new image from a description (an illustration, a photo-like scene, a poster background, a product shot). It appears in this chat. Write the prompt in English, concrete and visual (subject, setting, style, light, framing, "photo" or "illustration"). Never put Arabic text in the prompt: generate the picture without text and add Arabic lettering yourself afterwards (save_to_library, then compose it with code). Set quality "high" only when the owner asked for high quality in words; otherwise leave it out. Never for sexual or nude content, real people in compromising or fake situations, or logos/trademarks used deceptively.',
    parameters: obj({
      prompt: { type: 'string', description: 'What the image shows, in English.' },
      size: { type: 'string', enum: ['square', 'portrait', 'landscape', 'story'], description: 'square 1:1 (default), portrait 3:4 (Instagram post), landscape 16:9, story 9:16.' },
      quality: { type: 'string', enum: ['normal', 'high'], description: 'normal (default). high only if the owner asked for high quality.' },
      save_to_library: { type: 'boolean', description: 'Also save it in your Library (images/…) so you can edit it, add text or reuse it.' },
      file_name: { type: 'string', description: 'Name for the saved file, without extension.' },
    }, ['prompt']),
    activity: 'working',
    label: 'Generating an image',
    impl: async (a: any, ctx: OfficeCtx) => {
      const prompt = String(a.prompt ?? '').trim();
      if (!prompt) throw new Error('Describe the image in "prompt".');
      // High quality costs more, so it only happens when the owner's own words ask for it.
      const hq = (a.quality === 'high' || a.quality === 'best') && ownerAskedForHq(ctx.botId);
      const units = hq ? 2 : 1;
      const limit = allowance(ctx.userId), used = unitsUsed(ctx.userId);
      if (limit !== null && used + units > limit)
        throw new Error(limit === 0 ? 'Image generation is part of every plan; the owner needs a plan first.' : `This month's image allowance is used up (${used} of ${limit}). It resets on the 1st; a bigger plan has more.${hq ? ' A normal-quality image may still fit.' : ''}`);
      const size = String(a.size ?? 'square');
      const data = await falGenerate(MODEL.path, { prompt, image_size: hq ? (HQ_SIZES[size] ?? HQ_SIZES.square) : (SIZES[size] ?? 'square_hd'), num_images: 1, enable_safety_checker: true, output_format: 'jpeg' });
      if (Array.isArray(data?.has_nsfw_concepts) && data.has_nsfw_concepts.some(Boolean)) throw new Error('The image was blocked by the safety filter. Do not try to get around it.');
      const url = data?.images?.[0]?.url;
      if (!url) throw new Error('The image service returned no image. Try again with a clearer prompt.');
      const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const bytes = Buffer.from(await img.arrayBuffer());
      if (!img.ok || bytes.length < 100) throw new Error('Could not download the generated image.');
      db.prepare('INSERT INTO image_usage(user_id,bot_id,model,units,created_at) VALUES (?,?,?,?,?)').run(ctx.userId, ctx.botId, MODEL.path + (hq ? ':hq' : ''), units, now());
      const safe = String(a.file_name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 60) || `image-${Date.now()}`;
      publishAttachment(ctx.userId, ctx.botId, `${safe}.jpg`, bytes);
      let saved = '';
      if (a.save_to_library) {
        const r = await runPy(ctx, String.raw`
(ROOT / "images").mkdir(parents=True, exist_ok=True)
p = ROOT / "images" / A["name"]
p.write_bytes(base64.b64decode(A["b64"]))
done(path=str(p))
`, { name: `${safe}.jpg`, b64: bytes.toString('base64') });
        saved = `\nSaved in your Library: ${r.path}`;
      }
      const left = limit === null ? '' : ` · ${limit - used - units} of ${limit} image units left this month`;
      return { output: `Image created${hq ? ' in high quality' : ''} and shown in the chat.${saved}${left}`, summary: hq ? 'Image · high quality' : 'Image' };
    },
  },
];
export const IMAGE_SAFE = ['generate_image'];
