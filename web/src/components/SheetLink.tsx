import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Table2, ExternalLink, X } from 'lucide-react';

export function sheetId(href?:string){
  try {const u=new URL(href??'');return u.protocol==='https:'&&u.hostname==='docs.google.com'?u.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,150})(?:\/|$)/)?.[1]:undefined;}catch{return undefined;}
}
interface Preview {title:string;tabs:string[];tab:string;rows:string[][];truncated:boolean;}
function PreviewDialog({href,onClose}:{href:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState(''),[tab,setTab]=useState(''),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    const ctrl=new AbortController();setLoading(true);setError('');
    void fetch(`/api/sheets/${sheetId(href)}/preview${tab?`?tab=${encodeURIComponent(tab)}`:''}`,{credentials:'include',signal:ctrl.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error??'Preview unavailable.');return body as Preview;}).then(setData).catch(e=>{if(!ctrl.signal.aborted)setError(e.message);}).finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return()=>ctrl.abort();
  },[href,tab,retry]);
  return createPortal(<dialog ref={dialog} className="sheet-preview" aria-label="Google Sheets preview" onCancel={onClose}>
    <header><Table2 size={20}/><strong dir="auto">{data?.title??'Google Sheet'}</strong><button type="button" onClick={onClose} aria-label="Close sheet preview"><X size={20}/></button></header>
    <div className="sheet-preview__tools"><span>Private preview · your connected Google Sheets account</span><a href={href} target="_blank" rel="noreferrer noopener">Open in Google <ExternalLink size={13}/></a></div>
    {data&&<label className="sheet-preview__tabs">Worksheet <select value={tab||data.tab} onChange={e=>setTab(e.target.value)}>{data.tabs.map(t=><option key={t}>{t}</option>)}</select></label>}
    {loading?<p role="status">Loading sheet…</p>:error?<div role="alert"><p>{error}</p><button type="button" className="sheet-preview__retry" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>:data&&<>
      <div className="sheet-preview__grid"><table><tbody>{data.rows.map((row,i)=><tr key={i}><th>{i+1}</th>{row.map((cell,j)=><td dir="auto" key={j}>{cell}</td>)}</tr>)}</tbody></table>{!data.rows.length&&<p>This worksheet is empty.</p>}</div>
      <small>{data.truncated?'Preview limited to 100 rows and 20 columns. ':''}Read-only preview. Open in Google to edit; Google may ask you to sign in in this browser.</small>
    </>}
  </dialog>,document.body);
}
export function SheetLink({href,children}:{href:string;children:ReactNode}){
  const [open,setOpen]=useState(false);
  return <span className="sheet-link"><button type="button" onClick={()=>setOpen(true)} title="Preview using your connected Google account"><Table2 size={15}/><span>{children}</span></button><a href={href} target="_blank" rel="noreferrer noopener" aria-label="Open sheet in Google" title="Open in Google"><ExternalLink size={13}/></a>{open&&<PreviewDialog href={href} onClose={()=>setOpen(false)}/>}</span>;
}
