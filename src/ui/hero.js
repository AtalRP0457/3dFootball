// Original painted-style player figures and game covers, drawn from team
// colours. Limbs are tapered capsules with cylindrical shading and stadium
// rim light, so one skeleton can be posed (standing, fist pump, arms up from
// behind, roar). No photos or licensed artwork are used.
import { esc, shade, luminance } from './art.js';

let uid = 0;
const nid = (p) => `${p}${++uid}`;
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; }; }

const SKINS = ['#f0c6a2', '#dcaa82', '#c58a60', '#a06a45', '#7b4d31', '#583521'];
const HAIRS = ['#16100b', '#2a1c11', '#43291a', '#6e4a2b', '#a77d48', '#0b0b0b'];
const ink = (hex) => (luminance(hex) > 0.42 ? '#101522' : '#ffffff');

// ---- pose skeletons (viewBox 0 -90 400 850, feet at ~740) ----
const BASE_LEGS = { lHip: [172, 352], lKnee: [166, 540], lAnkle: [164, 700], rHip: [228, 352], rKnee: [236, 540], rAnkle: [240, 700] };
const POSES = {
  stand: { view: 'front', mouth: 'calm', ...BASE_LEGS,
    lSh: [134, 160], lEl: [110, 268], lHa: [108, 366], rSh: [266, 160], rEl: [290, 268], rHa: [292, 366] },
  fist: { view: 'front', mouth: 'shout', ...BASE_LEGS, rAnkle: [252, 700], rKnee: [244, 540],
    lSh: [134, 160], lEl: [98, 262], lHa: [128, 338], rSh: [266, 160], rEl: [350, 196], rHa: [336, 70] },
  roar: { view: 'front', mouth: 'shout', ...BASE_LEGS, lAnkle: [150, 700], lKnee: [156, 540], rAnkle: [252, 700], rKnee: [246, 540],
    lSh: [134, 160], lEl: [66, 236], lHa: [74, 140], rSh: [266, 160], rEl: [334, 236], rHa: [326, 140] },
  back: { view: 'back', mouth: 'calm', ...BASE_LEGS,
    lSh: [134, 160], lEl: [86, 64], lHa: [80, -38], rSh: [266, 160], rEl: [314, 64], rHa: [320, -38] },
};

/** Tapered limb with a slight muscle bulge, shaded like a cylinder. */
function limb(defs, a, b, wa, wb, color, { bulge = 6, light = 0.28, caps = 'both' } = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx > 0) { nx = -nx; ny = -ny; } // light always from the left
  const p = (pt, w, s) => [pt[0] + nx * w / 2 * s, pt[1] + ny * w / 2 * s];
  const a1 = p(a, wa, 1), a2 = p(a, wa, -1), b1 = p(b, wb, 1), b2 = p(b, wb, -1);
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], wm = (wa + wb) / 2;
  const c1 = [m[0] + nx * (wm / 2 + bulge), m[1] + ny * (wm / 2 + bulge)];
  const c2 = [m[0] - nx * (wm / 2 + bulge * 0.6), m[1] - ny * (wm / 2 + bulge * 0.6)];
  const id = nid('g');
  const g1 = [m[0] + nx * wm * 0.62, m[1] + ny * wm * 0.62], g2 = [m[0] - nx * wm * 0.62, m[1] - ny * wm * 0.62];
  defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g1[0]}" y1="${g1[1]}" x2="${g2[0]}" y2="${g2[1]}">
    <stop offset="0" stop-color="${shade(color, light)}"/><stop offset=".38" stop-color="${color}"/><stop offset=".82" stop-color="${shade(color, -0.42)}"/>
    <stop offset=".95" stop-color="${shade(color, -0.55)}"/><stop offset="1" stop-color="${shade(color, 0.35)}"/></linearGradient>`);
  const f = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  return `<path d="M${f(a1)} Q${f(c1)} ${f(b1)} L${f(b2)} Q${f(c2)} ${f(a2)} Z" fill="url(#${id})"/>
    ${caps === 'both' || caps === 'start' ? `<circle cx="${a[0]}" cy="${a[1]}" r="${wa / 2}" fill="url(#${id})"/>` : ''}${caps === 'both' || caps === 'end' ? `<circle cx="${b[0]}" cy="${b[1]}" r="${wb / 2}" fill="url(#${id})"/>` : ''}`;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function kitPattern(design, sec, clip) {
  if (!sec || !design || design === 'plain') return '';
  const r = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${sec}"/>`;
  let s = '';
  if (design === 'stripes') for (let x = 120; x < 290; x += 44) s += r(x, 100, 22, 270);
  else if (design === 'pinstripes') for (let x = 112; x < 290; x += 16) s += r(x, 100, 4, 270);
  else if (design === 'hoops') for (let y = 150; y < 360; y += 48) s += r(100, y, 200, 24);
  else if (design === 'halves') s += r(200, 100, 100, 270);
  else if (design === 'quarters') s += r(200, 100, 100, 130) + r(100, 230, 100, 140);
  else if (design === 'band') s += r(100, 200, 200, 40);
  else if (design === 'side') s += r(100, 100, 40, 270) + r(260, 100, 40, 270);
  else if (design === 'sash') s += `<path d="M110 130 L140 110 L300 330 L270 350 Z" fill="${sec}"/>`;
  else if (design === 'chevron') s += `<path d="M100 170 L200 230 L300 170 L300 200 L200 260 L100 200 Z" fill="${sec}"/>`;
  return s ? `<g clip-path="url(#${clip})" opacity=".95">${s}</g>` : '';
}

/**
 * Full-body player. `player` needs a name (drives skin/hair/beard) and number.
 * Options: pose ('stand' | 'fist' | 'roar' | 'back'), keeper, flip, nameOnBack.
 */
export function heroFigure(player, kit, { pose = 'stand', keeper = false, flip = false, cls = 'player-fig', crop = false, sized = false } = {}) {
  const P = POSES[pose] || POSES.stand;
  const h = hash(player.name || 'x');
  const skin = player.skin || SKINS[h % SKINS.length];
  const hair = HAIRS[(h >>> 3) % HAIRS.length];
  const hairStyle = (h >>> 6) % 4;
  const beard = ((h >>> 9) % 3) === 0;
  const shirt = keeper ? (kit.gk || '#2e7d32') : kit.shirt;
  const sec = keeper ? shade(shirt, -0.3) : (kit.secondary || null);
  const shorts = keeper ? shade(shirt, -0.45) : kit.shorts;
  const socks = keeper ? shirt : kit.socks;
  const trim = keeper ? '#ffffff' : (Math.abs(luminance(kit.shirt) - luminance(kit.shorts)) > 0.18 ? kit.shorts : (kit.secondary || ink(shirt)));
  const defs = [];
  const id = nid('h');
  const out = [];
  const back = P.view === 'back';

  // shadow
  out.push(`<ellipse cx="202" cy="744" rx="130" ry="15" fill="#000" opacity=".5" filter="url(#${id}blur)"/>`);
  // legs (skin, socks, boots)
  for (const s of ['l', 'r']) {
    const hip = P[`${s}Hip`], knee = P[`${s}Knee`], ank = P[`${s}Ankle`];
    out.push(limb(defs, hip, knee, 72, 48, skin, { bulge: 9 }));
    out.push(limb(defs, knee, ank, 48, 28, skin, { bulge: 10 }));
    const sTop = lerp(knee, ank, 0.1);
    out.push(limb(defs, sTop, ank, 50, 30, socks, { bulge: 7, light: 0.22, caps: 'end' }));
    const band = lerp(knee, ank, 0.2);
    out.push(limb(defs, lerp(knee, ank, 0.14), band, 52, 48, trim, { bulge: 6, light: 0.2, caps: 'none' }));
    const dir = s === 'l' ? -1 : 1;
    const bx = ank[0], by = ank[1];
    const boot = back
      ? `M${bx - 18} ${by - 8} C${bx - 22} ${by + 18} ${bx - 18} ${by + 38} ${bx} ${by + 40} C${bx + 18} ${by + 38} ${bx + 22} ${by + 18} ${bx + 18} ${by - 8} Z`
      : `M${bx - 17} ${by - 10} C${bx - 22} ${by + 14} ${bx - 12 + dir * 6} ${by + 42} ${bx + dir * 8} ${by + 42} C${bx + dir * 26} ${by + 42} ${bx + 22} ${by + 18} ${bx + 17} ${by - 10} Z`;
    out.push(`<path d="${boot}" fill="#121318"/><path d="${boot}" fill="url(#${id}boot)"/>`);
  }
  // shorts
  const shortsPath = 'M140 334 L260 334 L272 452 C250 458 222 458 206 450 L200 410 L194 450 C178 458 150 458 128 452 Z';
  defs.push(`<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(shorts, 0.25)}"/><stop offset=".45" stop-color="${shorts}"/><stop offset="1" stop-color="${shade(shorts, -0.5)}"/></linearGradient>`);
  out.push(`<path d="${shortsPath}" fill="url(#${id}sh)"/>`);
  out.push(`<path d="M130 440 L194 444 M206 444 L270 440" stroke="${trim}" stroke-width="6" opacity=".9"/>`);
  out.push(`<path d="M172 350 C176 380 170 410 168 440 M232 350 C228 380 232 410 236 440" stroke="#000" stroke-opacity=".22" stroke-width="6" fill="none" filter="url(#${id}soft)"/>`);

  // torso
  const torso = 'M150 128 C172 120 186 128 200 132 C214 128 228 120 250 128 C268 134 282 146 284 170 C282 212 268 236 264 262 L262 350 C222 362 178 362 138 350 L136 262 C132 236 118 212 116 170 C118 146 132 134 150 128 Z';
  defs.push(`<clipPath id="${id}tc"><path d="${torso}"/></clipPath>`);
  defs.push(`<linearGradient id="${id}ts" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".28"/><stop offset=".96" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#bcd6ff" stop-opacity=".5"/></linearGradient>`);
  const armsBehind = pose === 'stand' ? false : true;
  const arms = [];
  for (const s of ['l', 'r']) {
    const sh = P[`${s}Sh`], el = P[`${s}El`], ha = P[`${s}Ha`];
    arms.push(limb(defs, sh, el, 46, 36, skin, { bulge: 7 }));
    arms.push(limb(defs, el, ha, 36, 26, skin, { bulge: 6 }));
    // hand / fist
    const clenched = pose !== 'stand';
    arms.push(`<ellipse cx="${ha[0]}" cy="${ha[1] + (clenched ? 0 : 8)}" rx="${clenched ? 17 : 14}" ry="${clenched ? 17 : 20}" fill="${shade(skin, -0.12)}"/>
      <ellipse cx="${ha[0] - 4}" cy="${ha[1] - 3}" rx="8" ry="7" fill="${shade(skin, 0.18)}" opacity=".6"/>`);
    // sleeves
    const sEnd = keeper ? lerp(el, ha, 0.85) : lerp(sh, el, 0.48);
    if (keeper) { arms.push(limb(defs, sh, el, 54, 42, shirt, { bulge: 6, light: 0.25 })); arms.push(limb(defs, el, sEnd, 42, 32, shirt, { bulge: 4, light: 0.25, caps: 'start' })); }
    else arms.push(limb(defs, sh, sEnd, 56, 46, shirt, { bulge: 5, light: 0.25, caps: 'start' }));
    const cuffA = keeper ? lerp(el, ha, 0.78) : lerp(sh, el, 0.42);
    arms.push(limb(defs, cuffA, sEnd, keeper ? 44 : 49, keeper ? 34 : 48, trim, { bulge: 1, light: 0.2, caps: 'none' }));
  }
  if (!armsBehind) out.push(...arms.slice(0));
  out.push(`<path d="${torso}" fill="${shirt}"/>`);
  out.push(kitPattern(keeper ? null : kit.design, sec, `${id}tc`));
  // fabric folds + shading
  out.push(`<g clip-path="url(#${id}tc)" filter="url(#${id}soft)" fill="none" stroke-linecap="round">
    <path d="M150 300 C175 290 190 312 214 300 M166 214 C186 236 214 236 236 218 M140 250 C150 280 146 320 150 350" stroke="#000" stroke-opacity=".18" stroke-width="7"/>
    <path d="M156 196 C176 210 196 206 210 196 M232 280 C244 300 248 320 246 344" stroke="#fff" stroke-opacity=".14" stroke-width="5"/></g>`);
  out.push(`<path d="${torso}" fill="url(#${id}ts)"/>`);
  if (armsBehind) out.push(...arms);
  // collar
  if (!back) out.push(`<path d="M176 128 C186 152 214 152 224 128" fill="none" stroke="${trim}" stroke-width="8" stroke-linecap="round"/>`);
  else out.push(`<path d="M172 126 C188 136 212 136 228 126" fill="none" stroke="${trim}" stroke-width="7" stroke-linecap="round"/>`);
  // number / crest
  const num = esc(player.number ?? '');
  const nInk = ink(sec && (kit.design === 'stripes' || kit.design === 'halves') ? shade(shirt, -0.1) : shirt);
  const tx = flip ? 'transform="translate(400 0) scale(-1 1)"' : '';
  if (back) {
    const nm = esc(String(player.backName || player.name || '').split(' ').slice(-1)[0].toUpperCase().slice(0, 12));
    out.push(`<g ${tx}><text x="200" y="196" text-anchor="middle" font-family="Oswald, 'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" font-size="${nm.length > 8 ? 26 : 32}" letter-spacing="4" fill="${nInk}">${nm}</text>
      <text x="200" y="320" text-anchor="middle" font-family="Oswald, 'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" font-size="128" fill="${nInk}" stroke="${shade(shirt, -0.5)}" stroke-width="2">${num}</text></g>`);
  } else {
    out.push(`<g ${tx}><text x="200" y="${pose === 'stand' ? 286 : 290}" text-anchor="middle" font-family="Oswald, 'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" font-size="64" fill="${nInk}" opacity=".95">${num}</text></g>
      <path d="M232 170 l16 0 0 16 c0 8 -8 12 -8 12 c0 0 -8 -4 -8 -12 Z" fill="${trim}" opacity=".9"/>`);
  }

  // neck + head
  out.push(limb(defs, [200, 96], [200, 136], 46, 50, shade(skin, -0.1), { bulge: 0 }));
  const hx = 200, hy = 58;
  defs.push(`<radialGradient id="${id}face" cx=".36" cy=".34" r=".78"><stop offset="0" stop-color="${shade(skin, 0.2)}"/><stop offset=".55" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.5)}"/></radialGradient>`);
  const head = `M${hx - 30} ${hy - 8} C${hx - 33} ${hy + 26} ${hx - 18} ${hy + 48} ${hx} ${hy + 52} C${hx + 18} ${hy + 48} ${hx + 33} ${hy + 26} ${hx + 30} ${hy - 8} C${hx + 30} ${hy - 50} ${hx - 30} ${hy - 50} ${hx - 30} ${hy - 8} Z`;
  out.push(`<ellipse cx="${hx - 31}" cy="${hy + 6}" rx="7" ry="12" fill="${shade(skin, -0.12)}"/><ellipse cx="${hx + 31}" cy="${hy + 6}" rx="7" ry="12" fill="${shade(skin, -0.38)}"/>`);
  out.push(`<path d="${head}" fill="url(#${id}face)"/>`);
  if (!back) {
    const shout = P.mouth === 'shout';
    out.push(`<g filter="url(#${id}soft)">
      <ellipse cx="${hx - 12}" cy="${hy + 2}" rx="9" ry="5" fill="${shade(skin, -0.55)}" opacity=".75"/>
      <ellipse cx="${hx + 12}" cy="${hy + 2}" rx="9" ry="5" fill="${shade(skin, -0.6)}" opacity=".8"/>
      <path d="M${hx + 2} ${hy + 4} L${hx + 6} ${hy + 22} L${hx - 2} ${hy + 24}" stroke="${shade(skin, -0.45)}" stroke-width="4" fill="none" opacity=".7"/>
      <path d="M${hx - 24} ${hy + 18} C${hx - 20} ${hy + 30} ${hx - 14} ${hy + 36} ${hx - 6} ${hy + 40}" stroke="${shade(skin, -0.3)}" stroke-width="4" fill="none" opacity=".4"/></g>
      <path d="M${hx - 21} ${hy - 7} Q${hx - 12} ${hy - 12} ${hx - 4} ${hy - 7} M${hx + 4} ${hy - 7} Q${hx + 12} ${hy - 12} ${hx + 21} ${hy - 7}" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="${hx - 12}" cy="${hy + 2}" rx="5.5" ry="3" fill="#e9e2d6" opacity=".55"/><ellipse cx="${hx + 12}" cy="${hy + 2}" rx="5.5" ry="3" fill="#e9e2d6" opacity=".4"/>
      <circle cx="${hx - 11}" cy="${hy + 2}" r="3" fill="#24160f"/><circle cx="${hx + 13}" cy="${hy + 2}" r="3" fill="#24160f"/>
      <circle cx="${hx - 10}" cy="${hy + 1}" r=".9" fill="#fff" opacity=".8"/><circle cx="${hx + 14}" cy="${hy + 1}" r=".9" fill="#fff" opacity=".6"/>`);
    out.push(shout
      ? `<ellipse cx="${hx}" cy="${hy + 34}" rx="11" ry="10" fill="#2a0d0b"/><path d="M${hx - 9} ${hy + 28} Q${hx} ${hy + 25} ${hx + 9} ${hy + 28} L${hx + 8} ${hy + 31} L${hx - 8} ${hy + 31} Z" fill="#f1ece4"/>`
      : `<path d="M${hx - 9} ${hy + 33} Q${hx} ${hy + 36} ${hx + 9} ${hy + 33}" stroke="${shade(skin, -0.5)}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
    if (beard) out.push(`<path d="M${hx - 29} ${hy + 6} C${hx - 30} ${hy + 30} ${hx - 16} ${hy + 50} ${hx} ${hy + 53} C${hx + 16} ${hy + 50} ${hx + 30} ${hy + 30} ${hx + 29} ${hy + 6} C${hx + 24} ${hy + 22} ${hx + 16} ${hy + 26} ${hx} ${hy + 26} C${hx - 16} ${hy + 26} ${hx - 24} ${hy + 22} ${hx - 29} ${hy + 6} Z" fill="${hair}" opacity=".62"/>
      ${P.mouth === 'shout' ? `<ellipse cx="${hx}" cy="${hy + 34}" rx="11" ry="10" fill="#2a0d0b"/>` : ''}`);
  }
  const hairPaths = back ? [
    `M${hx - 31} ${hy + 10} C${hx - 36} ${hy - 52} ${hx + 36} ${hy - 52} ${hx + 31} ${hy + 10} C${hx + 28} ${hy + 30} ${hx - 28} ${hy + 30} ${hx - 31} ${hy + 10} Z`,
    `M${hx - 32} ${hy + 6} C${hx - 38} ${hy - 58} ${hx + 38} ${hy - 58} ${hx + 32} ${hy + 6} C${hx + 30} ${hy + 34} ${hx - 30} ${hy + 34} ${hx - 32} ${hy + 6} Z`,
    `M${hx - 30} ${hy + 4} C${hx - 33} ${hy - 48} ${hx + 33} ${hy - 48} ${hx + 30} ${hy + 4} C${hx + 26} ${hy + 22} ${hx - 26} ${hy + 22} ${hx - 30} ${hy + 4} Z`,
    `M${hx - 33} ${hy + 8} C${hx - 40} ${hy - 60} ${hx + 40} ${hy - 60} ${hx + 33} ${hy + 8} C${hx + 30} ${hy + 30} ${hx - 30} ${hy + 30} ${hx - 33} ${hy + 8} Z`,
  ] : [
    `M${hx - 31} ${hy - 2} C${hx - 36} ${hy - 54} ${hx + 36} ${hy - 54} ${hx + 31} ${hy - 2} C${hx + 28} ${hy - 22} ${hx + 10} ${hy - 26} ${hx} ${hy - 26} C${hx - 12} ${hy - 26} ${hx - 28} ${hy - 22} ${hx - 31} ${hy - 2} Z`,
    `M${hx - 32} ${hy - 4} C${hx - 40} ${hy - 62} ${hx + 26} ${hy - 76} ${hx + 34} ${hy - 6} C${hx + 26} ${hy - 30} ${hx + 6} ${hy - 30} ${hx - 6} ${hy - 28} C${hx - 20} ${hy - 26} ${hx - 28} ${hy - 20} ${hx - 32} ${hy - 4} Z`,
    `M${hx - 30} ${hy - 6} C${hx - 32} ${hy - 46} ${hx + 32} ${hy - 46} ${hx + 30} ${hy - 6} C${hx + 26} ${hy - 26} ${hx - 26} ${hy - 26} ${hx - 30} ${hy - 6} Z`,
    `M${hx - 34} ${hy} C${hx - 44} ${hy - 64} ${hx + 44} ${hy - 64} ${hx + 34} ${hy} C${hx + 30} ${hy - 20} ${hx + 18} ${hy - 22} ${hx + 6} ${hy - 24} C${hx - 8} ${hy - 22} ${hx - 26} ${hy - 22} ${hx - 34} ${hy} Z`,
  ];
  defs.push(`<linearGradient id="${id}hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(hair, 0.35)}"/><stop offset=".5" stop-color="${hair}"/><stop offset="1" stop-color="${shade(hair, -0.4)}"/></linearGradient>`);
  out.push(`<path d="${hairPaths[hairStyle]}" fill="url(#${id}hair)"/>`);
  if (hairStyle === 3) { // curls
    const r = rng(h);
    let curls = '';
    for (let i = 0; i < 16; i++) { const a = Math.PI * (0.05 + 0.9 * i / 15); curls += `<circle cx="${(hx - Math.cos(a) * 30).toFixed(1)}" cy="${(hy - 18 - Math.sin(a) * 26 + r() * 4).toFixed(1)}" r="${(6 + r() * 3).toFixed(1)}" fill="${shade(hair, r() * 0.25 - 0.1)}"/>`; }
    out.push(curls);
  }
  // stadium rim light on the whole silhouette edge (right side)
  out.push(`<path d="${torso}" fill="none" stroke="#cfe2ff" stroke-opacity=".35" stroke-width="3" clip-path="url(#${id}rim)"/>`);

  const vb = crop ? '40 -90 320 520' : '0 -90 400 850';
  return `<svg class="${cls}" ${sized ? 'x="0" y="0" width="400" height="850"' : ''} viewBox="${vb}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" ${flip ? 'style="transform:scaleX(-1)"' : ''}>
  <defs>${defs.join('')}
    <filter id="${id}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <linearGradient id="${id}boot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="${trim}" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    <clipPath id="${id}rim"><rect x="230" y="100" width="200" height="300"/></clipPath>
  </defs>
  ${out.join('')}
</svg>`;
}

// ---------------------------------------------------------------- covers
/** A cover ("box art") scene: night stadium, crowd, floodlights and a hero player.
 *  kind: 'fist' | 'back' | 'flag'. */
export function coverSVG(kind, { kit, player, flagColors, seed = 7, cx = 1080 } = {}) {
  const id = nid('cv');
  const r = rng(seed * 97 + kind.length);
  const c1 = kit?.shirt || '#c8102e', c2 = kit?.secondary || kit?.shorts || '#ffffff';
  const tint = { fist: ['#0b1e3d', '#123a6b'], back: ['#0c1a33', '#1d4f8f'], flag: ['#08121f', '#1b2f45'] }[kind] || ['#0b1e3d', '#123a6b'];
  let bokeh = '';
  for (let i = 0; i < 46; i++) {
    const x = r() * 1600, y = 60 + r() * 520, rad = 6 + r() * 34;
    const col = r() < 0.6 ? '#fff6dc' : r() < 0.5 ? '#9cc8ff' : shade(c1, 0.4);
    bokeh += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(1)}" fill="${col}" opacity="${(0.08 + r() * 0.3).toFixed(2)}"/>`;
  }
  let crowd = '';
  for (let i = 0; i < 520; i++) {
    const x = r() * 1640 - 20, y = 470 + r() * 260;
    const col = r() < 0.15 ? shade(c1, -0.1) : r() < 0.08 ? '#f2f2f2' : ['#1a2233', '#252b3a', '#30364a', '#141a26'][Math.floor(r() * 4)];
    crowd += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(5 + r() * 5).toFixed(1)}" ry="${(7 + r() * 6).toFixed(1)}" fill="${col}"/>`;
  }
  const floods = [[150, 40], [470, 10], [1130, 10], [1460, 40]].map(([x, y]) => `
    <g opacity=".95"><rect x="${x - 70}" y="${y}" width="140" height="44" rx="4" fill="#2a3448"/>
    ${[0, 1, 2, 3].map((k) => `<circle cx="${x - 48 + k * 32}" cy="${y + 22}" r="12" fill="#fffbe8"/>`).join('')}</g>
    <circle cx="${x}" cy="${y + 22}" r="120" fill="url(#${id}fl)"/>`).join('');
  const rays = [[150, 60], [470, 30], [1130, 30], [1460, 60]].map(([x, y]) =>
    `<path d="M${x} ${y} L${x - 260} 900 L${x + 120} 900 Z" fill="url(#${id}ray)" opacity=".5"/>`).join('');

  const pl = player || { name: 'Hero', number: 10 };
  let hero = '', extra = '';
  if (kind === 'back') {
    hero = `<g transform="translate(${cx - 440} -40) scale(2.2)">${heroFigure({ ...pl }, kit, { pose: 'back', cls: 'cv-fig', sized: true })}</g>`;
  } else if (kind === 'flag') {
    const fc = flagColors || [c1, '#ffffff', c1];
    const wave = (y0) => `M0 ${y0} C220 ${y0 - 60} 420 ${y0 + 60} 640 ${y0} C860 ${y0 - 60} 980 ${y0 + 40} 1100 ${y0}`;
    extra = `<g transform="translate(-80 40) rotate(-14)" filter="url(#${id}sm)" opacity=".95">
      <path d="${wave(120)} L1100 520 C980 560 860 470 640 520 C420 580 220 460 0 520 Z" fill="${fc[0]}"/>
      <path d="${wave(250)} L1100 390 C980 430 860 340 640 390 C420 450 220 330 0 390 Z" fill="${fc[1]}"/>
      <path d="${wave(120)} L1100 520 C980 560 860 470 640 520 C420 580 220 460 0 520 Z" fill="url(#${id}fold)"/>
      <rect x="-20" y="80" width="18" height="900" fill="#d8d8d8"/></g>
      ${[[220, 1.05, 0.5], [1240, 1.1, 0.55], [1420, 0.95, 0.4]].map(([x, s, o]) =>
        `<g transform="translate(${x} 300) scale(${s * 1.3})" opacity="${o}" filter="url(#${id}sm)">${heroFigure({ name: `mate${x}`, number: '' }, kit, { pose: x > 1300 ? 'stand' : 'roar', cls: 'cv-fig', sized: true })}</g>`).join('')}`;
    hero = `<g transform="translate(${cx - 440} 20) scale(2.2)">${heroFigure(pl, kit, { pose: 'roar', cls: 'cv-fig', sized: true })}</g>`;
  } else {
    hero = `<g transform="translate(${cx - 560} 40) scale(2.2)">${heroFigure(pl, kit, { pose: 'fist', cls: 'cv-fig', sized: true })}</g>`;
  }
  return `<svg class="cover-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <radialGradient id="${id}sky" cx=".5" cy=".25" r=".9"><stop offset="0" stop-color="${tint[1]}"/><stop offset=".6" stop-color="${tint[0]}"/><stop offset="1" stop-color="#03060d"/></radialGradient>
    <radialGradient id="${id}fl"><stop offset="0" stop-color="#fffbe6" stop-opacity=".9"/><stop offset=".3" stop-color="#fff2c0" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8dd" stop-opacity=".35"/><stop offset="1" stop-color="#fff8dd" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}pitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f5b2e"/><stop offset="1" stop-color="#0a1f10"/></linearGradient>
    <linearGradient id="${id}fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".25" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#000" stop-opacity=".3"/><stop offset=".75" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
    <linearGradient id="${id}grade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
    <filter id="${id}bk" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${id}cr" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="${id}sm" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#${id}sky)"/>
  ${rays}${floods}
  <g filter="url(#${id}bk)">${bokeh}</g>
  <path d="M0 450 L1600 430 L1600 760 L0 760 Z" fill="#0d1320"/>
  <g filter="url(#${id}cr)" opacity=".9">${crowd}</g>
  <rect x="0" y="720" width="1600" height="16" fill="${shade(c1, -0.2)}" opacity=".8"/>
  <path d="M0 736 L1600 736 L1600 900 L0 900 Z" fill="url(#${id}pitch)"/>
  ${extra}${hero}
  <rect width="1600" height="900" fill="url(#${id}grade)"/>
</svg>`;
}

// ---------------------------------------------------------------- your own images
// Optional, local-only images you have the rights to use. Put files in
//   public/assets/players/photos/  + manifest.json  { "<playerId>": "file.png" }
//   public/assets/covers/custom/   + manifest.json  { "covers": ["file.jpg", ...] }
// Both folders are git-ignored apart from their READMEs.
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
let photos = {};
let customCovers = [];
export function setPlayerPhotos(map) { photos = map && typeof map === 'object' ? map : {}; }
export function setCustomCovers(list) { customCovers = Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []; }
export const customCoverUrls = () => customCovers.map((f) => `${BASE}assets/covers/custom/${encodeURI(f)}`);
export async function loadUserImages() {
  const get = (p) => fetch(`${BASE}${p}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [ph, cv] = await Promise.all([get('assets/players/photos/manifest.json'), get('assets/covers/custom/manifest.json')]);
  setPlayerPhotos(ph);
  setCustomCovers(cv?.covers);
  return Object.keys(photos).length > 0 || customCovers.length > 0;
}

/** Player art for menus: your photo cut-out if you supplied one, else the painted figure. */
export function playerSVG(player, kit, opts = {}) {
  const file = player?.playerId && photos[player.playerId];
  if (file) return `<img class="player-fig player-photo" src="${BASE}assets/players/photos/${esc(encodeURI(file))}" alt="" decoding="async">`;
  return heroFigure(player || { name: '?' }, kit, opts);
}
