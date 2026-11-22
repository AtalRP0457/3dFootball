// Skinned body geometry for a footballer.
//
// The body is built from lofted surfaces (rings of vertices with elliptical
// / superelliptical cross-sections) that follow anatomical profiles: neck,
// skull and jaw, shoulders, chest, waist, hips, thighs, knees, calves,
// ankles, arms, hands and boots. Each ring carries bone weights, blended
// across joints so knees, elbows, hips and shoulders bend smoothly.
//
// Clothing is modelled, not painted on: the shirt (with sleeves), shorts
// and socks are separate surfaces in their own material slots, so a kit can
// be swapped by changing materials. Geometry is cached per (body type,
// sleeve length) and shared by every player of that build.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { layout, boneIndex, REF } from './rig.js';

export const SLOT = { skin: 0, face: 1, shirt: 2, sleeve: 3, shorts: 4, socks: 5, boot: 6, sole: 7, hands: 8 };
export const SLOT_COUNT = 9;

const TAU = Math.PI * 2;
// (vertex angle φ = 0 at +x, π/2 at the front, π at -x, 3π/2 at the back)

/** Superellipse helper: n = 2 is an ellipse, larger n is boxier. */
function se(c, n) {
  return Math.sign(c) * Math.abs(c) ** (2 / n);
}

/**
 * Vertical loft. rings: [{ y, cx, cz, rx, rzF, rzB, n, w: [[bone, weight]...], v }]
 * (rzF = front depth, rzB = back depth). φ = 0 at +x; front (+z) is φ = π/2,
 * so u = 0.25 is the front centre and u = 0.75 the back centre.
 */
/**
 * Smooth a ring list: Catmull-Rom between rings (3 per span), so limbs and the
 * torso have continuous curves instead of straight facets between sections.
 */
function densify(rings, steps = 3) {
  if (rings.length < 3) return rings;
  const keys = ['y', 'cx', 'cz', 'rx', 'rzF', 'rzB', 'n', 'v', 'z', 'cy', 'ryT', 'ryB'];
  const out = [];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[Math.max(0, i - 1)], r1 = rings[i], r2 = rings[i + 1], r3 = rings[Math.min(rings.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      if (k === 0) { out.push(r1); continue; }
      const r = { ...r1 };
      for (const key of keys) {
        if (r1[key] === undefined && r2[key] === undefined) continue;
        const g = (x) => (x[key] ?? (key === 'n' ? 2 : 0));
        r[key] = key === 'v' ? g(r1) + (g(r2) - g(r1)) * t : cr(g(r0), g(r1), g(r2), g(r3), t);
      }
      // Blend skin weights linearly between the two rings.
      const w = new Map();
      for (const [b, x] of r1.w) w.set(b, (w.get(b) || 0) + x * (1 - t));
      for (const [b, x] of r2.w) w.set(b, (w.get(b) || 0) + x * t);
      r.w = [...w.entries()].sort((a, b) => b[1] - a[1]);
      out.push(r);
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}

function loftY(rings, segs, { capTop = false, capBottom = false, mod } = {}) {
  rings = mod ? rings : densify(rings);
  segs = Math.round(segs * 1.5);
  return loft(rings, segs, (r, phi) => {
    const c = Math.cos(phi), s = Math.sin(phi);
    const n = r.n || 2;
    let x = (r.cx || 0) + r.rx * se(c, n);
    let z = (r.cz || 0) + (s >= 0 ? r.rzF : r.rzB) * se(s, n);
    let y = r.y;
    if (mod) ({ x, y, z } = mod(r, phi, x, y, z));
    return [x, y, z];
  }, { capTop, capBottom });
}

/**
 * Loft along z (for boots). rings: [{ z, cx, cy, rx, ryT, ryB, n, w, v }].
 * φ = 0 at +x, top at φ = π/2.
 */
function loftZ(rings, segs, opts = {}) {
  rings = densify(rings, 2);
  return loft(rings, segs, (r, phi) => {
    const c = Math.cos(phi), s = Math.sin(phi);
    const n = r.n || 2;
    return [(r.cx || 0) + r.rx * se(c, n), r.cy + (s >= 0 ? r.ryT : r.ryB) * se(s, n), r.z];
  }, opts);
}

function loft(rings, segs, point, { capTop = false, capBottom = false } = {}) {
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const pushW = (w) => {
    const ws = w.slice(0, 4);
    const total = ws.reduce((a, [, x]) => a + x, 0) || 1;
    for (let k = 0; k < 4; k++) {
      si.push(ws[k] ? boneIndex(ws[k][0]) : 0);
      sw.push(ws[k] ? ws[k][1] / total : 0);
    }
  };
  // φ starts at -x so the texture seam sits under the right arm; u runs
  // the other way round so text reads correctly on the front:
  // u = 0.25 front centre, 0.75 back centre (player's left is u > 0.25).
  rings.forEach((r, i) => {
    const v = r.v ?? i / (rings.length - 1);
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const phi = (Math.PI + t * TAU) % TAU;
      pos.push(...point(r, phi));
      uv.push(1 - t, v);
      pushW(r.w);
    }
  });
  const row = segs + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
      // Rings may run either way; fix winding later via the sign of the
      // computed normals (see orient()).
      idx.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ringI, top) => {
    const r = rings[ringI];
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < segs; k++) {
      const o = (ringI * row + k) * 3;
      cx += pos[o]; cy += pos[o + 1]; cz += pos[o + 2];
    }
    const centre = pos.length / 3;
    pos.push(cx / segs, cy / segs, cz / segs);
    uv.push(0.5, r.v ?? (top ? 1 : 0));
    pushW(r.w);
    for (let k = 0; k < segs; k++) {
      const a = ringI * row + k, b = a + 1;
      if (top) idx.push(a, b, centre); else idx.push(b, a, centre);
    }
  };
  if (capBottom) addCap(0, false);
  if (capTop) addCap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return orient(g);
}

/** Make triangle winding face outwards (away from the part's centroid). */
function orient(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, nrm = g.attributes.normal;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i));
  c.multiplyScalar(1 / p.count);
  let score = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 7) {
    v.fromBufferAttribute(p, i).sub(c);
    n.fromBufferAttribute(nrm, i);
    score += v.dot(n);
  }
  if (score < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

const W = (...pairs) => pairs; // readability: W(['thigh.L', 0.7], ['shin.L', 0.3])

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

// The head itself (skull, face, eyes, ears) is built per player in head.ts
// and rides on the head bone; the shared body mesh only carries the neck.
function headParts(L) {
  const hy = L.bones.head.y;
  const ny = L.bones.neck.y;
  // Neck trunk joining the collar.
  const neck = loftY([
    { y: ny - 0.03, rx: 0.062, rzF: 0.058, rzB: 0.062, w: W(['chest', 0.6], ['neck', 0.4]) },
    { y: ny + 0.04, rx: 0.056, rzF: 0.054, rzB: 0.06, w: W(['neck', 1]) },
    { y: hy - 0.02, rx: 0.056, rzF: 0.056, rzB: 0.06, cz: -0.005, w: W(['neck', 0.6], ['head', 0.4]) },
  ], 18);
  return { face: [], skin: [neck] };
}

/** Attach constant skin weights to a rigid primitive geometry. */
function skinRigid(geo, bone) {
  geo = geo.index ? geo : geo;
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const b = boneIndex(bone);
  for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}

function torsoShirt(L) {
  const { H } = L.dims;
  const b = L.dims.build;
  const S = (k, v) => k * v;
  // Shirt torso: hem to collar. rings: [yOffset, rx, rzF, rzB, weights]
  const prof = [
    [-0.075, S(0.166, b.hip), 0.112, 0.12, W(['hips', 1])],
    [0.04, S(0.15, b.waist), 0.104, 0.104, W(['hips', 0.7], ['spine', 0.3])],
    [0.16, S(0.148, (b.waist + b.chest) / 2), 0.108, 0.104, W(['spine', 1])],
    [0.28, S(0.162, b.chest), 0.122, 0.108, W(['spine', 0.35], ['chest', 0.65])],
    [0.38, S(0.172, b.chest), 0.12, 0.108, W(['chest', 1])],
    [0.435, S(0.168, b.shoulder), 0.104, 0.098, W(['chest', 1])],
    [0.48, S(0.142, b.shoulder), 0.088, 0.088, W(['chest', 1])],
    [0.52, S(0.108, b.shoulder), 0.074, 0.078, W(['chest', 0.8], ['neck', 0.2])],
    [0.55, 0.074, 0.064, 0.07, W(['chest', 0.55], ['neck', 0.45])],
    [0.566, 0.066, 0.06, 0.066, W(['chest', 0.35], ['neck', 0.65])],
  ];
  const rings = prof.map(([y, rx, rzF, rzB, w], i) => ({
    y: H + y, rx, rzF: rzF * b.chest, rzB: rzB * b.chest, w, n: 2.15, v: i / (prof.length - 1),
  }));
  return loftY(rings, 40);
}

function shorts(L) {
  const { H, legX } = L.dims;
  const b = L.dims.build;
  const pelvis = loftY([
    { y: H - 0.11, rx: 0.11 * b.hip, rzF: 0.085, rzB: 0.1, w: W(['hips', 1]), v: 0 },
    { y: H - 0.03, rx: 0.155 * b.hip, rzF: 0.104, rzB: 0.118, w: W(['hips', 1]), v: 0.45 },
    { y: H + 0.04, rx: 0.148 * b.waist, rzF: 0.1, rzB: 0.106, w: W(['hips', 0.75], ['spine', 0.25]), v: 1 },
  ], 32, { capBottom: true });
  const legs = [];
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const t = `thigh.${s}`;
    // Loose-fitting legs that flare slightly at the hem.
    legs.push(loftY([
      { y: H - 0.26, cx: sx * legX * 1.02, rx: 0.086 * b.limb, rzF: 0.088 * b.limb, rzB: 0.09 * b.limb, w: W([t, 1]), v: 0 },
      { y: H - 0.14, cx: sx * legX * 1.0, rx: 0.092 * b.limb, rzF: 0.094 * b.limb, rzB: 0.1 * b.limb, w: W([t, 0.85], ['hips', 0.15]), v: 0.5 },
      { y: H - 0.03, cx: sx * legX * 0.96, rx: 0.098 * b.limb, rzF: 0.098 * b.limb, rzB: 0.11 * b.limb, w: W([t, 0.45], ['hips', 0.55]), v: 1 },
    ], 24));
  }
  return [pelvis, ...legs];
}

function legs(L) {
  const { H, thigh, legX } = L.dims;
  const b = L.dims.build;
  const skin = [], socks = [];
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const th = `thigh.${s}`, sh = `shin.${s}`, ft = `foot.${s}`;
    const knee = H - thigh;
    const x = sx * legX;
    // Thigh (below the shorts) and knee.
    skin.push(loftY([
      { y: H - 0.22, cx: x, rx: 0.074 * b.limb, rzF: 0.08 * b.limb, rzB: 0.076 * b.limb, w: W([th, 1]) },
      { y: H - 0.32, cx: x, rx: 0.066 * b.limb, rzF: 0.072 * b.limb, rzB: 0.064 * b.limb, w: W([th, 1]) },
      { y: knee + 0.05, cx: x, rx: 0.054 * b.limb, rzF: 0.058 * b.limb, rzB: 0.052 * b.limb, w: W([th, 0.85], [sh, 0.15]) },
      { y: knee, cx: x, rx: 0.05 * b.limb, rzF: 0.058 * b.limb, rzB: 0.048 * b.limb, w: W([th, 0.5], [sh, 0.5]) },
      { y: knee - 0.06, cx: x, rx: 0.05 * b.limb, rzF: 0.052 * b.limb, rzB: 0.054 * b.limb, w: W([sh, 0.9], [th, 0.1]) },
    ], 18));
    // Socks with shin pads and the calf muscle; the top band is the trim.
    socks.push(loftY([
      { y: REF.ankle + 0.02, cx: x, rx: 0.036, rzF: 0.038, rzB: 0.04, w: W([sh, 0.75], [ft, 0.25]), v: 0 },
      { y: REF.ankle + 0.1, cx: x, rx: 0.037 * b.limb, rzF: 0.042 * b.limb, rzB: 0.045 * b.limb, w: W([sh, 1]), v: 0.2 },
      { y: knee - 0.27, cx: x, rx: 0.046 * b.limb, rzF: 0.052 * b.limb, rzB: 0.06 * b.limb, w: W([sh, 1]), v: 0.45 },
      { y: knee - 0.15, cx: x, rx: 0.055 * b.limb, rzF: 0.058 * b.limb, rzB: 0.072 * b.limb, w: W([sh, 1]), v: 0.7 },
      { y: knee - 0.07, cx: x, rx: 0.054 * b.limb, rzF: 0.057 * b.limb, rzB: 0.062 * b.limb, w: W([sh, 0.92], [th, 0.08]), v: 0.9 },
      { y: knee - 0.045, cx: x, rx: 0.053 * b.limb, rzF: 0.056 * b.limb, rzB: 0.058 * b.limb, w: W([sh, 0.85], [th, 0.15]), v: 1 },
    ], 18));
  }
  return { skin, socks };
}

function arms(L, longSleeves) {
  const { shoulderY, armX } = L.dims;
  const b = L.dims.build;
  const skin = [], sleeve = [], hands = [];
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const ua = `upperArm.${s}`, la = `lowerArm.${s}`, hd = `hand.${s}`;
    const x = sx * armX;
    const elbow = shoulderY - REF.upperArm;
    const wrist = elbow - REF.forearm;
    const r = b.limb;
    // Upper arm / forearm surfaces; the sleeve covers the top part.
    // The deltoid starts inside the sloping shoulder line of the shirt and
    // rounds out over the top of the arm.
    const armRings = [
      { y: shoulderY + 0.025, cx: x * 0.84, rx: 0.036 * r, rzF: 0.04 * r, rzB: 0.04 * r, w: W([ua, 0.4], ['chest', 0.6]) },
      { y: shoulderY + 0.005, cx: x * 0.95, rx: 0.054 * r, rzF: 0.054 * r, rzB: 0.056 * r, w: W([ua, 0.65], ['chest', 0.35]) },
      { y: shoulderY - 0.045, cx: x, rx: 0.056 * r, rzF: 0.055 * r, rzB: 0.057 * r, w: W([ua, 0.92], ['chest', 0.08]) },
      { y: shoulderY - 0.13, cx: x, rx: 0.048 * r, rzF: 0.05 * r, rzB: 0.05 * r, w: W([ua, 1]) },
      { y: elbow + 0.04, cx: x, rx: 0.04 * r, rzF: 0.042 * r, rzB: 0.044 * r, w: W([ua, 0.85], [la, 0.15]) },
      { y: elbow, cx: x, rx: 0.038 * r, rzF: 0.04 * r, rzB: 0.042 * r, w: W([ua, 0.5], [la, 0.5]) },
      { y: elbow - 0.06, cx: x, rx: 0.042 * r, rzF: 0.044 * r, rzB: 0.042 * r, w: W([la, 1]) },
      { y: wrist + 0.03, cx: x, rx: 0.028, rzF: 0.032, rzB: 0.032, w: W([la, 0.85], [hd, 0.15]) },
      { y: wrist, cx: x, rx: 0.025, rzF: 0.03, rzB: 0.03, w: W([la, 0.5], [hd, 0.5]) },
    ];
    const cut = longSleeves ? armRings.length - 1 : 3;
    sleeve.push(loftY(armRings.slice(0, cut + 1).map((ring, i) => ({
      ...ring, rx: ring.rx + 0.012, rzF: ring.rzF + 0.012, rzB: ring.rzB + 0.012, v: i / cut,
    })), 18));
    if (!longSleeves) skin.push(loftY(armRings.slice(3), 16));
    // Hand: palm facing the thigh, fingers slightly curled, and a thumb.
    hands.push(loftY([
      { y: wrist + 0.005, cx: x, rx: 0.022, rzF: 0.03, rzB: 0.03, w: W([hd, 0.6], [la, 0.4]) },
      { y: wrist - 0.05, cx: x, rx: 0.02, rzF: 0.045, rzB: 0.04, w: W([hd, 1]) },
      { y: wrist - 0.1, cx: x - sx * 0.004, rx: 0.017, rzF: 0.044, rzB: 0.036, w: W([hd, 1]) },
      { y: wrist - 0.15, cx: x - sx * 0.01, rx: 0.014, rzF: 0.036, rzB: 0.028, w: W([hd, 1]) },
      { y: wrist - 0.175, cx: x - sx * 0.014, rx: 0.01, rzF: 0.02, rzB: 0.016, w: W([hd, 1]) },
    ], 12, { capBottom: true }));
    const thumb = new THREE.CapsuleGeometry(0.011, 0.04, 3, 8);
    thumb.rotateX(-0.5);
    thumb.translate(x - sx * 0.008, wrist - 0.055, 0.04);
    hands.push(skinRigid(thumb, hd));
  }
  return { skin, sleeve, hands };
}

function boots(L) {
  const { legX } = L.dims;
  const boot = [], sole = [];
  // [z, cy, rx, ryTop, ryBottom]
  const prof = [
    [-0.075, 0.062, 0.028, 0.035, 0.05],
    [-0.055, 0.066, 0.04, 0.05, 0.056],
    [-0.015, 0.07, 0.046, 0.058, 0.06],
    [0.03, 0.06, 0.048, 0.046, 0.05],
    [0.08, 0.045, 0.049, 0.032, 0.035],
    [0.125, 0.034, 0.045, 0.022, 0.024],
    [0.165, 0.028, 0.036, 0.016, 0.016],
    [0.192, 0.024, 0.022, 0.01, 0.01],
    [0.202, 0.022, 0.008, 0.004, 0.004],
  ];
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const ft = `foot.${s}`, toe = `toe.${s}`;
    const w = (z) => (z < 0.07 ? W([ft, 1]) : z < 0.12 ? W([ft, 0.5], [toe, 0.5]) : W([toe, 1]));
    boot.push(loftZ(prof.map(([z, cy, rx, ryT, ryB], i) => ({
      z, cy, rx, ryT, ryB, cx: sx * legX + sx * 0.004, n: 2.6, w: w(z), v: i / (prof.length - 1),
    })), 22, { capTop: true, capBottom: true }));
    // Sole plate and studs.
    const plate = loftZ(prof.slice(1, -1).map(([z, , rx], i) => ({
      z, cy: 0.009, rx: rx * 0.98, ryT: 0.005, ryB: 0.004, cx: sx * legX + sx * 0.004, n: 4, w: w(z), v: i / 6,
    })), 16, { capTop: true, capBottom: true });
    sole.push(plate);
    const studs = [[-0.045, 0.022], [-0.045, -0.022], [0.05, 0.03], [0.05, -0.03], [0.1, 0.03], [0.1, -0.028], [0.15, 0.02], [0.15, -0.02]];
    for (const [z, x] of studs) {
      const st = new THREE.CylinderGeometry(0.0065, 0.0085, 0.008, 8);
      st.translate(sx * legX + sx * 0.004 + x, 0.004, z);
      sole.push(skinRigid(st, z < 0.07 ? ft : toe));
    }
  }
  return { boot, sole };
}

// ---------------------------------------------------------------------------

const cache = new Map();

/**
 * Build (or fetch from cache) the skinned body geometry for a body type.
 * longSleeves: goalkeeper shirts / players who wear long sleeves.
 * Returns { geometry, layout }.
 */
export function bodyGeometry(bodyType, longSleeves = false) {
  const key = `${bodyType}|${longSleeves ? 'long' : 'short'}`;
  if (cache.has(key)) return cache.get(key);
  const L = layout(bodyType);
  const head = headParts(L);
  const lg = legs(L);
  const ar = arms(L, longSleeves);
  const bt = boots(L);
  const slots = Array.from({ length: SLOT_COUNT }, () => []);
  slots[SLOT.skin].push(...head.skin, ...lg.skin, ...ar.skin);
  slots[SLOT.face].push(...head.face);
  slots[SLOT.shirt].push(torsoShirt(L));
  slots[SLOT.sleeve].push(...ar.sleeve);
  slots[SLOT.shorts].push(...shorts(L));
  slots[SLOT.socks].push(...lg.socks);
  slots[SLOT.boot].push(...bt.boot);
  slots[SLOT.sole].push(...bt.sole);
  slots[SLOT.hands].push(...ar.hands);
  const perSlot = slots.map((parts) => {
    if (!parts.length) return emptyPart();
    const clean = parts.map((g) => {
      const gg = g.index ? g : g;
      for (const name of Object.keys(gg.attributes)) {
        if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) gg.deleteAttribute(name);
      }
      if (!gg.attributes.normal) gg.computeVertexNormals();
      // Unify attribute array types for merging.
      if (!(gg.attributes.skinIndex.array instanceof Uint16Array)) {
        gg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(gg.attributes.skinIndex.array), 4));
      }
      return gg.index ? gg : gg;
    });
    return mergeGeometries(clean.map((g) => (g.index ? g : g)), false);
  });
  const geometry = mergeGeometries(perSlot, true);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const out = { geometry, layout: L };
  cache.set(key, out);
  return out;
}

/** An empty geometry so a slot with no parts still has its (empty) group. */
function emptyPart() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([], 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([], 4));
  g.setIndex([]);
  return g;
}

export function clearBodyCache() {
  for (const v of cache.values()) v.geometry.dispose();
  cache.clear();
}
