// Scanned PDFs have no text layer. OpenRouter's file parser runs Mistral OCR on the pages
// (about $0.002 a page) and a cheap model returns the transcription as plain text.
import { hostedKey, hostedProviderPrefs } from './hosted-models.js';

const OCR_MODEL = process.env.OR_OCR_MODEL ?? 'deepseek/deepseek-v4.1-flash';
const OCR_ENGINE = process.env.OR_OCR_ENGINE ?? 'mistral-ocr';

/** Plain text of a scanned PDF, or '' when OCR isn't available on this server. */
export async function ocrPdf(data: Buffer, name: string): Promise<string> {
  const key = hostedKey();
  if (!key) return '';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OCR_MODEL,
      provider: hostedProviderPrefs(),
      max_tokens: 16_000,
      plugins: [{ id: 'file-parser', pdf: { engine: OCR_ENGINE } }],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe this document as plain text, page by page. Start each page with [Page N]. Keep the original language, keep tables as rows with | between cells, and do not summarize, translate or add anything.',
            },
            { type: 'file', file: { filename: name.replace(/[^\w.\- ]/g, '_') || 'document.pdf', file_data: `data:application/pdf;base64,${data.toString('base64')}` } },
          ],
        },
      ],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } };
  if (!res.ok) throw new Error(`Could not read the scanned PDF: ${body.error?.message ?? res.status}`);
  const text = String(body.choices?.[0]?.message?.content ?? '').trim();
  console.log(`[ocr] ${name}: ${text.length} chars${typeof body.usage?.cost === 'number' ? `, cost=${body.usage.cost.toFixed(4)}` : ''}`);
  return text;
}

/** True when pypdf found no real text (only the [Page N] markers it adds). */
export const hasNoText = (text: string) => !text.replace(/\[Page \d+\]/g, '').trim();
