import assert from 'node:assert/strict';import {build} from './lib/bundle.mjs';import fs from 'node:fs/promises';
// Bot characters (accountant, chef, medic, architect, engineer, florist) are inline SVG painted in the bot's color,
// so they load with no network request, and older saved shapes (fruits, silhouettes) still map to a character.
const out=new URL('../data/verification/avatar-component.mjs',import.meta.url);await fs.mkdir(new URL('.',out),{recursive:true});
await build({stdin:{contents:"export {FinoCharacter,characterKind,CHARACTER_KINDS} from './web/src/avatar/FinoCharacter.tsx'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],outfile:out.pathname});
try{
 const {FinoCharacter,characterKind,CHARACTER_KINDS}=await import(out.href),{createElement:h}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const render=(shape,color)=>renderToStaticMarkup(h(FinoCharacter,{shape,color}));
 assert.deepEqual(CHARACTER_KINDS,['accountant','chef','medic','architect','engineer','florist']);
 for(const kind of CHARACTER_KINDS){
  const html=render(kind,'blue');
  assert.match(html,new RegExp(`data-character="${kind}"`));assert.match(html,/src="data:image\/svg\+xml/);assert.ok(!html.includes('https://'),'No network request for avatars');
  assert.notEqual(render(kind,'blue'),render(kind,'green'),'Characters are painted in the bot color');
 }
 for(const shape of ['watermelon','orange','olive','fig','blob','square','tablet','cloud','heart','flower','clover','teardrop','star','sparkle','wedge','house','hex'])assert.ok(CHARACTER_KINDS.includes(characterKind(shape)),'Legacy saved shapes remain supported');
 assert.equal(characterKind('watermelon'),'accountant');assert.equal(characterKind('tablet'),'medic');assert.equal(characterKind('cloud'),'chef');assert.equal(characterKind('clover'),'florist');
 console.log('PASS: six inline SVG characters painted in the bot color, no network requests, legacy saved-avatar compatibility');
}finally{await fs.unlink(out);}
