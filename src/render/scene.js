// three.js renderer: stadium, pitch, goals, players, ball and the
// FIFA 98 style broadcast camera. Reads match state, never changes it.

import * as THREE from 'three';
import { createCharacter } from './character/character.js';
import { applyEnginePose } from '../../packages/game-engine/player/applyPose.ts';
import { playerIdentity } from '../game/players/identity.ts';
import { buildPitch } from './stadium/pitch.js';
import { buildStadium as buildArena } from './stadium/stadium.js';
import {
  PITCH, HALF_L, HALF_W, GOAL, BOX, GOAL_AREA, PENALTY_SPOT,
  PENALTY_ARC_RADIUS, BALL_R,
} from '../game/constants.ts';

const HUMAN_COLORS = { p1: '#22d3ee', p2: '#f43f5e' };
// Ground rings under players
const RING = {
  current: '#22c55e', // green: the player you control
  next: '#facc15', // yellow: who you get on the next pass / switch
  other: '#ef4444', // red: controlled by the computer
  tackle: '#fb923c', // flashing orange: close enough to tackle
};

// Gameplay cameras. Heights/distances are the tightest framing; the camera
// pulls back dynamically (long passes, fast breaks, high balls, crowded
// play) and with the user's zoom setting. `follow` blends the focus from the
// ball towards the human's controlled player.
const CAMERA_MODES = {
  broadcast: { label: 'Broadcast', h: 10, back: 16.5, fov: 36, clampX: 9, follow: 0.35, pull: 0.6 },
  close: { label: 'Close', h: 6.8, back: 10.5, fov: 34, clampX: 4, follow: 0.6, pull: 0.75 },
  wide: { label: 'Tactical', h: 34, back: 40, fov: 46, clampX: 20, follow: 0.1, pull: 0.25 },
};
export const CAMERA_ORDER = Object.keys(CAMERA_MODES);
export const CAMERA_DEFAULTS = { mode: 'broadcast', zoom: 1 };
export const cameraLabel = (mode) => CAMERA_MODES[mode]?.label || mode;

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
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b9d4ee');
  scene.fog = new THREE.Fog('#b9d4ee', 200, 480);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1000);

  // Lighting: sky/ground fill plus a high key light (floodlights/sun) whose
  // shadow map follows the action, so shadows stay crisp everywhere.
  scene.add(new THREE.HemisphereLight('#e8f1ff', '#4a6b3e', 1.15));
  const sun = new THREE.DirectionalLight('#fff4e2', 2.9);
  const SUN_OFFSET = new THREE.Vector3(-18, 60, 26);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  // 2048 px over ~56 m around the play: ~2.7 cm texels, cheap enough for 60 fps.
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 20; sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(buildPitch(renderer));
  const arena = buildArena(renderer);
  scene.add(arena.group);
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
  const handA = new THREE.Vector3(), handB = new THREE.Vector3();
  const spinAxis = new THREE.Vector3();
  const spinQuat = new THREE.Quaternion();

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
    // Shot power meter above the shooter's head (billboarded): fills while
    // shoot is held; green → yellow → red, with a tick at the accurate zone.
    const meter = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.11), new THREE.MeshBasicMaterial({ color: '#0b1220', transparent: true, opacity: 0.75, depthTest: false, fog: false }));
    const fillGeo = new THREE.PlaneGeometry(1, 0.07);
    fillGeo.translate(0.5, 0, 0);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, depthTest: false, toneMapped: false, fog: false }));
    fill.position.set(-0.47, 0, 0.001);
    // Ticks at the shot-type thresholds (shooting.ts shotTypeFromCharge):
    // low driven below 30 %, power shot above 88 %.
    const ticks = [0.3, 0.88].map((x) => {
      const tk = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.13), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false, fog: false }));
      tk.position.set(-0.47 + 0.94 * x, 0, 0.002);
      return tk;
    });
    // Drawn on top of the scene in a fixed order: background, fill, ticks
    // (all transparent, so they share one render list and renderOrder holds).
    back.renderOrder = 10; fill.renderOrder = 11; for (const tk of ticks) tk.renderOrder = 12;
    meter.scale.setScalar(1.5);
    meter.add(back, fill, ...ticks);
    meter.visible = false;
    scene.add(meter);
    markers[id] = { arrow, meter, fill };
  }
  const meterCol = new THREE.Color();
  const ringGeo = new THREE.RingGeometry(0.55, 0.7, 40);
  const contactGeo = new THREE.CircleGeometry(0.55, 24);
  const contactMat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  })();
  // Small marker over the next player (pass target / switch).
  const nextMarker = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 3), new THREE.MeshBasicMaterial({ color: '#facc15' }));
  nextMarker.rotation.x = Math.PI;
  nextMarker.visible = false;
  scene.add(nextMarker);
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
  let camMode = CAMERA_DEFAULTS.mode;
  let camZoom = CAMERA_DEFAULTS.zoom; // user setting: >1 closer, <1 further
  let pullBack = 0; // dynamic 0 (tight) … 1 (wide), smoothed
  const camFocus = new THREE.Vector3();
  let focusReady = false;
  const camPos = new THREE.Vector3(0, 20, 44);
  const camLook = new THREE.Vector3();
  let time = 0;

  function setMatch(state) {
    arenaGlow.visible = !!state.indoor;
    scene.background.set(state.indoor ? '#071329' : '#b9d4ee');
    scene.fog.color.set(state.indoor ? '#071329' : '#b9d4ee');
    // Fans wear their team's colours (home end busiest, away fans grouped).
    const kitCols = (k) => [k.shirt, k.secondary || k.shirt, k.shirt].filter(Boolean);
    arena.setColors(kitCols(state.teams[0].kit), kitCols(state.teams[1].kit));
    for (const m of playerMeshes) m.character.dispose();
    playerMeshes = state.players.map((p) => {
      const team = state.teams[p.team];
      // The same identity the cards and Kick-Off preview use.
      const identity = p.identity || playerIdentity({ ...p, position: p.role });
      const character = createCharacter({
        identity: { ...identity, captain: !!(p.captain || identity.captain) },
        kit: team.kit,
        keeper: p.role === 'GK',
        crestUrl: team.data?.crest,
        teamKey: `t${team.index}|${team.kit.shirt}|${team.kit.secondary}|${team.kit.design}`,
      });
      const m = { character, root: character.group, prevFace: { x: p.face.x, z: p.face.z }, hipsBindY: character.bones.hips?.position.y ?? 0.93, posed: false };
      m.ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: RING.other, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      m.ring.rotation.x = -Math.PI / 2;
      m.ring.position.y = 0.03;
      m.root.add(m.ring);
      // Soft contact shadow that grounds the feet (the sun casts the real one).
      m.contact = new THREE.Mesh(contactGeo, contactMat);
      m.contact.rotation.x = -Math.PI / 2;
      m.contact.position.y = 0.012;
      m.contact.renderOrder = 1;
      m.root.add(m.contact);
      scene.add(m.root);
      return m;
    });
    ball.position.set(state.ball.pos.x, state.ball.pos.y, state.ball.pos.z);
    prevBall.copy(ball.position);
    snapCamera(state);
  }

  /** The human's controlled player (P1 first), if any. */
  function controlledPlayer(state) {
    for (const t of state.teams) if (t.human === 'p1' && t.controlled) return t.controlled;
    for (const t of state.teams) if (t.controlled) return t.controlled;
    return null;
  }

  /**
   * Live camera target. Focus is the ball, leaning towards the controlled
   * player and ahead of the ball's travel; the frame tightens on close
   * possession and widens for long balls, speed, height and crowds; the
   * distance adapts to the screen's aspect ratio so players stay a similar
   * size on wide displays and aren't cut off on narrow ones.
   */
  function cameraTarget(state, dt = 0) {
    const mode = CAMERA_MODES[camMode] || CAMERA_MODES.broadcast;
    const b = state.ball.pos, bv = state.ball.vel;
    const ctrl = controlledPlayer(state);
    let fx = b.x, fz = b.z;
    let spread = 0;
    if (ctrl && ctrl.onPitch && !ctrl.sentOff) {
      spread = Math.hypot(ctrl.pos.x - b.x, ctrl.pos.z - b.z);
      const w = mode.follow * THREE.MathUtils.clamp(1 - spread / 24, 0, 1);
      fx += (ctrl.pos.x - b.x) * w; fz += (ctrl.pos.z - b.z) * w;
    }
    // Lead the ball's travel a little so the play isn't framed from behind.
    const speed = Math.hypot(bv.x, bv.z);
    const lead = Math.min(4.5, speed * 0.3);
    if (speed > 0.5) { fx += (bv.x / speed) * lead; fz += (bv.z / speed) * lead * 0.6; }
    // Smooth the focus itself so a pass between players never jerks the frame.
    if (!focusReady || dt === 0) { camFocus.set(fx, 0, fz); focusReady = true; }
    else camFocus.lerp(new THREE.Vector3(fx, 0, fz), 1 - Math.exp(-dt * 3.4));
    // Dynamic zoom: 0 = tight, 1 = wide.
    let crowd = 0;
    for (const p of state.players) if (p.onPitch && !p.sentOff && Math.hypot(p.pos.x - camFocus.x, p.pos.z - camFocus.z) < 11) crowd++;
    const want = THREE.MathUtils.clamp(
      Math.max(0, speed - 9) / 15 + Math.max(0, spread - 7) / 22 + Math.max(0, b.y - 2) / 7 + Math.max(0, crowd - 7) * 0.05
        + (state.phase !== 'play' ? 0.25 : 0),
      0, 1,
    );
    if (dt === 0) pullBack = want;
    else pullBack += (want - pullBack) * (1 - Math.exp(-dt * (want > pullBack ? 1.6 : 0.8)));
    const indoor = state.indoor ? 0.85 : 1;
    // Aspect ratio: keep player size steady on wide screens, avoid cut-offs on narrow ones.
    const a = camera.aspect || 1.78;
    const aspectMul = a < 1.78 ? Math.pow(1.78 / a, 0.6) : Math.pow(1.78 / Math.min(a, 3.2), 0.18);
    const dist = (1 + mode.pull * pullBack) * aspectMul * indoor / camZoom;
    // Whatever the follow/lead/zoom, the ball stays in frame: the focus may
    // drift from it only so far (least towards the camera, where the bottom
    // of the frame is closest).
    const reach = mode.back * dist;
    const fxB = THREE.MathUtils.clamp(camFocus.x, b.x - reach * 0.45, b.x + reach * 0.45);
    const fzB = THREE.MathUtils.clamp(camFocus.z, b.z - reach * 0.22, b.z + reach * 0.5);
    const x = THREE.MathUtils.clamp(fxB, -HALF_L + mode.clampX, HALF_L - mode.clampX);
    const z = THREE.MathUtils.clamp(fzB, -HALF_W + 4, HALF_W - 2);
    const h = Math.max(3.2, mode.h * dist);
    return {
      pos: new THREE.Vector3(x, h, z + mode.back * dist),
      look: new THREE.Vector3(x, 0.9, z - 1.2),
      fov: mode.fov + pullBack * 4,
      rate: 2.8,
    };
  }

  function snapCamera(state) {
    focusReady = false;
    const t = cameraTarget(state, 0);
    camPos.copy(t.pos); camLook.copy(t.look);
    camera.fov = t.fov; camera.updateProjectionMatrix();
  }

  function cycleCamera() {
    const i = CAMERA_ORDER.indexOf(camMode);
    camMode = CAMERA_ORDER[(i + 1) % CAMERA_ORDER.length];
    return camMode;
  }
  /** Camera settings from the menu / in-match keys. */
  function setCamera({ mode, zoom } = {}) {
    if (mode && CAMERA_MODES[mode]) camMode = mode;
    if (Number.isFinite(zoom)) camZoom = THREE.MathUtils.clamp(zoom, 0.7, 1.5);
    return { mode: camMode, zoom: camZoom };
  }

  // Blend between the previous and current physics step so motion is smooth
  // at any display refresh rate. Teleports (restarts) are not blended.
  const lerpPos = (prev, cur, alpha, key) => {
    if (!prev || alpha >= 1) return cur[key];
    return prev[key] + (cur[key] - prev[key]) * alpha;
  };
  const blendable = (prev, cur) => !!prev && Math.abs(prev.x - cur.x) + Math.abs(prev.z - cur.z) < 3;

  // ---------- replay / celebration director ----------
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const byId = (state, id) => (id == null ? null : state.players.find((p) => p.id === id) || null);
  /** Rendered (interpolated) position of a player, so the camera never jitters. */
  function shownPos(state, p) {
    const m = playerMeshes[state.players.indexOf(p)];
    return m ? m.root.position : V(p.pos.x, 0, p.pos.z);
  }
  function celebrationCamera(state) {
    const sc = byId(state, state.lastGoal?.scorerId);
    if (!sc || state.lastGoal.ownGoal) return null;
    const p = shownPos(state, sc);
    // Stand between the scorer and the middle of the pitch, a little to the side.
    let vx = -p.x, vz = -p.z;
    const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
    return { pos: V(p.x + vx * 7 - vz * 2.5, 2.4, p.z + vz * 7 + vx * 2.5), look: V(p.x, 1.1, p.z), fov: 34, rate: 2.6 };
  }
  function replayCamera(state, r) {
    const b = ball.position;
    const goalX = HALF_L * (r.dir || 1);
    const shooter = byId(state, r.shooterId);
    const t = r.t, shotT = r.shotIdx != null ? r.shotIdx / r.fps : null, goalT = r.goalIdx / r.fps;
    if (shotT != null && t < shotT + 0.12 && shooter) {
      // Low and behind the shooter, looking past him at the goal.
      const p = shownPos(state, shooter);
      let gx = goalX - p.x, gz = -p.z;
      const l = Math.hypot(gx, gz) || 1; gx /= l; gz /= l;
      return { pos: V(p.x - gx * 6.5 + gz * 2.6, 2.1, p.z - gz * 6.5 - gx * 2.6), look: V((p.x + b.x) / 2 + gx * 3, 1.0, (p.z + b.z) / 2 + gz * 3), fov: 40, rate: 4 };
    }
    if (t < goalT + 0.7) {
      // Beside the goal, tracking the ball past the keeper into the net.
      const side = Math.sign(b.z || 1);
      return { pos: V(goalX - Math.sign(goalX) * 8.5, 1.9, side * (GOAL.width / 2 + 6.5)), look: V(b.x, Math.max(0.6, b.y), b.z), fov: 36, rate: 5 };
    }
    return celebrationCamera(state) || { pos: V(b.x - Math.sign(goalX) * 9, 3, b.z + 6), look: V(b.x, 0.8, b.z), fov: 38, rate: 3 };
  }
  let lastCamMode = 'live';

  function update(state, dt, alpha = 1, view = null) {
    time += dt;
    // Players
    state.players.forEach((p, i) => {
      const m = playerMeshes[i];
      if (!m) return;
      m.root.visible = p.onPitch && !p.sentOff;
      const pa = blendable(p.prevPos, p.pos) ? alpha : 1;
      m.root.position.set(lerpPos(p.prevPos, p.pos, pa, 'x'), 0, lerpPos(p.prevPos, p.pos, pa, 'z'));
      m.root.rotation.y = Math.atan2(p.face.x, p.face.z);
      // Body yaw rate, for turn-in-place steps.
      const yaw = Math.atan2(p.face.x, p.face.z), pyaw = Math.atan2(m.prevFace.x, m.prevFace.z);
      let dyaw = yaw - pyaw;
      if (dyaw > Math.PI) dyaw -= 2 * Math.PI; else if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      m.prevFace.x = p.face.x; m.prevFace.z = p.face.z;
      const gdt = dt * (state.timeScale || 1);
      m.yawRate = gdt > 0 ? m.yawRate * 0.8 + (dyaw / gdt) * 0.2 : (m.yawRate || 0);
      // Lean with the physics: forward into acceleration, back when braking,
      // and into the turn (centripetal acceleration).
      const acc = p.acc || { x: 0, z: 0 };
      const fwdAcc = acc.x * p.face.x + acc.z * p.face.z;
      const sideAcc = acc.x * p.face.z - acc.z * p.face.x;
      const mesh = m.character.mesh;
      const pitch = THREE.MathUtils.clamp(fwdAcc * 0.018, -0.16, 0.2);
      const roll = p.dive > 0 ? 0 : THREE.MathUtils.clamp(-sideAcc * 0.014, -0.16, 0.16);
      const kk = Math.min(1, dt * 10);
      mesh.rotation.x += (pitch - mesh.rotation.x) * kk;
      mesh.rotation.z += (roll - mesh.rotation.z) * kk;
      // Level of detail: eyes, lids and brows only near the camera; shadow
      // casting only within the shadow map's useful range.
      const camD = camera.position.distanceTo(m.root.position);
      const near = camD < 30;
      if (m.lodNear !== near) { m.lodNear = near; for (const o of m.character.detail || []) o.visible = near; }
      const shadow = camD < 70;
      if (m.lodShadow !== shadow) { m.lodShadow = shadow; mesh.castShadow = shadow; }
      const goalTeam = state.phase === 'goal' && state.lastGoal ? state.lastGoal.team : -1;
      let celebration = null;
      if (goalTeam >= 0) {
        if (p.team === goalTeam) celebration = state.lastGoal.scorerId === p.id && !state.lastGoal.ownGoal ? 'scorer' : 'team';
        else celebration = 'beaten';
      }
      const own = -HALF_L * state.teams[p.team].dir;
      // Gold Standard engine pose (stride-synced IK, kicks at the contact frame).
      // Keeper dives/holds, throw-ins and celebrations keep their own clips.
      const usePose = p.pose && !(p.dive > 0 || p.holding || (p.throwIn && p.mustPass) || celebration);
      if (usePose) {
        const r = applyEnginePose(m.character, p.posePrev || p.pose, p.pose, pa, m.hipsBindY);
        m.root.rotation.set(r.pitch, yaw + r.yawOffset, r.roll, 'YXZ');
        m.root.position.y = r.lift;
        mesh.rotation.x = 0; mesh.rotation.z = 0;
        m.posed = true;
        return;
      }
      if (m.posed) { m.root.rotation.set(0, yaw, 0); m.root.position.y = 0; m.posed = false; }
      if (gdt > 0 && m.root.visible) {
        m.character.update(gdt, p, {
          owner: state.ball.owner === p,
          keeperAlert: p.role === 'GK' && Math.abs(state.ball.pos.x - own) < 40,
          celebration,
          id: p.id,
          yawRate: m.yawRate || 0,
        });
      }
    });

    // Ball: position and rolling spin from displacement
    const b = state.ball;
    const ba = blendable(b.prevPos, b.pos) ? alpha : 1;
    ball.position.set(lerpPos(b.prevPos, b.pos, ba, 'x'), lerpPos(b.prevPos, b.pos, ba, 'y'), lerpPos(b.prevPos, b.pos, ba, 'z'));
    // Ball in the hands (keeper, throw-in): between the two hands.
    const holder = b.owner && (b.owner.holding || (b.owner.throwIn && b.owner.mustPass)) ? b.owner : null;
    if (holder) {
      const hm = playerMeshes[state.players.indexOf(holder)];
      const hl = hm?.character.bones['hand.L'], hr = hm?.character.bones['hand.R'];
      if (hl && hr) {
        hm.root.updateMatrixWorld(true);
        hl.getWorldPosition(handA); hr.getWorldPosition(handB);
        ball.position.copy(handA).add(handB).multiplyScalar(0.5);
        ball.position.x += holder.face.x * 0.07; ball.position.z += holder.face.z * 0.07;
        ball.position.y -= 0.05;
      } else ball.position.y = 1.05;
    }
    const ballHeight = Math.max(0, ball.position.y - BALL_R);
    ballShadow.position.x = ball.position.x;
    ballShadow.position.z = ball.position.z;
    ballShadow.scale.setScalar(1 + Math.min(0.45, ballHeight * 0.08));
    ballShadow.material.opacity = Math.max(0.12, 0.42 - ballHeight * 0.045);
    // Rotation comes from the physics spin (rolling, topspin, curl). Old
    // replay frames without spin fall back to rolling from displacement.
    const w = b.spin;
    const wl = w ? Math.hypot(w.x, w.y, w.z) : 0;
    if (w && wl > 1e-3) {
      spinAxis.set(w.x / wl, w.y / wl, w.z / wl);
      ball.quaternion.premultiply(spinQuat.setFromAxisAngle(spinAxis, wl * dt * (state.timeScale || 1)));
    } else if (!w) {
      const dx = ball.position.x - prevBall.x, dz = ball.position.z - prevBall.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < 5) {
        spinAxis.set(dz / d, 0, -dx / d);
        ball.quaternion.premultiply(spinQuat.setFromAxisAngle(spinAxis, d / BALL_R));
      }
    }
    prevBall.copy(ball.position);

    // Broadcast-style markers: only the player you control gets a ring and
    // the arrow overhead; the next player gets a small marker; a player you
    // can tackle flashes. Computer-controlled players are left clean.
    const live = state.phase !== 'fulltime' && state.phase !== 'goal';
    nextMarker.visible = false;
    state.players.forEach((p, i) => {
      const m = playerMeshes[i];
      if (!m) return;
      const team = state.teams[p.team];
      let kind = 'other';
      if (team.controlled === p && team.human) kind = 'current';
      else if (team.next === p && team.human) kind = 'next';
      else if (state.teams.some((t) => t.human && t.tackleTarget === p)) kind = 'tackle';
      m.ring.visible = live && p.onPitch && !p.sentOff && kind !== 'other' && kind !== 'next';
      m.ring.material.color.set(RING[kind]);
      if (kind === 'next' && live) {
        nextMarker.visible = true;
        nextMarker.position.set(m.root.position.x, (m.character.headHeight ?? 1.95) + 0.3 + Math.sin(time * 6) * 0.05, m.root.position.z);
      }
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
      if (arrow.visible) {
        const pm = playerMeshes[state.players.indexOf(p)];
        const mp = pm?.root.position;
        const top = (pm?.character.headHeight ?? 1.95) + 0.35;
        arrow.position.set(mp ? mp.x : p.pos.x, top + Math.sin(time * 5) * 0.08, mp ? mp.z : p.pos.z);
      }
      const { meter, fill } = markers[id];
      const charge = p && live ? p.charge || 0 : 0;
      meter.visible = charge > 0;
      if (meter.visible) {
        const pm = playerMeshes[state.players.indexOf(p)];
        const mp = pm?.root.position;
        meter.position.set(mp ? mp.x : p.pos.x, (pm?.character.headHeight ?? 1.95) + 0.75, mp ? mp.z : p.pos.z);
        meter.quaternion.copy(camera.quaternion);
        fill.scale.x = Math.max(0.001, charge) * 0.94;
        meterCol.setHSL(0.33 * (1 - Math.max(0, charge - 0.35) / 0.65), 0.85, 0.5);
        fill.material.color.copy(meterCol);
      }
    }

    // Camera: broadcast play, celebration close-up, or the replay director.
    let t = null;
    let mode = 'live';
    if (view?.replay) { t = replayCamera(state, view.replay); mode = 'replay'; }
    else if (state.phase === 'goal') { t = celebrationCamera(state); if (t) mode = 'celebration'; }
    const camDt = view?.realDt ?? dt;
    if (!t) t = cameraTarget(state, camDt);
    // Cut (rather than swoop) into and out of the replay, like a broadcast.
    if ((mode === 'replay') !== (lastCamMode === 'replay')) {
      camPos.copy(t.pos); camLook.copy(t.look); camera.fov = t.fov; camera.updateProjectionMatrix();
    }
    lastCamMode = mode;
    // Keep the shadow map centred on the action.
    sun.target.position.set(camLook.x, 0, camLook.z);
    sun.position.copy(sun.target.position).add(SUN_OFFSET);
    // The crowd erupts after a goal and settles again.
    arena.update(view?.realDt ?? dt, state.phase === 'goal' || view?.replay ? 1 : 0);
    const k = 1 - Math.exp(-camDt * (t.rate || 3.2));
    camPos.lerp(t.pos, k);
    camLook.lerp(t.look, k);
    // The smoothing lags a fast ball; never let it leave the frame. If it gets
    // past the limits around the look point, carry the camera with it.
    if (mode !== 'replay' && state.ball) {
      const bp = state.ball.pos, depth = Math.max(4, camPos.z - camLook.z);
      const lim = (v, lo, hi) => (v < lo ? v - lo : v > hi ? v - hi : 0);
      const ex = lim(bp.x - camLook.x, -depth * 0.5, depth * 0.5);
      const ez = lim(bp.z - camLook.z, -depth * 0.75, depth * 0.3);
      if (ex || ez) { camPos.x += ex; camLook.x += ex; camPos.z += ez; camLook.z += ez; }
    }
    if (Math.abs(camera.fov - t.fov) > 0.01) {
      camera.fov += (t.fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(camPos);
    if (camera.position.y < 1.2) camera.position.y = 1.2; // never clip into the pitch
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
    setMatch, update, resize, cycleCamera, setCamera,
    get cameraMode() { return camMode; },
    get cameraZoom() { return camZoom; },
    /** Live camera state (read-only; for debugging and tests). */
    get cameraDebug() { return { camera, pos: camera.position.clone(), fov: camera.fov, pullBack, focus: camFocus.clone() }; },
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
