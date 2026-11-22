import {isReadOnlySlug} from '../composio.js';
const SAFE_READS=new Set(['team_updates','read_page','update_plan','report_suspicious_content','recall','search_conversation','read_file','view_photo','computer_screenshot','list_routines','list_event_triggers','list_subagents','ask_user','stay_silent','notify_user','COMPOSIO_SEARCH_TOOLS','COMPOSIO_GET_TOOL_SCHEMAS','COMPOSIO_WAIT_FOR_CONNECTIONS']);
/** A positive, intentionally small list. Scripts/expansions/operators are never inferred safe. */
export function plainReadCommand(command:unknown):boolean{
 return typeof command==='string'&&/^(?:pwd|whoami|date(?:[ \t]+-u)?|uname(?:[ \t]+-[A-Za-z]+)?|ls(?:[ \t]+[A-Za-z0-9_./-]+)*)[ \t]*$/.test(command.trim());
}
export function freshApprovalReason(name:string,args:any,quarantined=false):string|undefined{
 if(name==='COMPOSIO_MULTI_EXECUTE_TOOL'){
  const items=args?.tools??args?.tool_calls??args?.actions;
  if(!Array.isArray(items)||!items.length)return 'Review an unrecognized connected-app batch.';
  for(const call of items){const reason=freshApprovalReason(String(call.tool_slug??call.slug??call.name??call.tool??''),call.arguments??call.args??{},quarantined);if(reason)return reason;}
  return;
 }
 if(name==='shell'){
  if(!plainReadCommand(args?.command))return 'It runs on the bot\'s computer and could change files or reach the internet, so it needs your OK each time.';
  return;
 }
 if(name.startsWith('COMPOSIO_')&&!SAFE_READS.has(name))return 'It acts in one of your connected apps, so it needs your OK each time.';
 if(/(?:EXECUTE|BASH|SHELL|PYTHON|CODEINTERPRETER|SANDBOX|SECRET|CREDENTIAL|ACCESS_TOKEN|PRIVATE_KEY|WEBHOOK|PERMISSION|FIREWALL|SSH|DEPLOY|WORKFLOW|IAM|KUBERNETES|DOCKER|HETZNER|DIGITALOCEAN|AWS_|AZURE_)/i.test(name))return 'Infrastructure, credentials and access changes require approval for this exact request.';
 const safe=SAFE_READS.has(name)||(name==='shell'&&plainReadCommand(args?.command))||(name==='connected_apps'&&args?.operation==='list_tools')||(!['connected_apps','shell'].includes(name)&&isReadOnlySlug(name));
 if(quarantined&&!safe)return 'Suspicious external instructions were detected in this conversation. Review this change before it runs.';
 return;
}
