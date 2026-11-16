// Run as the existing app user, using its official Claude subscription login.
// Synthetic examples only; no bot conversations or native sessions are modified.
import assert from 'node:assert/strict';
import {curateMemories} from '../server/dist/agent/memory-curator.js';
const cases=[
 ['arabic','لما تكتبلي محتوى، دائمًا اكتب باللهجة الشامية وبلا مقدمات طويلة.',true],
 ['english','I always prefer brief replies in English. My name is Sam.',true],
 ['question','شو الطقس بكرا في أمستردام؟',false],
 ['hypothetical','مثال خيالي للتجربة فقط: شخص اسمه رامي يحب السفر. هذا ليس اسمي ولا تفضيلي.',false],
 ['correction','غيرت تفضيلي: من الآن بدي المقالات بالعربية الفصحى بدل اللهجة الشامية.',true],
];
for(const [name,text,want] of cases){
 const start=Date.now(),result=await curateMemories([{seq:7,text}],name==='correction'?[{id:'old',text:'دائمًا اكتب باللهجة الشامية'}]:[]);
 assert.equal(Boolean(result.facts.length),want,name);assert.ok(result.facts.every(f=>f.seq===7&&text.includes(f.evidence)),`${name}: grounded exact quotes`);
 if(name==='correction')assert.equal(result.facts[0].replaces,'old');
 console.log(JSON.stringify({case:name,seconds:(Date.now()-start)/1000,pass:true}));
}
