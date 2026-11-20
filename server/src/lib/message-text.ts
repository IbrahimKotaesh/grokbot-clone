/** Placeholder dots are not a useful assistant message. Preserve prose and attachments. */
export const isSilentPlaceholder = (text: string) => /^[.\u2026\u00b7•\s\u200e\u200f]+$/u.test(text);

import type {Row} from '../types.js';
/** Hide the log of a completed, explicitly quiet check; preserve useful replies and errors. */
export function visibleTranscriptRows(rows:Row[]):Row[]{
 const result:Row[]=[];let batch:Row[]=[];
 const flush=()=>{
  const routine=batch[0]?.body.type==='event'&&batch[0].body.event==='routine-run';
  const quiet=batch.some(({body:b})=>b.type==='tool-call'&&b.name==='stay_silent'&&b.status==='done'||b.type==='message'&&b.role==='assistant'&&!b.streaming&&isSilentPlaceholder(b.text));
  const useful=batch.some(({body:b})=>b.type==='message'&&b.role==='assistant'&&(Boolean(b.text.trim())&&!isSilentPlaceholder(b.text)||!!b.images?.length||!!b.files?.length)||b.type==='card'||b.type==='notice'||b.type==='tool-call'&&b.status==='error');
  if(!routine||!quiet||useful)result.push(...batch);batch=[];
 };
 for(const row of rows){if(row.body.type==='event'&&row.body.event==='routine-run'||row.body.type==='message'&&row.body.role==='user')flush();batch.push(row);}flush();return result;
}
