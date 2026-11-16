import assert from 'node:assert/strict';
process.env.COMPOSIO_API_KEY='test-only';
const {composio}=await import('../server/dist/composio.js');
const {sheetPreview}=await import('../server/dist/sheets.js');
let owner='',calls=0,failure=0;
composio.connectedAccounts.list=async a=>{owner=a.userIds[0];return {items:owner==='unconnected'?[]:[{id:`connection-${owner}`,toolkit:{slug:'googlesheets'},status:'ACTIVE'}]};};
composio.tools.proxyExecute=async a=>{
  calls++;assert.equal(a.method,'GET');assert.equal(a.connectedAccountId,`connection-${a.userId}`);assert.ok(a.endpoint.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'));
  if(failure)return {status:failure,data:{error:{code:failure}}};
  if(a.endpoint.includes('/values/'))return {status:200,data:{values:[['Vendor','Amount'],['Example','€20'],['<script>literal</script>','Text']]}};
  return {status:200,data:{properties:{title:'Private tracker'},sheets:[{properties:{title:'Sheet1'}},{properties:{title:"Owner's tab"}}]}};
};
const id='12345678901234567890';
await assert.rejects(()=>sheetPreview('owner','https://evil.example'),/Invalid/);
await assert.rejects(()=>sheetPreview('unconnected',id),/Connect Google Sheets/);
const [first,duplicate]=await Promise.all([sheetPreview('owner',id),sheetPreview('owner',id)]);
assert.equal(first.title,'Private tracker');assert.equal(first.rows[1][1],'€20');assert.deepEqual(first,duplicate);assert.equal(calls,2,'Concurrent requests coalesce');
await sheetPreview('owner',id);assert.equal(calls,2,'Owner cache limits Google requests');
await sheetPreview('other',id);assert.equal(calls,4,'Caches are isolated by owner');
await sheetPreview('owner',id,"Owner's tab");assert.equal(calls,6);
await assert.rejects(()=>sheetPreview('owner',id,'Missing'),/worksheet was not found/);
for(const [status,message]of [[429,/limiting requests/],[403,/cannot read/],[404,/not found/]]){failure=status;await assert.rejects(()=>sheetPreview(`user-${status}`,id),message);}
console.log('PASS: owner-scoped private preview, fixed read-only endpoints, cache/coalescing, tabs and clear quota/access errors');
