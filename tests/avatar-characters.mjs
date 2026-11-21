import assert from 'node:assert/strict';import {build} from './lib/bundle.mjs';import fs from 'node:fs/promises';
const out=new URL('../data/verification/avatar-component.mjs',import.meta.url);await fs.mkdir(new URL('.',out),{recursive:true});
await build({stdin:{contents:"export {FinoCharacter,characterKind} from './web/src/avatar/FinoCharacter.tsx'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:out.pathname});
try{
 const {FinoCharacter,characterKind}=await import(out.href),{createElement:h}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const shapes=['watermelon','orange','olive','fig'];
 const render=(shape,color)=>renderToStaticMarkup(h(FinoCharacter,{shape,color}));
 for(const shape of shapes){
  const html=render(shape,'blue');assert.match(html,new RegExp(`/characters/fruits/${shape}.webp`));assert.ok(!html.includes('https://'));
  const asset=await fs.readFile(new URL(`../web/public/characters/fruits/${shape}.webp`,import.meta.url));assert.equal(asset.subarray(0,4).toString(),'RIFF');assert.equal(asset.subarray(8,12).toString(),'WEBP');assert.ok(asset.length<100_000,'Avatar download budget');
  assert.equal(render(shape,'blue'),render(shape,'green'),'Natural fruit colors remain unchanged by chat palette');
 }
 for(const shape of ['blob','square','tablet','cloud','heart','flower','clover','teardrop','star','sparkle','wedge','house','hex'])assert.ok(shapes.includes(characterKind(shape)),'Legacy saved shapes remain supported');
 assert.equal(characterKind('tablet'),'orange');assert.equal(characterKind('cloud'),'olive');assert.equal(characterKind('clover'),'fig');
 console.log('PASS: four optimized local fruit assets, natural colors and legacy saved-avatar compatibility');
}finally{await fs.unlink(out);}
