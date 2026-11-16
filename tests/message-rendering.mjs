import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const output=new URL('../data/verification/render-test.mjs',import.meta.url);
await fs.mkdir(new URL('../data/verification/',import.meta.url),{recursive:true});
await build({stdin:{contents:"export { Markdown } from './web/src/components/Markdown.tsx';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:output.pathname});
try {
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {Markdown}=await import(pathToFileURL(output.pathname));
 const render=text=>renderToStaticMarkup(createElement(Markdown,{text}));
 const marker='\uE200cite\uE202turn550136view2\uE201';
 const actual=render(`مرحبا **بالعربي**. ${marker}\n\n> اقتباس عربي\n\n1. One\n2. اثنان\n\n[Official source](https://example.com/report)`);
 assert.ok(!actual.includes('turn550136view2'));assert.ok(!actual.includes('\uE200'));
 assert.match(actual,/Some source links are unavailable/);assert.match(actual,/<strong>بالعربي<\/strong>/);
 assert.match(actual,/href="https:\/\/example.com\/report"/);assert.match(actual,/<blockquote>/);assert.match(actual,/<ol>/);assert.match(actual,/dir="auto"/);
 assert.ok(!render('Partial \uE200ci').includes('\uE200'));
 assert.ok(!render('Text \uE200cite\uE202turn123view0').includes('turn123view0'));
 const literal=render('`'+marker+'`');assert.ok(literal.includes('turn550136view2'),'Code samples stay literal');
 assert.ok(!literal.includes('Some source links are unavailable'));
 assert.match(render('المقدمة: 0:00–0:30 ثم موسم 2025–26'), /<bdi dir="ltr">0:00–0:30<\/bdi>/);
 assert.match(render('موسم 2025–26'), /<bdi dir="ltr">2025–26<\/bdi>/);
 const plain=render('English and عربي with [source](https://example.com)');assert.ok(!plain.includes('Some source links are unavailable'));
 console.log('PASS: actual Markdown rendering cleans broken citations, preserves links/code, handles streaming and keeps Arabic/list/quote structure');
} finally { await fs.unlink(output); }
