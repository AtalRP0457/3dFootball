// Hair, facial hair and accessories. These are rigid meshes parented to a
// bone (head, upper arm, wrist) so they follow the animation. Geometry is
// built in the bone's local space and cached per style, so 22 players with
// the same haircut share one geometry.

import * as THREE from 'three';

const TAU = Math.PI * 2;
// Skull profile relative to the head bone: [y, rx, rzF, rzB, cz] (matches body.js).
const SKULL = [
  [0.055, 0.071, 0.088, 0.083, 0.012],
  [0.085, 0.075, 0.092, 0.09, 0.01],
  [0.115, 0.077, 0.092, 0.095, 0.006],
  [0.145, 0.079, 0.088, 0.099, 0.002],
  [0.175, 0.076, 0.078, 0.096, -0.004],
  [0.205, 0.064, 0.062, 0.084, -0.008],
  [0.228, 0.042, 0.04, 0.058, -0.01],
  [0.243, 0.012, 0.012, 0.016, -0.01],
];
function skullAt(y) {
  if (y <= SKULL[0][0]) return SKULL[0];
  for (let i = 0; i < SKULL.length - 1; i++) {
    const a = SKULL[i], b = SKULL[i + 1];
    if (y <= b[0]) {
      const k = (y - a[0]) / (b[0] - a[0]);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return SKULL[SKULL.length - 1];
}
/** Point on the skull surface at height y and angle phi (front = π/2), pushed out by t. */
function skullPoint(y, phi, t) {
  const [, rx, rzF, rzB, cz] = skullAt(y);
  const s = Math.sin(phi);
  return new THREE.Vector3((rx + t) * Math.cos(phi), y, cz + ((s >= 0 ? rzF : rzB) + t) * s);
}

// Deterministic noise for curls.
function noise(a, b) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Generic scalp shell: rows from `bottom(phi)` up to the crown, offset from
 * the skull by `thickness(phi, y01)`.
 */
function shell({ rows = 14, segs = 36, bottom, thickness, extra }) {
  const pos = [], idx = [];
  for (let r = 0; r <= rows; r++) {
    const f = r / rows;
    for (let k = 0; k <= segs; k++) {
      const phi = (k / segs) * TAU;
      const y0 = bottom(phi);
      const y = y0 + (0.248 - y0) * (1 - (1 - f) ** 1.3);
      const p = skullPoint(Math.min(y, 0.243), phi, thickness(phi, f));
      if (y > 0.243) p.y = 0.243 + thickness(phi, f) * 0.9;
      if (extra) extra(p, phi, f);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < segs; k++) {
      const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Hairline: high at the forehead, lower at the temples, lowest at the nape.
const front = (phi) => Math.max(0, Math.sin(phi));
const back = (phi) => Math.max(0, -Math.sin(phi));
const hairline = (phi, { fh = 0.168, side = 0.128, nape = 0.07 } = {}) =>
  side + (fh - side) * front(phi) ** 1.5 - (side - nape) * back(phi) ** 1.2;

const STYLES = {
  shaved: () => shell({ bottom: (p) => hairline(p, { nape: 0.08 }), thickness: () => 0.0025 }),
  buzz: () => shell({ bottom: (p) => hairline(p), thickness: () => 0.0055 }),
  short: () => shell({ bottom: (p) => hairline(p), thickness: (p, f) => 0.009 + 0.008 * f }),
  crop: () => shell({
    bottom: (p) => hairline(p, { fh: 0.155 }),
    thickness: (p, f) => 0.01 + 0.01 * f,
    // A textured fringe brushed forward.
    extra: (v, p, f) => { if (front(p) > 0.6 && f < 0.3) { v.z += 0.012 * (1 - f / 0.3); v.y -= 0.006; } },
  }),
  quiff: () => shell({
    bottom: (p) => hairline(p, { fh: 0.172 }),
    thickness: (p, f) => 0.008 + 0.005 * f + 0.018 * front(p) ** 2 * Math.sin(Math.PI * Math.min(1, f * 1.6)),
    extra: (v, p, f) => { if (front(p) > 0.5 && f < 0.6) v.y += 0.006 * front(p); },
  }),
  sidePart: () => shell({
    bottom: (p) => hairline(p),
    thickness: (p, f) => 0.012 + 0.008 * f + (Math.cos(p) > 0.3 ? 0.004 : 0),
    extra: (v, p, f) => { if (front(p) > 0.3) v.x -= 0.006 * f; },
  }),
  curly: () => shell({
    rows: 18, segs: 44,
    bottom: (p) => hairline(p, { fh: 0.162 }),
    thickness: (p, f) => 0.016 + 0.01 * f + 0.008 * noise(Math.round(p * 9), Math.round(f * 7)),
  }),
  afro: () => shell({
    rows: 20, segs: 48,
    bottom: (p) => hairline(p, { fh: 0.16, nape: 0.075 }),
    thickness: (p, f) => 0.03 + 0.03 * Math.sin(Math.PI * Math.min(1, 0.25 + f)) + 0.01 * noise(Math.round(p * 11), Math.round(f * 9)),
  }),
  manBun: () => {
    const g = shell({
      bottom: (p) => hairline(p),
      thickness: () => 0.009,
      extra: (v) => { v.y += 0.002; },
    });
    const bun = new THREE.SphereGeometry(0.035, 14, 10);
    bun.translate(0, 0.215, -0.085);
    return merge([g, bun]);
  },
  long: () => shell({
    rows: 18,
    bottom: (p) => hairline(p, { fh: 0.17, side: 0.06, nape: -0.02 }),
    thickness: (p, f) => 0.012 + 0.006 * f + 0.012 * back(p) * (1 - f),
    extra: (v, p, f) => { if (back(p) > 0.2 && f < 0.4) { v.z -= 0.01 * (0.4 - f); } },
  }),
};

function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

const hairCache = new Map();
export function hairGeometry(style) {
  if (!STYLES[style]) style = 'short';
  if (!hairCache.has(style)) hairCache.set(style, STYLES[style]());
  return hairCache.get(style);
}

/** Beard / goatee / moustache shells over the lower face (head-bone space). */
const facialCache = new Map();
export function facialHairGeometry(kind) {
  if (kind === 'none' || kind === 'stubble') return null; // stubble is painted on the face texture
  if (facialCache.has(kind)) return facialCache.get(kind);
  const pos = [], idx = [];
  const rows = 8, segs = 24;
  const ranges = {
    beard: { y0: 0.0, y1: 0.095, span: 1.75, t: 0.008 },
    goatee: { y0: 0.01, y1: 0.07, span: 0.45, t: 0.007 },
    moustache: { y0: 0.062, y1: 0.074, span: 0.42, t: 0.006 },
  }[kind];
  if (!ranges) return null;
  for (let r = 0; r <= rows; r++) {
    const y = ranges.y0 + (ranges.y1 - ranges.y0) * (r / rows);
    for (let k = 0; k <= segs; k++) {
      const phi = Math.PI / 2 + (k / segs - 0.5) * 2 * ranges.span;
      // Keep the mouth clear on a full beard.
      let t = ranges.t;
      if (kind === 'beard' && y > 0.045 && y < 0.07 && Math.abs(phi - Math.PI / 2) < 0.35) t = -0.004;
      const p = skullPoint(Math.max(0.0, y), phi, t);
      if (y < 0.02) p.y -= 0.004;
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rows; r++) for (let k = 0; k < segs; k++) {
    const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  facialCache.set(kind, g);
  return g;
}

let bandGeo = null;
/** Captain's armband / headband / wrist tape: an open ring. */
export function bandGeometry() {
  if (!bandGeo) bandGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  return bandGeo;
}
