import { composio, connectionsDetail } from './composio.js';

export class SheetError extends Error { constructor(message:string,public status:number){super(message);} }
export interface SheetPreview {title:string;tabs:string[];tab:string;rows:string[][];truncated:boolean;}
const cache=new Map<string,{at:number;value:SheetPreview}>();
const pending=new Map<string,Promise<SheetPreview>>();
/** Fixed Google endpoint, existing owner-scoped connection, bounded preview. Never publishes a sheet. */
export async function sheetPreview(userId:string,id:string,tab?:string):Promise<SheetPreview>{
  if(!/^[a-zA-Z0-9_-]{20,150}$/.test(id)|| (tab?.length??0)>100) throw new SheetError('Invalid spreadsheet.',400);
  const key=JSON.stringify([userId,id,tab??'']);
  const cached=cache.get(key);if(cached&&Date.now()-cached.at<45_000)return cached.value;
  const existing=pending.get(key);if(existing)return existing;
  const request=(async()=>{
    const connection=(await connectionsDetail(userId)).find((c:{toolkit:string;status:string})=>c.toolkit==='googlesheets'&&c.status==='ACTIVE');
    if(!connection)throw new SheetError('Connect Google Sheets in Apps to preview this sheet.',409);
    const read=async(path:string)=>{
      const response:any=await composio.tools.proxyExecute({endpoint:`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`,method:'GET',connectedAccountId:connection.id,userId} as any);
      const data=response?.data??response;
      const status=Number(response?.status??data?.error?.code??200);
      if(status===429)throw new SheetError('Google Sheets is temporarily limiting requests. Try again in a minute.',429);
      if(status===401||status===403)throw new SheetError('The connected Google account cannot read this sheet. Check its access or reconnect Google Sheets in Apps.',403);
      if(status===404)throw new SheetError('This sheet was not found for the connected Google account.',404);
      if(status>=400||data?.error)throw new SheetError('Google Sheets could not load this preview. Try again shortly.',502);
      return data;
    };
    const meta=await read('?fields=properties(title),sheets(properties(title))');
    const tabs:string[]=(meta.sheets??[]).map((s:any)=>s.properties?.title).filter((t:any)=>typeof t==='string');
    const selected=tab??tabs[0];if(!selected||!tabs.includes(selected))throw new SheetError('This worksheet was not found.',404);
    const range=`'${selected.replaceAll("'","''")}'!A1:T100`;
    const values=await read(`/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
    const rows=(values.values??[]).slice(0,100).map((r:any[])=>r.slice(0,20).map(v=>String(v).slice(0,4000)));
    const value={title:String(meta.properties?.title??'Google Sheet'),tabs,tab:selected,rows,truncated:rows.length===100||rows.some((r:string[])=>r.length===20)};
    if(cache.size>=100)cache.delete(cache.keys().next().value!);
    cache.set(key,{at:Date.now(),value});return value;
  })();
  pending.set(key,request);try{return await request;}finally{pending.delete(key);}
}
