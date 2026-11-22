// Per-player sculpted heads.
//
// Every footballer gets his own head geometry: a dense loft whose skull and
// face proportions (head width and length, jaw, chin, cheekbones, brow
// ridge, nose length/width/bridge, lips, eye spacing, ears) come from the
// player's identity, with eye sockets, nose, lips and chin sculpted into the
// face. Eyeballs (sclera, iris, pupil), eyelids, eyebrows and shaped ears are
// separate meshes. Skin uses a physical material with a soft sheen and
// pore-scale normal detail; colour detail (cheeks, lips, beard shadow) is
// painted per player.
//
// Built in the head bone's local space (front = +z, the player's left = +x,
// y = 0 at the jaw line), so it simply rides on the head bone. Eyes, lids and
// brows are listed in `detail` so the renderer can hide them for distant
// players (level of detail).
import * as THREE from 'three';
import type { Identity } from '../../types/game.ts';

export interface FaceShape {
  headWidth: number; headLength: number; jaw: number; chin: number; cheek: number; brow: number;
  noseLength: number; noseWidth: number; noseBridge: number; lips: number; eyeSpacing: number; ears: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Deterministic 0..1 per key. */
const unit = (id: string, key: string) => (hash(`${id}|${key}`) % 10007) / 10007;
const span = (id: string, key: string, lo: number, hi: number) => lo + (hi - lo) * unit(id, key);

/** Face proportions for a player (deterministic from his ID and build). */
export function faceShape(identity: Identity): FaceShape {
  const id = identity.id;
  const strong = identity.bodyType === 'strong' || identity.bodyType === 'powerful' ? 1 : 0;
  const f: FaceShape = {
    headWidth: span(id, 'hw', 0.95, 1.06),
    headLength: span(id, 'hl', 0.96, 1.06) + (identity.bodyType === 'tall' ? 0.02 : 0),
    jaw: span(id, 'jaw', 0.9, 1.12) + strong * 0.06,
    chin: span(id, 'chin', 0.6, 1.4),
    cheek: span(id, 'cheek', 0.5, 1.5),
    brow: span(id, 'brow', 0.6, 1.5) + strong * 0.2,
    noseLength: span(id, 'nl', 0.88, 1.14),
    noseWidth: span(id, 'nw', 0.85, 1.25),
    noseBridge: span(id, 'nb', 0.75, 1.3),
    lips: span(id, 'lips', 0.7, 1.35),
    eyeSpacing: span(id, 'es', 0.94, 1.06),
    ears: span(id, 'ears', 0.9, 1.12),
  };
  // Known proportions from the player's appearance record win.
  for (const [k, v] of Object.entries(identity.face ?? {})) if (k in f && Number.isFinite(v)) f[k as keyof FaceShape] = v;
  return f;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const gauss = (a: number, b: number) => Math.exp(-(a * a + b * b));

/** Skull profile: [y, halfWidth, frontDepth, backDepth, centreZ]. */
const PROFILE: Array<[number, number, number, number, number]> = [
  [-0.03, 0.052, 0.046, 0.058, -0.006],
  [-0.008, 0.058, 0.056, 0.062, -0.002],
  [0.01, 0.063, 0.074, 0.068, 0.004],
  [0.03, 0.068, 0.085, 0.075, 0.008],
  [0.055, 0.072, 0.089, 0.082, 0.01],
  [0.085, 0.076, 0.092, 0.089, 0.009],
  [0.115, 0.078, 0.092, 0.095, 0.006],
  [0.145, 0.08, 0.088, 0.099, 0.002],
  [0.175, 0.077, 0.079, 0.097, -0.004],
  [0.205, 0.066, 0.064, 0.086, -0.008],
  [0.228, 0.046, 0.043, 0.062, -0.01],
  [0.243, 0.014, 0.012, 0.018, -0.01],
];
/** Catmull-Rom through the profile rows. */
function profileAt(y: number): [number, number, number, number] {
  const P = PROFILE;
  if (y <= P[0][0]) return [P[0][1], P[0][2], P[0][3], P[0][4]];
  if (y >= P[P.length - 1][0]) { const l = P[P.length - 1]; return [l[1], l[2], l[3], l[4]]; }
  let i = 0;
  while (i < P.length - 2 && y > P[i + 1][0]) i++;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
  const t = (y - p1[0]) / (p2[0] - p1[0]);
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2]), cr(p0[3], p1[3], p2[3], p3[3]), cr(p0[4], p1[4], p2[4], p3[4])];
}

const EYE_Y = 0.114, EYE_X = 0.031, BROW_Y = 0.137;

/** Face relief (z offset) at face-plane coordinates X (left +), Y (height). */
function relief(X: number, Y: number, f: FaceShape): number {
  const ax = Math.abs(X);
  let z = 0;
  const ex = EYE_X * f.eyeSpacing;
  // Eye sockets.
  z -= 0.0085 * gauss((ax - ex) / 0.018, (Y - EYE_Y) / 0.013);
  // Brow ridge.
  z += 0.006 * f.brow * Math.exp(-(((Y - BROW_Y) / 0.011) ** 2)) * smooth(1 - (ax - 0.02) / 0.05);
  // Nose: bridge rising to the tip, then tucking under to the lip.
  const nTop = 0.128, nTip = 0.084 - (f.noseLength - 1) * 0.02;
  {
    // k: 0 at the top of the bridge, 1 at the tip, falling back to 0 where
    // the columella meets the lip. Smooth windows keep the surface continuous.
    const k = Y > nTip ? (nTop - Y) / (nTop - nTip) : 1 - (nTip - Y) / 0.017;
    const kk = Math.max(0, Math.min(1, k));
    const win = smooth((nTop + 0.006 - Y) / 0.012) * smooth((Y - (nTip - 0.021)) / 0.006);
    const h = (0.005 + 0.018 * Math.pow(kk, 1.25)) * (Y > nTip ? f.noseBridge * 0.35 + 0.65 : 1) * win;
    const w = (0.0075 + 0.008 * kk) * f.noseWidth;
    z += h * Math.exp(-((X / w) ** 2));
  }
  // Nostril wings.
  z += 0.0075 * f.noseWidth * gauss((ax - 0.014 * f.noseWidth) / 0.007, (Y - (nTip - 0.006)) / 0.007);
  // Philtrum and lips with a mouth crease.
  const my = 0.052;
  z += 0.005 * f.lips * gauss(X / 0.022, (Y - (my + 0.007)) / 0.006);
  z += 0.0065 * f.lips * gauss(X / 0.02, (Y - (my - 0.007)) / 0.007);
  z -= 0.003 * gauss(X / 0.026, (Y - my) / 0.0022);
  // Chin and cheekbones.
  z += 0.008 * f.chin * gauss(X / 0.021, (Y - 0.024) / 0.012);
  z += 0.005 * f.cheek * gauss((ax - 0.046) / 0.02, (Y - 0.094) / 0.015);
  // Soft hollow under the cheekbone.
  z -= 0.003 * gauss((ax - 0.05) / 0.016, (Y - 0.066) / 0.012);
  return z;
}

interface HeadBuild { geometry: THREE.BufferGeometry; eyeZ: number }

export const HEAD_Y_MIN = PROFILE[0][0];
export const HEAD_Y_MAX = 0.243;

/**
 * Point on a player's head surface at height y and angle phi (front = π/2,
 * the player's left = 0), pushed outwards by t. Hair, beards and the head
 * mesh itself all use this, so they fit each player's own head.
 */
export function headPoint(f: FaceShape, y: number, phi: number, t = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const yy = Math.max(HEAD_Y_MIN, Math.min(HEAD_Y_MAX, y));
  const [hw0, fd0, bd0, cz] = profileAt(yy);
  // Jaw width only below the cheekbones; head width/length everywhere above.
  const jawK = 1 - smooth((yy - 0.02) / 0.07);
  const hw = hw0 * (f.headWidth * (1 - jawK) + f.jaw * jawK);
  const fd = fd0 * f.headLength, bd = bd0 * f.headLength;
  const c = Math.cos(phi), s = Math.sin(phi);
  const n = 2.15;
  const se = (q: number) => Math.sign(q) * Math.abs(q) ** (2 / n);
  let x = hw * se(c);
  let z = cz + (s >= 0 ? fd : bd) * se(s);
  // Temples slightly flatter.
  if (yy > 0.13 && yy < 0.2) x *= 1 - 0.035 * Math.abs(c) * smooth(s + 0.3);
  // The jaw narrows towards the chin at the front (V from above), while
  // the jaw angles at the back stay wide.
  const taper = 0.34 * (1 - smooth((yy + 0.005) / 0.075));
  if (s > 0) x *= 1 - taper * Math.pow(s, 1.4);
  if (s > 0) z += relief(x, yy, f) * smooth(s * 1.6);
  if (t !== 0) {
    const dx = x / hw, dz = (z - cz) / (s >= 0 ? fd : bd);
    const l = Math.hypot(dx, dz) || 1;
    x += (t * dx) / l; z += (t * dz) / l;
  }
  return out.set(x, y, z);
}

function headGeometry(f: FaceShape): HeadBuild {
  const rows = 64, segs = 64;
  const yMin = HEAD_Y_MIN, yMax = HEAD_Y_MAX;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = new THREE.Vector3();
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const y = yMin + (yMax - yMin) * v;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const phi = Math.PI + t * Math.PI * 2; // seam at the back-left, like the body
      headPoint(f, y, phi, 0, P);
      pos.push(P.x, P.y, P.z);
      uv.push(1 - ((t + 0.5) % 1), v);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rows; r++) for (let k = 0; k < segs; k++) {
    const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Fix winding if needed (normals should point away from the centre).
  const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  let score = 0;
  for (let i = 0; i < p.count; i += 11) score += (p.getX(i) * nrm.getX(i) + (p.getY(i) - 0.11) * nrm.getY(i) + p.getZ(i) * nrm.getZ(i));
  if (score < 0) {
    const ix = g.index!.array as Uint32Array | Uint16Array;
    for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; }
    g.index!.needsUpdate = true;
    g.computeVertexNormals();
  }
  // Surface depth at the eye centre (for placing the eyeballs).
  const [hwE, fdE, , czE] = profileAt(EYE_Y);
  const X = EYE_X * f.eyeSpacing;
  const hwj = hwE * f.headWidth, fdj = fdE * f.headLength;
  const zs = czE + fdj * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(X) / hwj, 2.15)), 1 / 2.15) + relief(X, EYE_Y, f);
  return { geometry: g, eyeZ: zs };
}

// ---------------------------------------------------------------- textures
const hasDOM = typeof document !== 'undefined';
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture | null {
  if (!hasDOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function mix(a: string, b: string, k: number): string {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return `#${ca.lerp(cb, k).getHexString()}`;
}

/** Colour map in the head's UV layout (u = 0.25 is the front, v = 0 the neck). */
function skinTexture(identity: Identity): THREE.CanvasTexture | null {
  return canvasTex(512, 512, (g) => {
    const W = 512, H = 512, skin = identity.skinTone;
    const X = (u: number) => u * W, Y = (v: number) => (1 - v) * H;
    const vOf = (y: number) => (y - PROFILE[0][0]) / (0.243 - PROFILE[0][0]);
    g.fillStyle = skin; g.fillRect(0, 0, W, H);
    // Mottled variation.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,60,50' : '255,235,220'},${(Math.random() * 0.035).toFixed(3)})`;
      g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 6, 0, Math.PI * 2); g.fill();
    }
    const dot = (u: number, y: number, rx: number, ry: number, col: string) => {
      const grd = g.createRadialGradient(X(u), Y(vOf(y)), 0, X(u), Y(vOf(y)), Math.max(rx, ry));
      grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(X(u), Y(vOf(y))); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-X(u), -Y(vOf(y)));
      g.fillStyle = grd; g.beginPath(); g.arc(X(u), Y(vOf(y)), Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore();
    };
    // Warmth on cheeks, nose and ears; shade in the eye area.
    for (const s of [-1, 1]) {
      dot(0.25 + s * 0.085, 0.085, 46, 34, 'rgba(190,80,70,0.13)');
      dot(0.25 + s * 0.06, 0.112, 26, 14, 'rgba(70,40,40,0.16)');
    }
    dot(0.25, 0.08, 14, 26, 'rgba(190,90,80,0.10)');
    // Lips.
    const lip = mix(skin, '#a4524c', 0.5);
    g.fillStyle = lip;
    g.beginPath(); g.ellipse(X(0.25), Y(vOf(0.0475)), 24, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = mix(skin, '#a4524c', 0.42);
    g.beginPath(); g.ellipse(X(0.25), Y(vOf(0.0575)), 22, 5, 0, 0, Math.PI * 2); g.fill();
    // Mouth line.
    g.strokeStyle = mix(skin, '#3a1c1a', 0.6); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(X(0.25) - 20, Y(vOf(0.0525))); g.quadraticCurveTo(X(0.25), Y(vOf(0.0515)), X(0.25) + 20, Y(vOf(0.0525))); g.stroke();
    // Beard shadow / stubble.
    const fh = identity.facialHair;
    if (fh && fh !== 'none') {
      const hair = identity.hair.hex;
      const a = fh === 'stubble' ? 0.18 : fh === 'beard' ? 0.42 : 0.3;
      g.fillStyle = hair;
      for (let i = 0; i < (fh === 'beard' ? 9000 : 5000); i++) {
        const u = 0.25 + (Math.random() - 0.5) * (fh === 'goatee' || fh === 'moustache' ? 0.08 : 0.3);
        const y = 0.0 + Math.random() * (fh === 'moustache' ? 0.02 : 0.07) + (fh === 'moustache' ? 0.055 : 0);
        if (Math.abs(u - 0.25) < 0.035 && Math.abs(y - 0.048) < 0.008) continue; // lips stay clear
        g.globalAlpha = a * (0.4 + Math.random() * 0.6);
        g.fillRect(X(u), Y(vOf(y)), 1.4, 1.4);
      }
      g.globalAlpha = 1;
    }
  });
}

/** Fine pore / wrinkle normal detail (tiles). */
let poreTex: THREE.CanvasTexture | null = null;
function poreNormal(): THREE.CanvasTexture | null {
  if (poreTex) return poreTex;
  poreTex = canvasTex(256, 256, (g) => {
    const img = g.createImageData(256, 256);
    const hgt = new Float32Array(256 * 256);
    for (let i = 0; i < hgt.length; i++) hgt[i] = Math.random();
    for (let pass = 0; pass < 2; pass++) for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      hgt[i] = (hgt[i] * 2 + hgt[((y + 1) % 256) * 256 + x] + hgt[y * 256 + ((x + 1) % 256)]) / 4;
    }
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      const dx = hgt[y * 256 + ((x + 1) % 256)] - hgt[i], dy = hgt[((y + 1) % 256) * 256 + x] - hgt[i];
      img.data[i * 4] = 128 + dx * 160; img.data[i * 4 + 1] = 128 + dy * 160; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  if (poreTex) { poreTex.wrapS = poreTex.wrapT = THREE.RepeatWrapping; poreTex.repeat.set(6, 6); }
  return poreTex;
}

function irisTexture(color: string): THREE.CanvasTexture | null {
  return canvasTex(128, 64, (g) => {
    // Sphere UV: u around, v from the top.
    g.fillStyle = '#ece6dc'; g.fillRect(0, 0, 128, 64);
    // Faint veins/shade towards the edges.
    const edge = g.createLinearGradient(0, 0, 128, 0);
    edge.addColorStop(0, 'rgba(160,90,90,0.18)'); edge.addColorStop(0.25, 'rgba(0,0,0,0)'); edge.addColorStop(0.5, 'rgba(160,90,90,0.18)');
    g.fillStyle = edge; g.fillRect(0, 0, 128, 64);
    const cx = 128 * 0.25, cy = 32; // SphereGeometry faces +z at u = 0.25
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 13);
    grd.addColorStop(0, '#050505'); grd.addColorStop(0.32, '#050505'); grd.addColorStop(0.36, color);
    grd.addColorStop(0.85, mix(color, '#000000', 0.35)); grd.addColorStop(1, '#2a1d16');
    g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, 13, 13, 0, 0, Math.PI * 2); g.fill();
  });
}

// ---------------------------------------------------------------- assembly
export interface Head {
  group: THREE.Group;
  /** Fine detail hidden for distant players (LOD). */
  detail: THREE.Object3D[];
  skin: THREE.Material;
}

const headCache = new Map<string, HeadBuild>();
const matCache = new Map<string, THREE.Material>();
function cachedMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}

/** Skin material shared by the face and (optionally) the body for one tone. */
export function skinMaterial(tone: string, map: THREE.Texture | null = null, key = tone): THREE.Material {
  return cachedMat(`skin|${key}`, () => new THREE.MeshPhysicalMaterial({
    color: map ? 0xffffff : tone, map, roughness: 0.52, metalness: 0,
    sheen: 0.35, sheenColor: new THREE.Color(mix(tone, '#ff6650', 0.35)), sheenRoughness: 0.55,
    normalMap: poreNormal(), normalScale: new THREE.Vector2(0.18, 0.18),
  }));
}

export function buildHead(identity: Identity, hairHex: string): Head {
  const f = faceShape(identity);
  const key = identity.id;
  let hb = headCache.get(key);
  if (!hb) { hb = headGeometry(f); headCache.set(key, hb); }
  const group = new THREE.Group();
  group.name = 'head';
  const skin = skinMaterial(identity.skinTone, skinTexture(identity), `face|${identity.id}`);
  const face = new THREE.Mesh(hb.geometry, skin);
  face.castShadow = true;
  group.add(face);
  const detail: THREE.Object3D[] = [];
  const plain = skinMaterial(identity.skinTone);

  // Ears: a flattened shell with a rim, tilted back, set behind the jaw.
  const earGeo = new THREE.SphereGeometry(1, 16, 12);
  for (const sx of [1, -1]) {
    const ear = new THREE.Mesh(earGeo, plain);
    const [hwE] = profileAt(0.104);
    ear.scale.set(0.0085, 0.031 * f.ears, 0.019 * f.ears);
    ear.position.set(sx * (hwE * f.headWidth + 0.003), 0.104, -0.012);
    ear.rotation.set(0.12, sx * 0.35, sx * -0.08);
    ear.castShadow = true;
    group.add(ear);
  }

  // Eyes, lids and brows.
  const ex = EYE_X * f.eyeSpacing;
  const eyeR = 0.0118;
  const eyeMat = cachedMat(`eye|${identity.eyes}`, () => new THREE.MeshPhysicalMaterial({
    map: irisTexture(identity.eyes), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05,
  }));
  const lidGeo = new THREE.SphereGeometry(eyeR * 1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.36);
  const lowerGeo = new THREE.SphereGeometry(eyeR * 1.06, 18, 8, 0, Math.PI * 2, Math.PI * 0.76, Math.PI * 0.24);
  const browMat = cachedMat(`brow|${hairHex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(hairHex).multiplyScalar(0.85), roughness: 0.9 }));
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 20, 14), eyeMat);
    eye.position.set(sx * ex, EYE_Y, hb.eyeZ - eyeR * 0.55);
    eye.rotation.y = sx * 0.06;
    group.add(eye); detail.push(eye);
    const lid = new THREE.Mesh(lidGeo, plain);
    lid.position.copy(eye.position);
    lid.rotation.x = 0.3; // upper lid tips forward over the top of the eye
    group.add(lid); detail.push(lid);
    const low = new THREE.Mesh(lowerGeo, plain);
    low.position.copy(eye.position);
    low.rotation.x = -0.3;
    group.add(low); detail.push(low);
    // Brow: a curved tapered strip following the brow ridge.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = sx * (ex - 0.017 + t * 0.036);
      const y = BROW_Y + 0.004 + Math.sin(t * Math.PI * 0.9) * 0.0045 - t * 0.002;
      const [hw0, fd0, , cz] = profileAt(y);
      const hw = hw0 * f.headWidth, fd = fd0 * f.headLength;
      const z = cz + fd * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / hw, 2.15)), 1 / 2.15) + relief(x, y, f) + 0.0018;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const thick = 0.0022 + unit(identity.id, 'browT') * 0.0018;
    const brow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, thick, 5, false), browMat);
    group.add(brow); detail.push(brow);
  }
  return { group, detail, skin };
}
