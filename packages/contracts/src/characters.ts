// Fino bot characters: soft clay figures with a job, drawn as SVG so any bot color can paint them.
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

/** Clay tones for each bot color: softer than the chat accents so the figures look like matte toys. */
export const CLAY: Record<string, string> = {
  black: '#62646f',
  brown: '#b07b55',
  red: '#f2786a',
  orange: '#f59a55',
  yellow: '#f6c84b',
  green: '#86b07a',
  cyan: '#3e9f98',
  blue: '#5476b0',
  violet: '#b28ad9',
  magenta: '#ef86a8',
  gray: '#a6a6ac',
};

function mix(hex: string, to: string, t: number): string {
  const a = hex.replace('#', ''), b = to.replace('#', '');
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  return '#' + [0, 2, 4].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('');
}

const INK = '#2b211f';

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140;
}

/** Eyes with a shine, and a small smile. Blinks when animated. */
function face(lx: number, rx: number, y: number, smileY: number, animate: boolean, delay: number, cheekY = y + 17) {
  const blink = animate
    ? `<animate attributeName="ry" values="9;9;1;9" keyTimes="0;0.93;0.965;1" dur="4.6s" begin="${delay}s" repeatCount="indefinite"/>`
    : '';
  const eye = (x: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="8.5" ry="9" fill="${INK}">${blink}</ellipse><circle cx="${x + 2.6}" cy="${y - 3.2}" r="2.6" fill="#fff"/>`;
  const cx = (lx + rx) / 2;
  const cheek = (x: number) => `<ellipse cx="${x}" cy="${cheekY}" rx="8" ry="4.5" fill="#ff6f8a" fill-opacity="0.32"/>`;
  return `${cheek(lx - 6)}${cheek(rx + 6)}${eye(lx)}${eye(rx)}<path d="M${cx - 7} ${smileY} Q${cx} ${smileY + 7} ${cx + 7} ${smileY}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
}

/** Shared gradients: top light, body color, darker base, and a soft shine. */
function defs(id: string, base: string) {
  return `<defs>
<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(base, '#ffffff', 0.22)}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${mix(base, '#000000', 0.16)}"/></linearGradient>
<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(base, '#000000', 0.08)}"/><stop offset="1" stop-color="${mix(base, '#000000', 0.3)}"/></linearGradient>
<radialGradient id="${id}s" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000000" stop-opacity="0.18"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6e0d6"/></linearGradient>
</defs>`;
}

const ground = (id: string) => `<ellipse cx="100" cy="182" rx="66" ry="9" fill="url(#${id}g)"/>`;
const shine = (id: string, x: number, y: number, rx: number, ry: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${id}s)"/>`;

function body(kind: CharacterKind, id: string, base: string, animate: boolean, plain: boolean): string {
  const fill = `url(#${id}b)`;
  const edge = mix(base, '#000000', 0.22);
  const rim = `stroke="${edge}" stroke-opacity="0.35" stroke-width="1.5"`;
  switch (kind) {
    case 'accountant':
      return `${ground(id)}
<rect x="30" y="52" width="140" height="124" rx="36" fill="${fill}" ${rim}/>
${shine(id, 70, 78, 36, 18)}
<path d="M46 80 C42 54 70 40 102 42 C118 24 150 18 160 32 C168 44 158 58 140 56 C126 66 92 66 66 74 C56 77 48 82 46 80 Z" fill="url(#${id}h)"/>
<g fill="none" stroke="${INK}" stroke-width="4"><rect x="46" y="94" width="46" height="34" rx="11"/><rect x="108" y="94" width="46" height="34" rx="11"/><path d="M92 106 Q100 100 108 106"/></g>
${face(69, 131, 111, 138, animate, 0, 137)}
${plain ? '' : `<rect x="126" y="140" width="32" height="30" rx="7" fill="url(#${id}w)" stroke="#d8d1c6" stroke-width="1"/>
<g fill="#5f5853"><rect x="132" y="146" width="8" height="7" rx="2"/><rect x="144" y="146" width="8" height="7" rx="2"/><rect x="132" y="157" width="8" height="7" rx="2"/><rect x="144" y="157" width="8" height="7" rx="2"/></g>`}`;
    case 'chef':
      return `${ground(id)}
<path d="M24 168 C20 112 56 76 100 76 C144 76 180 112 176 168 C175 178 168 180 158 180 L42 180 C32 180 25 178 24 168 Z" fill="${fill}" ${rim}/>
${shine(id, 70, 102, 32, 16)}
<g fill="url(#${id}w)"><circle cx="76" cy="48" r="21"/><circle cx="124" cy="48" r="21"/><circle cx="100" cy="36" r="26"/><rect x="72" y="52" width="56" height="30" rx="7"/></g>
<path d="M72 74 L128 74" stroke="#e2dbcf" stroke-width="2"/>
${face(80, 120, 130, 148, animate, 0.7)}`;
    case 'medic':
      return `${ground(id)}
<clipPath id="${id}c"><rect x="50" y="36" width="100" height="144" rx="50"/></clipPath>
<rect x="50" y="36" width="100" height="144" rx="50" fill="${fill}" ${rim}/>
${shine(id, 80, 104, 18, 22)}
<path d="M40 70 Q100 54 160 70 L160 94 Q100 78 40 94 Z" fill="url(#${id}w)" clip-path="url(#${id}c)"/>
<g fill="#ef5f57"><rect x="94" y="56" width="12" height="28" rx="3"/><rect x="86" y="64" width="28" height="12" rx="3"/></g>
${face(82, 118, 122, 140, animate, 1.4)}`;
    case 'architect':
      return `${ground(id)}
<path d="M62 62 Q68 48 84 48 L118 48 Q134 48 140 62 L178 158 Q184 178 164 178 L36 178 Q16 178 22 158 Z" fill="${fill}" ${rim}/>
${shine(id, 84, 74, 26, 14)}
${face(80, 122, 110, 128, animate, 2.1)}
<g transform="rotate(-18 146 152)"><rect x="118" y="138" width="58" height="28" rx="14" fill="url(#${id}w)" stroke="#d6d9e8" stroke-width="1"/><ellipse cx="122" cy="152" rx="6" ry="13" fill="#e9ecf6" stroke="#cfd4e6" stroke-width="1"/><path d="M134 146 L148 146 L148 158 L160 158 M156 144 L156 152 L166 152" fill="none" stroke="#5876cf" stroke-width="2" stroke-linecap="round"/></g>`;
    case 'engineer': {
      const bolt = isDark(base) ? '#fff1bf' : '#3b3f62';
      return `${ground(id)}
<path d="M100 40 L168 88 L144 168 L56 168 L32 88 Z" fill="${fill}" stroke="${fill}" stroke-width="22" stroke-linejoin="round"/>
${shine(id, 78, 82, 28, 16)}
${face(78, 122, 110, 128, animate, 2.8)}
<path d="M104 141 L89 160 L99 160 L94 174 L111 153 L101 153 L106 141 Z" fill="${bolt}" stroke="${bolt}" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    case 'florist':
      return `${ground(id)}
<path d="M22 162 C18 110 54 70 100 70 C146 70 182 110 178 162 C176 178 166 180 152 180 L48 180 C34 180 24 178 22 162 Z" fill="${fill}" ${rim}/>
${shine(id, 72, 96, 32, 16)}
<g transform="translate(146 72)"><g fill="#fffdf8" stroke="#ebe4d8" stroke-width="1">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-13" rx="9" ry="12" transform="rotate(${a})"/>`).join('')}</g><circle r="7" fill="#f4bf3a"/></g>
${face(80, 120, 128, 146, animate, 3.5)}`;
  }
}

/** The character as an SVG document. `animate` adds a blink (browsers only; native ignores it). */
export function characterSvg(kind: CharacterKind, color: string, animate = true, plain = false): string {
  const base = CLAY[color] ?? (color?.startsWith?.('#') ? color : CLAY.cyan);
  const id = `c${kind.slice(0, 3)}${base.slice(1)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${defs(id, base)}${body(kind, id, base, animate, plain)}</svg>`;
}

const cache = new Map<string, string>();
/** Data URI for an <img>. `plain` drops the small badge (the accountant's calculator), as in the logo. Cached, since rosters show the same few bots many times. */
export function characterDataUri(shape: string, color: string, animate = true, plain = false): string {
  const key = `${shape}|${color}|${animate}|${plain}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(characterSvg(characterKind(shape), color, animate, plain));
    cache.set(key, uri);
  }
  return uri;
}
