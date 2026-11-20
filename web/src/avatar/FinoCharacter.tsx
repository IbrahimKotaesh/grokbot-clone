export type CharacterKind='pebble'|'arch'|'ghost'|'dino';
/** Retain old saved identities while presenting the new four-character family. */
export function characterKind(shape:string):CharacterKind {
 if(['arch','tablet','capsule','cylinder','bean','teardrop'].includes(shape))return 'arch';
 if(['ghost','cloud','dome','flower','star','sparkle'].includes(shape))return 'ghost';
 if(['dino','leaf','clover','house','shield'].includes(shape))return 'dino';
 return 'pebble';
}
const baseHue:Record<CharacterKind,number>={pebble:280,arch:210,ghost:245,dino:150};
const hues:Record<string,number>={violet:280,blue:210,cyan:170,green:140,magenta:320,red:355,orange:25,yellow:48,brown:30};
export function FinoCharacter({shape,color}:{shape:string;color:string}){
 const kind=characterKind(shape);
 const filter=color==='black'?'saturate(0.15) brightness(0.7)':color==='gray'?'saturate(0) brightness(1.05)':`hue-rotate(${(hues[color]??baseHue[kind])-baseHue[kind]}deg)${color==='brown'?' saturate(.65) brightness(.85)':' saturate(2.3) contrast(1.12) brightness(.94)'}`;
 return <span className="fino-character" data-character={kind}><img src={`/characters/${kind}.png`} alt="" aria-hidden="true" draggable={false} decoding="async" style={{filter}}/></span>;
}
