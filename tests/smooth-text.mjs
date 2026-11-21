import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transformSync} from 'esbuild';
const {code}=transformSync(fs.readFileSync('web/src/lib/smooth-text.ts','utf8'),{loader:'ts',format:'cjs'});
const context={module:{exports:{}},require:createRequire(import.meta.url),Intl};vm.runInNewContext(code,context);
const {revealNext}=context.module.exports;
for(const target of ['مرحبا بِك يا إبراهيم 👨‍👩‍👧‍👦','A smooth English response with **formatting**']) {
 let shown='',steps=0;
 const boundaries=new Set([0,...[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(target)].map(s=>s.index+s.segment.length)]);
 while(shown!==target&&steps++<1000){const next=revealNext(shown,target);assert.ok(target.startsWith(next));assert.ok(next.length>shown.length);assert.ok(boundaries.has(next.length),'Never split a grapheme');shown=next;}
 assert.equal(shown,target);assert.ok(steps>1,'Provider chunks should reveal gradually');
}
assert.equal(revealNext('Old partial','Corrected final answer'),'Corrected final answer');
assert.equal(revealNext('Done','Done'),'Done');
console.log('PASS: gradual monotonic text, Arabic marks/emoji integrity, canonical corrections and completion');

const long='a'.repeat(10000);assert.equal(revealNext('',long),'aa','Large backlogs do not accelerate display');
// Exercise the hook's clock while chunks arrive faster than animation frames.
const slots=[],deps=[],effects=[];let cursor=0,clock=0,nextId=0;const raf=new Map();
const react={
 useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
 useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>{slots[i]=v;}];},
 useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn);}}
};
const animation={module:{exports:{}},require:n=>n==='react'?react:createRequire(import.meta.url)(n),Intl,window:{matchMedia:()=>({matches:false})},requestAnimationFrame:fn=>{raf.set(++nextId,fn);return nextId;},cancelAnimationFrame:id=>raf.delete(id)};
vm.runInNewContext(code,animation);
const render=(text,streaming)=>{cursor=0;animation.module.exports.useSmoothText(text,streaming);while(effects.length)effects.shift()();};
const frame=(ms)=>{clock+=ms;const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn(clock));};
render('a'.repeat(1000),true);frame(16);
for(let i=0;i<10;i++){render('a'.repeat(1000+i),true);frame(1);}
assert.equal(slots[0],'','Fast incoming chunks must not reset the clock or immediately reveal text');
frame(22);assert.equal(slots[0],'aa');
render('a'.repeat(1010),false);frame(32);assert.equal(slots[0],'aaaa','Completion must continue gradual reveal');
frame(5000);assert.equal(slots[0],'aaaaaa','A paused tab must not jump a whole backlog on resume');
console.log('PASS: stable streaming clock, fast chunks, final drain and bounded background-tab catch-up');
