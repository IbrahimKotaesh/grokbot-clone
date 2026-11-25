// Fino bot characters: flat sticker friends with a job and two black feet, drawn as SVG so any bot color
// can paint them.
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

/** Sticker colors for each bot color: flat, bright and cheerful, like a sheet of stickers. */
export const CLAY: Record<string, string> = {
  black: '#4b4f63',
  brown: '#c9844a',
  red: '#f2564b',
  orange: '#ff8a3d',
  yellow: '#ffcf3a',
  green: '#5cc25f',
  cyan: '#2ec4b6',
  blue: '#4a8ff0',
  violet: '#9b6cf0',
  magenta: '#f46ba6',
  gray: '#a9abb5',
};

/** Your chat bubble in a bot's chat: the bot's own hue, deep enough for its text to read (4:1 or better). */
export const BUBBLE: Record<string, { bg: string; ink: string }> = {
  black: { bg: '#3d404f', ink: '#ffffff' },
  brown: { bg: '#a5652e', ink: '#ffffff' },
  red: { bg: '#d9342a', ink: '#ffffff' },
  orange: { bg: '#cf5a0c', ink: '#ffffff' },
  yellow: { bg: '#ffcf3a', ink: '#211c17' },
  green: { bg: '#2f8a35', ink: '#ffffff' },
  cyan: { bg: '#11877d', ink: '#ffffff' },
  blue: { bg: '#2f6fd8', ink: '#ffffff' },
  violet: { bg: '#7d4fe0', ink: '#ffffff' },
  magenta: { bg: '#d9367f', ink: '#ffffff' },
  gray: { bg: '#6f7280', ink: '#ffffff' },
};
export const bubbleFor = (color?: string | null) => BUBBLE[color ?? ''] ?? BUBBLE.blue;

function mix(hex: string, to: string, t: number): string {
  const a = hex.replace('#', ''), b = to.replace('#', '');
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  return '#' + [0, 2, 4].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('');
}

const INK = '#211c17';
const CREAM = '#fff8ee';

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140;
}

/** Two round black eyes with a shine, rosy cheeks and a small smile. Blinks when animated. */
function face(cx: number, y: number, gap: number, animate: boolean, delay: number) {
  const blink = animate
    ? `<animate attributeName="ry" values="8.5;8.5;1;8.5" keyTimes="0;0.93;0.965;1" dur="4.6s" begin="${delay}s" repeatCount="indefinite"/>`
    : '';
  const eye = (x: number) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="8.5" fill="${INK}">${blink}</ellipse><circle cx="${x + 2.2}" cy="${y - 3}" r="2.4" fill="#fff"/>`;
  const cheek = (x: number) => `<ellipse cx="${x}" cy="${y + 13}" rx="7.5" ry="4.5" fill="#ff7a9c" fill-opacity="0.55"/>`;
  const l = cx - gap / 2, r = cx + gap / 2;
  return `${cheek(l - 9)}${cheek(r + 9)}${eye(l)}${eye(r)}<path d="M${cx - 6.5} ${y + 12} Q${cx} ${y + 19} ${cx + 6.5} ${y + 12}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`;
}

/** Two chunky black feet, the sticker family's signature. */
const feet = (lx = 74, rx = 126, y = 178) =>
  // A cream rim: invisible on light grounds, it keeps the feet visible on dark ones.
  `<g fill="${INK}" stroke="${CREAM}" stroke-width="3"><ellipse cx="${lx}" cy="${y}" rx="19" ry="11"/><ellipse cx="${rx}" cy="${y}" rx="19" ry="11"/></g>`;

/** A flat highlight in the top-left of a shape: one lighter tint, no gradients. */
const gleam = (x: number, y: number, w: number, base: string) =>
  `<path d="M${x} ${y + 14} Q${x + 2} ${y} ${x + w} ${y - 2}" fill="none" stroke="${mix(base, '#ffffff', 0.45)}" stroke-width="7" stroke-linecap="round"/>`;

function body(kind: CharacterKind, base: string, animate: boolean): string {
  const deep = mix(base, '#000000', 0.18);
  switch (kind) {
    case 'accountant':
      // A soft square with round glasses and a little pencil behind the ear.
      return `${feet()}
<rect x="34" y="44" width="132" height="128" rx="42" fill="${base}"/>
${gleam(52, 66, 30, base)}
<g transform="rotate(28 158 52)"><rect x="150" y="18" width="13" height="50" rx="4" fill="#ffd34d"/><path d="M150 68 L156.5 82 L163 68 Z" fill="${CREAM}"/><path d="M154.5 77.5 L156.5 82 L158.5 77.5 Z" fill="${INK}"/><rect x="150" y="18" width="13" height="8" rx="3" fill="#ff8fb1"/></g>
<g fill="${CREAM}" fill-opacity="0.35" stroke="${INK}" stroke-width="4.5"><circle cx="76" cy="104" r="20"/><circle cx="124" cy="104" r="20"/></g><path d="M96 101 Q100 96 104 101" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
${face(100, 104, 48, animate, 0)}`;
    case 'chef':
      // A cloud with a puffy chef's hat.
      return `${feet()}
<path d="M38 170 C14 170 12 136 32 128 C24 100 52 84 72 94 C80 72 112 68 124 86 C142 74 170 88 166 112 C188 118 188 156 166 164 C164 170 158 172 150 172 Z" fill="${base}"/>
${gleam(44, 116, 22, base)}
<g fill="#ffffff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"><path d="M74 78 L74 58 C60 58 56 40 68 34 C70 20 90 16 98 26 C106 14 128 18 128 34 C142 38 140 58 126 58 L126 78 Z"/></g>
<path d="M76 68 H124" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
${face(100, 122, 40, animate, 0.7)}`;
    case 'medic':
      // A capsule with a white band and a red cross.
      return `${feet()}
<rect x="52" y="30" width="96" height="144" rx="48" fill="${base}"/>
${gleam(66, 56, 18, base)}
<path d="M52 70 Q100 60 148 70 L148 92 Q100 82 52 92 Z" fill="${CREAM}"/>
<g fill="#f2564b"><rect x="94.5" y="64" width="11" height="24" rx="3"/><rect x="88" y="70.5" width="24" height="11" rx="3"/></g>
${face(100, 120, 36, animate, 1.4)}`;
    case 'architect':
      // A little house: pointed roof, a chimney and a round window.
      return `${feet()}
<rect x="132" y="34" width="18" height="34" rx="4" fill="${deep}"/>
<path d="M100 26 Q106 26 112 31 L170 82 Q176 88 170 92 L164 92 L164 160 Q164 172 152 172 L48 172 Q36 172 36 160 L36 92 L30 92 Q24 88 30 82 L88 31 Q94 26 100 26 Z" fill="${base}"/>
<path d="M30 90 L100 30 L170 90" fill="none" stroke="${deep}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="100" cy="72" r="11" fill="${CREAM}"/><path d="M100 61 V83 M89 72 H111" stroke="${deep}" stroke-width="3"/>
${face(100, 116, 40, animate, 2.1)}`;
    case 'engineer': {
      // A round-cornered star with a lightning bolt on its belly.
      const bolt = isDark(base) ? '#ffe07a' : '#fff4c2';
      return `${feet(78, 122)}
<path d="M100 24 L122 70 L172 76 L135 110 L146 160 L100 136 L54 160 L65 110 L28 76 L78 70 Z" fill="${base}" stroke="${base}" stroke-width="18" stroke-linejoin="round"/>
${gleam(74, 74, 18, base)}
${face(100, 100, 36, animate, 2.8)}
<path d="M104 126 L92 142 L100 142 L96 154 L110 137 L102 137 L106 126 Z" fill="${bolt}" stroke="${bolt}" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    case 'florist': {
      // A flower: round face, five petals, a stem with two leaves.
      const petal = mix(base, '#ffffff', 0.3);
      return `${feet()}
<path d="M100 130 V168" stroke="#4fae52" stroke-width="7" stroke-linecap="round"/>
<path d="M100 160 C90 142 70 138 56 146 C68 162 88 164 100 160 Z M100 160 C110 142 130 138 144 146 C132 162 112 164 100 160 Z" fill="#5cc25f"/>
<g fill="${petal}">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="100" cy="40" rx="24" ry="27" transform="rotate(${a} 100 82)"/>`).join('')}</g>
<circle cx="100" cy="82" r="40" fill="${base}"/>
${gleam(74, 68, 16, base)}
${face(100, 80, 32, animate, 3.5)}`;
    }
  }
}

/** The character as an SVG document. `animate` adds a blink (browsers only; native ignores it). */
export function characterSvg(kind: CharacterKind, color: string, animate = true): string {
  const base = CLAY[color] ?? (color?.startsWith?.('#') ? color : CLAY.cyan);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body(kind, base, animate)}</svg>`;
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
