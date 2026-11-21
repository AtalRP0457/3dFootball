// Skeletal animation clips (THREE.AnimationClip) for the footballer rig.
//
// Locomotion cycles are generated from a gait model: each foot follows a
// stance / swing path on the ground and the leg angles are solved with
// two-bone IK, so the foot really stays planted while the body moves over
// it. Every gait reports its stride (ground distance per cycle, as a
// fraction of leg length); the controller plays the cycle at
// speed / stride, which keeps feet from sliding at any speed.
//
// Actions (passes, shots, tackles, falls, dives, celebrations, ...) are
// keyframed poses. All clips only rotate bones (plus an offset on the root
// bone), so one set of clips drives every body type and height.
//
// Conventions (bind pose: standing, facing +z, left side at +x):
//   thigh/upperArm  -x = swing forward       shin  +x = knee bend
//   lowerArm        -x = elbow bend          foot  +x = toes down
//   spine/chest     +x = lean forward        head  +x = look down
//   upperArm.L +z / upperArm.R -z = raise sideways
//   root rotation tilts the whole body about the feet.

import * as THREE from 'three';
import { BONE_NAMES, REF, nodeName } from './rig.js';

const D = Math.PI / 180;
const L1 = REF.thigh, L2 = REF.shin, ANKLE = REF.ankle;
const HIP = ANKLE + L1 + L2;
export const LEG_LENGTH = L1 + L2 + ANKLE;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Two-bone IK in the sagittal plane: returns thigh and shin x-rotations. */
function legIK(z, y) {
  // (z, y): ankle relative to the hip joint (y negative = below).
  let d = Math.hypot(z, y);
  const max = L1 + L2 - 1e-4;
  if (d > max) { z *= max / d; y *= max / d; d = max; }
  const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  const alpha = Math.atan2(z, -y);
  const beta = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  return { thigh: -(alpha + beta), shin: knee };
}

/**
 * Gait parameters (lengths as fractions of leg length where noted).
 *   duty      fraction of the cycle each foot is on the ground
 *   front     ankle reach ahead of the hip at contact (× leg)
 *   back      ankle reach behind the hip at toe-off (× leg)
 *   roll      extra ground covered by rolling heel-to-toe (× leg)
 *   lift      swing-foot clearance (× leg)
 *   heel      heel lift at toe-off (m)
 *   crouch    how much lower the hips run (m), bob = vertical bounce (m)
 */
export const GAITS = {
  walk: { duty: 0.62, front: 0.3, back: 0.44, roll: 0.17, lift: 0.1, heel: 0.07, crouch: 0.025, bob: 0.012, lean: 3, arms: 18, elbow: 18, pelvis: 6, chest: 5 },
  jog: { duty: 0.42, front: 0.34, back: 0.5, roll: 0.12, lift: 0.22, heel: 0.1, crouch: 0.05, bob: 0.025, lean: 7, arms: 30, elbow: 70, pelvis: 8, chest: 7 },
  dribble: { duty: 0.44, front: 0.3, back: 0.44, roll: 0.1, lift: 0.18, heel: 0.09, crouch: 0.06, bob: 0.02, lean: 11, arms: 22, elbow: 55, pelvis: 7, chest: 6, head: 14, armsOut: 14 },
  run: { duty: 0.34, front: 0.4, back: 0.58, roll: 0.08, lift: 0.36, heel: 0.13, crouch: 0.065, bob: 0.035, lean: 10, arms: 42, elbow: 85, pelvis: 10, chest: 9 },
  sprint: { duty: 0.28, front: 0.44, back: 0.64, roll: 0.06, lift: 0.46, heel: 0.16, crouch: 0.075, bob: 0.04, lean: 15, arms: 55, elbow: 92, pelvis: 11, chest: 10 },
  airplane: { duty: 0.36, front: 0.38, back: 0.54, roll: 0.08, lift: 0.3, heel: 0.12, crouch: 0.07, bob: 0.03, lean: 6, arms: 0, elbow: 10, pelvis: 8, chest: 4, armsOut: 85 },
  stepInPlace: { duty: 0.6, front: 0.07, back: 0.07, roll: 0.0, lift: 0.09, heel: 0.03, crouch: 0.03, bob: 0.008, lean: 2, arms: 6, elbow: 15, pelvis: 14, chest: 4 },
};

/** Ground distance covered in one gait cycle, in metres for the reference leg. */
export function gaitCycleDistance(g) {
  const contact = (g.front + g.back + g.roll) * LEG_LENGTH;
  return contact / g.duty;
}

function legPose(psi, g) {
  const front = g.front * LEG_LENGTH, back = g.back * LEG_LENGTH;
  let z, y, plantar, toe = 0;
  if (psi < g.duty) {
    const s = psi / g.duty;
    z = front - (front + back) * s;
    const hl = g.heel * smooth(0.5, 1, s);
    y = ANKLE + hl;
    plantar = Math.asin(Math.min(0.9, hl / REF.toe));
    toe = -plantar;
  } else {
    const s = (psi - g.duty) / (1 - g.duty);
    z = -back + (front + back) * (1 - Math.cos(Math.PI * s)) / 2;
    y = ANKLE + g.heel * (1 - s) ** 2 + g.lift * LEG_LENGTH * Math.sin(Math.PI * s ** 0.8);
    plantar = 0.45 * (1 - s) ** 2 - 0.12 * smooth(0.6, 1, s);
  }
  return { z, y, plantar, toe };
}

/** Pose for a gait at cycle phase phi (0..1). */
function gaitPose(g, phi) {
  const pose = {};
  const bob = -g.bob * Math.cos(4 * Math.PI * (phi - g.duty / 2));
  const hipY = HIP - g.crouch + bob;
  for (const [s, off] of [['L', 0], ['R', 0.5]]) {
    const psi = (phi + off) % 1;
    const lp = legPose(psi, g);
    const ik = legIK(lp.z, lp.y - hipY);
    pose[`thigh.${s}`] = [ik.thigh, 0, 0];
    pose[`shin.${s}`] = [ik.shin, 0, 0];
    pose[`foot.${s}`] = [-(ik.thigh + ik.shin) + lp.plantar, 0, 0];
    pose[`toe.${s}`] = [lp.toe, 0, 0];
  }
  const c = Math.cos(2 * Math.PI * phi);
  pose.hips = [0, -g.pelvis * D * c, 0];
  pose.spine = [g.lean * 0.6 * D, g.pelvis * 0.5 * D * c, 0];
  pose.chest = [g.lean * 0.4 * D, g.chest * D * c, 0];
  pose.neck = [-g.lean * 0.4 * D, -g.chest * 0.5 * D * c, 0];
  pose.head = [(-g.lean * 0.4 + (g.head || 0)) * D, -g.chest * 0.3 * D * c, 0];
  const out = (g.armsOut || 0) * D;
  pose['upperArm.L'] = [g.arms * D * c, 0, 0.1 + out];
  pose['upperArm.R'] = [-g.arms * D * c, 0, -0.1 - out];
  pose['lowerArm.L'] = [-(g.elbow + g.arms * 0.25 * Math.max(0, -c)) * D, 0, 0];
  pose['lowerArm.R'] = [-(g.elbow + g.arms * 0.25 * Math.max(0, c)) * D, 0, 0];
  pose['hand.L'] = [0, 0, -0.1];
  pose['hand.R'] = [0, 0, 0.1];
  pose.root = [0, hipY - HIP, 0];
  return pose;
}

// ---------- building clips ----------
const q = new THREE.Quaternion();
const e = new THREE.Euler();

function quatValues(rot) {
  e.set(rot[0], rot[1], rot[2], 'YXZ');
  q.setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

/** Build a clip from sampled poses: frames = [{t, pose}], pose angles in radians. */
function buildClip(name, frames, { bones = BONE_NAMES, rootRot = false } = {}) {
  const times = frames.map((f) => f.t);
  const tracks = [];
  for (const b of bones) {
    if (b === 'root') continue;
    const values = [];
    let any = false;
    for (const f of frames) {
      const r = f.pose[b] || [0, 0, 0];
      if (f.pose[b]) any = true;
      values.push(...quatValues(r));
    }
    if (!any && bones !== BONE_NAMES) continue;
    // Keep quaternions on the same hemisphere for clean interpolation.
    for (let i = 4; i < values.length; i += 4) {
      const dot = values[i] * values[i - 4] + values[i + 1] * values[i - 3] + values[i + 2] * values[i - 2] + values[i + 3] * values[i - 1];
      if (dot < 0) for (let k = 0; k < 4; k++) values[i + k] *= -1;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${nodeName(b)}.quaternion`, times, values));
  }
  if (bones === BONE_NAMES || bones.includes('root')) {
    const pv = [];
    for (const f of frames) pv.push(...(f.pose.root || [0, 0, 0]));
    tracks.push(new THREE.VectorKeyframeTrack(`${nodeName('root')}.position`, times, pv));
    if (rootRot) {
      const rv = [];
      for (const f of frames) rv.push(...quatValues(f.pose.rootRot || [0, 0, 0]));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${nodeName('root')}.quaternion`, times, rv));
    }
  }
  const dur = times[times.length - 1];
  return new THREE.AnimationClip(name, dur, tracks);
}

function gaitClip(name, g, samples = 24) {
  const frames = [];
  for (let i = 0; i <= samples; i++) {
    const phi = i / samples;
    frames.push({ t: phi, pose: gaitPose(g, phi % 1) });
  }
  const clip = buildClip(name, frames);
  clip.userData = { cycleDistance: gaitCycleDistance(g), gait: name };
  return clip;
}

// Keyframed actions: poses in degrees for readability.
const deg = (pose) => {
  const out = {};
  for (const [k, v] of Object.entries(pose)) out[k] = k === 'root' ? v : v.map((x) => x * D);
  return out;
};
function keyClip(name, keys, opts) {
  return buildClip(name, keys.map(([t, pose]) => ({ t, pose: deg(pose) })), opts);
}
// Mirror a pose left/right (for dives and the like).
function mirrorPose(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    const mk = k.endsWith('.L') ? k.replace('.L', '.R') : k.endsWith('.R') ? k.replace('.R', '.L') : k;
    out[mk] = k === 'root' ? [-v[0], v[1], v[2]] : [v[0], -v[1], -v[2]];
  }
  return out;
}

const STAND = { 'upperArm.L': [0, 0, 6], 'upperArm.R': [0, 0, -6], 'lowerArm.L': [-12, 0, 0], 'lowerArm.R': [-12, 0, 0] };
const P = (o) => ({ ...STAND, ...o });

function idleClip() {
  const frames = [];
  for (let i = 0; i <= 30; i++) {
    const t = (i / 30) * 3;
    const w = Math.sin((t / 3) * Math.PI * 2);
    const br = Math.sin((t / 3) * Math.PI * 4);
    const knee = 6 * D;
    const ik = legIK(0.02, -(HIP - 0.012 - ANKLE));
    frames.push({
      t,
      pose: {
        root: [w * 0.012, -0.012, 0],
        hips: [0, 0, -w * 2 * D],
        'thigh.L': [ik.thigh, 0, (w * 2 + 2) * D], 'thigh.R': [ik.thigh, 0, (w * 2 - 2) * D],
        'shin.L': [ik.shin + knee * 0, 0, 0], 'shin.R': [ik.shin, 0, 0],
        'foot.L': [-(ik.thigh + ik.shin), 0, -w * 2 * D], 'foot.R': [-(ik.thigh + ik.shin), 0, -w * 2 * D],
        spine: [2 * D + br * 0.6 * D, 0, w * 1.5 * D],
        chest: [br * 1.2 * D, 0, 0],
        head: [-2 * D, Math.sin((t / 3) * Math.PI * 2 + 1) * 6 * D, 0],
        'upperArm.L': [2 * D, 0, 0.12 + br * 0.01], 'upperArm.R': [2 * D, 0, -0.12 - br * 0.01],
        'lowerArm.L': [-14 * D, 0, 0], 'lowerArm.R': [-14 * D, 0, 0],
      },
    });
  }
  return buildClip('idle', frames);
}

function gkReadyClip() {
  const frames = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * 0.8;
    const bounce = Math.sin((t / 0.8) * Math.PI * 2) * 0.012;
    const ik = legIK(0.04, -(HIP - 0.14 + bounce - ANKLE));
    frames.push({
      t,
      pose: {
        root: [0, -0.14 + bounce, 0],
        'thigh.L': [ik.thigh, 0, 14 * D], 'thigh.R': [ik.thigh, 0, -14 * D],
        'shin.L': [ik.shin, 0, 0], 'shin.R': [ik.shin, 0, 0],
        'foot.L': [-(ik.thigh + ik.shin), 0, -12 * D], 'foot.R': [-(ik.thigh + ik.shin), 0, 12 * D],
        spine: [18 * D, 0, 0], chest: [8 * D, 0, 0], neck: [-14 * D, 0, 0], head: [-10 * D, 0, 0],
        'upperArm.L': [-35 * D, 0, 38 * D], 'upperArm.R': [-35 * D, 0, -38 * D],
        'lowerArm.L': [-45 * D, 0, 0], 'lowerArm.R': [-45 * D, 0, 0],
      },
    });
  }
  return buildClip('gkReady', frames);
}

function actionClips() {
  const clips = [];
  // Passes and shots are right-footed in the clip; left-footed players use
  // the mirrored version.
  clips.push(keyClip('pass', [
    [0, P({ spine: [6, 0, 0] })],
    [0.12, P({ root: [0, -0.04, 0], spine: [10, 0, 0], 'thigh.L': [-12, 0, 0], 'shin.L': [20, 0, 0], 'foot.L': [-8, 0, 0], 'thigh.R': [32, -10, 0], 'shin.R': [62, 0, 0], 'upperArm.L': [-10, 0, 28], 'upperArm.R': [10, 0, -24] })],
    [0.24, P({ root: [0, -0.03, 0], spine: [8, -10, 0], 'thigh.L': [-10, 0, 0], 'shin.L': [18, 0, 0], 'foot.L': [-8, 0, 0], 'thigh.R': [-32, -35, 0], 'shin.R': [14, 0, 0], 'foot.R': [-12, 0, 0], 'upperArm.L': [-14, 0, 30], 'upperArm.R': [14, 0, -26] })],
    [0.36, P({ root: [0, -0.02, 0], spine: [6, -6, 0], 'thigh.R': [-44, -25, 0], 'shin.R': [22, 0, 0], 'upperArm.L': [-6, 0, 22], 'upperArm.R': [8, 0, -20] })],
    [0.5, P({})],
  ]));
  clips.push(keyClip('longPass', [
    [0, P({ spine: [4, 0, 0] })],
    [0.15, P({ root: [0, -0.05, 0], spine: [8, 8, 0], 'thigh.L': [-14, 0, 0], 'shin.L': [24, 0, 0], 'foot.L': [-10, 0, 0], 'thigh.R': [52, 0, 0], 'shin.R': [95, 0, 0], 'upperArm.L': [-40, 0, 55], 'upperArm.R': [30, 0, -40] })],
    [0.3, P({ root: [0, -0.04, 0], spine: [-6, -6, 0], 'thigh.L': [-10, 0, 0], 'shin.L': [20, 0, 0], 'thigh.R': [-55, -10, 0], 'shin.R': [12, 0, 0], 'foot.R': [20, 0, 0], 'upperArm.L': [-30, 0, 60], 'upperArm.R': [20, 0, -45] })],
    [0.42, P({ root: [0, 0.0, 0], spine: [-10, -8, 0], 'thigh.R': [-78, -8, 0], 'shin.R': [18, 0, 0], 'foot.R': [25, 0, 0], 'upperArm.L': [-10, 0, 45], 'upperArm.R': [10, 0, -35] })],
    [0.62, P({})],
  ]));
  clips.push(keyClip('shoot', [
    [0, P({ spine: [8, 0, 0] })],
    [0.12, P({ root: [0, -0.05, 0], spine: [6, 12, 0], 'thigh.L': [-18, 0, 0], 'shin.L': [26, 0, 0], 'foot.L': [-10, 0, 0], 'thigh.R': [58, 0, 0], 'shin.R': [108, 0, 0], 'foot.R': [30, 0, 0], 'upperArm.L': [-50, 0, 62], 'upperArm.R': [42, 0, -38] })],
    [0.25, P({ root: [0, -0.05, 0], spine: [16, -10, 0], 'thigh.L': [-14, 0, 0], 'shin.L': [26, 0, 0], 'foot.L': [-12, 0, 0], 'thigh.R': [-38, 0, 0], 'shin.R': [8, 0, 0], 'foot.R': [35, 0, 0], 'upperArm.L': [-30, 0, 70], 'upperArm.R': [20, 0, -50] })],
    [0.36, P({ root: [0, 0.04, 0], spine: [12, -16, 0], 'thigh.L': [6, 0, 0], 'shin.L': [20, 0, 0], 'thigh.R': [-86, -6, 0], 'shin.R': [16, 0, 0], 'foot.R': [30, 0, 0], 'upperArm.L': [-6, 0, 60], 'upperArm.R': [6, 0, -45] })],
    [0.5, P({ root: [0, -0.03, 0], spine: [10, -6, 0], 'thigh.R': [-30, 0, 0], 'shin.R': [40, 0, 0], 'thigh.L': [-4, 0, 0], 'shin.L': [22, 0, 0] })],
    [0.66, P({})],
  ]));
  // Dribble touch: right leg only (overlay on locomotion).
  clips.push(keyClip('touch', [
    [0, { 'thigh.R': [0, 0, 0], 'shin.R': [20, 0, 0], 'foot.R': [0, 0, 0] }],
    [0.09, { 'thigh.R': [-24, -14, 0], 'shin.R': [24, 0, 0], 'foot.R': [-10, 0, 0] }],
    [0.22, { 'thigh.R': [0, 0, 0], 'shin.R': [20, 0, 0], 'foot.R': [0, 0, 0] }],
  ], { bones: ['thigh.R', 'shin.R', 'foot.R'] }));
  clips.push(keyClip('tackle', [
    [0, P({ spine: [12, 0, 0] })],
    [0.14, P({ root: [0, -0.3, 0], spine: [-10, 0, 0], 'thigh.L': [-30, 0, 0], 'shin.L': [80, 0, 0], 'thigh.R': [-55, 0, 0], 'shin.R': [20, 0, 0], 'upperArm.L': [20, 0, 40], 'upperArm.R': [20, 0, -40] })],
    [0.3, P({ root: [0, -0.62, 0], rootRot: [-20, 0, 0], spine: [-28, 0, 0], neck: [20, 0, 0], 'thigh.L': [-15, 0, -10], 'shin.L': [110, 0, 0], 'foot.L': [10, 0, 0], 'thigh.R': [-82, 0, 0], 'shin.R': [6, 0, 0], 'foot.R': [-15, 0, 0], 'upperArm.L': [45, 0, 50], 'upperArm.R': [45, 0, -50], 'lowerArm.L': [-30, 0, 0], 'lowerArm.R': [-30, 0, 0] })],
    [0.7, P({ root: [0, -0.62, 0], rootRot: [-20, 0, 0], spine: [-24, 0, 0], neck: [20, 0, 0], 'thigh.L': [-15, 0, -10], 'shin.L': [110, 0, 0], 'thigh.R': [-80, 0, 0], 'shin.R': [8, 0, 0], 'upperArm.L': [40, 0, 50], 'upperArm.R': [40, 0, -50] })],
    [0.95, P({ root: [0, -0.3, 0], spine: [30, 0, 0], 'thigh.L': [-80, 0, 0], 'shin.L': [120, 0, 0], 'foot.L': [-40, 0, 0], 'thigh.R': [-30, 0, 0], 'shin.R': [70, 0, 0], 'upperArm.L': [-20, 0, 20], 'upperArm.R': [-20, 0, -20] })],
    [1.15, P({})],
  ], { rootRot: true }));
  // Standing tackle / block (stab at the ball).
  clips.push(keyClip('poke', [
    [0, P({})],
    [0.12, P({ root: [0, -0.08, 0], spine: [14, 0, 0], 'thigh.L': [-20, 0, 0], 'shin.L': [35, 0, 0], 'thigh.R': [-50, -10, 0], 'shin.R': [20, 0, 0], 'foot.R': [-20, 0, 0], 'upperArm.L': [-10, 0, 30], 'upperArm.R': [10, 0, -30] })],
    [0.35, P({})],
  ]));
  clips.push(keyClip('jump', [
    [0, P({})],
    [0.14, P({ root: [0, -0.18, 0], spine: [20, 0, 0], 'thigh.L': [-42, 0, 0], 'thigh.R': [-42, 0, 0], 'shin.L': [80, 0, 0], 'shin.R': [80, 0, 0], 'foot.L': [-38, 0, 0], 'foot.R': [-38, 0, 0], 'upperArm.L': [40, 0, 10], 'upperArm.R': [40, 0, -10] })],
    [0.3, P({ root: [0, 0.32, 0], spine: [-4, 0, 0], 'foot.L': [40, 0, 0], 'foot.R': [40, 0, 0], 'upperArm.L': [-165, 0, 10], 'upperArm.R': [-165, 0, -10], 'lowerArm.L': [-10, 0, 0], 'lowerArm.R': [-10, 0, 0] })],
    [0.46, P({ root: [0, 0.42, 0], 'thigh.L': [-20, 0, 0], 'thigh.R': [-10, 0, 0], 'shin.L': [45, 0, 0], 'shin.R': [35, 0, 0], 'foot.L': [20, 0, 0], 'foot.R': [20, 0, 0], 'upperArm.L': [-170, 0, 12], 'upperArm.R': [-170, 0, -12] })],
    [0.62, P({ root: [0, -0.14, 0], spine: [16, 0, 0], 'thigh.L': [-38, 0, 0], 'thigh.R': [-38, 0, 0], 'shin.L': [70, 0, 0], 'shin.R': [70, 0, 0], 'foot.L': [-32, 0, 0], 'foot.R': [-32, 0, 0], 'upperArm.L': [-40, 0, 30], 'upperArm.R': [-40, 0, -30] })],
    [0.8, P({})],
  ]));
  clips.push(keyClip('fall', [
    [0, P({})],
    [0.16, P({ root: [0, -0.08, 0], rootRot: [-12, 0, 0], spine: [-15, 0, 6], 'upperArm.L': [-30, 0, 70], 'upperArm.R': [-40, 0, -60], 'thigh.L': [-25, 0, 0], 'shin.L': [30, 0, 0] })],
    [0.42, P({ root: [0, 0.12, -0.2], rootRot: [-82, 0, 0], spine: [-6, 0, 0], neck: [25, 0, 0], 'thigh.L': [-35, 0, 6], 'shin.L': [55, 0, 0], 'thigh.R': [-15, 0, -6], 'shin.R': [25, 0, 0], 'upperArm.L': [-20, 0, 75], 'upperArm.R': [-20, 0, -75], 'lowerArm.L': [-30, 0, 0], 'lowerArm.R': [-30, 0, 0] })],
    [0.6, P({ root: [0, 0.1, -0.22], rootRot: [-88, 0, 0], neck: [18, 0, 0], 'thigh.L': [-40, 0, 6], 'shin.L': [70, 0, 0], 'thigh.R': [-10, 0, -6], 'shin.R': [20, 0, 0], 'upperArm.L': [-10, 0, 80], 'upperArm.R': [-10, 0, -80] })],
  ], { rootRot: true }));
  clips.push(keyClip('getUp', [
    [0, P({ root: [0, 0.1, -0.22], rootRot: [-88, 0, 0], neck: [18, 0, 0], 'thigh.L': [-40, 0, 6], 'shin.L': [70, 0, 0], 'thigh.R': [-10, 0, -6], 'shin.R': [20, 0, 0], 'upperArm.L': [-10, 0, 80], 'upperArm.R': [-10, 0, -80] })],
    [0.35, P({ root: [0, -0.42, -0.1], rootRot: [-40, 0, 0], spine: [45, 0, 0], neck: [10, 0, 0], 'thigh.L': [-95, 0, 6], 'shin.L': [125, 0, 0], 'thigh.R': [-70, 0, -6], 'shin.R': [95, 0, 0], 'upperArm.L': [20, 0, 25], 'upperArm.R': [20, 0, -25] })],
    [0.7, P({ root: [0, -0.32, 0], spine: [42, 0, 0], neck: [-10, 0, 0], 'thigh.L': [-75, 0, 0], 'shin.L': [110, 0, 0], 'foot.L': [-30, 0, 0], 'thigh.R': [-75, 0, 0], 'shin.R': [110, 0, 0], 'foot.R': [-30, 0, 0], 'upperArm.L': [-40, 0, 10], 'upperArm.R': [-40, 0, -10], 'lowerArm.L': [-30, 0, 0], 'lowerArm.R': [-30, 0, 0] })],
    [1.0, P({})],
  ], { rootRot: true }));
  clips.push(keyClip('stumble', [
    [0, P({})],
    [0.12, P({ root: [0.04, -0.06, 0], spine: [-8, 0, -10], 'upperArm.L': [-20, 0, 50], 'upperArm.R': [-10, 0, -35], 'thigh.R': [-20, 0, -6], 'shin.R': [30, 0, 0] })],
    [0.32, P({ root: [0, -0.03, 0], spine: [10, 0, 4], 'upperArm.L': [-10, 0, 25], 'upperArm.R': [-5, 0, -20] })],
    [0.45, P({})],
  ]));
  // Celebrations.
  const armsUp = (pump) => P({ 'upperArm.L': [-10, 0, 150 + pump], 'upperArm.R': [-10, 0, -150 - pump], 'lowerArm.L': [-20, 0, 0], 'lowerArm.R': [-20, 0, 0], head: [-15, 0, 0], spine: [-6, 0, 0] });
  clips.push(keyClip('celebrate', [
    [0, armsUp(0)],
    [0.2, { ...armsUp(10), root: [0, -0.12, 0], 'thigh.L': [-30, 0, 0], 'thigh.R': [-30, 0, 0], 'shin.L': [55, 0, 0], 'shin.R': [55, 0, 0], 'foot.L': [-25, 0, 0], 'foot.R': [-25, 0, 0] }],
    [0.42, { ...armsUp(-5), root: [0, 0.3, 0], 'foot.L': [35, 0, 0], 'foot.R': [35, 0, 0], 'shin.L': [25, 0, 0], 'shin.R': [25, 0, 0] }],
    [0.62, { ...armsUp(5), root: [0, -0.08, 0], 'thigh.L': [-25, 0, 0], 'thigh.R': [-25, 0, 0], 'shin.L': [45, 0, 0], 'shin.R': [45, 0, 0], 'foot.L': [-20, 0, 0], 'foot.R': [-20, 0, 0] }],
    [0.9, armsUp(15)],
    [1.2, armsUp(0)],
  ]));
  clips.push(keyClip('kneeSlide', [
    [0, P({ spine: [8, 0, 0] })],
    [0.25, P({ root: [0, -0.46, 0], spine: [-24, 0, 0], neck: [-10, 0, 0], 'thigh.L': [0, 0, 8], 'thigh.R': [0, 0, -8], 'shin.L': [92, 0, 0], 'shin.R': [92, 0, 0], 'foot.L': [60, 0, 0], 'foot.R': [60, 0, 0], 'upperArm.L': [-10, 0, 125], 'upperArm.R': [-10, 0, -125], 'lowerArm.L': [-15, 0, 0], 'lowerArm.R': [-15, 0, 0] })],
    [1.4, P({ root: [0, -0.46, 0], spine: [-30, 0, 0], neck: [-14, 0, 0], head: [-10, 0, 0], 'thigh.L': [0, 0, 8], 'thigh.R': [0, 0, -8], 'shin.L': [92, 0, 0], 'shin.R': [92, 0, 0], 'foot.L': [60, 0, 0], 'foot.R': [60, 0, 0], 'upperArm.L': [-30, 0, 140], 'upperArm.R': [-30, 0, -140], 'lowerArm.L': [-40, 0, 0], 'lowerArm.R': [-40, 0, 0] })],
  ]));
  clips.push(keyClip('embrace', [
    [0, P({ spine: [10, 0, 0], 'upperArm.L': [-70, 0, 40], 'upperArm.R': [-70, 0, -40], 'lowerArm.L': [-70, 0, 0], 'lowerArm.R': [-70, 0, 0] })],
    [0.5, P({ root: [0, 0.06, 0], spine: [14, 0, 0], 'upperArm.L': [-80, 0, 30], 'upperArm.R': [-80, 0, -30], 'lowerArm.L': [-85, 0, 0], 'lowerArm.R': [-85, 0, 0] })],
    [1.0, P({ spine: [10, 0, 0], 'upperArm.L': [-70, 0, 40], 'upperArm.R': [-70, 0, -40], 'lowerArm.L': [-70, 0, 0], 'lowerArm.R': [-70, 0, 0] })],
  ]));
  clips.push(keyClip('dejected', [
    [0, P({ spine: [16, 0, 0], head: [22, 0, 0], 'upperArm.L': [-150, 0, 40], 'upperArm.R': [-150, 0, -40], 'lowerArm.L': [-115, 0, 0], 'lowerArm.R': [-115, 0, 0] })],
    [1.5, P({ spine: [20, 0, 0], head: [28, 0, 0], 'upperArm.L': [-148, 0, 42], 'upperArm.R': [-148, 0, -42], 'lowerArm.L': [-118, 0, 0], 'lowerArm.R': [-118, 0, 0] })],
    [3, P({ spine: [16, 0, 0], head: [22, 0, 0], 'upperArm.L': [-150, 0, 40], 'upperArm.R': [-150, 0, -40], 'lowerArm.L': [-115, 0, 0], 'lowerArm.R': [-115, 0, 0] })],
  ]));
  // Goalkeeper.
  const diveL = [
    [0, P({ root: [0, -0.1, 0], spine: [15, 0, 0], 'upperArm.L': [-35, 0, 38], 'upperArm.R': [-35, 0, -38] })],
    [0.12, P({ root: [0.05, -0.2, 0], spine: [10, 0, -12], 'thigh.L': [-30, 0, 10], 'shin.L': [60, 0, 0], 'thigh.R': [-20, 0, -5], 'shin.R': [40, 0, 0], 'upperArm.L': [-40, 0, 90], 'upperArm.R': [-40, 0, -20] })],
    [0.32, P({ root: [0.35, 0.55, 0], rootRot: [0, 0, -78], spine: [0, 0, -6], 'thigh.L': [-10, 0, 4], 'shin.L': [25, 0, 0], 'thigh.R': [-5, 0, -12], 'shin.R': [15, 0, 0], 'upperArm.L': [-10, 0, 165], 'upperArm.R': [-10, 0, -170], 'lowerArm.L': [-5, 0, 0], 'lowerArm.R': [-5, 0, 0] })],
    [0.6, P({ root: [0.45, 0.18, 0], rootRot: [0, 0, -88], 'thigh.L': [-25, 0, 0], 'shin.L': [40, 0, 0], 'upperArm.L': [-30, 0, 150], 'upperArm.R': [-30, 0, -160], 'lowerArm.L': [-40, 0, 0], 'lowerArm.R': [-40, 0, 0] })],
    [0.9, P({ root: [0.45, 0.18, 0], rootRot: [0, 0, -88], 'thigh.L': [-35, 0, 0], 'shin.L': [60, 0, 0], 'upperArm.L': [-60, 0, 120], 'upperArm.R': [-60, 0, -130], 'lowerArm.L': [-70, 0, 0], 'lowerArm.R': [-70, 0, 0] })],
  ];
  clips.push(keyClip('gkDiveL', diveL, { rootRot: true }));
  clips.push(buildClip('gkDiveR', diveL.map(([t, pose]) => ({ t, pose: mirrorPose(deg(pose)) })), { rootRot: true }));
  clips.push(keyClip('gkCatch', [
    [0, P({ spine: [12, 0, 0], 'upperArm.L': [-60, 0, 25], 'upperArm.R': [-60, 0, -25] })],
    [0.15, P({ spine: [18, 0, 0], 'upperArm.L': [-85, 0, 12], 'upperArm.R': [-85, 0, -12], 'lowerArm.L': [-20, 0, 0], 'lowerArm.R': [-20, 0, 0] })],
    [0.4, P({ spine: [10, 0, 0], 'upperArm.L': [-40, 0, 18], 'upperArm.R': [-40, 0, -18], 'lowerArm.L': [-95, 0, 0], 'lowerArm.R': [-95, 0, 0] })],
  ]));
  clips.push(keyClip('gkHold', [
    [0, P({ spine: [6, 0, 0], 'upperArm.L': [-38, 0, 16], 'upperArm.R': [-38, 0, -16], 'lowerArm.L': [-98, 0, 0], 'lowerArm.R': [-98, 0, 0] })],
    [2, P({ spine: [7, 0, 0], 'upperArm.L': [-40, 0, 16], 'upperArm.R': [-40, 0, -16], 'lowerArm.L': [-96, 0, 0], 'lowerArm.R': [-96, 0, 0] })],
  ]));
  clips.push(keyClip('throwHold', [
    [0, P({ spine: [-12, 0, 0], 'upperArm.L': [-190, 0, 16], 'upperArm.R': [-190, 0, -16], 'lowerArm.L': [-70, 0, 0], 'lowerArm.R': [-70, 0, 0] })],
    [2, P({ spine: [-14, 0, 0], 'upperArm.L': [-192, 0, 16], 'upperArm.R': [-192, 0, -16], 'lowerArm.L': [-72, 0, 0], 'lowerArm.R': [-72, 0, 0] })],
  ]));
  clips.push(keyClip('throwIn', [
    [0, P({ spine: [-16, 0, 0], 'upperArm.L': [-195, 0, 16], 'upperArm.R': [-195, 0, -16], 'lowerArm.L': [-75, 0, 0], 'lowerArm.R': [-75, 0, 0] })],
    [0.25, P({ spine: [18, 0, 0], 'thigh.R': [20, 0, 0], 'shin.R': [25, 0, 0], 'upperArm.L': [-110, 0, 12], 'upperArm.R': [-110, 0, -12], 'lowerArm.L': [-8, 0, 0], 'lowerArm.R': [-8, 0, 0] })],
    [0.6, P({ spine: [8, 0, 0] })],
  ]));
  return clips;
}

/** Turn-in-place stepping, with the pelvis leading into the turn. */
function turnClip(name, dir) {
  const g = GAITS.stepInPlace;
  const frames = [];
  for (let i = 0; i <= 24; i++) {
    const phi = i / 24;
    const pose = gaitPose(g, phi % 1);
    pose.hips = [0, dir * 12 * D, 0];
    pose.chest = [pose.chest[0], dir * 10 * D, 0];
    pose.head = [pose.head[0], dir * 15 * D, 0];
    // Feet step outwards into the turn.
    pose['thigh.L'][2] = dir * 6 * D * Math.max(0, Math.sin(2 * Math.PI * phi));
    pose['thigh.R'][2] = dir * 6 * D * Math.max(0, -Math.sin(2 * Math.PI * phi));
    frames.push({ t: phi * 0.9, pose });
  }
  const clip = buildClip(name, frames);
  clip.userData = { cycleDistance: 0, gait: 'stepInPlace' };
  return clip;
}

let library = null;
/** All clips, built once and shared by every character (by name). */
export function clipLibrary() {
  if (library) return library;
  const list = [
    idleClip(), gkReadyClip(),
    gaitClip('walk', GAITS.walk), gaitClip('jog', GAITS.jog), gaitClip('dribble', GAITS.dribble),
    gaitClip('run', GAITS.run), gaitClip('sprint', GAITS.sprint), gaitClip('celebrateRun', GAITS.airplane),
    turnClip('turnLeft', 1), turnClip('turnRight', -1),
    ...actionClips(),
  ];
  // Mirrored kicks for left-footed players.
  for (const name of ['pass', 'longPass', 'shoot', 'touch']) {
    const src = list.find((c) => c.name === name);
    list.push(mirrorClip(src, `${name}Left`));
  }
  library = Object.fromEntries(list.map((c) => [c.name, c]));
  return library;
}

/** Mirror a clip left/right (swap .L/.R tracks and flip y/z rotation). */
function mirrorClip(clip, name) {
  const tracks = clip.tracks.map((t) => {
    const [node, prop] = t.name.split('.');
    let mirrored = node.endsWith('_L') ? node.replace(/_L$/, '_R') : node.endsWith('_R') ? node.replace(/_R$/, '_L') : node;
    const values = t.values.slice();
    if (prop === 'quaternion') for (let i = 0; i < values.length; i += 4) { values[i + 1] *= -1; values[i + 2] *= -1; }
    if (prop === 'position') for (let i = 0; i < values.length; i += 3) values[i] *= -1;
    const T = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return new T(`${mirrored}.${prop}`, t.times.slice(), values);
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

export const LOCOMOTION = ['walk', 'jog', 'run', 'sprint'];
