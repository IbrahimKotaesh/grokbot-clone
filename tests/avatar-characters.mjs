import assert from 'node:assert/strict';import {build} from 'esbuild';import fs from 'node:fs/promises';
const out=new URL('../data/verification/avatar-component.mjs',import.meta.url);await fs.mkdir(new URL('.',out),{recursive:true});
await build({stdin:{contents:"export {FinoCharacter,characterKind} from './web/src/avatar/FinoCharacter.tsx'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:out.pathname});
try{
 const {FinoCharacter,characterKind}=await import(out.href),{createElement:h}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const shapes=['pebble','arch','ghost','dino'];
 const render=(shape,color)=>renderToStaticMarkup(h(FinoCharacter,{shape,color}));
 for(const shape of shapes){
  const html=render(shape,'blue');assert.match(html,new RegExp(`/characters/${shape}.png`));assert.ok(!html.includes('https://'));
  const png=await fs.readFile(new URL(`../web/public/characters/${shape}.png`,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png[25],6,'RGBA assets preserve alpha');
  assert.notEqual(render(shape,'blue'),render(shape,'green'),'Colors change independently from the shape');
 }
 for(const shape of ['blob','square','tablet','cloud','heart','flower','clover','teardrop','star','sparkle','wedge','house','hex'])assert.ok(shapes.includes(characterKind(shape)),'Legacy saved shapes remain supported');
 assert.equal(characterKind('tablet'),'arch');assert.equal(characterKind('cloud'),'ghost');assert.equal(characterKind('clover'),'dino');
 console.log('PASS: four local RGBA character assets, independent colors and legacy saved-avatar compatibility');
}finally{await fs.unlink(out);}
