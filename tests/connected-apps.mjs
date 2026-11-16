// Run with DB_PATH=:memory: node --env-file=.env tests/connected-apps.mjs.
import assert from 'node:assert/strict';
import { z } from 'zod';
import { appToolCall, functionSchemas, policyFor } from '../server/dist/agent/tools.js';
const wrap=(tool,args)=>({operation:'execute',tool,arguments:JSON.stringify(args)});
const user='test-local-owner';
assert.equal(policyFor(user,'connected_apps',{operation:'list_tools'}).decision,'allow');
assert.equal(policyFor(user,'connected_apps',wrap('COMPOSIO_SEARCH_TOOLS',{query:'gmail'})).decision,'allow');
const batch=(slug)=>wrap('COMPOSIO_MULTI_EXECUTE_TOOL',{tools:[{tool_slug:slug,arguments:{}}]});
assert.equal(policyFor(user,'connected_apps',batch('GMAIL_FETCH_EMAILS')).decision,'allow');
assert.equal(policyFor(user,'connected_apps',batch('GMAIL_SEND_EMAIL')).decision,'ask');
assert.equal(policyFor(user,'connected_apps',batch('GITHUB_CREATE_ISSUE')).decision,'ask');
assert.equal(policyFor(user,'connected_apps',batch('SLACK_SEND_MESSAGE')).decision,'ask');
assert.equal(policyFor(user,'connected_apps',wrap('COMPOSIO_REMOTE_BASH_TOOL',{command:'anything'})).decision,'ask');
assert.equal(policyFor(user,'connected_apps',wrap('COMPOSIO_MULTI_EXECUTE_TOOL',{tools:[]})).decision,'ask');
assert.throws(()=>appToolCall({operation:'execute',tool:'shell',arguments:'{}'}),/Invalid/);
assert.throws(()=>appToolCall(wrap('COMPOSIO_SEARCH_TOOLS',[])),/JSON object/);
for(const t of functionSchemas()) assert.ok((z.fromJSONSchema(t.parameters)).shape,`Claude schema: ${t.name}`);
console.log('PASS: app discovery, read/write approval routing, remote-code approval, malformed calls, Claude tool schemas');
