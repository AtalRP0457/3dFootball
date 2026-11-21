// Materials for the footballer: kit (shirt, sleeves, shorts, socks), boots,
// skin, face, hair, gloves and the captain's armband.
//
// Textures are drawn on canvases (no third-party artwork): jersey pattern
// from the team's kit design, collar and cuffs, chest crest (the team's own
// crest image when available), small front number, surname and big number
// on the back. Materials are cached and shared: all outfield players of a
// team share sleeves/shorts/socks; shirts differ only by number and name.

import * as THREE from 'three';
import { SLOT, SLOT_COUNT } from './body.js';

const hasDOM = typeof document !== 'undefined';
const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  return t;
}
export function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}
const contrast = (hex) => (luminance(hex) > 0.58 ? '#111318' : '#ffffff');

// ---------- crest images ----------
const crestImages = new Map();
function crestImage(url, onLoad) {
  if (!url || !hasDOM) return null;
  let entry = crestImages.get(url);
  if (!entry) {
    const img = new Image();
    entry = { img, ready: false, waiters: [] };
    img.onload = () => { entry.ready = true; for (const f of entry.waiters) f(); entry.waiters = []; };
    img.onerror = () => { entry.failed = true; };
    img.src = url;
    crestImages.set(url, entry);
  }
  if (!entry.ready && onLoad && !entry.failed) entry.waiters.push(onLoad);
  return entry;
}

// ---------- kit pattern ----------
function drawPattern(g, w, h, kit, base) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const sec = kit.secondary;
  if (!sec || !kit.design || kit.keeper) return;
  g.fillStyle = sec;
  const d = kit.design;
  if (d === 'stripes') for (let x = 0; x < w; x += w / 12) g.fillRect(x, 0, w / 24, h);
  if (d === 'pinstripes') for (let x = 0; x < w; x += w / 40) g.fillRect(x, 0, 2, h);
  if (d === 'hoops') for (let y = h * 0.08; y < h; y += h / 6) g.fillRect(0, y, w, h / 12);
  if (d === 'halves') { g.fillRect(0, 0, w * 0.25, h); g.fillRect(w * 0.75, 0, w * 0.25, h); }
  if (d === 'quarters') { g.fillRect(0, 0, w * 0.25, h / 2); g.fillRect(w * 0.25, h / 2, w * 0.25, h / 2); g.fillRect(w * 0.5, 0, w * 0.25, h / 2); g.fillRect(w * 0.75, h / 2, w * 0.25, h / 2); }
  if (d === 'band') g.fillRect(0, h * 0.36, w, h * 0.14);
  if (d === 'side') { g.fillRect(0, 0, w * 0.06, h); g.fillRect(w * 0.44, 0, w * 0.12, h); g.fillRect(w * 0.94, 0, w * 0.06, h); }
  if (d === 'sash') {
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.05); g.lineTo(w * 0.18, 0); g.lineTo(w * 0.4, h); g.lineTo(w * 0.32, h);
    g.closePath(); g.fill();
  }
  if (d === 'chevron') {
    g.beginPath();
    g.moveTo(w * 0.05, h * 0.6); g.lineTo(w * 0.25, h * 0.4); g.lineTo(w * 0.45, h * 0.6);
    g.lineTo(w * 0.45, h * 0.68); g.lineTo(w * 0.25, h * 0.48); g.lineTo(w * 0.05, h * 0.68);
    g.closePath(); g.fill();
  }
}

function fabric(g, w, h) {
  // Fine knit texture so the shirt reads as fabric up close.
  g.globalAlpha = 0.06;
  g.fillStyle = '#000000';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  g.globalAlpha = 0.05;
  g.fillStyle = '#ffffff';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  g.globalAlpha = 1;
}

/** Shirt torso texture: u = 0.25 front centre, 0.75 back centre; v = 0 hem, 1 collar. */
function shirtTexture(kit, number, surname, crestUrl) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const base = kit.keeper ? kit.gk : kit.shirt;
  const trim = kit.keeper ? shade(kit.gk, 0.6) : (kit.secondary && kit.secondary !== kit.shirt ? kit.secondary : contrast(kit.shirt));
  const ink = kit.keeper ? contrast(kit.gk) : (kit.design === 'stripes' || kit.design === 'hoops' ? '#ffffff' : contrast(kit.shirt));
  const paint = () => {
    drawPattern(g, W, H, kit, base);
    fabric(g, W, H);
    // Side panels and shoulder piping.
    g.fillStyle = shade(base, 0.82);
    g.fillRect(0, 0, W * 0.035, H); g.fillRect(W * 0.465, 0, W * 0.07, H); g.fillRect(W * 0.965, 0, W * 0.035, H);
    g.fillStyle = trim;
    g.fillRect(0, H * 0.04, W, H * 0.022); // ribbed collar band
    // V-neck at the front centre.
    g.beginPath();
    g.moveTo(W * 0.21, 0); g.lineTo(W * 0.25, H * 0.12); g.lineTo(W * 0.29, 0); g.closePath();
    g.fillStyle = trim; g.fill();
    g.beginPath();
    g.moveTo(W * 0.222, 0); g.lineTo(W * 0.25, H * 0.09); g.lineTo(W * 0.278, 0); g.closePath();
    g.fillStyle = shade(base, 0.55); g.fill();
    // Hem band.
    g.fillStyle = shade(base, 0.85);
    g.fillRect(0, H * 0.97, W, H * 0.03);
    // Front: crest on the player's left chest (u > 0.25), number centre.
    const crest = crestImage(crestUrl, () => { paint(); t.needsUpdate = true; });
    const cx = W * 0.31, cy = H * 0.3, cs = W * 0.06; // player's left chest
    if (crest?.ready) {
      g.drawImage(crest.img, cx - cs / 2, cy - cs / 2, cs, cs);
    } else {
      g.fillStyle = trim; g.beginPath(); g.arc(cx, cy, cs * 0.42, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = ink;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(H * 0.11)}px "Arial Black", Arial, sans-serif`;
    g.fillText(String(number), W * 0.25, H * 0.5);
    // Back: surname and big number.
    g.font = `800 ${Math.round(H * 0.06)}px Arial, sans-serif`;
    const name = (surname || '').toUpperCase().slice(0, 14);
    g.save();
    g.translate(W * 0.75, H * 0.22);
    g.scale(Math.min(1, (W * 0.2) / Math.max(1, g.measureText(name).width)), 1);
    g.fillText(name, 0, 0);
    g.restore();
    g.font = `900 ${Math.round(H * 0.3)}px "Arial Black", Arial, sans-serif`;
    g.lineWidth = 6; g.strokeStyle = shade(ink === '#ffffff' ? base : '#ffffff', ink === '#ffffff' ? 0.5 : 1);
    g.strokeText(String(number), W * 0.75, H * 0.5);
    g.fillText(String(number), W * 0.75, H * 0.5);
  };
  // CanvasTexture (flipY) maps the top of the canvas to v = 1: the collar.
  const t = tex(c);
  paint();
  return t;
}

function bandTexture(base, band, { bandFrom = 0.86, bandTo = 0.96, stripe = null, design = null, kit = null } = {}) {
  const W = 128, H = 128;
  const [c, g] = canvas(W, H);
  if (kit && design) drawPattern(g, W, H, kit, base); else { g.fillStyle = base; g.fillRect(0, 0, W, H); }
  fabric(g, W, H);
  g.fillStyle = band;
  // v = 1 is the top of the canvas.
  g.fillRect(0, (1 - bandTo) * H, W, (bandTo - bandFrom) * H);
  if (stripe) {
    g.fillStyle = stripe;
    g.fillRect(0, 0, W * 0.04, H); g.fillRect(W * 0.48, 0, W * 0.04, H); g.fillRect(W * 0.96, 0, W * 0.04, H);
  }
  return tex(c);
}

/** Face: skin, eyes, brows, lips and stubble. u = 0.25 is the front. */
function faceTexture(identity) {
  const W = 512, H = 256;
  const [c, g] = canvas(W, H);
  const skin = identity.skinTone;
  g.fillStyle = skin; g.fillRect(0, 0, W, H);
  const X = (u) => u * W, Y = (v) => (1 - v) * H;
  // Soft shading under the cheekbones and jaw.
  const grad = g.createLinearGradient(0, Y(0.45), 0, Y(0));
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad; g.fillRect(0, Y(0.45), W, Y(0) - Y(0.45));
  const hair = identity.hair.hex;
  const dark = luminance(skin) < 0.45;
  // Stubble / beard shadow on the jaw.
  if (identity.facialHair !== 'none') {
    // Jaw, chin and upper lip only; cheeks stay clear.
    g.globalAlpha = identity.facialHair === 'stubble' ? 0.16 : 0.3;
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(X(0.25), Y(0.15), X(0.11), (Y(0.02) - Y(0.3)) / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(X(0.25), Y(0.31), X(0.035), 6, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = skin; // keep lips clear
    g.beginPath(); g.ellipse(X(0.25), Y(0.27), X(0.03), 7, 0, 0, Math.PI * 2); g.fill();
  }
  // Eyes.
  for (const s of [-1, 1]) {
    const ex = X(0.25 + s * 0.055), ey = Y(0.53);
    g.fillStyle = '#f4f1ea';
    g.beginPath(); g.ellipse(ex, ey, 11, 5.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = identity.eyes;
    g.beginPath(); g.arc(ex, ey, 4.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0b0b';
    g.beginPath(); g.arc(ex, ey, 2, 0, Math.PI * 2); g.fill();
    // Upper lid line and lid shadow.
    g.strokeStyle = 'rgba(30,18,12,0.85)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(ex, ey, 11.5, 6, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    // Brows.
    g.strokeStyle = identity.hair.color === 'grey' ? '#6e6a66' : shade(hair, 0.9); g.lineWidth = 4.5; g.lineCap = 'round';
    // Arched brow, thicker towards the nose.
    g.beginPath(); g.moveTo(ex - 13 * s, Y(0.612)); g.quadraticCurveTo(ex, Y(0.638), ex + 13 * s, Y(0.6)); g.stroke();
  }
  // Nose shadow and nostrils.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.beginPath(); g.ellipse(X(0.25), Y(0.4), 8, 16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(40,20,15,0.45)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(X(0.25 + s * 0.012), Y(0.355), 3, 2, 0, 0, Math.PI * 2); g.fill(); }
  // Lips.
  g.fillStyle = dark ? shade(skin, 0.72) : '#b56d64';
  g.beginPath(); g.ellipse(X(0.25), Y(0.275), 15, 4.5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,15,12,0.6)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(X(0.25) - 15, Y(0.275)); g.quadraticCurveTo(X(0.25), Y(0.268), X(0.25) + 15, Y(0.275)); g.stroke();
  return tex(c);
}

function bootTexture(boots) {
  const W = 128, H = 64;
  const [c, g] = canvas(W, H);
  g.fillStyle = boots.upper; g.fillRect(0, 0, W, H);
  // Contrasting stripe sweeping along both sides (u = 0 and 0.5).
  g.strokeStyle = boots.accent; g.lineWidth = 6;
  for (const u0 of [0.02, 0.52]) {
    g.beginPath(); g.moveTo(W * (u0 - 0.06), H * 0.85); g.quadraticCurveTo(W * u0, H * 0.4, W * (u0 + 0.08), H * 0.15); g.stroke();
  }
  // Laces on top (u = 0.25).
  g.fillStyle = shade(boots.upper, 0.7);
  g.fillRect(W * 0.22, H * 0.15, W * 0.06, H * 0.45);
  g.strokeStyle = boots.accent; g.lineWidth = 1.5;
  for (let y = H * 0.18; y < H * 0.58; y += 5) { g.beginPath(); g.moveTo(W * 0.22, y); g.lineTo(W * 0.28, y + 2); g.stroke(); }
  return tex(c);
}

function armbandTexture() {
  const [c, g] = canvas(128, 32);
  g.fillStyle = '#ffd400'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#111111';
  g.font = '900 24px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [16, 48, 80, 112]) g.fillText('C', x, 17);
  return tex(c, { repeat: true });
}

const std = (o) => new THREE.MeshStandardMaterial(o);

/**
 * Material array (one per body slot) plus extra materials for hair, facial
 * hair and bands. `kit`: team kit (shirt, secondary, shorts, socks, sleeves,
 * design, gk). `opts`: { keeper, crestUrl, teamKey }.
 */
export function characterMaterials(identity, kit, opts = {}) {
  const keeper = !!opts.keeper;
  const teamKey = opts.teamKey || `${kit.shirt}|${kit.secondary}|${kit.shorts}|${kit.socks}|${kit.design}|${kit.gk}`;
  const k = keeper ? { ...kit, keeper: true } : kit;
  const surname = String(identity.name || '').trim().split(/\s+/).slice(-1)[0];
  const shirtBase = keeper ? kit.gk : kit.shirt;
  const sleeveBase = keeper ? kit.gk : (kit.sleeves || kit.shirt);
  const trim = keeper ? shade(kit.gk, 0.6) : (kit.secondary && kit.secondary !== kit.shirt ? kit.secondary : contrast(kit.shirt));
  const shortsCol = keeper ? '#1b1d22' : kit.shorts;
  const socksCol = keeper ? kit.gk : kit.socks;

  const fabricMat = (map, color) => std({ map, color: map ? 0xffffff : color, roughness: 0.82, metalness: 0 });
  const mats = new Array(SLOT_COUNT);
  mats[SLOT.skin] = cached(`skin|${identity.skinTone}`, () => std({ color: identity.skinTone, roughness: 0.62, metalness: 0 }));
  mats[SLOT.face] = hasDOM
    ? cached(`face|${identity.id}`, () => std({ map: faceTexture(identity), roughness: 0.6 }))
    : mats[SLOT.skin];
  mats[SLOT.shirt] = hasDOM
    ? cached(`shirt|${teamKey}|${keeper}|${identity.number}|${surname}|${opts.crestUrl || ''}`,
      () => fabricMat(shirtTexture(k, identity.number, surname, opts.crestUrl)))
    : fabricMat(null, shirtBase);
  mats[SLOT.sleeve] = hasDOM
    ? cached(`sleeve|${teamKey}|${keeper}`, () => fabricMat(bandTexture(sleeveBase, trim, { bandFrom: 0.84, bandTo: 0.97, kit: k, design: !keeper && kit.design === 'stripes' })))
    : fabricMat(null, sleeveBase);
  mats[SLOT.shorts] = hasDOM
    ? cached(`shorts|${teamKey}|${keeper}`, () => fabricMat(bandTexture(shortsCol, shade(shortsCol, 0.8), { bandFrom: 0.0, bandTo: 0.05, stripe: keeper ? null : trim })))
    : fabricMat(null, shortsCol);
  mats[SLOT.socks] = hasDOM
    ? cached(`socks|${teamKey}|${keeper}`, () => fabricMat(bandTexture(socksCol, trim, { bandFrom: 0.8, bandTo: 0.9 })))
    : fabricMat(null, socksCol);
  mats[SLOT.boot] = hasDOM
    ? cached(`boot|${identity.boots.id}`, () => std({ map: bootTexture(identity.boots), roughness: 0.32, metalness: 0.08 }))
    : std({ color: identity.boots.upper, roughness: 0.32 });
  mats[SLOT.sole] = cached(`sole|${identity.boots.id}`, () => std({ color: identity.boots.sole, roughness: 0.5 }));
  mats[SLOT.hands] = keeper
    ? cached(`gloves|${kit.gk}`, () => std({ color: shade(kit.gk, 0.75), roughness: 0.55 }))
    : mats[SLOT.skin];

  const hair = cached(`hair|${identity.hair.hex}`, () => std({ color: identity.hair.hex, roughness: 0.85, side: THREE.DoubleSide }));
  const armband = hasDOM ? cached('armband', () => std({ map: armbandTexture(), roughness: 0.6, side: THREE.DoubleSide })) : std({ color: '#ffd400', side: THREE.DoubleSide });
  const tape = cached('tape', () => std({ color: '#f2f2f2', roughness: 0.7, side: THREE.DoubleSide }));
  const headband = cached(`headband|${trim}`, () => std({ color: trim, roughness: 0.7, side: THREE.DoubleSide }));
  return { slots: mats, hair, armband, tape, headband };
}

export function disposeCharacterMaterials() {
  for (const m of cache.values()) { m.map?.dispose(); m.dispose(); }
  cache.clear();
}
