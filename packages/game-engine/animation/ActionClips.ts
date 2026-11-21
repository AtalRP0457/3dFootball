// Action clips: timed poses with contact markers. Kicks are authored for the
// RIGHT foot and mirrored for the left. Gameplay acts on markers at the step
// they are crossed: 'plant' (support foot down), 'contact' / 'touch' /
// 'touch2' (ball struck), 'end'.
import type { ActionKind } from '../player/PlayerTypes.ts';
import type { MoveModeKind } from '../player/PlayerMovement.ts';
import type { Keyframe, PartialPose } from './AnimationBlending.ts';
import type { AnimMarker } from './AnimationEvents.ts';

export interface ActionClip {
  name: ActionKind;
  duration: number;
  markers: AnimMarker[];
  keys: Keyframe[];
  blendIn: number;
  blendOut: number;
  move: MoveModeKind;
  control: number;
  speedCap?: number;
  /** Can a new action cut in? */
  interruptible: boolean;
  /** Action to chain when this one ends. */
  next?: ActionKind;
  /** Exit side for skill touches: +1 left of travel, −1 right, 0 forward, 2 backwards. */
  exitSide?: number;
}

interface KickShape {
  dur: number;
  power: number;   // 0..1 swing size
  lean: number;    // + over the ball, − leaning back
  lofted: number;  // 0..1 (lob/chip/cross)
  turnOut: number; // inside-foot rotation (finesse, pass)
  follow: number;  // follow-through height
  contact?: number;
}

function kick(name: ActionKind, k: KickShape): ActionClip {
  const c = k.contact ?? 0.55, p = k.power;
  const keys: Keyframe[] = [
    { t: 0, pose: {} },
    { t: 0.25, pose: { 'thigh.L': { x: -0.25 }, 'shin.L': { x: 0.35 }, 'foot.L': { x: -0.05 }, 'thigh.R': { x: 0.25 }, 'shin.R': { x: 0.9 }, spine: { x: 0.08 + k.lean * 0.5 }, hipDrop: 0.05 } },
    { t: c - 0.12, pose: {
      'thigh.R': { x: 0.4 + 0.3 * p, y: k.turnOut * 0.4, z: 0 }, 'shin.R': { x: 1.45 + 0.45 * p }, 'foot.R': { x: 0.55 },
      'thigh.L': { x: -0.15 }, 'shin.L': { x: 0.35 }, 'upperArm.L': { x: -0.3, z: 0.95 }, 'upperArm.R': { x: 0.45, z: -0.45 },
      chest: { y: 0.28 }, spine: { x: 0.1 + k.lean }, hipDrop: 0.07, roll: -0.06 } },
    { t: c, pose: {
      'thigh.R': { x: -0.35 - 0.25 * k.lofted, y: k.turnOut }, 'shin.R': { x: 0.25 }, 'foot.R': { x: k.lofted > 0.5 ? -0.25 : 0.45 - k.turnOut * 0.3 },
      'thigh.L': { x: -0.1 }, 'shin.L': { x: 0.3 }, 'upperArm.L': { x: -0.2, z: 1.0 }, 'upperArm.R': { x: 0.3, z: -0.5 },
      chest: { y: -0.08 }, spine: { x: k.lean }, hipDrop: 0.06 } },
    { t: Math.min(0.85, c + 0.22), pose: {
      'thigh.R': { x: -0.7 - 0.7 * p - 0.35 * k.follow, y: k.turnOut * 0.6 }, 'shin.R': { x: 0.2 }, 'foot.R': { x: 0.3 },
      'thigh.L': { x: -0.05 }, 'shin.L': { x: 0.15 }, 'upperArm.L': { x: -0.1, z: 0.8 }, chest: { y: -0.3 },
      spine: { x: k.lean - 0.12 * k.lofted }, lift: 0.04 * p, hipDrop: 0.02 } },
    { t: 1, pose: { 'thigh.R': { x: -0.15 }, 'shin.R': { x: 0.35 } } },
  ];
  return {
    name, duration: k.dur, keys, blendIn: 0.07, blendOut: 0.14,
    markers: [{ t: 0.25, kind: 'plant' }, { t: c, kind: 'contact' }, { t: 1, kind: 'end' }],
    move: 'action', control: 0.25, interruptible: false,
  };
}

function skill(name: ActionKind, dur: number, keys: Keyframe[], markers: AnimMarker[], exitSide: number, speedCap: number, control = 0.55): ActionClip {
  return { name, duration: dur, keys, markers: [...markers, { t: 1, kind: 'end' }], blendIn: 0.08, blendOut: 0.15, move: 'action', control, speedCap, interruptible: false, exitSide };
}

const arms = (z: number): PartialPose => ({ 'upperArm.L': { z }, 'upperArm.R': { z: -z } });

export const ACTION_CLIPS: Record<ActionKind, ActionClip> = {
  shortPass: kick('shortPass', { dur: 0.42, power: 0.25, lean: 0.12, lofted: 0, turnOut: 0.7, follow: 0 }),
  firstTimePass: kick('firstTimePass', { dur: 0.32, power: 0.3, lean: 0.12, lofted: 0, turnOut: 0.6, follow: 0, contact: 0.45 }),
  drivenPass: kick('drivenPass', { dur: 0.5, power: 0.6, lean: 0.2, lofted: 0, turnOut: 0.2, follow: 0.2 }),
  throughBall: kick('throughBall', { dur: 0.45, power: 0.4, lean: 0.15, lofted: 0, turnOut: 0.5, follow: 0.1 }),
  lobPass: kick('lobPass', { dur: 0.55, power: 0.55, lean: -0.12, lofted: 0.8, turnOut: 0.2, follow: 0.6 }),
  longPass: kick('longPass', { dur: 0.6, power: 0.8, lean: -0.1, lofted: 0.7, turnOut: 0.1, follow: 0.8 }),
  cross: kick('cross', { dur: 0.6, power: 0.75, lean: -0.08, lofted: 0.6, turnOut: 0.5, follow: 0.7 }),
  shot: kick('shot', { dur: 0.55, power: 0.75, lean: 0.18, lofted: 0, turnOut: 0, follow: 0.6 }),
  powerShot: kick('powerShot', { dur: 0.78, power: 1, lean: 0.22, lofted: 0, turnOut: 0, follow: 1, contact: 0.6 }),
  finesseShot: kick('finesseShot', { dur: 0.6, power: 0.6, lean: 0.12, lofted: 0.2, turnOut: 0.9, follow: 0.6 }),
  placedShot: kick('placedShot', { dur: 0.5, power: 0.5, lean: 0.15, lofted: 0, turnOut: 0.6, follow: 0.3 }),
  lowDrivenShot: kick('lowDrivenShot', { dur: 0.55, power: 0.85, lean: 0.32, lofted: 0, turnOut: 0, follow: 0.3 }),
  chipShot: kick('chipShot', { dur: 0.55, power: 0.4, lean: -0.15, lofted: 1, turnOut: 0, follow: 0.2 }),
  volley: {
    ...kick('volley', { dur: 0.5, power: 0.8, lean: -0.05, lofted: 0, turnOut: 0, follow: 0.6 }),
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, pose: { 'thigh.R': { x: -0.2, z: -0.3 }, 'shin.R': { x: 1.6 }, roll: 0.15, spine: { x: -0.1 }, ...arms(0.9) } },
      { t: 0.55, pose: { 'thigh.R': { x: -1.15, z: -0.2 }, 'shin.R': { x: 0.15 }, 'foot.R': { x: 0.45 }, roll: 0.3, spine: { x: -0.15 }, ...arms(1.0) } },
      { t: 0.8, pose: { 'thigh.R': { x: -1.25 }, 'shin.R': { x: 0.3 }, roll: 0.15 } },
      { t: 1, pose: {} },
    ],
  },
  halfVolley: kick('halfVolley', { dur: 0.48, power: 0.8, lean: 0.25, lofted: 0, turnOut: 0, follow: 0.5 }),
  header: {
    name: 'header', duration: 0.7, blendIn: 0.06, blendOut: 0.15, move: 'action', control: 0.3, interruptible: false,
    markers: [{ t: 0.5, kind: 'contact' }, { t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, pose: { hipDrop: 0.14, 'thigh.L': { x: -0.5 }, 'shin.L': { x: 1.0 }, 'thigh.R': { x: -0.5 }, 'shin.R': { x: 1.0 }, ...arms(0.5) } },
      { t: 0.38, pose: { lift: 0.4, hipDrop: 0, neck: { x: -0.3 }, head: { x: -0.35 }, spine: { x: -0.2 }, 'shin.L': { x: 0.9 }, 'shin.R': { x: 0.6 }, ...arms(1.2) } },
      { t: 0.5, pose: { lift: 0.45, neck: { x: 0.35 }, head: { x: 0.45 }, spine: { x: 0.3 } } },
      { t: 0.8, pose: { lift: 0.05, neck: { x: 0.1 }, head: { x: 0.1 }, spine: { x: 0.15 }, hipDrop: 0.08 } },
      { t: 1, pose: {} },
    ],
  },
  stepOver: skill('stepOver', 0.75, [
    { t: 0, pose: {} },
    { t: 0.2, pose: { 'thigh.R': { x: -0.55, z: 0.3 }, 'shin.R': { x: 0.8 }, roll: -0.1, hips: { y: 0.2 } } },
    { t: 0.4, pose: { 'thigh.R': { x: -0.45, z: -0.45 }, 'shin.R': { x: 0.7 }, roll: 0.18, hips: { y: -0.15 }, ...arms(0.6) } },
    { t: 0.6, pose: { 'thigh.R': { x: 0.05, z: -0.15 }, 'shin.R': { x: 0.3 }, roll: 0.25, hipDrop: 0.08 } },
    { t: 0.8, pose: { 'thigh.L': { x: -0.5, y: 0.5 }, 'shin.L': { x: 0.5 }, roll: -0.2 } },
    { t: 1, pose: {} },
  ], [{ t: 0.8, kind: 'touch' }], 1, 4.5),
  doubleStepOver: skill('doubleStepOver', 1.05, [
    { t: 0, pose: {} },
    { t: 0.15, pose: { 'thigh.R': { x: -0.55, z: 0.3 }, 'shin.R': { x: 0.8 }, roll: -0.1 } },
    { t: 0.3, pose: { 'thigh.R': { x: -0.4, z: -0.45 }, 'shin.R': { x: 0.6 }, roll: 0.2, ...arms(0.6) } },
    { t: 0.45, pose: { 'thigh.L': { x: -0.55, z: -0.3 }, 'shin.L': { x: 0.8 }, 'thigh.R': { x: 0 }, roll: 0.1 } },
    { t: 0.62, pose: { 'thigh.L': { x: -0.4, z: 0.45 }, 'shin.L': { x: 0.6 }, roll: -0.22, ...arms(0.6) } },
    { t: 0.85, pose: { 'thigh.R': { x: -0.5, y: -0.5 }, 'shin.R': { x: 0.5 }, roll: 0.2 } },
    { t: 1, pose: {} },
  ], [{ t: 0.86, kind: 'touch' }], -1, 4),
  bodyFeint: skill('bodyFeint', 0.6, [
    { t: 0, pose: {} },
    { t: 0.3, pose: { roll: 0.35, hipDrop: 0.1, spine: { z: 0.2 }, 'thigh.R': { z: -0.3, x: -0.2 }, 'shin.R': { x: 0.5 }, ...arms(0.7) } },
    { t: 0.6, pose: { roll: -0.25, hipDrop: 0.06, spine: { z: -0.15 } } },
    { t: 1, pose: {} },
  ], [{ t: 0.62, kind: 'touch' }], 1, 5),
  dragBack: {
    ...skill('dragBack', 0.75, [
      { t: 0, pose: {} },
      { t: 0.2, pose: { 'thigh.R': { x: -0.5 }, 'shin.R': { x: 0.55 }, 'foot.R': { x: -0.2 }, spine: { x: -0.05 } } },
      { t: 0.38, pose: { 'thigh.R': { x: 0.25 }, 'shin.R': { x: 0.7 }, 'foot.R': { x: 0.2 }, lift: 0.04, yawOffset: 0.4 } },
      { t: 0.7, pose: { yawOffset: Math.PI * 0.85, 'thigh.L': { x: -0.3 }, 'shin.L': { x: 0.5 } } },
      { t: 1, pose: { yawOffset: Math.PI } },
    ], [{ t: 0.36, kind: 'touch' }], 2, 1.6, 0.3),
  },
  ballRoll: skill('ballRoll', 0.6, [
    { t: 0, pose: {} },
    { t: 0.2, pose: { 'thigh.R': { x: -0.4, z: 0.1 }, 'shin.R': { x: 0.5 }, 'foot.R': { x: -0.25 } } },
    { t: 0.4, pose: { 'thigh.R': { x: -0.25, z: 0.45 }, 'shin.R': { x: 0.45 }, roll: -0.15, hips: { y: 0.35 } } },
    { t: 0.7, pose: { 'thigh.L': { z: 0.35 }, roll: -0.1, hips: { y: 0.2 } } },
    { t: 1, pose: {} },
  ], [{ t: 0.4, kind: 'touch' }], 1, 3),
  roulette: {
    ...skill('roulette', 1.0, [
      { t: 0, pose: {} },
      { t: 0.2, pose: { 'thigh.R': { x: -0.5 }, 'shin.R': { x: 0.5 }, 'foot.R': { x: -0.2 }, yawOffset: -0.4 } },
      { t: 0.4, pose: { 'thigh.R': { x: 0.2 }, yawOffset: -Math.PI * 0.8, ...arms(0.7) } },
      { t: 0.6, pose: { 'thigh.L': { x: -0.5 }, 'shin.L': { x: 0.5 }, 'foot.L': { x: -0.2 }, yawOffset: -Math.PI * 1.3 } },
      { t: 0.85, pose: { 'thigh.L': { x: 0.1 }, yawOffset: -Math.PI * 1.9 } },
      { t: 1, pose: { yawOffset: -Math.PI * 2 } },
    ], [{ t: 0.3, kind: 'touch' }, { t: 0.66, kind: 'touch2' }], 0, 3, 0.45),
  },
  heelToHeel: skill('heelToHeel', 0.55, [
    { t: 0, pose: {} },
    { t: 0.2, pose: { 'thigh.R': { x: -0.3, z: 0.1 }, 'shin.R': { x: 0.4 } } },
    { t: 0.38, pose: { 'thigh.R': { x: 0.1, z: 0.3 }, 'shin.R': { x: 1.4 }, 'foot.R': { x: 0.4 }, roll: -0.08 } },
    { t: 0.6, pose: { 'thigh.L': { x: -0.3 }, 'shin.L': { x: 0.5 } } },
    { t: 1, pose: {} },
  ], [{ t: 0.38, kind: 'touch' }], 0.6, 5),
  fakeShot: skill('fakeShot', 0.78, [
    { t: 0, pose: {} },
    { t: 0.3, pose: { 'thigh.R': { x: 0.6 }, 'shin.R': { x: 1.7 }, 'thigh.L': { x: -0.15 }, 'upperArm.L': { z: 0.95 }, chest: { y: 0.28 }, spine: { x: 0.15 }, hipDrop: 0.07 } },
    { t: 0.5, pose: { 'thigh.R': { x: -0.45 }, 'shin.R': { x: 0.9 }, 'foot.R': { x: 0.1 }, chest: { y: 0 } } },
    { t: 0.68, pose: { 'thigh.R': { x: -0.3, y: 0.6 }, 'shin.R': { x: 0.4 }, roll: -0.2, hips: { y: 0.4 } } },
    { t: 1, pose: {} },
  ], [{ t: 0.7, kind: 'touch' }], 1, 3.5, 0.4),
  standingTackle: {
    name: 'standingTackle', duration: 0.6, blendIn: 0.05, blendOut: 0.15, move: 'action', control: 0.2, interruptible: false,
    markers: [{ t: 0.15, kind: 'plant' }, { t: 0.36, kind: 'contact' }, { t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, pose: { 'thigh.L': { x: 0.2 }, 'shin.L': { x: 0.9 }, hipDrop: 0.12, spine: { x: 0.25 }, ...arms(0.5) } },
      { t: 0.36, pose: { 'thigh.R': { x: -1.05, z: -0.2 }, 'shin.R': { x: 0.12 }, 'foot.R': { x: -0.35, y: 0.6 }, 'thigh.L': { x: 0.35 }, 'shin.L': { x: 1.1 }, hipDrop: 0.22, spine: { x: 0.35 }, ...arms(0.8) } },
      { t: 0.65, pose: { 'thigh.R': { x: -0.6 }, 'shin.R': { x: 0.4 }, hipDrop: 0.12 } },
      { t: 1, pose: {} },
    ],
  },
  slidingTackle: {
    name: 'slidingTackle', duration: 1.05, blendIn: 0.06, blendOut: 0.1, move: 'slide', control: 0, interruptible: false, next: 'getUp',
    markers: [{ t: 0.14, kind: 'contact' }, { t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      // Body tilted back ~0.95 rad: a thigh at −0.6 relative to the torso lies flat along the turf.
      { t: 0.14, pose: { pitch: -0.95, hipDrop: 0.62, 'thigh.R': { x: -0.68, z: -0.08 }, 'shin.R': { x: 0.04 }, 'foot.R': { x: -0.25 }, 'thigh.L': { x: -0.05 }, 'shin.L': { x: 1.75 }, 'upperArm.L': { x: 0.7, z: 0.5 }, 'upperArm.R': { x: 0.7, z: -0.5 }, spine: { x: 0.45 }, head: { x: 0.5 } } },
      { t: 0.75, pose: { pitch: -0.95, hipDrop: 0.62, 'thigh.R': { x: -0.66 }, 'shin.R': { x: 0.06 }, 'thigh.L': { x: -0.05 }, 'shin.L': { x: 1.75 }, 'upperArm.L': { x: 0.7, z: 0.5 }, 'upperArm.R': { x: 0.7, z: -0.5 }, spine: { x: 0.45 }, head: { x: 0.5 } } },
      { t: 1, pose: { pitch: -0.8, hipDrop: 0.58, 'thigh.R': { x: -0.5 }, 'thigh.L': { x: -0.2 }, 'shin.L': { x: 1.6 }, spine: { x: 0.4 } } },
    ],
  },
  getUp: {
    name: 'getUp', duration: 0.8, blendIn: 0.02, blendOut: 0.2, move: 'down', control: 0, interruptible: false,
    markers: [{ t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: { pitch: -0.8, hipDrop: 0.58, 'thigh.L': { x: -0.2 }, 'shin.L': { x: 1.6 }, 'thigh.R': { x: -0.5 }, spine: { x: 0.4 } } },
      { t: 0.45, pose: { pitch: 0.3, hipDrop: 0.35, 'thigh.L': { x: -1.4 }, 'shin.L': { x: 2.2 }, 'thigh.R': { x: -0.2 }, 'shin.R': { x: 1.9 }, spine: { x: 0.5 }, 'upperArm.R': { x: -0.3, z: -0.3 } } },
      { t: 1, pose: {} },
    ],
  },
  stumble: {
    name: 'stumble', duration: 0.7, blendIn: 0.04, blendOut: 0.2, move: 'stumble', control: 0.3, speedCap: 3.5, interruptible: false,
    markers: [{ t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      { t: 0.25, pose: { spine: { x: 0.45, z: 0.2 }, pitch: 0.18, roll: 0.15, hipDrop: 0.1, 'upperArm.L': { x: -0.8, z: 1.1 }, 'upperArm.R': { x: 0.4, z: -1.3 }, 'lowerArm.L': { x: -0.8 } } },
      { t: 0.55, pose: { spine: { x: 0.3, z: -0.1 }, pitch: 0.1, roll: -0.08, 'upperArm.L': { x: 0.3, z: 0.8 }, 'upperArm.R': { x: -0.6, z: -0.9 } } },
      { t: 1, pose: {} },
    ],
  },
  fall: {
    name: 'fall', duration: 1.1, blendIn: 0.04, blendOut: 0.05, move: 'down', control: 0, interruptible: false, next: 'getUp',
    markers: [{ t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      { t: 0.25, pose: { pitch: 0.5, spine: { x: 0.5 }, hipDrop: 0.15, 'upperArm.L': { x: -1.2, z: 0.4 }, 'upperArm.R': { x: -1.2, z: -0.4 }, 'thigh.L': { x: -0.4 }, 'shin.L': { x: 0.6 } } },
      { t: 0.5, pose: { pitch: -0.8, hipDrop: 0.58, 'thigh.L': { x: -0.2 }, 'shin.L': { x: 1.6 }, 'thigh.R': { x: -0.5 }, spine: { x: 0.4 }, 'upperArm.L': { x: 0.6, z: 0.6 }, 'upperArm.R': { x: 0.6, z: -0.6 } } },
      { t: 1, pose: { pitch: -0.8, hipDrop: 0.58, 'thigh.L': { x: -0.2 }, 'shin.L': { x: 1.6 }, 'thigh.R': { x: -0.5 }, spine: { x: 0.4 } } },
    ],
  },
  jump: {
    name: 'jump', duration: 0.75, blendIn: 0.05, blendOut: 0.15, move: 'action', control: 0.3, interruptible: false,
    markers: [{ t: 0.2, kind: 'release' }, { t: 0.5, kind: 'contact' }, { t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, pose: { hipDrop: 0.16, 'thigh.L': { x: -0.6 }, 'shin.L': { x: 1.1 }, 'thigh.R': { x: -0.6 }, 'shin.R': { x: 1.1 }, spine: { x: 0.25 }, 'upperArm.L': { x: 0.5 }, 'upperArm.R': { x: 0.5 } } },
      { t: 0.5, pose: { lift: 0.45, hipDrop: 0, 'thigh.L': { x: -0.3 }, 'shin.L': { x: 0.7 }, 'thigh.R': { x: -0.2 }, 'shin.R': { x: 0.5 }, 'upperArm.L': { x: -2.2, z: 0.3 }, 'upperArm.R': { x: -2.2, z: -0.3 } } },
      { t: 0.82, pose: { lift: 0, hipDrop: 0.14, 'thigh.L': { x: -0.5 }, 'shin.L': { x: 0.9 }, 'thigh.R': { x: -0.5 }, 'shin.R': { x: 0.9 } } },
      { t: 1, pose: {} },
    ],
  },
  celebrate: {
    name: 'celebrate', duration: 2.2, blendIn: 0.1, blendOut: 0.25, move: 'action', control: 0.5, speedCap: 4, interruptible: true,
    markers: [{ t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: {} },
      { t: 0.15, pose: { lift: 0.25, 'upperArm.R': { x: -2.8, z: -0.2 }, 'lowerArm.R': { x: -0.9 }, 'upperArm.L': { x: -0.4, z: 1.2 }, head: { x: -0.3 }, spine: { x: -0.15 } } },
      { t: 0.3, pose: { lift: 0, 'upperArm.R': { x: -1.6, z: -0.3 }, 'lowerArm.R': { x: -1.8 }, hipDrop: 0.1 } },
      { t: 0.45, pose: { lift: 0.2, 'upperArm.R': { x: -2.9, z: -0.2 }, 'lowerArm.R': { x: -0.6 }, 'upperArm.L': { x: -2.9, z: 0.2 }, 'lowerArm.L': { x: -0.6 }, head: { x: -0.4 } } },
      { t: 0.8, pose: { lift: 0, 'upperArm.R': { x: -2.7, z: -0.4 }, 'upperArm.L': { x: -2.7, z: 0.4 }, head: { x: -0.35 }, spine: { x: -0.2 } } },
      { t: 1, pose: {} },
    ],
  },
  trap: {
    name: 'trap', duration: 0.38, blendIn: 0.04, blendOut: 0.12, move: 'action', control: 0.6, interruptible: true,
    markers: [{ t: 1, kind: 'end' }],
    keys: [
      { t: 0, pose: { 'thigh.R': { x: -0.45 }, 'shin.R': { x: 0.55 }, 'foot.R': { x: -0.3, y: 0.5 }, spine: { x: 0.15 }, hipDrop: 0.06, ...arms(0.45) } },
      { t: 0.5, pose: { 'thigh.R': { x: -0.25 }, 'shin.R': { x: 0.45 }, spine: { x: 0.12 }, hipDrop: 0.05 } },
      { t: 1, pose: {} },
    ],
  },
};

export const KICK_ACTIONS: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'shortPass', 'firstTimePass', 'drivenPass', 'throughBall', 'lobPass', 'longPass', 'cross', 'shot', 'powerShot',
  'finesseShot', 'placedShot', 'lowDrivenShot', 'chipShot', 'volley', 'halfVolley', 'header',
]);
export const SKILL_ACTIONS: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'stepOver', 'doubleStepOver', 'bodyFeint', 'dragBack', 'ballRoll', 'roulette', 'heelToHeel', 'fakeShot',
]);
