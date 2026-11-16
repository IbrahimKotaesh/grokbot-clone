import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
const {code}=await transform(fs.readFileSync('web/src/lib/smooth-text.ts','utf8'),{loader:'ts',format:'cjs'});
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
