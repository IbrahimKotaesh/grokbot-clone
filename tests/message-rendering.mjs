import assert from 'node:assert/strict';
import { build } from './lib/bundle.mjs';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const output=new URL('../data/verification/render-test.mjs',import.meta.url);
await fs.mkdir(new URL('../data/verification/',import.meta.url),{recursive:true});
await build({stdin:{contents:"export { Markdown } from './web/src/components/Markdown.tsx'; export {botVars,BOT_COLORS} from './web/src/lib/colors.ts'; export {BUBBLE} from './packages/contracts/src/characters.ts';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime','react-dom','lucide-react'],outfile:output.pathname});
try {
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {Markdown,botVars,BOT_COLORS,BUBBLE}=await import(pathToFileURL(output.pathname));
 const render=text=>renderToStaticMarkup(createElement(Markdown,{text}));
 const marker='\uE200cite\uE202turn550136view2\uE201';
 const actual=render(`مرحبا **بالعربي**. ${marker}\n\n> اقتباس عربي\n\n1. One\n2. اثنان\n\n[Official source](https://example.com/report)`);
 assert.ok(!actual.includes('turn550136view2'));assert.ok(!actual.includes('\uE200'));
 assert.match(actual,/Some source links are unavailable/);assert.match(actual,/<strong>بالعربي<\/strong>/);
 assert.match(actual,/href="https:\/\/example.com\/report"/);assert.match(actual,/<blockquote>/);assert.match(actual,/<ol>/);assert.match(render('- **Sheet1:** 81 إيصال'),/<li dir="auto">/);assert.match(render('[Tracker](https://docs.google.com/spreadsheets/d/12345678901234567890/edit)'),/Preview using your connected Google account/);assert.match(actual,/dir="auto"/);
 assert.ok(!render('Partial \uE200ci').includes('\uE200'));
 assert.ok(!render('Text \uE200cite\uE202turn123view0').includes('turn123view0'));
 const literal=render('`'+marker+'`');assert.ok(literal.includes('turn550136view2'),'Code samples stay literal');
 assert.ok(!literal.includes('Some source links are unavailable'));
 assert.match(render('المقدمة: 0:00–0:30 ثم موسم 2025–26'), /<bdi dir="ltr" class="md__number">0:00–0:30<\/bdi>/);
 assert.match(render('موسم 2025–26'), /<bdi dir="ltr" class="md__number">2025–26<\/bdi>/);
 assert.match(render('المجموع **€365,62** و ٣٠٠٫٩٠ €'),/<bdi dir="ltr" class="md__number">€365,62<\/bdi>/);
 const plain=render('English and عربي with [source](https://example.com)');assert.ok(!plain.includes('Some source links are unavailable'));
 const remoteImage=render('![Report](https://example.com/collect?secret=test-only)');assert.ok(!remoteImage.includes('<img'),'External images must not generate automatic requests');assert.match(remoteImage,/Open external image/);
 assert.match(render('![Generated](/api/bots/bot_test/images/img_test)'),/<img/,'Local chat images stay inline');
 for(const [color,palette] of Object.entries(BOT_COLORS)){
  // Your bubble wears the bot's own hue (shared BUBBLE palette); its text color must stay readable on it.
  const vars=botVars(color);assert.equal(vars['--bot-reply-bg'],palette.fill,'Bot bubbles use a solid pigment');assert.equal(vars['--bot-bubble'],BUBBLE[color].bg);assert.equal(vars['--bot-on-bubble'],BUBBLE[color].ink);
  const lum=hex=>{const c=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const [a,b]=[lum(vars['--bot-bubble']),lum(vars['--bot-on-bubble'])].sort((x,y)=>y-x);assert.ok((a+.05)/(b+.05)>=4,`Readable contrast for ${color}`);
 }
 const chart={type:'bar',title:'مبيعات الشهر',labels:['يناير','فبراير'],series:[{name:'Revenue',values:[10,-20]}],unit:'USD'};
 const chartText=c=>'```fino-chart\n'+JSON.stringify(c)+'\n```';
 for(const type of ['bar','line','pie']){
  const output=render(chartText({...chart,type,series:[{name:'Revenue',values:[10,20]}]}));
  assert.match(output,/<figure class="chat-chart"/);assert.match(output,/<svg/);assert.match(output,/View data/);assert.ok(!output.includes('<pre'),'Chart renders as a visual, not a code block');assert.ok(!output.includes('language-fino-chart'));
 }
 assert.match(render(chartText(chart)),/<rect/,'Negative values render in a bar chart');
 assert.ok(!render(chartText({...chart,type:'pie'})).includes('<svg'),'Negative pie values rejected');
 assert.ok(!render(chartText({...chart,labels:['x']})).includes('<svg'),'Mismatched arrays rejected');
 assert.ok(!render(chartText({...chart,series:[{name:'x',values:[1e20,2]}]})).includes('<svg'),'Oversized values rejected');
 assert.ok(!render(chartText({...chart,title:'<script>alert(1)</script>'})).includes('<script>'),'Labels are escaped, never executable');
 assert.match(render('```fino-chart\n{"type":'),/Preparing chart/,'Partial streaming JSON waits quietly');
 assert.match(render('```json\n{"a":1}\n```'),/<pre/,'Normal code blocks preserved');
 console.log('PASS: safe bar/line/pie chart rendering, streaming and vivid bubble contrast; actual Markdown rendering cleans broken citations, preserves links/code, handles streaming and keeps Arabic/list/quote structure');
} finally { await fs.unlink(output); }
