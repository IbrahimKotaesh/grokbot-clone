export type CharacterKind='watermelon'|'orange'|'olive'|'fig';
export const FRUIT_COLORS={watermelon:'red',orange:'orange',olive:'green',fig:'violet'} as const;
/** Map saved silhouettes without changing bot records, chat colors, or memories. */
export function characterKind(shape:string):CharacterKind {
 if(['watermelon','orange','olive','fig'].includes(shape))return shape as CharacterKind;
 if(['arch','tablet','capsule','cylinder','bean','teardrop'].includes(shape))return 'orange';
 if(['ghost','cloud','dome','flower','star','sparkle'].includes(shape))return 'olive';
 if(['dino','leaf','clover','house','shield'].includes(shape))return 'fig';
 return 'watermelon';
}
export function FinoCharacter({shape}:{shape:string;color:string}){
 const kind=characterKind(shape);
 return <span className="fino-character" data-character={kind}><img src={`/characters/fruits/${kind}.webp`} alt="" aria-hidden="true" draggable={false} decoding="async" width="384" height="384"/></span>;
}
