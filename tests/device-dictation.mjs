import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source=fs.readFileSync(new URL('../web/src/voice/dictation.ts',import.meta.url),'utf8').replace(/import .* from 'react';/, 'const { useCallback, useEffect, useRef, useState } = React;');
const {code}=await transform(source,{loader:'ts',format:'cjs'});
let current,cleanup,received=[],errors=[],timers=new Set();
class Recognition {
  constructor(){current=this;}
  start(){this.started=true;}
  stop(){this.stopped=true;this.onend?.();}
  abort(){this.aborted=true;}
}
const context={module:{exports:{}},React:{useCallback:f=>f,useEffect:f=>{cleanup=f();},useRef:v=>({current:v}),useState:v=>[v,()=>{}]},window:{SpeechRecognition:Recognition,addEventListener(){},removeEventListener(){}},navigator:{language:'en-US'},setTimeout:f=>{timers.add(f);return f;},clearTimeout:f=>timers.delete(f)};
vm.runInNewContext(code,context);
const hook=context.module.exports.useDictation;
const voice=hook(t=>received.push(t),e=>errors.push(e),'auto');
voice.toggle(); assert.equal(current.lang,'en-US'); assert.equal(current.started,true);
current.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'partial'}}]});assert.equal(received.length,0);
current.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'Hello مرحبا'}}]});assert.deepEqual(received,['Hello مرحبا']);
voice.toggle();assert.equal(current.stopped,true);assert.equal(timers.size,0);
voice.toggle();const old=current;const late=old.onresult;cleanup();assert.equal(old.aborted,true);
late({resultIndex:0,results:[{isFinal:true,0:{transcript:'stale'}}]});assert.equal(received.length,1);
context.window.SpeechRecognition=undefined;
hook(()=>{},e=>errors.push(e)).toggle();assert.match(errors.at(-1),/phone.*keyboard/);
console.log('PASS: device language, final-only dictation, stop, cleanup, stale callbacks and keyboard fallback');
