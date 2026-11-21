// Momentum-based locomotion (pure, deterministic). Given the current
// horizontal velocity, body yaw and intent, produce the next velocity and yaw
// for one fixed step. The same function moves human and AI players.
//
// Model:
//  - Speeding up follows a = a0·(1 − (v/Vsprint)²): quick first steps, fading
//    near top speed. Fatigue scales a0 and the top speeds.
//  - Direction changes are limited by lateral grip: the velocity vector can
//    rotate at most a_lat / v rad/s, so turning radius grows with v².
//  - Very sharp reversals at speed brake first (plant), then re-accelerate.
//  - Releasing the stick coasts down (momentum); opposite input brakes.
//  - Body yaw follows travel (or a facing target when jockeying) with a
//    speed-dependent yaw-rate limit.
import { angleDiff, clamp, headingOf, type Vec2 } from '../physics/Vec3.ts';
import { fatigueFactor } from './PlayerAttributes.ts';
import type { PlayerInput, PlayerTuning } from './PlayerTypes.ts';

export type MoveModeKind = 'normal' | 'dribble' | 'jockey' | 'action' | 'slide' | 'stumble' | 'down';

export interface MoveMode {
  kind: MoveModeKind;
  /** Yaw to face (jockeying, shielding, kicking). */
  facing?: number;
  /** Extra speed cap (m/s). */
  speedCap?: number;
  /** 0..1 authority of the stick (balance loss, actions). */
  control?: number;
}

export interface MoveState { vel: Vec2; yaw: number; yawRate: number; stamina: number }

export interface MoveResult {
  vel: Vec2;
  yaw: number;
  yawRate: number;
  stamina: number;
  accel: Vec2;
  targetSpeed: number;
  braking: boolean;
  turning: boolean;
}

const D2R = Math.PI / 180;

export function targetSpeedFor(input: PlayerInput, t: PlayerTuning, stamina: number): number {
  return baseTargetSpeed(input, t, stamina) * (input.speedScale ?? 1);
}
function baseTargetSpeed(input: PlayerInput, t: PlayerTuning, stamina: number): number {
  const mag = clamp(Math.hypot(input.move.x, input.move.z), 0, 1);
  if (mag < 0.08) return 0;
  const f = fatigueFactor(stamina);
  if (input.walk) return t.walkSpeed * Math.min(1, mag * 1.2);
  if (input.jog) return t.jogSpeed * f * Math.min(1, mag * 1.1);
  if (input.sprint && mag > 0.5 && stamina > 0.02) return t.sprintSpeed * f;
  // Analog stick: low deflection jogs/walks, full deflection runs.
  if (mag < 0.4) return t.walkSpeed * (mag / 0.4);
  if (mag < 0.75) return t.walkSpeed + (t.jogSpeed - t.walkSpeed) * ((mag - 0.4) / 0.35);
  return t.runSpeed * f;
}

export function stepMovement(s: MoveState, input: PlayerInput, t: PlayerTuning, mode: MoveMode, dt: number): MoveResult {
  const f = fatigueFactor(s.stamina);
  const control = mode.control ?? 1;
  let vx = s.vel.x, vz = s.vel.z;
  let speed = Math.hypot(vx, vz);
  const mag = clamp(Math.hypot(input.move.x, input.move.z), 0, 1);
  const dir: Vec2 = mag > 1e-6 ? { x: input.move.x / mag, z: input.move.z / mag } : { x: 0, z: 0 };
  let target = control > 0 ? targetSpeedFor(input, t, s.stamina) * (0.35 + 0.65 * control) : 0;
  if (mode.kind === 'jockey') target = Math.min(target, t.jockeySpeed * f);
  if (mode.speedCap !== undefined) target = Math.min(target, mode.speedCap);
  let braking = false, turning = false;

  if (mode.kind === 'slide') {
    // Committed slide: no steering, ground friction.
    const ns = Math.max(0, speed - 6.0 * dt);
    if (speed > 1e-6) { vx *= ns / speed; vz *= ns / speed; }
  } else if (mode.kind === 'down') {
    const ns = Math.max(0, speed - 9 * dt);
    if (speed > 1e-6) { vx *= ns / speed; vz *= ns / speed; }
  } else if (mode.kind === 'jockey') {
    // Defensive shuffle: short quick steps in any direction, facing fixed.
    const a = t.accel0 * 0.9 * f;
    const dvx = dir.x * target - vx, dvz = dir.z * target - vz;
    const dl = Math.hypot(dvx, dvz), step = Math.min(dl, a * dt + t.brakeDecel * 0.4 * dt);
    if (dl > 1e-6) { vx += (dvx / dl) * step; vz += (dvz / dl) * step; }
  } else if (target <= 0.01) {
    // No input: coast down, keeping direction (momentum).
    const decel = mode.kind === 'action' ? t.brakeDecel * 0.5 : t.coastDecel;
    const ns = Math.max(0, speed - decel * dt);
    if (speed > 1e-6) { vx *= ns / speed; vz *= ns / speed; }
    braking = speed > 0.5;
  } else if (speed < 1.2) {
    // Standing or very slow: step off in any direction.
    const a = t.accel0 * f * control;
    const dvx = dir.x * target - vx, dvz = dir.z * target - vz;
    const dl = Math.hypot(dvx, dvz), step = Math.min(dl, a * dt * 1.4);
    if (dl > 1e-6) { vx += (dvx / dl) * step; vz += (dvz / dl) * step; }
  } else {
    const vh = { x: vx / speed, z: vz / speed };
    const theta = Math.abs(angleDiff(headingOf(vh.x, vh.z), headingOf(dir.x, dir.z)));
    if (theta > 110 * D2R && speed > 3.2) {
      // Plant and brake before reversing direction.
      speed = Math.max(0, speed - t.brakeDecel * dt);
      vx = vh.x * speed; vz = vh.z * speed;
      braking = true;
    } else {
      // Speed along the path.
      if (speed < target) {
        const a = t.accel0 * f * control * Math.max(0.12, 1 - (speed / t.sprintSpeed) ** 2);
        speed = Math.min(target, speed + a * dt);
      } else if (speed > target) {
        const d = target < speed - 1.5 ? t.brakeDecel * 0.6 : t.coastDecel;
        speed = Math.max(target, speed - d * dt);
        braking = speed > target + 0.5;
      }
      // Turning into a bend costs speed above ~60°.
      if (theta > 60 * D2R) {
        speed = Math.max(0, speed - t.brakeDecel * 0.55 * ((theta - 60 * D2R) / (50 * D2R)) * dt);
        braking = true;
      }
      // Rotate the velocity towards the stick, limited by lateral grip.
      const maxTurn = ((t.lateralAccel * f * (0.5 + 0.5 * control)) / Math.max(speed, 0.8)) * dt;
      const cur = headingOf(vh.x, vh.z);
      const d = angleDiff(cur, headingOf(dir.x, dir.z));
      const turn = clamp(d, -maxTurn, maxTurn);
      turning = Math.abs(d) > 0.05;
      const h = cur + turn;
      vx = Math.sin(h) * speed; vz = Math.cos(h) * speed;
    }
  }

  // Body yaw.
  const newSpeed = Math.hypot(vx, vz);
  let wantYaw = s.yaw;
  if (mode.facing !== undefined) wantYaw = mode.facing;
  else if (newSpeed > 0.4) wantYaw = headingOf(vx, vz);
  else if (mag > 0.08 && control > 0) wantYaw = headingOf(dir.x, dir.z);
  const sprintT = clamp(newSpeed / t.sprintSpeed, 0, 1);
  let maxRate = (t.yawRateStand + (t.yawRateSprint - t.yawRateStand) * sprintT) * f;
  if (mode.kind === 'slide' || mode.kind === 'down') maxRate = 0.5;
  const dy = angleDiff(s.yaw, wantYaw);
  // First-order response with a hard rate limit (gives a real angular velocity).
  const wantRate = clamp(dy * 10, -maxRate, maxRate);
  const yawRate = s.yawRate + clamp(wantRate - s.yawRate, -40 * dt, 40 * dt);
  const yaw = s.yaw + clamp(yawRate * dt, -Math.abs(dy), Math.abs(dy));

  // Stamina.
  let stamina = s.stamina;
  if (newSpeed > t.runSpeed * 1.02) stamina -= t.staminaDrain * dt * (newSpeed / t.sprintSpeed);
  else if (newSpeed < t.jogSpeed) stamina += t.staminaRecover * dt;
  else stamina += t.staminaRecover * 0.3 * dt;
  stamina = clamp(stamina, 0, 1);

  return {
    vel: { x: vx, z: vz }, yaw, yawRate, stamina,
    accel: { x: (vx - s.vel.x) / dt, z: (vz - s.vel.z) / dt },
    targetSpeed: target, braking, turning,
  };
}
