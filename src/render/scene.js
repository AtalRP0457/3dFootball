// three.js renderer: stadium, pitch, goals, players, ball and the
// FIFA 98 style broadcast camera. Reads match state, never changes it.

import * as THREE from 'three';
import {
  PITCH, HALF_L, HALF_W, GOAL, BOX, GOAL_AREA, PENALTY_SPOT,
  PENALTY_ARC_RADIUS, BALL_R,
} from '../game/constants.js';

const MARGIN = 4; // grass beyond the touchlines (metres)
const HUMAN_COLORS = { p1: '#22d3ee', p2: '#f43f5e' };
// Ground rings under players
const RING = {
  current: '#22c55e', // green: the player you control
  next: '#facc15', // yellow: who you get on the next pass / switch
  other: '#ef4444', // red: controlled by the computer
  tackle: '#fb923c', // flashing orange: close enough to tackle
};
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673b'];
const HAIR = ['#1b1b1b', '#3b2416', '#6b4423', '#c9a15b', '#2a1a0f'];

const CAMERA_MODES = {
  broadcast: { h: 22, back: 29, ahead: 0.82, fov: 44, clampX: 13 },
  wide: { h: 46, back: 48, ahead: 0.6, fov: 50, clampX: 24 },
  close: { h: 17, back: 24, ahead: 0.95, fov: 40, clampX: 8 },
};
export const CAMERA_ORDER = Object.keys(CAMERA_MODES);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------- pitch ----------
function pitchTexture(renderer) {
  const S = 20;
  const W = (PITCH.length + 2 * MARGIN) * S;
  const H = (PITCH.width + 2 * MARGIN) * S;
  const [c, g] = canvas(W, H);
  const X = (x) => (x + HALF_L + MARGIN) * S;
  const Z = (z) => (z + HALF_W + MARGIN) * S;

  g.fillStyle = '#2e7a31';
  g.fillRect(0, 0, W, H);
  const n = 16, sw = W / n;
  for (let i = 0; i < n; i++) {
    if (i % 2) { g.fillStyle = '#37893a'; g.fillRect(i * sw, 0, sw, H); }
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,60,20' : '90,150,80'},0.18)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 0.12 * S;
  g.strokeRect(X(-HALF_L), Z(-HALF_W), PITCH.length * S, PITCH.width * S);
  g.beginPath(); g.moveTo(X(0), Z(-HALF_W)); g.lineTo(X(0), Z(HALF_W)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 9.15 * S, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 0.25 * S, 0, Math.PI * 2); g.fill();

  for (const sx of [-1, 1]) {
    const gx = sx * HALF_L;
    const inner = (d) => gx - sx * d;
    // Penalty area
    g.strokeRect(Math.min(X(gx), X(inner(BOX.depth))), Z(-BOX.width / 2), BOX.depth * S, BOX.width * S);
    // Goal area
    g.strokeRect(Math.min(X(gx), X(inner(GOAL_AREA.depth))), Z(-GOAL_AREA.width / 2), GOAL_AREA.depth * S, GOAL_AREA.width * S);
    // Penalty spot and arc
    const spot = inner(PENALTY_SPOT);
    g.beginPath(); g.arc(X(spot), Z(0), 0.2 * S, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath();
    g.rect(sx > 0 ? 0 : X(inner(BOX.depth)), 0, sx > 0 ? X(inner(BOX.depth)) : W, H);
    g.clip();
    g.beginPath(); g.arc(X(spot), Z(0), PENALTY_ARC_RADIUS * S, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  // Corner arcs, clipped to the pitch so only the inside quarter shows.
  g.save();
  g.beginPath();
  g.rect(X(-HALF_L), Z(-HALF_W), PITCH.length * S, PITCH.width * S);
  g.clip();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.beginPath(); g.arc(X(sx * HALF_L), Z(sz * HALF_W), 1 * S, 0, Math.PI * 2); g.stroke();
    }
  }
  g.restore();
  return texture(c, renderer);
}

function adTexture(renderer) {
  const [c, g] = canvas(1024, 64);
  const ads = [
    ['#0b3d91', '#ffffff', 'LEGENDS'],
    ['#ffd400', '#111111', 'DECADES CUP'],
    ['#c8102e', '#ffffff', '1910 – 2000'],
    ['#111111', '#22d3ee', 'THREE.JS'],
  ];
  const w = c.width / ads.length;
  ads.forEach(([bg, fg, text], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = fg; g.font = 'italic 900 38px Arial Black, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, i * w + w / 2, 34);
  });
  const t = texture(c, renderer);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function crowdTexture(renderer) {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#2b2b33'; g.fillRect(0, 0, 512, 256);
  const colors = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#ffd166', '#06d6a0', '#ef476f', '#f4a261', '#222', '#ddd'];
  for (let row = 0; row < 16; row++) {
    g.fillStyle = '#3a3a44'; g.fillRect(0, row * 16 + 12, 512, 4);
    for (let i = 0; i < 64; i++) {
      if (Math.random() < 0.12) continue;
      const x = i * 8 + Math.random() * 2, y = row * 16 + 2;
      g.fillStyle = colors[(Math.random() * colors.length) | 0];
      g.fillRect(x, y + 4, 6, 7);
      g.fillStyle = SKIN[(Math.random() * SKIN.length) | 0];
      g.fillRect(x + 1.5, y, 3, 4);
    }
  }
  const t = texture(c, renderer);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeStand(width, depth, height, crowdTex) {
  const group = new THREE.Group();
  const slope = Math.hypot(depth, height);
  const tex = crowdTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(width / 14, 1);
  const seats = new THREE.Mesh(
    new THREE.PlaneGeometry(width, slope),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  seats.rotation.x = -Math.atan2(depth, height);
  seats.position.set(0, 1 + height / 2, -depth / 2);
  group.add(seats);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, height + 4, 1),
    new THREE.MeshLambertMaterial({ color: '#4a4f5c' }),
  );
  back.position.set(0, (height + 4) / 2, -depth - 0.5);
  group.add(back);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.6, depth * 0.7),
    new THREE.MeshLambertMaterial({ color: '#5d6472' }),
  );
  roof.position.set(0, height + 4, -depth * 0.65);
  group.add(roof);
  return group;
}

function buildStadium(scene, renderer) {
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length + 2 * MARGIN, PITCH.width + 2 * MARGIN),
    new THREE.MeshLambertMaterial({ map: pitchTexture(renderer) }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 180),
    new THREE.MeshLambertMaterial({ color: '#3d5a3e' }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  scene.add(apron);

  // Advertising boards
  const ad = adTexture(renderer);
  const boardMat = (w) => {
    const t = ad.clone(); t.needsUpdate = true; t.repeat.set(w / 32, 1);
    return new THREE.MeshLambertMaterial({ map: t });
  };
  const bz = HALF_W + MARGIN - 0.6, bx = HALF_L + MARGIN - 0.6;
  const longW = PITCH.length + 2 * MARGIN, endW = PITCH.width + 2 * MARGIN;
  const boards = [
    { w: longW, pos: [0, 0.5, -bz], rot: 0 },
    { w: longW, pos: [0, 0.5, bz], rot: Math.PI },
    { w: endW, pos: [-bx, 0.5, 0], rot: Math.PI / 2 },
    { w: endW, pos: [bx, 0.5, 0], rot: -Math.PI / 2 },
  ];
  for (const b of boards) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, 1), boardMat(b.w));
    m.position.set(...b.pos);
    m.rotation.y = b.rot;
    scene.add(m);
  }

  // Stands on three sides (the camera side stays open, like TV).
  const crowd = crowdTexture(renderer);
  const far = makeStand(PITCH.length + 2 * MARGIN + 4, 20, 13, crowd);
  far.position.set(0, 0, -(HALF_W + MARGIN + 2));
  scene.add(far);
  const left = makeStand(PITCH.width + 2 * MARGIN, 16, 10, crowd);
  left.position.set(-(HALF_L + MARGIN + 2), 0, 0);
  left.rotation.y = Math.PI / 2;
  scene.add(left);
  const right = makeStand(PITCH.width + 2 * MARGIN, 16, 10, crowd);
  right.position.set(HALF_L + MARGIN + 2, 0, 0);
  right.rotation.y = -Math.PI / 2;
  scene.add(right);

  // Floodlight towers
  const poleMat = new THREE.MeshLambertMaterial({ color: '#9aa1ad' });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe6' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HALF_L + 16), z = sz * (HALF_W + 18);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 34, 8), poleMat);
      pole.position.set(x, 17, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), lampMat);
      lamp.position.set(x, 35, z);
      lamp.lookAt(0, 0, 0);
      scene.add(lamp);
    }
  }
}

// ---------- goals ----------
function buildGoal(scene, sx) {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const r = 0.06;
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL.height, 10), white);
    post.position.set(0, GOAL.height / 2, sz * GOAL.width / 2);
    post.castShadow = true;
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL.width + r * 2, 10), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, GOAL.height, 0);
  bar.castShadow = true;
  group.add(bar);

  // Net as a grid of lines: back, roof and both sides.
  const D = GOAL.depth * sx, Wd = GOAL.width / 2, Hh = GOAL.height, step = 0.25;
  const pts = [];
  const seg = (a, b) => pts.push(...a, ...b);
  for (let z = -Wd; z <= Wd + 1e-6; z += step) {
    seg([D, 0, z], [D, Hh, z]);
    seg([0, Hh, z], [D, Hh, z]);
  }
  for (let y = 0; y <= Hh + 1e-6; y += step) {
    seg([D, y, -Wd], [D, y, Wd]);
    for (const sz of [-1, 1]) seg([0, y, sz * Wd], [D, y, sz * Wd]);
  }
  for (let x = 0; Math.abs(x) <= Math.abs(D) + 1e-6; x += step * sx) {
    seg([x, Hh, -Wd], [x, Hh, Wd]);
    for (const sz of [-1, 1]) seg([x, 0, sz * Wd], [x, Hh, sz * Wd]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const net = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }));
  group.add(net);

  group.position.x = sx * HALF_L;
  scene.add(group);
}

// ---------- players ----------
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function numberTexture(num, shirt, renderer) {
  const [c, g] = canvas(64, 64);
  g.fillStyle = luminance(shirt) > 0.6 ? '#111111' : '#ffffff';
  g.font = '900 44px Arial Black, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 32, 36);
  return texture(c, renderer);
}

function jerseyTexture(shirt, trim, renderer) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = shirt; g.fillRect(0, 0, 128, 128);
  // Fine fabric weave and original diagonal paneling keep kits readable at
  // broadcast distance without relying on branded artwork.
  g.globalAlpha = 0.16;
  g.strokeStyle = '#ffffff'; g.lineWidth = 1;
  for (let i = -128; i < 192; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = trim;
  g.fillRect(0, 8, 128, 6);
  g.fillRect(58, 0, 12, 128);
  return texture(c, renderer);
}

function makePlayer(p, kit, renderer) {
  const isGK = p.role === 'GK';
  const shirt = isGK ? kit.gk : kit.shirt;
  const shorts = isGK ? '#1a1a1a' : kit.shorts;
  const socks = isGK ? kit.gk : kit.socks;
  const skin = SKIN[(p.id * 7 + p.number) % SKIN.length];
  const hair = HAIR[(p.id * 3 + p.number) % HAIR.length];
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const kitTrim = luminance(shirt) > 0.55 ? '#17304d' : '#f2d36b';
  const shirtM = new THREE.MeshLambertMaterial({ map: jerseyTexture(shirt, kitTrim, renderer) });
  const shortsM = mat(shorts), sockM = mat(socks), skinM = mat(skin);
  const bootM = mat('#111111');

  const root = new THREE.Group();
  const body = new THREE.Group(); // tilts for dives
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirtM);
  torso.position.y = 1.2;
  body.add(torso);
  const num = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.32),
    new THREE.MeshBasicMaterial({ map: numberTexture(p.number, shirt, renderer), transparent: true }),
  );
  num.position.set(0, 1.24, -0.145);
  num.rotation.y = Math.PI;
  body.add(num);
  const frontNum = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19),
    new THREE.MeshBasicMaterial({ map: numberTexture(p.number, shirt, renderer), transparent: true }));
  frontNum.position.set(0, 1.22, 0.145);
  body.add(frontNum);
  const trimM = mat(kitTrim);
  const trim = (w, h, d, x, y, z, material = trimM) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); body.add(mesh); return mesh;
  };
  trim(0.18, 0.045, 0.29, 0, 1.515, 0);
  for (const sx of [-1, 1]) {
    trim(0.045, 0.52, 0.012, sx * 0.235, 1.2, 0.146);
    trim(0.145, 0.035, 0.15, sx * 0.32, 1.31, 0);
    trim(0.035, 0.26, 0.018, sx * 0.23, 0.8, 0.155);
  }
  const shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.3), shortsM);
  shortsMesh.position.y = 0.8;
  body.add(shortsMesh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinM);
  head.position.y = 1.7;
  body.add(head);
  const faceDetail = mat('#241a17');
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skinM);
    ear.position.set(sx * 0.15, 1.69, 0); body.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), faceDetail);
    eye.position.set(sx * 0.055, 1.72, 0.145); body.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.018), faceDetail);
    brow.position.set(sx * 0.055, 1.75, 0.145); body.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 6), skinM);
  nose.position.set(0, 1.685, 0.16); body.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.009, 0.012), faceDetail);
  mouth.position.set(0, 1.65, 0.15); body.add(mouth);
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair),
  );
  hairMesh.position.y = 1.72;
  hairMesh.rotation.x = -0.25;
  body.add(hairMesh);

  const limb = (w, h, m, y) => {
    const pivot = new THREE.Group();
    pivot.position.y = y;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = limb(0.17, 0.4, skinM, 0.72);
    leg.position.x = sx * 0.13;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.32, 0.17), sockM);
    lower.position.y = -0.56;
    lower.castShadow = true;
    leg.add(lower);
    const sockBand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.038, 0.18), trimM);
    sockBand.position.y = -0.47;
    leg.add(sockBand);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.28), bootM);
    boot.position.set(0, -0.72, 0.05);
    leg.add(boot);
    body.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = limb(0.12, 0.58, isGK ? shirtM : skinM, 1.48);
    arm.position.x = sx * 0.32;
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), shirtM);
    sleeve.position.y = -0.1;
    arm.add(sleeve);
    body.add(arm);
    arms.push(arm);
  }
  for (const m of [torso, shortsMesh, head]) m.castShadow = true;

  return { root, body, legs, arms, phase: Math.random() * 6, prevX: p.pos.x, prevZ: p.pos.z };
}

function ballTexture(renderer) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#151515';
  const spots = [[32, 30], [96, 64], [160, 30], [224, 64], [32, 98], [160, 98], [96, 8], [224, 8], [96, 120], [224, 120]];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 11);
    }
    g.closePath(); g.fill();
  }
  return texture(c, renderer);
}

// ---------- renderer ----------
export function createRenderer(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fbfe8');
  scene.fog = new THREE.Fog('#8fbfe8', 110, 260);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 500);

  scene.add(new THREE.HemisphereLight('#ffffff', '#3b5a3b', 1.8));
  const sun = new THREE.DirectionalLight('#fff6e0', 2.4);
  sun.position.set(-25, 50, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 35; sc.bottom = -35; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  buildStadium(scene, renderer);
  buildGoal(scene, -1);
  buildGoal(scene, 1);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 24, 16),
    new THREE.MeshLambertMaterial({ map: ballTexture(renderer) }),
  );
  ball.castShadow = true;
  scene.add(ball);
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({ color: '#101820', transparent: true, opacity: 0.42, depthWrite: false }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.035;
  scene.add(ballShadow);
  const prevBall = new THREE.Vector3();

  // Arrow above each human's current player (cyan = P1, pink = P2).
  const markers = {};
  for (const id of ['p1', 'p2']) {
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.36, 8),
      new THREE.MeshBasicMaterial({ color: HUMAN_COLORS[id] }),
    );
    arrow.rotation.x = Math.PI;
    arrow.visible = false;
    scene.add(arrow);
    markers[id] = { arrow };
  }
  const ringGeo = new THREE.RingGeometry(0.55, 0.78, 32);
  const arenaGlow = new THREE.Group();
  const glowMat = new THREE.MeshBasicMaterial({ color: '#33c8ff', transparent: true, opacity: 0.7 });
  for (const z of [-HALF_W - 0.25, HALF_W + 0.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(PITCH.length + 1, 0.42, 0.12), glowMat);
    rail.position.set(0, 0.28, z); arenaGlow.add(rail);
  }
  for (const x of [-HALF_L - 0.25, HALF_L + 0.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, PITCH.width + 1), glowMat);
    rail.position.set(x, 0.28, 0); arenaGlow.add(rail);
  }
  arenaGlow.visible = false;
  scene.add(arenaGlow);

  let playerMeshes = [];
  let camMode = 'broadcast';
  const camPos = new THREE.Vector3(0, 20, 44);
  const camLook = new THREE.Vector3();
  let time = 0;

  function setMatch(state) {
    arenaGlow.visible = !!state.indoor;
    scene.background.set(state.indoor ? '#071329' : '#8fbfe8');
    scene.fog.color.set(state.indoor ? '#071329' : '#8fbfe8');
    for (const m of playerMeshes) scene.remove(m.root);
    playerMeshes = state.players.map((p) => {
      const m = makePlayer(p, state.teams[p.team].kit, renderer);
      m.ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: RING.other, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      m.ring.rotation.x = -Math.PI / 2;
      m.ring.position.y = 0.03;
      m.root.add(m.ring);
      scene.add(m.root);
      return m;
    });
    ball.position.set(state.ball.pos.x, state.ball.pos.y, state.ball.pos.z);
    prevBall.copy(ball.position);
    snapCamera(state);
  }

  function cameraTarget(state) {
    const mode = CAMERA_MODES[camMode];
    const b = state.ball.pos;
    const x = THREE.MathUtils.clamp(b.x * mode.ahead, -HALF_L + mode.clampX, HALF_L - mode.clampX);
    const zShift = b.z * 0.25;
    // Tighten only when the attack reaches the final third. It makes faces,
    // kit details and keeper action readable while preserving the wide view at
    // midfield where passing options matter most.
    const attackZoom = camMode === 'broadcast'
      ? THREE.MathUtils.smoothstep(Math.abs(b.x), HALF_L * 0.54, HALF_L * 0.9)
      : 0;
    const indoorZoom = state.indoor ? 1 : 0;
    const height = mode.h - attackZoom * 3 - indoorZoom * 3;
    const back = mode.back - attackZoom * 5 - indoorZoom * 5;
    const fov = mode.fov - attackZoom * 3.5 - indoorZoom * 3;
    return {
      pos: new THREE.Vector3(x, height, HALF_W + back + zShift * 0.5),
      look: new THREE.Vector3(x, 0, -1 + zShift),
      fov,
    };
  }

  function snapCamera(state) {
    const t = cameraTarget(state);
    camPos.copy(t.pos); camLook.copy(t.look);
    camera.fov = t.fov; camera.updateProjectionMatrix();
  }

  function cycleCamera() {
    const i = CAMERA_ORDER.indexOf(camMode);
    camMode = CAMERA_ORDER[(i + 1) % CAMERA_ORDER.length];
    return camMode;
  }

  function update(state, dt) {
    time += dt;
    // Players
    state.players.forEach((p, i) => {
      const m = playerMeshes[i];
      if (!m) return;
      m.root.visible = p.onPitch && !p.sentOff;
      m.root.position.set(p.pos.x, 0, p.pos.z);
      m.root.rotation.y = Math.atan2(p.face.x, p.face.z);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      // Legs follow game speed, so slow motion looks like slow motion.
      m.phase += sp * dt * 1.7 * (state.timeScale || 1);
      const amp = Math.min(1, sp / 6) * 0.85;
      const s = Math.sin(m.phase);
      m.legs[0].rotation.x = s * amp;
      m.legs[1].rotation.x = -s * amp;
      m.arms[0].rotation.x = -s * amp * 0.8;
      m.arms[1].rotation.x = s * amp * 0.8;
      if (p.kickAnim > 0) {
        const k = Math.sin((1 - p.kickAnim / 0.3) * Math.PI);
        m.legs[1].rotation.x = -1.3 * k;
      }
      // Keeper dive / stumble tilt
      let tilt = 0, drop = 0;
      if (p.dive > 0) {
        const localX = p.vel.x * p.face.z - p.vel.z * p.face.x;
        tilt = -Math.sign(localX || 1) * 1.2;
        drop = -0.5;
        m.arms[0].rotation.z = -2.6; m.arms[1].rotation.z = 2.6;
      } else {
        m.arms[0].rotation.z = 0; m.arms[1].rotation.z = 0;
        if (p.stun > 0) tilt = 0.25;
      }
      m.body.rotation.z += (tilt - m.body.rotation.z) * Math.min(1, dt * 14);
      m.body.position.y += (drop - m.body.position.y) * Math.min(1, dt * 14);
      // Keeper holding the ball: arms forward
      if (state.ball.owner === p && p.holding) {
        m.arms[0].rotation.x = m.arms[1].rotation.x = -1.3;
      }
      // A clear team reaction gives goals and their replays a readable payoff.
      if (state.phase === 'goal' && state.lastGoal?.team === p.team && p.role !== 'GK') {
        const cheer = Math.sin(time * 9 + p.id) * 0.18;
        m.arms[0].rotation.x = -2.15 + cheer;
        m.arms[1].rotation.x = -2.15 - cheer;
        m.arms[0].rotation.z = -0.35;
        m.arms[1].rotation.z = 0.35;
      }
    });

    // Ball: position and rolling spin from displacement
    const b = state.ball;
    ball.position.set(b.pos.x, b.pos.y, b.pos.z);
    if (b.owner && b.owner.holding) ball.position.y = 1.05; // in the keeper's hands
    const dx = ball.position.x - prevBall.x, dz = ball.position.z - prevBall.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5 && d < 5) {
      const axis = new THREE.Vector3(dz / d, 0, -dx / d);
      ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, d / BALL_R));
    }
    prevBall.copy(ball.position);

    // Rings: green = yours, yellow = next, red = computer-controlled.
    const live = state.phase !== 'fulltime';
    state.players.forEach((p, i) => {
      const m = playerMeshes[i];
      if (!m) return;
      const team = state.teams[p.team];
      let kind = 'other';
      if (team.controlled === p && team.human) kind = 'current';
      else if (team.next === p && team.human) kind = 'next';
      else if (state.teams.some((t) => t.human && t.tackleTarget === p)) kind = 'tackle';
      m.ring.visible = live;
      m.ring.material.color.set(RING[kind]);
      const pulse = kind === 'next' ? 1 + Math.sin(time * 8) * 0.12
        : kind === 'tackle' ? 1.2 + Math.sin(time * 18) * 0.2 : 1;
      const size = kind === 'other' ? 0.8 : 1.1;
      m.ring.scale.setScalar(size * pulse);
      m.ring.material.opacity = kind === 'other' ? 0.6 : 0.95;
    });
    for (const id of ['p1', 'p2']) {
      const team = state.teams.find((t) => t.human === id);
      const p = team && team.controlled;
      const arrow = markers[id].arrow;
      arrow.visible = !!p && live;
      if (arrow.visible) arrow.position.set(p.pos.x, 2.35 + Math.sin(time * 5) * 0.08, p.pos.z);
    }

    // Camera
    const t = cameraTarget(state);
    const k = 1 - Math.exp(-dt * 3.2);
    camPos.lerp(t.pos, k);
    camLook.lerp(t.look, k);
    if (Math.abs(camera.fov - t.fov) > 0.01) {
      camera.fov += (t.fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    renderer.render(scene, camera);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    setMatch, update, resize, cycleCamera,
    get cameraMode() { return camMode; },
    renderIdle(dt) {
      // Slow orbit for the menu background.
      time += dt;
      camera.position.set(Math.sin(time * 0.08) * 55, 26, Math.cos(time * 0.08) * 55);
      camera.lookAt(0, 0, 0);
      ball.position.set(0, BALL_R, 0);
      for (const id of ['p1', 'p2']) markers[id].arrow.visible = false;
      for (const m of playerMeshes) m.ring.visible = false;
      renderer.render(scene, camera);
    },
  };
}
