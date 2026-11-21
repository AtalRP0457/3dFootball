// Pass planning: where to play the ball, how hard, and how accurately.
//
// Kinds
//   ground   short or long ground pass, weighted with the rolling model so it
//            dies a little past the receiver; `driven` plays it firmer
//   lofted   lifted pass with backspin, drops short of the receiver
//   through  into space ahead of a running teammate, timed so he arrives as
//            the ball does
//   chip     lofted over a blocked lane (assist)
//
// The pass is aimed at where the receiver will be, not where he is. Error
// grows with distance, low passing, running speed, body facing away from
// the pass, pressure from opponents, fatigue and AI difficulty, and is
// applied to both direction and weight, so passes are never laser-perfect.

import { HALF_L, HALF_W } from '../constants.ts';
import type { Vec2, Vec3, PassKind, PhysicalProfile } from '../../types/game.ts';
import {
  speedForRollDistance, rollDistanceAfter, rollStopTime, solveLoftedKick, gauss,
} from '../physics/ballPhysics.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Passer / receiver as the planner needs them (match Players satisfy this). */
export interface Passer {
  pos: Vec2; vel: Vec2; face: Vec2; stamina?: number; injured?: boolean; role?: string;
  phys: Pick<PhysicalProfile, 'runSpeed' | 'sprintMul' | 'passAccuracy' | 'longPassing'> & { distribution?: number };
}
export interface Receiver { pos: Vec2; vel: Vec2; phys?: { runSpeed: number } | null }
export interface PassInput {
  p: Passer; target: Receiver; ball: { pos: Vec3 }; kind?: PassKind; driven?: boolean;
  errMul?: number; pressure?: number; attackDir?: number; assisted?: boolean; rng?: () => number;
}
export interface PassPlan { vel: Vec3; top: number | null; aim: Vec2; kind: PassKind; sigma: number; flight: number }

/** Time for a rolling ball launched at v0 to cover d metres (Infinity if it stops short). */
export function rollTimeTo(v0: number, d: number): number {
  const stop = rollStopTime(v0);
  if (rollDistanceAfter(v0, stop) < d) return Infinity;
  let lo = 0, hi = stop;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (rollDistanceAfter(v0, mid) < d) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function groundSpeed(d: number, driven?: boolean): number {
  // Run-on past the receiver: a short pass is played to feet, a long one
  // firmer so it doesn't die before it arrives.
  const extra = clamp(d * 0.15, 0.6, 2.5);
  let v = speedForRollDistance(d + extra);
  if (driven) v *= 1.22;
  return clamp(v, 3.2, 26);
}

/**
 * @param o {
 *   p, target, ball, kind ('ground'|'lofted'|'through'|'chip'),
 *   driven (bool), errMul, pressure (0..1), attackDir (+1/-1), assisted, rng
 * }
 * @returns { vel:{x,y,z}, top, aim:{x,z}, kind, sigma, flight }
 */
export function planPass(o: PassInput): PassPlan {
  const { p, target, ball } = o;
  const rng = o.rng || Math.random;
  const prof = p.phys;
  const kind: PassKind = o.kind || 'ground';
  const from = ball.pos;

  // ----- where to aim (lead the receiver) -----
  let aim = { x: target.pos.x, z: target.pos.z };
  let speed = 0, flight = 0;
  const runSpeed = target.phys ? target.phys.runSpeed : 6;
  if (kind === 'through') {
    // Space ahead of the receiver along his run (or towards goal).
    const tv = Math.hypot(target.vel.x, target.vel.z);
    let rx = o.attackDir || 1, rz = 0;
    if (tv > 1.5 && target.vel.x * (o.attackDir || 1) > -0.2) { rx = target.vel.x / tv; rz = target.vel.z / tv; }
    const reach = Math.max(runSpeed * 0.9, tv);
    for (let i = 0; i < 3; i++) {
      const d = Math.hypot(aim.x - from.x, aim.z - from.z);
      speed = clamp(speedForRollDistance(d + 3), 5, 24);
      const t = rollTimeTo(speed, d);
      const lead = clamp(reach * (Number.isFinite(t) ? t : 1.5), 4, 16);
      aim = { x: target.pos.x + rx * lead, z: target.pos.z + rz * lead };
      aim.x = clamp(aim.x, -HALF_L + 1.5, HALF_L - 1.5);
      aim.z = clamp(aim.z, -HALF_W + 1.5, HALF_W - 1.5);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const d = Math.hypot(aim.x - from.x, aim.z - from.z);
      let t;
      if (kind === 'ground') {
        speed = groundSpeed(d, o.driven);
        t = Math.min(2.5, rollTimeTo(speed, d));
      } else {
        flight = kind === 'chip' ? 0.9 + d / 40 : 0.95 + d / 28;
        t = flight;
      }
      // Receivers adjust anyway; lead most, not all, of his movement.
      aim = { x: target.pos.x + target.vel.x * t * 0.85, z: target.pos.z + target.vel.z * t * 0.85 };
    }
  }

  let dx = aim.x - from.x, dz = aim.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;

  // ----- error -----
  const pSpeed = Math.hypot(p.vel.x, p.vel.z);
  const runFactor = clamp(pSpeed / (prof.runSpeed * prof.sprintMul), 0, 1.2);
  const bodyAngle = Math.acos(clamp(p.face.x * dx + p.face.z * dz, -1, 1));
  const fatigue = (1 + (1 - (p.stamina ?? 1)) * 0.25) * (p.injured ? 1.3 : 1);
  const skill = p.role === 'GK' && prof.distribution != null ? prof.distribution
    : kind === 'ground' ? prof.passAccuracy : prof.longPassing;
  const sigma = (0.008 + (1 - skill) * 0.06)
    * (1 + d / 40)
    * (1 + runFactor * 0.6)
    * (1 + (bodyAngle / (Math.PI / 2)) * 0.9)
    * (1 + (o.pressure || 0) * 0.6)
    * (o.driven ? 1.25 : 1)
    * fatigue * (o.errMul ?? 1);
  const err = gauss(rng) * sigma;
  const c = Math.cos(err), s = Math.sin(err);
  const ex = dx * c - dz * s, ez = dx * s + dz * c;
  const weight = 1 + gauss(rng) * sigma * 1.2;

  if (kind === 'ground' && !speed) speed = groundSpeed(d, o.driven);
  if (kind === 'ground' || kind === 'through') {
    const v = speed * weight;
    return { vel: { x: ex * v, y: 0, z: ez * v }, top: null, aim, kind, sigma, flight: 0 };
  }
  // Lofted / chip: land short of the receiver (assisted lands closer).
  const landFrac = kind === 'chip' ? 0.97 : o.assisted ? 0.92 : 0.82;
  const top = kind === 'chip' ? -12 : -6;
  const k = solveLoftedKick(d * landFrac * weight, flight || 0.95 + d / 28, top);
  return { vel: { x: ex * k.h, y: k.vy, z: ez * k.h }, top, aim, kind, sigma, flight };
}
