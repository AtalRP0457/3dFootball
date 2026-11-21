// Momentum-based player locomotion, shared by human and AI players.
//
// A player has a running line (velocity direction) and a body orientation
// (p.face). The running line can only bend at a rate that drops with speed,
// sharp changes of direction force the player to brake first, speed builds
// up along an acceleration curve, and the body turns with a limited angular
// speed. Everything is integrated per fixed step with dt, so results do not
// depend on the frame rate.

import type { Vec2, PhysicalProfile } from '../../types/game.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Anything that moves like a player. */
export interface Mover { pos: Vec2; vel: Vec2; face: Vec2; acc?: Vec2 }
/** Movement command for one step. */
export interface MoveCommand { dx: number; dz: number; top: number; accelMul?: number; turnMul?: number }
/** A body taking part in player-player contacts. */
export interface ContactBody {
  onPitch: boolean; sentOff: boolean; pos: Vec2; vel: Vec2; stagger?: number;
  phys?: { mass: number; balance: number } | null;
}
type Turning = Pick<PhysicalProfile, 'turnBase' | 'turnFalloff'>;
type Locomotion = Pick<PhysicalProfile, 'accel' | 'brake' | 'coast' | 'turnBase' | 'turnFalloff' | 'grip' | 'yawRate'>;
const TAU = Math.PI * 2;

function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Below this speed the player is "on the spot" and can step in any direction. */
export const PIVOT_SPEED = 0.6;

/** Max rate the running line can bend at a given speed (rad/s). */
export function turnRate(prof: Turning, speed: number): number {
  return prof.turnBase / (1 + speed * prof.turnFalloff);
}

/** Forward acceleration available at the current speed (fades near top speed). */
export function accelAt(prof: Pick<PhysicalProfile, 'accel'>, speed: number, top: number): number {
  if (top <= 0) return 0;
  return prof.accel * Math.max(0.22, 1 - speed / (top * 1.12));
}

/**
 * Advance one player's motion by dt.
 * cmd = {
 *   dx, dz      desired direction (any length; magnitude 0..1 is the speed fraction)
 *   top         top speed for this step (already includes sprint/fatigue/etc.)
 *   accelMul    multiplier for acceleration (e.g. dribbling, keeper dive)
 *   turnMul     multiplier for turning (e.g. keeper dive, stagger)
 * }
 * Mutates p.vel, p.pos, p.face and writes p.acc (for body lean in rendering).
 */
export function stepLocomotion(p: Mover, prof: Locomotion, cmd: MoveCommand, dt: number): void {
  const vx0 = p.vel.x, vz0 = p.vel.z;
  let s = Math.hypot(vx0, vz0);
  let mag = Math.hypot(cmd.dx, cmd.dz);
  let ddx = 0, ddz = 0;
  if (mag > 1e-4) { ddx = cmd.dx / mag; ddz = cmd.dz / mag; }
  mag = Math.min(1, mag);
  const top = Math.max(0, cmd.top);
  const want = mag > 0.02 ? mag * top : 0;
  const accelMul = cmd.accelMul ?? 1;
  const turnMul = cmd.turnMul ?? 1;

  if (s < PIVOT_SPEED) {
    // On the spot: step straight into the new direction, limited by
    // acceleration (no running line to bend yet).
    const tx = ddx * want, tz = ddz * want;
    let dvx = tx - vx0, dvz = tz - vz0;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = (want > 0 ? prof.accel * accelMul : prof.coast) * dt;
    if (dv > maxDv) { dvx *= maxDv / dv; dvz *= maxDv / dv; }
    p.vel.x = vx0 + dvx;
    p.vel.z = vz0 + dvz;
  } else {
    let hx = vx0 / s, hz = vz0 / s;
    let target = want;
    let yawRateUsed = 0;
    if (want > 0) {
      const heading = Math.atan2(hz, hx);
      const delta = wrapAngle(Math.atan2(ddz, ddx) - heading);
      const maxTurn = turnRate(prof, s) * turnMul * dt;
      const rot = clamp(delta, -maxTurn, maxTurn);
      const nh = heading + rot;
      hx = Math.cos(nh); hz = Math.sin(nh);
      yawRateUsed = Math.abs(rot) / dt;
      // What is left of the turn decides how much of the wanted speed can be
      // carried along the current line. Past ~90 degrees the player plants
      // and brakes, which in turn lets him turn tighter.
      const rest = Math.abs(delta - rot);
      target *= Math.max(0, Math.cos(Math.min(rest, Math.PI / 2)));
      // Centripetal limit: carving hard at pace costs speed.
      if (yawRateUsed > 1e-3) target = Math.min(target, Math.max(PIVOT_SPEED, (prof.grip * turnMul) / yawRateUsed));
    }
    if (target > s) {
      s = Math.min(target, s + accelAt(prof, s, top) * accelMul * dt);
    } else {
      const dec = (want > 0 ? prof.brake : prof.coast) * dt;
      s = Math.max(target, s - dec);
    }
    p.vel.x = hx * s;
    p.vel.z = hz * s;
  }

  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;

  // Acceleration in world space, lightly smoothed, for body lean.
  const ax = (p.vel.x - vx0) / dt, az = (p.vel.z - vz0) / dt;
  if (!p.acc) p.acc = { x: 0, z: 0 };
  const k = Math.min(1, dt * 12);
  p.acc.x += (ax - p.acc.x) * k;
  p.acc.z += (az - p.acc.z) * k;

  turnBody(p, prof, ddx, ddz, want > 0, dt, turnMul);
}

/** Rotate the body towards the running line (or the stick when standing). */
function turnBody(p: Mover, prof: Pick<PhysicalProfile, 'yawRate'>, ddx: number, ddz: number, hasInput: boolean, dt: number, turnMul: number): void {
  const sp = Math.hypot(p.vel.x, p.vel.z);
  let tx, tz;
  if (sp > PIVOT_SPEED) { tx = p.vel.x / sp; tz = p.vel.z / sp; }
  else if (hasInput) { tx = ddx; tz = ddz; }
  else return;
  const cur = Math.atan2(p.face.z, p.face.x);
  const delta = wrapAngle(Math.atan2(tz, tx) - cur);
  const max = prof.yawRate * turnMul * dt;
  const a = cur + clamp(delta, -max, max);
  p.face.x = Math.cos(a);
  p.face.z = Math.sin(a);
}

/**
 * Player-vs-player contact. Separates overlapping bodies weighted by mass,
 * removes the closing velocity (an almost inelastic shoulder contact) and
 * makes the weaker / less balanced player stagger on a heavy hit.
 * `fixed(p)` marks players that cannot be moved (keeper holding the ball).
 * Returns the number of heavy contacts (for events/tests).
 */
export function resolvePlayerContacts<T extends ContactBody>(
  players: T[], radius: number, fixed: (p: T) => boolean,
  onHeavy?: (loser: T, other: T, closingSpeed: number) => void,
): number {
  const min = radius * 2;
  let heavy = 0;
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (!a.onPitch || a.sentOff) continue;
    for (let j = i + 1; j < players.length; j++) {
      const c = players[j];
      if (!c.onPitch || c.sentOff) continue;
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const aFixed = fixed(a), cFixed = fixed(c);
      const ia = aFixed ? 0 : 1 / (a.phys?.mass || 75);
      const ic = cFixed ? 0 : 1 / (c.phys?.mass || 75);
      const isum = ia + ic;
      if (isum === 0) continue;
      const overlap = min - d;
      a.pos.x -= nx * overlap * (ia / isum); a.pos.z -= nz * overlap * (ia / isum);
      c.pos.x += nx * overlap * (ic / isum); c.pos.z += nz * overlap * (ic / isum);
      // Closing speed along the contact normal.
      const vn = (c.vel.x - a.vel.x) * nx + (c.vel.z - a.vel.z) * nz;
      if (vn < 0) {
        const e = 0.1;
        const jimp = (-(1 + e) * vn) / isum;
        a.vel.x -= nx * jimp * ia; a.vel.z -= nz * jimp * ia;
        c.vel.x += nx * jimp * ic; c.vel.z += nz * jimp * ic;
        if (-vn > 3.2) {
          heavy++;
          // Stability = balance x mass; the less stable player is knocked off
          // his stride for a moment, proportional to the impact.
          const sa = (a.phys?.balance ?? 0.6) * (a.phys?.mass ?? 75) + (aFixed ? 1e3 : 0);
          const sc = (c.phys?.balance ?? 0.6) * (c.phys?.mass ?? 75) + (cFixed ? 1e3 : 0);
          const loser = sa < sc ? a : c;
          const ratio = Math.min(sa, sc) / Math.max(sa, sc);
          const t = clamp((-vn - 3.2) * 0.12 + (1 - ratio) * 0.5, 0.15, 0.6);
          loser.stagger = Math.max(loser.stagger || 0, t);
          if (onHeavy) onHeavy(loser, a === loser ? c : a, -vn);
        }
      }
    }
  }
  return heavy;
}
