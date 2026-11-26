import type { CSSProperties } from 'react';
import { characterDataUri, characterSvg } from '../../../packages/contracts/src/characters';
import '../styles/badr.css';

/**
 * Badr, Fino's main character, in six moods spread across the app:
 * hop (waiting, loading), wave (hello: the plan screen, Badr's empty chat), think (working something out:
 * activating a plan), celebrate (a plan just started), sleep (the computer is asleep), peek (sign-in).
 * The body is the shared character art; each mood adds its own motion and small props in CSS.
 */
export type BadrMood = 'hop' | 'wave' | 'think' | 'celebrate' | 'sleep' | 'peek';

const AWAKE = characterDataUri('accountant', 'yellow');
// Asleep: the still character with both eyes closed (yellow lids and a soft curve over each eye).
const ASLEEP = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  characterSvg('accountant', 'yellow', false).replace(
    /<\/svg>$/,
    '<circle cx="78" cy="90" r="25" fill="#f5bf2f"/><circle cx="124" cy="86" r="22" fill="#f5bf2f"/>' +
      '<path d="M62 92 Q78 103 94 92" fill="none" stroke="#1f1a17" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M110 88 Q124 98 138 88" fill="none" stroke="#1f1a17" stroke-width="5" stroke-linecap="round"/></svg>',
  ),
)}`;

const CONFETTI = ['#c13f22', '#3d7ed8', '#2f8150', '#ef8fb1', '#7b68d6', '#ffcf3a', '#c13f22', '#3d7ed8', '#2f8150', '#ef8fb1', '#7b68d6', '#ffcf3a'];

export function Badr({ mood = 'hop', size = 80, className = '' }: { mood?: BadrMood; size?: number; className?: string }) {
  return (
    <span className={`badr badr--${mood} ${className}`} style={{ '--badr': `${size}px` } as CSSProperties} aria-hidden>
      {mood === 'celebrate' && (
        <span className="badr__confetti">
          {CONFETTI.map((c, i) => <i key={i} style={{ '--c': c, '--a': `${i * 30}deg`, '--d': `${(i % 4) * 60}ms` } as CSSProperties} />)}
        </span>
      )}
      <span className="badr__body"><img src={mood === 'sleep' ? ASLEEP : AWAKE} alt="" draggable={false} /></span>
      {mood === 'wave' && <span className="badr__hand" />}
      {mood === 'think' && <span className="badr__think"><i /><i /><i /></span>}
      {mood === 'sleep' && <span className="badr__z"><i>z</i><i>z</i><i>Z</i></span>}
      {(mood === 'hop' || mood === 'celebrate') && <span className="badr__shadow" />}
    </span>
  );
}
