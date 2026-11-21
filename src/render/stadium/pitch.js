// Broadcast-quality pitch.
//
// - Grass: a mowing-pattern colour map (stripes across the pitch, worn
//   goalmouths and centre circle, darker edges) multiplied by a tiling
//   high-frequency blade texture through a small shader hook, so the turf
//   has detail up close and clean stripes from the TV camera.
// - Markings are real geometry (thin ribbons and arcs just above the
//   grass), so they stay razor sharp at any distance instead of blurring in
//   a texture.
// - Corner flags.

import * as THREE from 'three';
import {
  PITCH, HALF_L, HALF_W, BOX, GOAL_AREA, PENALTY_SPOT, PENALTY_ARC_RADIUS,
} from '../../game/constants.ts';

export const MARGIN = 6; // grass beyond the lines (metres)
const LINE_W = 0.12;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Small deterministic random so the pitch looks the same every match.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Mowing pattern + wear, one texel per ~12 cm (stripes are wide and soft). */
function grassColourTexture(renderer) {
  const S = 8; // px per metre
  const L = PITCH.length + 2 * MARGIN, Wd = PITCH.width + 2 * MARGIN;
  const [c, g] = canvas(Math.round(L * S), Math.round(Wd * S));
  const X = (x) => (x + HALF_L + MARGIN) * S;
  const Z = (z) => (z + HALF_W + MARGIN) * S;
  const base = '#356f2b', light = '#428036';
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  // Stripes across the pitch (perpendicular to the touchlines), 18 bands
  // between the goal lines plus matching bands behind them.
  const bands = 18, bw = PITCH.length / bands;
  for (let i = -2; i < bands + 2; i++) {
    if (i % 2 === 0) continue;
    g.fillStyle = light;
    g.fillRect(X(-HALF_L + i * bw), 0, bw * S, c.height);
  }
  // Soft cross-mow (very subtle second direction).
  g.globalAlpha = 0.05;
  const cw = PITCH.width / 8;
  for (let i = 0; i < 8; i += 2) { g.fillStyle = '#ffffff'; g.fillRect(0, Z(-HALF_W + i * cw), c.width, cw * S); }
  g.globalAlpha = 1;
  // Wear: goalmouths, penalty spots and the centre.
  const worn = (x, z, rx, rz, a) => {
    const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), Math.max(rx, rz) * S);
    grd.addColorStop(0, `rgba(120,100,60,${a})`);
    grd.addColorStop(1, 'rgba(120,100,60,0)');
    g.save();
    g.translate(X(x), Z(z)); g.scale(rx / Math.max(rx, rz), rz / Math.max(rx, rz)); g.translate(-X(x), -Z(z));
    g.fillStyle = grd; g.fillRect(X(x) - rx * S * 2, Z(z) - rz * S * 2, rx * S * 4, rz * S * 4);
    g.restore();
  };
  for (const sx of [-1, 1]) {
    worn(sx * (HALF_L - 3), 0, 4, 6, 0.32);
    worn(sx * (HALF_L - PENALTY_SPOT), 0, 1.6, 1.6, 0.25);
    worn(sx * (HALF_L - 0.6), 0, 1.2, 3.4, 0.4);
  }
  worn(0, 0, 3, 3, 0.16);
  // Blotchy colour variation.
  const r = rng(7);
  for (let i = 0; i < 1400; i++) {
    const x = r() * c.width, y = r() * c.height, rad = (4 + r() * 22) * S / 8;
    g.fillStyle = r() < 0.5 ? 'rgba(20,60,15,0.025)' : 'rgba(150,200,90,0.02)';
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // Slightly darker turf outside the lines.
  g.fillStyle = 'rgba(10,40,10,0.12)';
  g.fillRect(0, 0, c.width, Z(-HALF_W)); g.fillRect(0, Z(HALF_W), c.width, c.height - Z(HALF_W));
  g.fillRect(0, 0, X(-HALF_L), c.height); g.fillRect(X(HALF_L), 0, c.width - X(HALF_L), c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/** Tiling blade detail (grey around 0.5), repeated every couple of metres. */
function grassDetailTexture(renderer) {
  const N = 512;
  const [c, g] = canvas(N, N);
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  const r = rng(42);
  for (let i = 0; i < 26000; i++) {
    const x = r() * N, y = r() * N;
    const v = Math.floor(70 + r() * 120);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 0.6 + r() * 0.9;
    const a = -Math.PI / 2 + (r() - 0.5) * 0.9, l = 2 + r() * 5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    // Wrap blades across the tile edges so the tiling is seamless.
    if (x < 8 || y < 8 || x > N - 8 || y > N - 8) {
      g.beginPath(); g.moveTo((x + N / 2) % N, (y + N / 2) % N); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function grassMaterial(renderer) {
  const map = grassColourTexture(renderer);
  const detail = grassDetailTexture(renderer);
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  const L = PITCH.length + 2 * MARGIN, Wd = PITCH.width + 2 * MARGIN;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    shader.uniforms.detailRepeat = { value: new THREE.Vector2(L / 2.2, Wd / 2.2) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform vec2 detailRepeat;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float d1 = texture2D(detailMap, vMapUv * detailRepeat).r;
        float d2 = texture2D(detailMap, vMapUv * detailRepeat * 0.137 + 0.31).r;
        diffuseColor.rgb *= 0.62 + 0.55 * d1 + 0.18 * (d2 - 0.5);`);
  };
  return m;
}

// ---------- markings as geometry ----------
function addSegment(pos, ax, az, bx, bz, w = LINE_W) {
  const dx = bx - ax, dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  const nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
  pos.push(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax + nx, az + nz, bx - nx, bz - nz, ax - nx, az - nz);
}
function addArc(pos, cx, cz, r, a0, a1, segs = 64) {
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + (a1 - a0) * (i / segs), t1 = a0 + (a1 - a0) * ((i + 1) / segs);
    const ri = r - LINE_W / 2, ro = r + LINE_W / 2;
    const p = (rr, t) => [cx + Math.cos(t) * rr, cz + Math.sin(t) * rr];
    const [ax, az] = p(ri, t0), [bx, bz] = p(ro, t0), [qx, qz] = p(ro, t1), [dx, dz] = p(ri, t1);
    pos.push(ax, az, bx, bz, qx, qz, ax, az, qx, qz, dx, dz);
  }
}
function addDisc(pos, cx, cz, r, segs = 20) {
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * Math.PI * 2, t1 = ((i + 1) / segs) * Math.PI * 2;
    pos.push(cx, cz, cx + Math.cos(t0) * r, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cz + Math.sin(t1) * r);
  }
}
function rect(pos, x0, z0, x1, z1) {
  addSegment(pos, x0, z0, x1, z0); addSegment(pos, x1, z0, x1, z1);
  addSegment(pos, x1, z1, x0, z1); addSegment(pos, x0, z1, x0, z0);
}

function markingsGeometry() {
  const p2 = [];
  const hl = HALF_L, hw = HALF_W;
  rect(p2, -hl, -hw, hl, hw);
  addSegment(p2, 0, -hw, 0, hw);
  addArc(p2, 0, 0, 9.15, 0, Math.PI * 2, 96);
  addDisc(p2, 0, 0, 0.18);
  for (const sx of [-1, 1]) {
    const gx = sx * hl;
    rect(p2, gx, -BOX.width / 2, gx - sx * BOX.depth, BOX.width / 2);
    rect(p2, gx, -GOAL_AREA.width / 2, gx - sx * GOAL_AREA.depth, GOAL_AREA.width / 2);
    const spot = gx - sx * PENALTY_SPOT;
    addDisc(p2, spot, 0, 0.15);
    // "D": the part of the penalty arc outside the box.
    const edge = BOX.depth - PENALTY_SPOT; // distance spot -> box line
    const half = Math.acos(edge / PENALTY_ARC_RADIUS);
    const centre = sx > 0 ? Math.PI : 0;
    addArc(p2, spot, 0, PENALTY_ARC_RADIUS, centre - half, centre + half, 40);
    for (const sz of [-1, 1]) {
      // Corner arcs (quarter circles inside the pitch).
      const start = Math.atan2(-sz, -sx);
      addArc(p2, gx, sz * hw, 1, start - Math.PI / 4, start + Math.PI / 4, 16);
    }
  }
  const pos = new Float32Array((p2.length / 2) * 3);
  for (let i = 0, j = 0; i < p2.length; i += 2, j += 3) { pos[j] = p2[i]; pos[j + 1] = 0; pos[j + 2] = p2[i + 1]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

function cornerFlag(x, z) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.6 }));
  pole.position.y = 0.75;
  pole.castShadow = true;
  grp.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ color: '#ffcc00', side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(0.2, 1.33, 0);
  flag.castShadow = true;
  grp.add(flag);
  grp.position.set(x, 0, z);
  return grp;
}

/** Grass + markings + corner flags. */
export function buildPitch(renderer) {
  const group = new THREE.Group();
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length + 2 * MARGIN, PITCH.width + 2 * MARGIN),
    grassMaterial(renderer),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);
  const lines = new THREE.Mesh(markingsGeometry(), new THREE.MeshStandardMaterial({
    color: '#f4f6f2', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  lines.position.y = 0.004;
  lines.receiveShadow = true;
  group.add(lines);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(cornerFlag(sx * HALF_L, sz * HALF_W));
  return group;
}
