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
// grows with distance, the passer's rating for that kind of pass (short
// passing, long passing, vision for through balls, crossing for crosses),
// running speed, body facing away from the pass, pressure from opponents,
// a first-time strike (pace of the incoming ball, how far it is turned),
// fatigue and AI difficulty. It is applied to both direction and weight, so
// passes are never laser-perfect. Weak-foot strikes lose contact quality in
// the engine (the foot is only known at the strike).
//
// Weight: every ground pass is weighted by the speed it should still have
// when it reaches the receiver (passArriveSpeed). The engine turns that into
// a launch speed and the same arrival time is used to lead the receiver, so
// the kick and the aim always agree.

import { HALF_L, HALF_W } from '../constants.ts';
import type { Vec2, Vec3, PassKind, PhysicalProfile } from '../../types/game.ts';
import {
  speedForRollDistance, rollDistanceAfter, rollStopTime, solveLoftedKick, gauss,
} from '../physics/ballPhysics.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Passer / receiver as the planner needs them (match Players satisfy this). */
export interface Passer {
  pos: Vec2; vel: Vec2; face: Vec2; stamina?: number; injured?: boolean; role?: string;
  phys: Pick<PhysicalProfile, 'runSpeed' | 'sprintMul' | 'passAccuracy' | 'longPassing'>
    & { distribution?: number; vision?: number; crossing?: number };
}
export interface Receiver { pos: Vec2; vel: Vec2; phys?: { runSpeed: number } | null }
export interface PassInput {
  p: Passer; target: Receiver; ball: { pos: Vec3 }; kind?: PassKind; driven?: boolean;
  errMul?: number; pressure?: number; attackDir?: number; assisted?: boolean; rng?: () => number;
  /** Optional arrival-time model from the active physics engine. */
  groundPassTime?: (distance: number, kind: PassKind, driven: boolean) => number;
  /** Optional flight time of a lofted ball (engine trajectory) for the lead. */
  loftedTime?: (distance: number) => number;
  /** A cross: aimed into the space in front of the runner, not at his feet. */
  cross?: boolean;
  /**
   * A first-time pass off a moving ball: its pace (m/s) and how far the pass
   * turns it (rad; 0 = played back the way it came, π = on in its direction).
   */
  firstTime?: { inSpeed: number; turn: number };
}

/**
 * Speed (m/s) a ground pass should still have when it reaches the receiver.
 * Short passes arrive soft enough to control, longer ones firmer so they get
 * there in time; driven passes much harder; through balls softly into the
 * runner's stride. A held pass scales it: 0.7× (soft) .. 1.5× (full).
 *   ground:  6 m → 6.5,  12 m → 8,  20 m → 10,  30 m → 12.5
 *   driven:  12 m → 13.1, 25 m → 16
 *   through: 15 m → 5.3, 30 m → 7.1
 */
/**
 * Launch elevation (deg) of a lofted ball. Short lobs go up to clear the
 * lane, long balls a little flatter so they get there sooner (FC-style
 * "more driven" lobs) while backspin keeps them carrying; crosses are
 * whipped in at ~19°, chips go high.
 *   20 m → 34°, 35 m → 31°, 50 m → 28°, 60 m → 26°
 */
export function loftElevation(d: number, kind: PassKind, cross = false): number {
  if (cross) return 19;
  if (kind === 'chip') return 42;
  return clamp(38 - d * 0.2, 25, 35);
}
/**
 * Backspin (rad/s, negative) the engine strikes a lofted ball with: it holds
 * up, carries and checks on landing. Matches the engine's kick table
 * (lobPass -22, longPass over 30 m -35 ≈ 5.6 rev/s, cross -15) so the
 * solver flies the same ball.
 */
export function loftBackspin(_kind: PassKind, cross = false, d = 0): number {
  return cross ? -15 : d > 30 ? -35 : -22;
}

export function passArriveSpeed(kind: 'ground' | 'through', d: number, driven = false, power?: number): number {
  const pf = power === undefined ? 1 : 0.5 + clamp(power, 0.2, 1);
  const v = kind === 'through' ? clamp(3.5 + 0.12 * d, 4, 7.5)
    : driven ? clamp(10.5 + 0.22 * d, 12, 18)
      : clamp(5 + 0.25 * d, 6, 12.5);
  return v * pf;
}
export interface PassPlan { vel: Vec3; top: number | null; aim: Vec2; kind: PassKind; sigma: number; flight: number;
  /** Where a lofted ball should first land (aim × land fraction); the aim itself for ground passes. */
  land: Vec2;
  /** Weight error (1 = as intended), applied by the engine path too. */
  weight: number }

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
    // Reading the run: vision decides how well the lead matches it.
    const vis = p.phys.vision ?? p.phys.passAccuracy;
    const leadErr = 1 + gauss(rng) * (0.03 + (1 - vis) * 0.16) * (o.errMul ?? 1);
    for (let i = 0; i < 3; i++) {
      const d = Math.hypot(aim.x - from.x, aim.z - from.z);
      speed = clamp(speedForRollDistance(d + 3), 5, 24);
      const t = o.groundPassTime?.(d, kind, !!o.driven) ?? rollTimeTo(speed, d);
      const lead = clamp(reach * (Number.isFinite(t) ? t : 1.5) * leadErr, 3, 16);
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
        t = Math.min(3, o.groundPassTime?.(d, kind, !!o.driven) ?? rollTimeTo(speed, d));
      } else {
        flight = o.loftedTime?.(d) ?? (kind === 'chip' ? 0.9 + d / 40 : 0.95 + d / 28);
        t = flight;
      }
      // Receivers adjust anyway; lead most, not all, of his movement.
      aim = { x: target.pos.x + target.vel.x * t * 0.85, z: target.pos.z + target.vel.z * t * 0.85 };
      if (o.cross) {
        // Into the space in front of the runner, towards goal.
        const gx = (o.attackDir || 1) * HALF_L;
        const tx = gx - aim.x, tz = -aim.z, tl = Math.hypot(tx, tz) || 1;
        aim = { x: aim.x + (tx / tl) * 2.5, z: aim.z + (tz / tl) * 2.5 };
      }
      aim.x = clamp(aim.x, -HALF_L + 1.5, HALF_L - 1.5);
      aim.z = clamp(aim.z, -HALF_W + 1.5, HALF_W - 1.5);
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
  // The rating that matters for this pass.
  const short = prof.passAccuracy, long = prof.longPassing;
  const vision = prof.vision ?? short, crossing = prof.crossing ?? long;
  const longShare = clamp((d - 18) / 20, 0, 1); // a ground pass becomes a long ball's job past ~18 m
  const skill = p.role === 'GK' && prof.distribution != null ? prof.distribution
    : o.cross ? crossing * 0.8 + long * 0.2
      : kind === 'through' ? vision * 0.5 + (short + (long - short) * longShare) * 0.5
        : kind === 'ground' ? (short + (long - short) * longShare) * (o.driven ? 0.7 : 1) + (o.driven ? long * 0.3 : 0)
          : long * 0.85 + vision * 0.15;
  // First time: harder off a quick ball, and the further it is turned.
  const ft = o.firstTime
    ? (1.15 + clamp((o.firstTime.inSpeed - 6) / 12, 0, 1) * 0.7) * (1 + (clamp(o.firstTime.turn, 0, Math.PI) / Math.PI) ** 2 * 0.6)
    : 1;
  // Body shape: a passer opens his hips during the wind-up, so the first
  // ~45° across the body is free; beyond that (passing behind himself) it costs.
  const across = Math.max(0, bodyAngle - Math.PI / 4) / (Math.PI / 2);
  const sigma = (0.005 + (1 - skill) * 0.05)
    * (1 + d / 50)
    * (1 + runFactor * 0.4)
    * (1 + across * 0.8)
    * (1 + (o.pressure || 0) * 0.5)
    * (o.driven ? 1.25 : 1)
    * ft
    * fatigue * (o.errMul ?? 1);
  const err = gauss(rng) * sigma;
  const c = Math.cos(err), s = Math.sin(err);
  const ex = dx * c - dz * s, ez = dx * s + dz * c;
  const weight = 1 + gauss(rng) * sigma * 1.2;

  if (kind === 'ground' && !speed) speed = groundSpeed(d, o.driven);
  if (kind === 'ground' || kind === 'through') {
    const v = speed * weight;
    return { vel: { x: ex * v, y: 0, z: ez * v }, top: null, aim, kind, sigma, flight: 0, weight, land: aim };
  }
  // Lofted / chip: drop just short of the receiver so it bounces up to him
  // (assisted lands a little closer).
  const landFrac = kind === 'chip' ? 0.97 : o.assisted ? 0.97 : 0.94;
  const top = kind === 'chip' ? -12 : -6;
  const k = solveLoftedKick(d * landFrac * weight, flight || 0.95 + d / 28, top);
  const land = { x: from.x + dx * d * landFrac, z: from.z + dz * d * landFrac };
  return { vel: { x: ex * k.h, y: k.vy, z: ez * k.h }, top, aim, kind, sigma, flight, weight, land };
}
