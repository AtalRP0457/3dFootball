// Stadium: tiered stands on all four sides, an instanced crowd of
// individually animated spectators, LED advertising boards, roof canopies
// with floodlight strips and a sky dome.
//
// The crowd is one InstancedMesh-style draw call: each spectator is a small
// textured quad (16 body / pose variants in an atlas) tinted with a shirt
// colour, swaying while seated and jumping with arms up after a goal.
// Sponsors on the boards are invented names, not real brands.

import * as THREE from 'three';
import { PITCH, HALF_L, HALF_W } from '../../game/constants.js';
import { MARGIN } from './pitch.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------------------
// Spectator atlas: 16 cells (64 x 128): 8 seated / calm, 8 arms up.
// colour atlas (skin, hair, trousers; shirt drawn white) + shirt mask atlas.
// ---------------------------------------------------------------------------
const CELLS = 16, CW = 64, CH = 128;
function spectatorAtlases() {
  const [c, g] = canvas(CW * CELLS, CH);
  const [m, gm] = canvas(CW * CELLS, CH);
  gm.fillStyle = '#000'; gm.fillRect(0, 0, m.width, m.height);
  const skins = ['#f1d0b5', '#d9a77f', '#b07a52', '#7a4b2e'];
  const hairs = ['#1d1612', '#4a2f1c', '#8a6239', '#c9a56a', '#2a2a2a'];
  for (let i = 0; i < CELLS; i++) {
    const x0 = i * CW, up = i >= 8, k = i % 8;
    const skin = skins[k % 4], hair = hairs[(k * 3) % 5];
    const cx = x0 + CW / 2;
    const draw = (ctx, shirtCol, isMask) => {
      const fill = (col) => { ctx.fillStyle = isMask ? (col === 'shirt' ? '#fff' : '#000') : (col === 'shirt' ? shirtCol : col); };
      // Legs / trousers (mostly hidden behind the row in front).
      fill('#23252c'); ctx.fillRect(cx - 13, 92, 26, 36);
      // Torso.
      fill('shirt');
      ctx.beginPath();
      ctx.moveTo(cx - 17, 56); ctx.quadraticCurveTo(cx - 20, 50, cx - 12, 46); ctx.lineTo(cx + 12, 46);
      ctx.quadraticCurveTo(cx + 20, 50, cx + 17, 56); ctx.lineTo(cx + 15, 96); ctx.lineTo(cx - 15, 96); ctx.closePath(); ctx.fill();
      // Arms: at the sides, or raised.
      if (up) {
        fill('shirt');
        ctx.save(); ctx.translate(cx - 15, 52); ctx.rotate(-2.6 + (k % 3) * 0.15); ctx.fillRect(-4, 0, 8, 26); ctx.restore();
        ctx.save(); ctx.translate(cx + 15, 52); ctx.rotate(2.6 - (k % 2) * 0.2); ctx.fillRect(-4, 0, 8, 26); ctx.restore();
        fill(skin);
        ctx.beginPath(); ctx.arc(cx - 23 - (k % 3), 26, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 23 + (k % 2), 26, 4.5, 0, Math.PI * 2); ctx.fill();
      } else {
        fill('shirt');
        ctx.fillRect(cx - 21, 54, 7, 30); ctx.fillRect(cx + 14, 54, 7, 30);
        fill(skin);
        ctx.fillRect(cx - 20, 82, 6, 8); ctx.fillRect(cx + 14, 82, 6, 8);
      }
      // Neck, head, hair.
      fill(skin); ctx.fillRect(cx - 4, 38, 8, 9);
      ctx.beginPath(); ctx.ellipse(cx, 30, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
      if (k % 5 !== 3) {
        fill(hair);
        ctx.beginPath(); ctx.ellipse(cx, 24, 10.5, 8, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(cx - 10.5, 22, 21, 4);
      } else {
        // A cap in the shirt colour.
        fill('shirt'); ctx.beginPath(); ctx.ellipse(cx, 22, 11, 7, 0, Math.PI, Math.PI * 2); ctx.fill();
      }
      // Scarf on some fans.
      if (k % 4 === 1) { fill('shirt'); ctx.fillRect(cx - 12, 44, 24, 7); }
    };
    draw(g, '#ffffff', false);
    draw(gm, '#ffffff', true);
  }
  const tex = (cv, color) => {
    const t = new THREE.CanvasTexture(cv);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { colorMap: tex(c, true), maskMap: tex(m, false) };
}

const crowdVertex = /* glsl */ `
  attribute vec3 offset;
  attribute float rotY;
  attribute float variant;
  attribute vec3 tint;
  attribute float phase;
  attribute float scaleH;
  uniform float uTime;
  uniform float uExcite;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    // Fans with a high phase stand up and jump when excited.
    float joins = step(0.25, fract(phase * 7.13));
    float jump = uExcite * joins * abs(sin(uTime * (6.0 + fract(phase * 3.7) * 3.0) + phase * 6.2831)) * 0.32;
    float sway = sin(uTime * 1.3 + phase * 6.2831) * 0.02;
    float v = variant + (uExcite * joins > 0.5 ? 8.0 : 0.0);
    vUv = vec2((uv.x + v) / ${CELLS.toFixed(1)}, uv.y);
    vTint = tint;
    vShade = 0.78 + 0.22 * fract(phase * 13.7);
    vec3 p = vec3(position.x * 0.62, (position.y + 0.5) * 1.24 * scaleH, 0.0);
    p.x += sway;
    float c = cos(rotY), s = sin(rotY);
    vec3 w = vec3(p.x * c, p.y + jump, -p.x * s) + offset;
    vec4 mvPosition = modelViewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const crowdFragment = /* glsl */ `
  uniform sampler2D colorMap;
  uniform sampler2D maskMap;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vShade;
  #include <fog_pars_fragment>
  void main() {
    vec4 c = texture2D(colorMap, vUv);
    if (c.a < 0.45) discard;
    float m = texture2D(maskMap, vUv).r;
    vec3 col = mix(c.rgb, vTint, m) * vShade * uLight;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/**
 * Seats for one stand as rows of spectator positions.
 * Returns an array of { x, y, z, rotY } in world space.
 */
function seatRows({ origin, along, out, length, rows, rise, depth, startY, spacing }) {
  const seats = [];
  const n = Math.floor(length / spacing);
  for (let r = 0; r < rows; r++) {
    const d = r * depth + depth * 0.5, y = startY + r * rise;
    for (let i = 0; i < n; i++) {
      const a = -length / 2 + (i + 0.5) * spacing;
      seats.push({
        x: origin.x + along.x * a + out.x * d,
        y,
        z: origin.z + along.z * a + out.z * d,
        rotY: Math.atan2(-out.x, -out.z), // face the pitch
      });
    }
  }
  return seats;
}

/** Stepped concrete + seat geometry for a tier (local: x along, z outwards). */
function tierGeometry(length, rows, rise, depth, startY) {
  const pos = [], idx = [], groups = [];
  const quad = (a, b, c, d) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const L = length / 2;
  // Treads (seats) then risers (concrete), as two groups.
  for (let r = 0; r < rows; r++) {
    const z0 = r * depth, z1 = z0 + depth, y = startY + r * rise;
    quad([-L, y, z0], [L, y, z0], [L, y, z1], [-L, y, z1]);
  }
  const treadCount = idx.length;
  for (let r = 0; r < rows; r++) {
    const z = r * depth, y0 = startY + (r - 1) * rise, y1 = startY + r * rise;
    quad([-L, Math.max(0, y0), z], [L, Math.max(0, y0), z], [L, y1, z], [-L, y1, z]);
  }
  // Back wall.
  const top = startY + rows * rise, back = rows * depth;
  quad([-L, 0, back], [L, 0, back], [L, top + 3, back], [-L, top + 3, back]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.addGroup(0, treadCount, 0);
  g.addGroup(treadCount, idx.length - treadCount, 1);
  g.computeVertexNormals();
  return g;
}

// ---------- LED boards ----------
const SPONSORS = [
  ['#0b1d4d', '#ffffff', 'FUTBOL SUPER LEAGUE'],
  ['#e10600', '#ffffff', 'NOVA ENERGY'],
  ['#0a0a0a', '#36e0ff', 'ORBIT TELECOM'],
  ['#f4c20d', '#0a0a0a', 'KICKSTAR'],
  ['#1b7f3b', '#ffffff', 'GREENLINE BANK'],
  ['#5b21b6', '#ffffff', 'AERO AIRWAYS'],
  ['#ffffff', '#c8102e', 'LEGENDS'],
  ['#0f766e', '#ffffff', 'PIXELBYTE'],
];
function ledTexture() {
  const W = 2048, H = 96;
  const [c, g] = canvas(W, H);
  const w = W / SPONSORS.length;
  SPONSORS.forEach(([bg, fg, text], i) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, bg); grd.addColorStop(1, shadeHex(bg, 0.75));
    g.fillStyle = grd; g.fillRect(i * w, 0, w, H);
    g.fillStyle = fg;
    g.font = '900 54px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save();
    g.translate(i * w + w / 2, H / 2 + 3);
    const tw = g.measureText(text).width;
    g.scale(Math.min(1, (w - 30) / tw), 1);
    g.fillText(text, 0, 0);
    g.restore();
  });
  // LED pixel grid.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }

function skyDome() {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#2a5ea8') }, horizon: { value: new THREE.Color('#b9d4ee') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Build the stadium. colours: { home: [...], away: [...] } shirt colours
 * used for the crowd (mostly home fans).
 * Returns { group, update(dt, excite), setColors(colours) }.
 */
export function buildStadium(renderer) {
  const group = new THREE.Group();
  group.add(skyDome());

  const concrete = new THREE.MeshStandardMaterial({ color: '#7b818c', roughness: 0.95 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#1f3e8f', roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: '#2c313b', roughness: 0.6, metalness: 0.3 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#d9dde4', roughness: 0.7, side: THREE.DoubleSide });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#15181f', roughness: 0.9 });

  const sideZ = HALF_W + MARGIN + 1.2; // first row (sides)
  const endX = HALF_L + MARGIN + 1.2; // first row (ends)
  const allSeats = [];

  // Stand definitions: origin at the front edge, `out` points away from the pitch.
  const stands = [
    // far side: two tiers + roof
    { origin: new THREE.Vector3(0, 0, -sideZ), along: new THREE.Vector3(1, 0, 0), out: new THREE.Vector3(0, 0, -1), length: PITCH.length + 2 * MARGIN + 6, tiers: 2 },
    // ends: two tiers + roof
    { origin: new THREE.Vector3(-endX, 0, 0), along: new THREE.Vector3(0, 0, 1), out: new THREE.Vector3(-1, 0, 0), length: PITCH.width + 2 * MARGIN + 6, tiers: 2 },
    { origin: new THREE.Vector3(endX, 0, 0), along: new THREE.Vector3(0, 0, -1), out: new THREE.Vector3(1, 0, 0), length: PITCH.width + 2 * MARGIN + 6, tiers: 2 },
    // near (camera) side: a lower tier only, so the TV camera sees over it
    { origin: new THREE.Vector3(0, 0, sideZ), along: new THREE.Vector3(-1, 0, 0), out: new THREE.Vector3(0, 0, 1), length: PITCH.length + 2 * MARGIN + 6, tiers: 1 },
  ];
  // Angled corner stands close the bowl.
  const cornerLen = 24;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const out = new THREE.Vector3(sx, 0, sz).normalize();
    const along = new THREE.Vector3(-sz, 0, sx).normalize();
    const origin = new THREE.Vector3(sx * (endX + 3.5), 0, sz * (sideZ + 3.5));
    stands.push({ origin, along, out, length: cornerLen, tiers: sz > 0 ? 1 : 2 });
  }
  const lower = { rows: 22, rise: 0.42, depth: 0.82, startY: 1.4 };
  const upper = { rows: 16, rise: 0.58, depth: 0.8 };

  for (const st of stands) {
    const yaw = Math.atan2(st.out.x, st.out.z); // local +z -> out
    const place = (mesh, d, y = 0) => {
      mesh.position.set(st.origin.x + st.out.x * d, y, st.origin.z + st.out.z * d);
      mesh.rotation.y = yaw;
      group.add(mesh);
      return mesh;
    };
    // Lower tier.
    const lowerGeo = tierGeometry(st.length, lower.rows, lower.rise, lower.depth, lower.startY);
    const lowerMesh = place(new THREE.Mesh(lowerGeo, [seatMat, concrete]), 0);
    lowerMesh.receiveShadow = true;
    allSeats.push(...seatRows({ ...st, ...lower, spacing: 0.55 }));
    // Front wall of the lower tier.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(st.length, 1.4, 0.3), darkMat);
    place(wall, -0.15, 0.7);
    if (st.tiers === 2) {
      const lowerDepth = lower.rows * lower.depth;
      const lowerTop = lower.startY + lower.rows * lower.rise;
      // Hospitality band with an LED ribbon between the tiers.
      const band = new THREE.Mesh(new THREE.BoxGeometry(st.length, 2.4, 1.2), darkMat);
      place(band, lowerDepth - 2.2, lowerTop + 1.5);
      const ribbonTex = ledTexture();
      ribbonTex.repeat.set(st.length / 60, 1);
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(st.length, 1.1), new THREE.MeshBasicMaterial({ map: ribbonTex }));
      ribbon.userData.scroll = ribbonTex;
      place(ribbon, lowerDepth - 2.85, lowerTop + 1.6);
      ribbon.rotation.y = yaw + Math.PI;
      // Upper tier, set back over the lower one.
      const upStartY = lowerTop + 3.2;
      const upD = lowerDepth - 1.5;
      const upGeo = tierGeometry(st.length, upper.rows, upper.rise, upper.depth, 0);
      const upMesh = place(new THREE.Mesh(upGeo, [seatMat, concrete]), upD, upStartY);
      upMesh.receiveShadow = true;
      const upOrigin = st.origin.clone().addScaledVector(st.out, upD);
      allSeats.push(...seatRows({ ...st, origin: upOrigin, ...upper, startY: upStartY, spacing: 0.55 }));
      // Roof canopy and floodlight strip.
      const top = upStartY + upper.rows * upper.rise + 5;
      const roofDepth = upD + upper.rows * upper.depth + 2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(st.length + 4, 0.5, roofDepth), roofMat);
      roof.rotation.x = 0;
      place(roof, roofDepth / 2 - 4, top);
      const truss = new THREE.Mesh(new THREE.BoxGeometry(st.length + 4, 1.2, 0.8), steel);
      place(truss, -4, top - 0.8);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(st.length * 0.92, 0.45, 0.3), lampMat);
      place(strip, -4.3, top - 1.4);
      // Columns.
      for (let i = -2; i <= 2; i++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, top, 0.8), steel);
        const a = (i / 2) * (st.length / 2 - 2);
        col.position.set(st.origin.x + st.along.x * a + st.out.x * roofDepth * 0.95, top / 2, st.origin.z + st.along.z * a + st.out.z * roofDepth * 0.95);
        group.add(col);
      }
    }
  }

  // ---------- crowd ----------
  const atlas = spectatorAtlases();
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const r = rng(2024);
  const seats = allSeats.filter(() => r() < 0.93); // a few empty seats
  const n = seats.length;
  const offset = new Float32Array(n * 3), rotY = new Float32Array(n), variant = new Float32Array(n);
  const tint = new Float32Array(n * 3), phase = new Float32Array(n), scaleH = new Float32Array(n);
  seats.forEach((s, i) => {
    offset[i * 3] = s.x; offset[i * 3 + 1] = s.y; offset[i * 3 + 2] = s.z;
    rotY[i] = s.rotY; variant[i] = Math.floor(r() * 8); phase[i] = r(); scaleH[i] = 0.9 + r() * 0.2;
  });
  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offset, 3));
  geo.setAttribute('rotY', new THREE.InstancedBufferAttribute(rotY, 1));
  geo.setAttribute('variant', new THREE.InstancedBufferAttribute(variant, 1));
  const tintAttr = new THREE.InstancedBufferAttribute(tint, 3);
  geo.setAttribute('tint', tintAttr);
  geo.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('scaleH', new THREE.InstancedBufferAttribute(scaleH, 1));
  geo.instanceCount = n;
  const crowdMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      colorMap: { value: atlas.colorMap }, maskMap: { value: atlas.maskMap },
      uTime: { value: 0 }, uExcite: { value: 0 }, uLight: { value: new THREE.Vector3(0.86, 0.88, 0.92) },
    }]),
    vertexShader: crowdVertex,
    fragmentShader: crowdFragment,
    fog: true,
    side: THREE.DoubleSide,
  });
  crowdMat.uniforms.colorMap.value = atlas.colorMap;
  crowdMat.uniforms.maskMap.value = atlas.maskMap;
  const crowd = new THREE.Mesh(geo, crowdMat);
  crowd.frustumCulled = false;
  group.add(crowd);

  /** Colour the crowd: about 70% home colours, 20% away, the rest neutral. */
  function setColors(home = ['#c8102e', '#ffffff'], away = ['#1d4ed8', '#ffffff']) {
    const cr = rng(99);
    const neutral = ['#2b2f38', '#5b6270', '#e6e6e6', '#1f2937', '#7c4a2a'];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // Away fans grouped at one end, like a real away section.
      const s = seats[i];
      const awaySection = s.x > HALF_L && Math.abs(s.z) < 22;
      const roll = cr();
      let hex;
      if (awaySection) hex = roll < 0.85 ? away[Math.floor(cr() * away.length)] : neutral[Math.floor(cr() * neutral.length)];
      else if (roll < 0.72) hex = home[Math.floor(cr() * home.length)];
      else if (roll < 0.8) hex = away[Math.floor(cr() * away.length)];
      else hex = neutral[Math.floor(cr() * neutral.length)];
      col.set(hex).convertSRGBToLinear();
      tint[i * 3] = col.r; tint[i * 3 + 1] = col.g; tint[i * 3 + 2] = col.b;
    }
    tintAttr.needsUpdate = true;
  }
  setColors();

  // ---------- pitch-side LED boards ----------
  const boards = [];
  const boardTex = ledTexture();
  const bz = HALF_W + 4.4, bx = HALF_L + 4.4;
  const longW = PITCH.length + 10, endW = PITCH.width + 4;
  for (const b of [
    { w: longW, pos: [0, 0.5, -bz], rot: 0 },
    { w: longW, pos: [0, 0.5, bz], rot: Math.PI },
    { w: endW, pos: [-bx, 0.5, 0], rot: Math.PI / 2 },
    { w: endW, pos: [bx, 0.5, 0], rot: -Math.PI / 2 },
  ]) {
    const t = boardTex.clone(); t.needsUpdate = true; t.repeat.set(b.w / 40, 1);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(b.w, 0.95), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    face.position.set(b.pos[0], 0.55, b.pos[2]);
    face.rotation.y = b.rot;
    face.userData.scroll = t;
    group.add(face);
    boards.push(face);
    const backing = new THREE.Mesh(new THREE.BoxGeometry(b.w, 1.05, 0.25), darkMat);
    backing.position.set(b.pos[0], 0.52, b.pos[2]);
    backing.rotation.y = b.rot;
    backing.translateZ(-0.14);
    group.add(backing);
  }
  // Running track-coloured surround beyond the grass.
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.length + 2 * MARGIN + 8, PITCH.width + 2 * MARGIN + 8),
    new THREE.MeshStandardMaterial({ color: '#33663a', roughness: 1 }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.01;
  surround.receiveShadow = true;
  group.add(surround);

  const scrolling = [];
  group.traverse((o) => { if (o.userData.scroll) scrolling.push(o.userData.scroll); });
  let time = 0;
  let excite = 0;
  return {
    group,
    crowd,
    spectators: n,
    setColors,
    /** excite: 0 calm .. 1 goal celebration. */
    update(dt, targetExcite = 0) {
      time += dt;
      excite += (targetExcite - excite) * Math.min(1, dt * (targetExcite > excite ? 6 : 1.2));
      crowdMat.uniforms.uTime.value = time;
      crowdMat.uniforms.uExcite.value = excite;
      // LED boards rotate their adverts slowly.
      for (const t of scrolling) t.offset.x = (t.offset.x + dt * 0.02) % 1;
    },
  };
}
