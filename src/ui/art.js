// Original, generated artwork for the front end: club crests and trophies
// (player figures and covers live in hero.js). Everything is drawn from team colours, so no licensed assets
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
  // Unique gradient id: a shared id breaks when the first copy sits in a hidden screen.
  const id = nextId('ball');
  return `<svg class="ball-ico" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="${id}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#dfe5ef"/><stop offset="1" stop-color="#8d98ab"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#${id})"/>
    <path d="M50 30 L66 42 L60 61 L40 61 L34 42 Z" fill="#111"/>
    <path d="M50 30 L50 6 M66 42 L88 34 M60 61 L74 82 M40 61 L26 82 M34 42 L12 34" stroke="#111" stroke-width="3"/>
  </svg>`;
}
