import type { CSSProperties } from 'react';
import '../styles/badr.css';

/**
 * Badr, Fino's main character, drawn with arms, hands and feet so each mood can act:
 * hop (waiting, loading), wave (hello: the plan screen, Badr's empty chat), think (activating a plan),
 * celebrate (a plan just started), sleep (the computer is asleep), peek (sign-in).
 * Same body, eyes and colors as the shared character art (packages/contracts/src/characters.ts, "accountant"/yellow).
 */
export type BadrMood = 'hop' | 'wave' | 'think' | 'celebrate' | 'sleep' | 'peek';

const BODY = '#f5bf2f';
const LIMB = '#e5a91c';
const INK = '#1f1a17';
const CONFETTI = ['#c13f22', '#3d7ed8', '#2f8150', '#ef8fb1', '#7b68d6', '#ffcf3a'];

export function Badr({ mood = 'hop', size = 80, className = '' }: { mood?: BadrMood; size?: number; className?: string }) {
  const asleep = mood === 'sleep';
  return (
    <span className={`badr badr--${mood} ${className}`} style={{ '--badr': `${size}px` } as CSSProperties} aria-hidden>
      <svg viewBox="-40 -40 280 280" width={size} height={size} overflow="visible">
        {mood === 'celebrate' && (
          <g className="badr__confetti">
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x="96" y="40" width="10" height="6" rx="2" fill={CONFETTI[i % CONFETTI.length]} style={{ '--a': `${i * 30}deg`, '--d': `${(i % 4) * 70}ms` } as CSSProperties} />
            ))}
          </g>
        )}
        <g className="badr__all">
          {/* feet */}
          <ellipse className="badr__foot" cx="78" cy="180" rx="17" ry="9" fill={LIMB} />
          <ellipse className="badr__foot badr__foot--r" cx="122" cy="180" rx="17" ry="9" fill={LIMB} />
          {/* body */}
          <g className="badr__body">
            <path d="M64 32 H136 L168 64 V136 L136 168 H64 L32 136 V64 Z" fill={BODY} stroke={BODY} strokeWidth="16" strokeLinejoin="round" />
            {asleep ? (
              <g fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round">
                <path d="M62 92 Q78 103 94 92" />
                <path d="M110 88 Q124 98 138 88" />
              </g>
            ) : (
              <g>
                <circle cx="78" cy="90" r="23" fill="#ffffff" />
                <circle cx="124" cy="86" r="20" fill="#ffffff" />
                <g className="badr__pupils">
                  <circle cx="83" cy="94" r="13.8" fill={INK} />
                  <circle cx="129" cy="90" r="12" fill={INK} />
                </g>
                <g className="badr__lids" fill={BODY}>
                  <ellipse cx="78" cy="90" rx="25" ry="25" />
                  <ellipse cx="124" cy="86" rx="22" ry="22" />
                </g>
              </g>
            )}
            <path className="badr__mouth" d={mood === 'celebrate' ? 'M88 128 Q101 146 114 128 Z' : 'M92 134 Q101 141 110 134'} fill={mood === 'celebrate' ? INK : 'none'} stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {/* arms in front of the body: a shoulder, a forearm and a round hand; they turn at the shoulder */}
          <g className="badr__arm badr__arm--l">
            <path d="M30 116 Q10 130 6 152" fill="none" stroke={LIMB} strokeWidth="13" strokeLinecap="round" />
            <circle cx="6" cy="156" r="11" fill={LIMB} />
          </g>
          <g className="badr__arm badr__arm--r">
            <path d="M170 116 Q190 130 194 152" fill="none" stroke={LIMB} strokeWidth="13" strokeLinecap="round" />
            <circle cx="194" cy="156" r="11" fill={LIMB} />
          </g>
        </g>
        {mood === 'think' && (
          <g className="badr__think" fill="#ffffff" stroke={INK} strokeWidth="4">
            <circle cx="186" cy="34" r="7" />
            <circle cx="204" cy="10" r="11" />
            <ellipse cx="232" cy="-22" rx="26" ry="20" />
          </g>
        )}
        {asleep && (
          <g className="badr__z" fill="currentColor" fontFamily="Nunito, system-ui, sans-serif" fontWeight="900">
            <text x="168" y="40" fontSize="30">z</text>
            <text x="168" y="40" fontSize="40">z</text>
            <text x="168" y="40" fontSize="52">Z</text>
          </g>
        )}
      </svg>
    </span>
  );
}
