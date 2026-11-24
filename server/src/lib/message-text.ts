// Empty markup some models send when they have nothing to say ("<br>", "&nbsp;", an empty paragraph).
const EMPTY_MARKUP = /<br\s*\/?>|<\/?(?:p|div|span)\s*>|&nbsp;/gi;
/** Placeholder dots or empty markup are not a useful assistant message. Preserve prose and attachments. */
export const isSilentPlaceholder = (text: string) => text.length > 0 && /^[.\u2026\u00b7•\s\u200e\u200f]*$/u.test(text.replace(EMPTY_MARKUP, ''));

/** A scheduled check that found nothing ("No new emails.", "ما في شي جديد"): not worth a message. */
export const isNothingToReport = (text: string) => {
  const t = text.replace(EMPTY_MARKUP, ' ').replace(/[*_`#>]/g, '').trim();
  // One short sentence only: "No new emails, but an invoice arrived" is a finding, not nothing.
  if (!t || t.length > 90 || /\b(?:but|however|except|although|though)\b|لكن|بس |إلا|غير /iu.test(t) || (t.match(/[.!?؟]\s+\S/g)?.length ?? 0) > 0) return false;
  return /^(?:no (?:new|important|urgent|unread|relevant)\b|nothing (?:new|important|urgent|to report)|all (?:clear|quiet)\b|no updates?\b|لا (?:يوجد|جديد|شي)|ما (?:في|فيه|عندي) (?:شي|اشي|إشي|أي|جديد|ايميل|إيميل|رسائل))/iu.test(t);
};

import type {Row} from '../types.js';
/** Hide the log of a completed, explicitly quiet check; preserve useful replies and errors. */
export function visibleTranscriptRows(rows:Row[]):Row[]{
 const result:Row[]=[];let batch:Row[]=[];
 const flush=()=>{
  const routine=batch[0]?.body.type==='event'&&batch[0].body.event==='routine-run';
  const quiet=batch.some(({body:b})=>b.type==='tool-call'&&b.name==='stay_silent'&&b.status==='done'||b.type==='message'&&b.role==='assistant'&&!b.streaming&&(!b.text.trim()||isSilentPlaceholder(b.text)||isNothingToReport(b.text)));
  // A finished run that never replied at all (only its steps) is quiet too.
  const replied=batch.some(({body:b})=>b.type==='message'&&b.role==='assistant');
  const busy=batch.some(({body:b})=>b.type==='tool-call'&&(b.status==='running'||b.status==='awaiting-approval'));
  const silent=quiet||(!replied&&!busy&&batch.length>1);
  const useful=batch.some(({body:b})=>b.type==='message'&&b.role==='assistant'&&(Boolean(b.text.trim())&&!isSilentPlaceholder(b.text)&&!isNothingToReport(b.text)||!!b.images?.length||!!b.files?.length)||b.type==='card'||b.type==='notice'||b.type==='tool-call'&&b.status==='error');
  if(!routine||!silent||useful)result.push(...batch);batch=[];
 };
 for(const row of rows){if(row.body.replaced)continue;if(row.body.type==='event'&&row.body.event==='routine-run'||row.body.type==='message'&&row.body.role==='user')flush();batch.push(row);}flush();return result;
}
