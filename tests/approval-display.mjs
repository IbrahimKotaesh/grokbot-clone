import assert from 'node:assert/strict';
import {build} from 'esbuild';import fs from 'node:fs/promises';
const output=new URL('../data/verification/approval-render-test.mjs',import.meta.url);await fs.mkdir(new URL('.',output),{recursive:true});
await build({stdin:{contents:"export {ApprovalCard} from './web/src/components/cards/Cards.tsx';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime','react-dom'],outfile:output.pathname});
try{
 globalThis.window={matchMedia:()=>({matches:false})};
 const {createElement:h}=await import('react'),{renderToStaticMarkup:render}=await import('react-dom/server'),{ApprovalCard}=await import(output.href);
 const body={type:'card',card:'approval',approvalId:'test',title:'Review action',tool:'shell',args:{command:'python -c "print(1)"'},status:'pending'};
 const fresh=render(h(ApprovalCard,{body:{...body,requiresFreshApproval:true}}));
 assert.ok(!fresh.includes('Always allow'));assert.ok(fresh.includes('Allow once'));assert.ok(fresh.includes('including in Autonomous mode'));
 assert.ok(render(h(ApprovalCard,{body})).includes('Always allow'),'Ordinary action grants are preserved');
 console.log('PASS: critical approval UI has Allow once, no permanent-grant button; ordinary approval UI unchanged');
}finally{delete globalThis.window;await fs.unlink(output);}
