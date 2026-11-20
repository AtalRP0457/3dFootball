// Original, generated artwork for the front end: club crests, player figures
// and trophies. Everything is drawn from team colours, so no licensed assets
// are needed. Swap these for supplied artwork later without touching screens.

let uid = 0;
const nextId = (p) => `${p}${++uid}`;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export const inkOn = (hex) => (luminance(hex) > 0.45 ? '#0b1224' : '#ffffff');

/** A second colour that stands out against the shirt. */
export function accentFor(kit) {
  const d = (a, b) => Math.abs(luminance(a) - luminance(b));
  if (d(kit.shirt, kit.shorts) > 0.18) return kit.shorts;
  if (d(kit.shirt, kit.socks) > 0.18) return kit.socks;
  return luminance(kit.shirt) > 0.45 ? '#0b1224' : '#f2f2f2';
}

const initials = (s) => s.replace(/[^A-Za-z&\s-]/g, '').split(/[\s-]+/).filter(Boolean)
  .map((w) => (w === '&' ? '&' : w[0])).join('').slice(0, 3).toUpperCase();

/** Shield-shaped crest built from the team's kit colours. */
export function crestSVG(team, index = 0) {
  const id = nextId('cr');
  const base = team.kit.shirt;
  const acc = accentFor(team.kit);
  const pattern = index % 5; // stripes, hoops, sash, halves, chevron
  const shield = 'M100 8 L182 30 C184 92 172 160 100 212 C28 160 16 92 18 30 Z';
  let motif = '';
  if (pattern === 0) motif = [0, 1, 2].map((i) => `<rect x="${52 + i * 36}" y="0" width="18" height="230" fill="${acc}" opacity=".9"/>`).join('');
  if (pattern === 1) motif = [0, 1, 2].map((i) => `<rect x="0" y="${92 + i * 36}" width="200" height="16" fill="${acc}" opacity=".9"/>`).join('');
  if (pattern === 2) motif = `<path d="M20 70 L70 30 L190 170 L140 210 Z" fill="${acc}" opacity=".92"/>`;
  if (pattern === 3) motif = `<rect x="100" y="0" width="100" height="230" fill="${acc}" opacity=".92"/>`;
  if (pattern === 4) motif = `<path d="M18 120 L100 70 L182 120 L182 150 L100 100 L18 150 Z" fill="${acc}" opacity=".92"/>`;
  const decade = esc(team.name);
  const mono = esc(initials(team.nickname || team.name));
  return `<svg class="crest" viewBox="0 0 200 220" role="img" aria-label="${esc(team.nickname || team.name)} crest">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(base, 0.25)}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${shade(base, -0.35)}"/>
    </linearGradient>
    <linearGradient id="${id}rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#e2b33c"/><stop offset=".7" stop-color="#9a6b12"/><stop offset="1" stop-color="#f1cf6b"/>
    </linearGradient>
    <linearGradient id="${id}gl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${id}c"><path d="${shield}"/></clipPath>
  </defs>
  <path d="${shield}" fill="url(#${id}rim)" transform="translate(100 110) scale(1.06) translate(-100 -110)"/>
  <g clip-path="url(#${id}c)">
    <rect width="200" height="230" fill="url(#${id}g)"/>
    ${motif}
    <rect x="0" y="22" width="200" height="40" fill="#0b1224" opacity=".88"/>
    <rect width="200" height="120" fill="url(#${id}gl)"/>
  </g>
  <path d="${shield}" fill="none" stroke="#0b1224" stroke-opacity=".55" stroke-width="3"/>
  <text x="100" y="51" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="26" letter-spacing="3" fill="#f5d36b">${decade}</text>
  <circle cx="100" cy="128" r="38" fill="#0b1224" opacity=".82" stroke="url(#${id}rim)" stroke-width="4"/>
  <text x="100" y="${mono.length > 2 ? 140 : 142}" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="${mono.length > 2 ? 32 : 38}" fill="#fff">${mono}</text>
  <path d="M100 186 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z" fill="#f5d36b"/>
</svg>`;
}

const SKINS = ['#f1c7a5', '#e0ac85', '#c68b62', '#a26c47', '#7d4f32', '#5b3822'];
const HAIRS = ['#1a120d', '#2c1d12', '#4a2f1b', '#7a5230', '#b88a4f', '#0d0d0d'];
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/**
 * A lit, stylised full-body player in the team's kit. `flip` mirrors it so
 * two players can face each other.
 */
export function playerSVG(player, kit, { flip = false, keeper = false } = {}) {
  const id = nextId('pl');
  const h = hash(player.name);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >> 3) % HAIRS.length];
  const shirt = keeper ? kit.gk : kit.shirt;
  const shorts = keeper ? shade(kit.gk, -0.4) : kit.shorts;
  const socks = keeper ? kit.gk : kit.socks;
  const trim = keeper ? '#ffffff' : accentFor(kit);
  const num = esc(player.number ?? '');
  const ink = inkOn(shirt);
  const hairStyle = (h >> 6) % 3;
  const hairPath = [
    'M168 70 C168 44 232 40 234 72 C226 60 176 58 168 70 Z',
    'M166 74 C160 36 238 34 236 76 C232 58 222 54 200 54 C178 54 170 60 166 74 Z',
    'M170 66 C176 48 226 46 232 66 C220 60 182 60 170 66 Z',
  ][hairStyle];
  return `<svg class="player-fig" viewBox="0 0 400 760" preserveAspectRatio="xMidYMax meet" aria-hidden="true" ${flip ? 'style="transform:scaleX(-1)"' : ''}>
  <defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(shirt, 0.28)}"/><stop offset=".45" stop-color="${shirt}"/><stop offset="1" stop-color="${shade(shirt, -0.5)}"/>
    </linearGradient>
    <linearGradient id="${id}k" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(skin, 0.15)}"/><stop offset=".5" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.42)}"/>
    </linearGradient>
    <linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(shorts, 0.22)}"/><stop offset="1" stop-color="${shade(shorts, -0.5)}"/>
    </linearGradient>
    <linearGradient id="${id}o" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(socks, 0.2)}"/><stop offset="1" stop-color="${shade(socks, -0.5)}"/>
    </linearGradient>
    <radialGradient id="${id}r" cx=".85" cy=".3" r=".9">
      <stop offset="0" stop-color="#9cc4ff" stop-opacity=".55"/><stop offset=".4" stop-color="#9cc4ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}f"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <ellipse cx="200" cy="742" rx="120" ry="16" fill="#000" opacity=".55" filter="url(#${id}f)"/>
  <!-- legs -->
  <path d="M150 430 L196 430 L192 560 L188 690 L156 690 L152 560 Z" fill="url(#${id}k)"/>
  <path d="M206 430 L252 430 L250 560 L246 690 L214 690 L210 560 Z" fill="url(#${id}k)"/>
  <path d="M150 560 L194 560 L190 700 L154 700 Z" fill="url(#${id}o)"/>
  <path d="M208 560 L252 560 L248 700 L212 700 Z" fill="url(#${id}o)"/>
  <rect x="150" y="566" width="44" height="8" fill="${trim}" opacity=".85"/>
  <rect x="208" y="566" width="44" height="8" fill="${trim}" opacity=".85"/>
  <path d="M146 694 L196 694 L200 718 L130 722 C128 708 136 698 146 694 Z" fill="#111"/>
  <path d="M208 694 L254 694 C266 698 272 708 270 722 L206 718 Z" fill="#111"/>
  <path d="M136 716 L200 714" stroke="${trim}" stroke-width="4"/>
  <path d="M206 714 L268 716" stroke="${trim}" stroke-width="4"/>
  <!-- shorts -->
  <path d="M138 352 L264 352 L272 466 L208 470 L201 420 L194 470 L130 466 Z" fill="url(#${id}p)"/>
  <path d="M130 456 L194 460" stroke="${trim}" stroke-width="5"/><path d="M208 460 L272 456" stroke="${trim}" stroke-width="5"/>
  <!-- arms -->
  <path d="M112 176 C92 220 88 300 96 360 L122 362 C120 300 126 236 140 196 Z" fill="url(#${id}k)"/>
  <path d="M288 176 C308 220 312 300 304 360 L278 362 C280 300 274 236 260 196 Z" fill="url(#${id}k)"/>
  <ellipse cx="108" cy="370" rx="15" ry="19" fill="${shade(skin, -0.1)}"/>
  <ellipse cx="292" cy="370" rx="15" ry="19" fill="${shade(skin, -0.25)}"/>
  <!-- shirt -->
  <path d="M146 136 L176 128 C186 146 214 146 224 128 L254 136 C282 146 298 168 304 214 L276 228 L266 196 L268 362 L132 362 L134 196 L124 228 L96 214 C102 168 118 146 146 136 Z" fill="url(#${id}s)"/>
  <path d="M176 128 C186 150 214 150 224 128" fill="none" stroke="${trim}" stroke-width="7"/>
  <path d="M96 214 L124 228" stroke="${trim}" stroke-width="6"/><path d="M276 228 L304 214" stroke="${trim}" stroke-width="6"/>
  <path d="M146 136 C130 210 132 300 132 362" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="10"/>
  <text x="200" y="272" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="96" fill="${ink}" opacity=".92" ${flip ? 'transform="translate(400 0) scale(-1 1)"' : ''}>${num}</text>
  <!-- neck + head -->
  <path d="M184 104 L216 104 L218 134 C208 142 192 142 182 134 Z" fill="${shade(skin, -0.2)}"/>
  <ellipse cx="200" cy="78" rx="34" ry="42" fill="url(#${id}k)"/>
  <path d="${hairPath}" fill="${hair}"/>
  <ellipse cx="166" cy="82" rx="6" ry="10" fill="${shade(skin, -0.15)}"/>
  <!-- rim light -->
  <path d="M146 136 L176 128 C186 146 214 146 224 128 L254 136 C282 146 298 168 304 214 L276 228 L266 196 L268 362 L132 362 L134 196 L124 228 L96 214 C102 168 118 146 146 136 Z" fill="url(#${id}r)"/>
</svg>`;
}

/** Generic gold trophy (league shield style or tall cup). */
export function trophySVG(kind = 'cup') {
  const id = nextId('tr');
  const defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8a5a0c"/><stop offset=".3" stop-color="#ffe9a3"/><stop offset=".55" stop-color="#e0a92e"/><stop offset=".8" stop-color="#fff2c2"/><stop offset="1" stop-color="#7a4c08"/>
  </linearGradient></defs>`;
  if (kind === 'league') {
    return `<svg class="trophy" viewBox="0 0 200 260" aria-hidden="true">${defs}
      <path d="M58 30 C40 30 26 46 30 66 C34 86 52 94 66 92" fill="none" stroke="url(#${id})" stroke-width="10"/>
      <path d="M142 30 C160 30 174 46 170 66 C166 86 148 94 134 92" fill="none" stroke="url(#${id})" stroke-width="10"/>
      <path d="M52 18 L148 18 C148 92 128 132 100 140 C72 132 52 92 52 18 Z" fill="url(#${id})"/>
      <rect x="92" y="138" width="16" height="44" fill="url(#${id})"/>
      <path d="M66 182 L134 182 L144 214 L56 214 Z" fill="url(#${id})"/>
      <rect x="46" y="214" width="108" height="30" rx="4" fill="#1b1f2b" stroke="url(#${id})" stroke-width="4"/>
      <path d="M78 34 L84 110" stroke="#fff" stroke-opacity=".5" stroke-width="5"/>
    </svg>`;
  }
  return `<svg class="trophy" viewBox="0 0 200 260" aria-hidden="true">${defs}
    <ellipse cx="100" cy="60" rx="46" ry="52" fill="url(#${id})"/>
    <path d="M62 86 C68 130 84 150 92 176 L108 176 C116 150 132 130 138 86 Z" fill="url(#${id})"/>
    <path d="M70 40 C84 22 116 22 130 40" fill="none" stroke="#fff8d8" stroke-width="6" opacity=".7"/>
    <circle cx="100" cy="62" r="18" fill="none" stroke="#8a5a0c" stroke-width="4" opacity=".55"/>
    <path d="M78 176 L122 176 L130 206 L70 206 Z" fill="url(#${id})"/>
    <rect x="58" y="206" width="84" height="18" rx="3" fill="#2a7a3a"/>
    <rect x="52" y="224" width="96" height="24" rx="3" fill="url(#${id})"/>
  </svg>`;
}

export function ballSVG() {
  return `<svg class="ball-ico" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="bg-ball" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#dfe5ef"/><stop offset="1" stop-color="#8d98ab"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#bg-ball)"/>
    <path d="M50 30 L66 42 L60 61 L40 61 L34 42 Z" fill="#111"/>
    <path d="M50 30 L50 6 M66 42 L88 34 M60 61 L74 82 M40 61 L26 82 M34 42 L12 34" stroke="#111" stroke-width="3"/>
  </svg>`;
}
