import {useId} from 'react';
const silhouettes:Record<string,string>={
 blob:'M17 39C17 18 34 15 50 19C70 12 85 25 84 44C88 65 73 76 50 76C27 78 13 63 17 39Z',
 square:'M25 19H75Q88 19 88 32V63Q88 76 75 76H25Q12 76 12 63V32Q12 19 25 19Z',
 tablet:'M20 25H80Q94 25 94 41V59Q94 74 80 74H20Q6 74 6 59V41Q6 25 20 25Z',
 cloud:'M17 37C5 23 25 13 37 22C42 5 64 5 70 23C88 12 101 35 85 44C102 61 79 80 66 70C52 86 33 80 29 70C8 76 0 54 17 45Z',
 heart:'M50 78C34 68 9 54 10 34C12 8 39 9 50 27C62 8 91 10 91 35C92 55 68 69 50 78Z',
 flower:'M50 13C61 0 77 11 73 26C92 20 102 41 86 50C103 66 85 83 70 72C68 92 43 94 38 76C20 89 2 69 16 56C-1 43 10 22 28 27C23 10 42 1 50 13Z',
 clover:'M48 27C26 0 4 22 23 43C-2 58 16 86 39 72C44 99 72 95 72 71C100 81 108 49 82 42C96 19 66 1 54 27Z',
 teardrop:'M50 5C45 24 16 39 16 57C16 85 85 86 85 57C85 39 58 22 50 5Z',
 star:'M50 5L63 27L88 26L79 49L95 68L70 73L60 94L42 78L18 86L19 60L2 43L26 33L31 9L50 20Z',
 sparkle:'M50 4Q57 28 67 34L94 44L72 58Q61 66 57 88L43 73Q32 60 8 55L25 38Q40 27 50 4Z',
 wedge:'M50 10Q56 10 60 18L91 65Q98 77 84 79H17Q3 77 10 65L40 18Q44 10 50 10Z',
 house:'M11 40L43 13Q50 7 57 13L90 40V66Q90 79 77 79H24Q11 79 11 66Z',
 hex:'M29 13H71L93 39V62L72 81H28L7 62V39Z',
};
const aliases:Record<string,string>={bean:'teardrop',egg:'blob',pebble:'blob',squircle:'square',capsule:'tablet',cylinder:'tablet',gem:'hex',crystal:'sparkle',shield:'house',dome:'cloud',arch:'house',leaf:'teardrop'};
const palettes:Record<string,[string,string,string]>={black:['#b7e5cc','#4a9c84','#22665b'],green:['#bfe9b2','#76af63','#3b7545'],blue:['#b8def5','#6ba6d0','#3d6b9c'],cyan:['#b8ebe4','#66b6b0','#337a80'],violet:['#dcc8f3','#a28ac8','#725d98'],magenta:['#f1c8e6','#c58eb9','#995e8a'],red:['#f4c4bf','#d98d87','#a55858'],orange:['#f6d4ad','#d9a168','#a77340'],yellow:['#f4e4ad','#d3b76c','#9b833e'],brown:['#dcc7b4','#ad8d70','#7c614c'],gray:['#dce4e2','#9caeaa','#6c817b']};
/** Distinct vector characters: shape changes the silhouette, ears, antenna and expression. */
export function FinoCharacter({shape,color}:{shape:string;color:string}){
 const id='fino'+useId().replace(/[^a-zA-Z0-9_-]/g,'');const kind=silhouettes[shape]?shape:aliases[shape]??'blob';
 const [light,main,dark]=palettes[color]??palettes.black;const raised=kind==='wedge'||kind==='teardrop';const faceY=raised?44:35;
 return <svg viewBox="0 0 100 110" aria-hidden="true" focusable="false" data-character={kind}>
  <defs><linearGradient id={id} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={light}/><stop offset=".65" stopColor={main}/><stop offset="1" stopColor={dark}/></linearGradient></defs>
  <ellipse cx="50" cy="104" rx="29" ry="4" fill={dark} opacity=".12"/>
  <path d="M30 70Q20 73 16 86M72 70Q82 74 84 86" stroke={main} strokeWidth="11" fill="none" strokeLinecap="round"/>
  <path d="M31 96L28 103M68 96L71 103" stroke={dark} strokeWidth="11" strokeLinecap="round"/>
  <path d="M29 72Q50 61 73 72L77 94Q50 106 24 94Z" fill={`url(#${id})`}/>
  {kind==='blob'&&<><circle cx="21" cy="23" r="13" fill={main}/><circle cx="79" cy="23" r="13" fill={main}/><circle cx="21" cy="23" r="7" fill={light}/><circle cx="79" cy="23" r="7" fill={light}/></>}
  {['square','hex'].includes(kind)&&<><path d="M50 20V9" stroke={dark} strokeWidth="4"/><circle cx="50" cy="7" r="5" fill="#f5c36b"/></>}
  {kind==='tablet'&&<><rect x="0" y="39" width="10" height="24" rx="5" fill={dark}/><rect x="90" y="39" width="10" height="24" rx="5" fill={dark}/><path d="M16 29Q50 2 84 29" fill="none" stroke={dark} strokeWidth="6"/></>}
  <path d={silhouettes[kind]} fill={`url(#${id})`} stroke={dark} strokeWidth="1.2"/>
  <path d={silhouettes[kind]} fill="none" stroke="white" strokeWidth="2" opacity=".25" transform="translate(0 -1)"/>
  <rect x={kind==='wedge'?29:23} y={faceY} width={kind==='wedge'?43:54} height="27" rx={['square','hex','tablet'].includes(kind)?9:14} fill="#193f3d"/>
  {['flower','heart','clover'].includes(kind)?<g stroke="#d9f9df" strokeWidth="3" strokeLinecap="round" fill="none"><path d={`M33 ${faceY+12}q4 -6 8 0M59 ${faceY+12}q4 -6 8 0`}/></g>:<g fill="#d9f9df"><ellipse cx="37" cy={faceY+12} rx="3.5" ry={kind==='tablet'?4:5}/><ellipse cx="63" cy={faceY+12} rx="3.5" ry={kind==='tablet'?4:5}/></g>}
  <path d={`M45 ${faceY+20}q5 4 10 0`} fill="none" stroke="#c6ebd3" strokeWidth="2" strokeLinecap="round"/>
  <circle cx="27" cy={faceY+22} r="4" fill="#efaa9c" opacity=".45"/><circle cx="73" cy={faceY+22} r="4" fill="#efaa9c" opacity=".45"/>
  <rect x="39" y="82" width="22" height="12" rx="5" fill={light} opacity=".7"/>
  {kind==='square'?<path d="M42 85l8 5 8-5" fill="none" stroke={dark} strokeWidth="1.6"/>:kind==='tablet'?<path d="M46 91l9-7" stroke={dark} strokeWidth="3" strokeLinecap="round"/>:<circle cx="50" cy="88" r="3" fill={dark} opacity=".65"/>}
 </svg>;
}
