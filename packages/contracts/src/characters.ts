// Fino bot characters: basic shapes with googly eyes, one per job, drawn as SVG so any bot color can
// paint them.
// Platform-neutral (no DOM, no React): web shows the string in an <img>, the phone app in SvgXml,
// and the landing page uses the same drawings.

export type CharacterKind = 'accountant' | 'chef' | 'medic' | 'architect' | 'engineer' | 'florist';

/** Order shown in the bot pickers. */
export const CHARACTER_KINDS: CharacterKind[] = ['accountant', 'chef', 'medic', 'architect', 'engineer', 'florist'];

export const CHARACTER_LABELS: Record<CharacterKind, string> = {
  accountant: 'Accountant', chef: 'Chef', medic: 'Medic', architect: 'Architect', engineer: 'Engineer', florist: 'Florist',
};

/** Saved shapes from older versions (fruits, silhouettes) keep a stable character. */
export function characterKind(shape: string | null | undefined): CharacterKind {
  const s = String(shape ?? '');
  if ((CHARACTER_KINDS as string[]).includes(s)) return s as CharacterKind;
  if (['watermelon', 'square', 'squircle', 'hex', 'gem', 'crystal', 'wedge'].includes(s)) return 'accountant';
  if (['orange', 'arch', 'dome', 'cloud', 'ghost'].includes(s)) return 'chef';
  if (['olive', 'tablet', 'capsule', 'cylinder', 'bean', 'egg'].includes(s)) return 'medic';
  if (['fig', 'house', 'shield', 'dino', 'leaf'].includes(s)) return 'architect';
  if (['star', 'sparkle', 'teardrop', 'pebble'].includes(s)) return 'engineer';
  if (['flower', 'heart', 'clover', 'blob'].includes(s)) return 'florist';
  return 'accountant';
}

/** Flat, printed-paper colors for each bot color: warm, a little muted, never neon. */
export const CLAY: Record<string, string> = {
  black: '#3c3f52',
  brown: '#b5743d',
  red: '#e84a33',
  orange: '#f27c2f',
  yellow: '#f5bf2f',
  green: '#2f8150',
  cyan: '#25a093',
  blue: '#3d7ed8',
  violet: '#7b68d6',
  magenta: '#ef8fb1',
  gray: '#a5a7b0',
};

/** Your chat bubble in a bot's chat: the bot's own hue, deep enough for its text to read (4:1 or better). */
export const BUBBLE: Record<string, { bg: string; ink: string }> = {
  black: { bg: '#3c3f52', ink: '#ffffff' },
  brown: { bg: '#9a5d28', ink: '#ffffff' },
  red: { bg: '#d23a24', ink: '#ffffff' },
  orange: { bg: '#c05510', ink: '#ffffff' },
  yellow: { bg: '#f5bf2f', ink: '#211c17' },
  green: { bg: '#2f8150', ink: '#ffffff' },
  cyan: { bg: '#1c8277', ink: '#ffffff' },
  blue: { bg: '#3169c4', ink: '#ffffff' },
  violet: { bg: '#6553c4', ink: '#ffffff' },
  magenta: { bg: '#c8457f', ink: '#ffffff' },
  gray: { bg: '#6f7280', ink: '#ffffff' },
};
export const bubbleFor = (color?: string | null) => BUBBLE[color ?? ''] ?? BUBBLE.blue;

const INK = '#1f1a17';

/** A googly eye: white ball, round black pupil looking (dx, dy). Animated eyes glance around now and then,
 * and blink: a lid in the body's color closes over the eye for a moment. */
function eye(cx: number, cy: number, r: number, dx: number, dy: number, animate: boolean, delay: number, lid = '') {
  const look = animate
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${(-dx * 1.6).toFixed(1)} ${(-dy * 0.6).toFixed(1)};${(-dx * 1.6).toFixed(1)} ${(-dy * 0.6).toFixed(1)};0 0" keyTimes="0;0.62;0.68;0.9;1" dur="6.5s" begin="${delay}s" repeatCount="indefinite"/>`
    : '';
  const blink = animate && lid
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${r + 1.5}" ry="0" fill="${lid}"><animate attributeName="ry" values="0;0;${r + 1.5};0" keyTimes="0;0.93;0.96;1" dur="4.8s" begin="${(delay + 1.1).toFixed(1)}s" repeatCount="indefinite"/></ellipse>`
    : '';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/><g><circle cx="${cx + dx}" cy="${cy + dy}" r="${(r * 0.6).toFixed(1)}" fill="${INK}"/>${look}</g>${blink}`;
}
const line = (d: string, w = 4) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Each job is a basic shape with its own face. */
function body(kind: CharacterKind, base: string, animate: boolean): string {
  switch (kind) {
    case 'accountant':
      // A soft octagon, calm and a little curious.
      return `<path d="M64 32 H136 L168 64 V136 L136 168 H64 L32 136 V64 Z" fill="${base}" stroke="${base}" stroke-width="16" stroke-linejoin="round"/>
${eye(78, 90, 23, 5, 4, animate, 0, base)}${eye(124, 86, 20, 5, 4, animate, 0, base)}
${line('M92 134 Q101 141 110 134')}`;
    case 'chef':
      // A four-leaf clover, a bit worried about the soup.
      return `<g fill="${base}"><circle cx="70" cy="70" r="40"/><circle cx="130" cy="70" r="40"/><circle cx="70" cy="130" r="40"/><circle cx="130" cy="130" r="40"/><rect x="60" y="60" width="80" height="80"/></g>
${eye(86, 86, 22, -3, 5, animate, 0.9, base)}${eye(120, 84, 22, -3, 5, animate, 0.9, base)}
${line('M92 128 Q102 120 112 128')}`;
    case 'medic':
      // A gumdrop with small round eyes and a gentle "w" smile.
      return `<path d="M42 170 V92 C42 48 70 24 100 24 C130 24 158 48 158 92 V170 Z" fill="${base}" stroke="${base}" stroke-width="12" stroke-linejoin="round"/>
${eye(80, 96, 18, 0, 4, animate, 1.7, base)}${eye(120, 96, 18, 0, 4, animate, 1.7, base)}
${line('M88 130 Q94 137 100 130 Q106 137 112 130', 3.6)}`;
    case 'architect':
      // An arch like a doorway, eyebrows raised, eyes on the top beam.
      return `<g transform="rotate(-5 100 100)"><path d="M36 174 V52 Q36 32 56 32 H144 Q164 32 164 52 V174 H126 V126 Q126 104 100 104 Q74 104 74 126 V174 Z" fill="${base}"/>
${eye(72, 68, 21, 4, 3, animate, 2.4, base)}${eye(128, 68, 21, 4, 3, animate, 2.4, base)}
${line('M58 42 Q70 34 84 40', 3.6)}${line('M116 40 Q130 34 142 42', 3.6)}</g>`;
    case 'engineer': {
      // A sun with rounded rays: one big eye, one small, a lopsided grin.
      const pts = Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 60 : 82;
        return `${(100 + Math.cos(a) * r).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="${base}" stroke="${base}" stroke-width="10" stroke-linejoin="round"/>
${eye(82, 92, 21, 4, -3, animate, 3.1, base)}${eye(120, 86, 15, 3, -2, animate, 3.1, base)}
${line('M86 122 Q100 132 116 118')}`;
    }
    case 'florist':
      // A tulip with a scalloped top and a big happy smile.
      return `<path d="M38 112 C36 62 52 38 70 50 C78 26 94 24 100 44 C106 24 122 26 130 50 C148 38 164 62 162 112 C162 152 136 176 100 176 C64 176 38 152 38 112 Z" fill="${base}"/>
${eye(86, 108, 16, 2, 2, animate, 3.8, base)}${eye(116, 108, 16, 2, 2, animate, 3.8, base)}
${line('M80 132 Q100 152 120 132', 4.2)}`;
  }
}

/** The character as an SVG document. `animate` adds a slow breath, blinks and glances (browsers only; native ignores it). */
export function characterSvg(kind: CharacterKind, color: string, animate = true): string {
  const base = CLAY[color] ?? (color?.startsWith?.('#') ? color : CLAY.cyan);
  // A slow breath: the character rises a few pixels and settles, each job on its own rhythm.
  const i = CHARACTER_KINDS.indexOf(kind);
  const breathe = animate
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${(3 + i * 0.35).toFixed(2)}s" begin="${(i * 0.4).toFixed(1)}s" repeatCount="indefinite"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g>${body(kind, base, animate)}${breathe}</g></svg>`;
}

const cache = new Map<string, string>();
/** Data URI for an <img>. Cached, since rosters show the same few bots many times. */
export function characterDataUri(shape: string, color: string, animate = true): string {
  const key = `${shape}|${color}|${animate}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(characterSvg(characterKind(shape), color, animate));
    cache.set(key, uri);
  }
  return uri;
}
