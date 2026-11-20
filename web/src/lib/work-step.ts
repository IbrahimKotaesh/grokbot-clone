import type {ToolCallBody} from '@shared/types';
/** Show destinations only from explicit URL arguments, never command text or secrets. */
export function stepDestination(call:ToolCallBody):{host:string;icon:string}|null{
 const args=call.args;if(!args||typeof args!=='object')return null;
 for(const [key,value] of Object.entries(args)){
  if(!/^(url|website|target_url|start_url)$/i.test(key)||typeof value!=='string')continue;
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)continue;return {host:u.hostname.replace(/^www\./,''),icon:`${u.origin}/favicon.ico`};}catch{/* no URL */}
 }
 return null;
}
export function stepTitle(call:ToolCallBody):string{
 const destination=stepDestination(call);
 if(destination)return `${call.status==='done'?'Visited':'Opening'} ${destination.host}`;
 const name=call.name.toLowerCase();
 if(/shell|exec|command/.test(name))return 'Running a command';
 if(/search/.test(name))return 'Searching for information';
 if(/read_file/.test(name))return 'Reading a document';
 if(/attach_file/.test(name))return 'Sharing a file in chat';
 return call.label;
}
