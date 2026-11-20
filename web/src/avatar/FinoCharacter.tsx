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
const palettes:Record<string,[string,string,string]>={black:['#cad7f4','#859bc7','#50648f'],green:['#bfe9b2','#76af63','#3b7545'],blue:['#b8def5','#6ba6d0','#3d6b9c'],cyan:['#b8ebe4','#66b6b0','#337a80'],violet:['#dcc8f3','#a28ac8','#725d98'],magenta:['#f1c8e6','#c58eb9','#995e8a'],red:['#f4c4bf','#d98d87','#a55858'],orange:['#f6d4ad','#d9a168','#a77340'],yellow:['#f4e4ad','#d3b76c','#9b833e'],brown:['#dcc7b4','#ad8d70','#7c614c'],gray:['#dce4e2','#9caeaa','#6c817b']};
/** Compact companions: sculpted silhouettes, expressive eyes and no robot visor. */
export function FinoCharacter({shape,color}:{shape:string;color:string}){
 const id='fino'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const kind=silhouettes[shape]?shape:aliases[shape]??'blob';
 const [light,main,dark]=palettes[color]??palettes.black;
 const faceY=['wedge','teardrop','house'].includes(kind)?51:46;
 const eyesApart=kind==='wedge'?11:13;
 const curious=['cloud','sparkle','star'].includes(kind);
 return <svg viewBox="0 0 100 110" aria-hidden="true" focusable="false" data-character={kind}>
  <defs>
   <linearGradient id={id} x1="0" y1="0" x2=".7" y2="1">
    <stop stopColor={light}/><stop offset=".5" stopColor={main}/><stop offset="1" stopColor={dark}/>
   </linearGradient>
   <linearGradient id={id+'shine'} x1="0" y1="0" x2="0" y2="1">
    <stop stopColor="white" stopOpacity=".55"/><stop offset=".7" stopColor="white" stopOpacity="0"/>
   </linearGradient>
  </defs>
  <ellipse cx="50" cy="104" rx="24" ry="3" fill={dark} opacity=".14"/>
  <path d="M24 61Q10 67 11 77M78 61Q91 65 90 76" fill="none" stroke={dark} strokeWidth="7" strokeLinecap="round"/>
  <path d="M38 72Q38 88 34 98M62 72Q62 88 66 98" fill="none" stroke={dark} strokeWidth="12" strokeLinecap="round"/>
  <path d={silhouettes[kind]} fill={`url(#${id})`} stroke={dark} strokeWidth="1" strokeLinejoin="round"/>
  <path d={silhouettes[kind]} fill={`url(#${id}shine)`}/>
  <g className="fino-character__eyes">
   <ellipse cx={50-eyesApart} cy={faceY} rx="10" ry={curious?13:12} fill="#fffdf8"/>
   <ellipse cx={50+eyesApart} cy={faceY} rx="10" ry="12" fill="#fffdf8"/>
   <ellipse cx={52-eyesApart} cy={faceY+1} rx="5" ry="7" fill="#202a34"/>
   <ellipse cx={52+eyesApart} cy={faceY+1} rx="5" ry="7" fill="#202a34"/>
   <circle cx={53-eyesApart} cy={faceY-2} r="1.8" fill="white"/>
   <circle cx={53+eyesApart} cy={faceY-2} r="1.8" fill="white"/>
  </g>
  <path d={kind==='tablet'?`M46 ${faceY+18}h8`:`M46 ${faceY+17}q4 5 8 0`} fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round"/>
 </svg>;
}
