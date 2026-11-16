import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source=fs.readFileSync(new URL('../web/src/voice/dictation.ts',import.meta.url),'utf8').replace(/import .* from 'react';/, 'const { useCallback, useEffect, useRef, useState } = React;');
const {code}=await transform(source,{loader:'ts',format:'cjs'});
let current,cleanup,received=[],errors=[],states=[],timers=new Map();
class Recognition {
 constructor(){current=this;}
 start(){this.started=true;}
 stop(){this.stopped=true;this.onend?.();}
 abort(){this.aborted=true;}
}
const context={module:{exports:{}},React:{useCallback:f=>f,useEffect:f=>{cleanup=f();},useRef:v=>({current:v}),useState:v=>[v,x=>states.push(x)]},window:{SpeechRecognition:Recognition,addEventListener(){},removeEventListener(){}},navigator:{language:'en-US'},setTimeout:(f,ms)=>{timers.set(f,ms);return f;},clearTimeout:f=>timers.delete(f)};
vm.runInNewContext(code,context);
const hook=context.module.exports.useDictation;
const voice=hook(t=>received.push(t),e=>errors.push(e),'ar-SA');
voice.toggle();assert.equal(current.lang,'ar-SA','Arabic must override the English browser language');assert.ok(states.includes('starting'));assert.ok(!states.includes('recording'),'Do not say listening before recognition starts');
current.onstart();assert.ok(states.includes('recording'));
current.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'مرحبا'}}]});assert.equal(received.length,0);
current.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'مرحبا إبراهيم'}}]});assert.deepEqual(received,['مرحبا إبراهيم']);
voice.toggle();assert.equal(current.stopped,true);assert.equal(timers.size,0);
voice.toggle();const old=current;const late=old.onresult;cleanup();assert.equal(old.aborted,true);
late({resultIndex:0,results:[{isFinal:true,0:{transcript:'stale'}}]});assert.equal(received.length,1);
// Preserve a browser's last interim result if it ends without a final result.
const next=hook(t=>received.push(t),e=>errors.push(e),'en-US');next.toggle();assert.equal(current.lang,'en-US');current.onstart();current.onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'last words'}}]});current.onend();assert.equal(received.at(-1),'last words');assert.equal(timers.size,0);
// A microphone that never starts must leave Starting and provide a usable fallback.
next.toggle();[...timers.keys()][0]();assert.equal(current.aborted,true);assert.match(errors.at(-1),/microphone did not start/);assert.equal(timers.size,0);
next.toggle();current.onerror({error:'not-allowed'});assert.match(errors.at(-1),/Allow microphone/);assert.equal(timers.size,0);
context.window.SpeechRecognition=undefined;hook(()=>{},e=>errors.push(e),'ar-SA').toggle();assert.match(errors.at(-1),/keyboard.*Arabic/);
console.log('PASS: Arabic/English selection, actual-start status, final/interim text, cancellation, startup timeout, denied permission and keyboard fallback');
