// Ball physics: a spinning sphere with gravity, quadratic air drag, Magnus
// lift, ground bounce with friction (which trades velocity for spin and back)
// and rolling resistance. Pure functions on a plain ball object:
//   b = { pos:{x,y,z}, vel:{x,y,z}, spin:{x,y,z} }   spin in rad/s, world axes
//
// The rolling model (decel = ROLL_A + ROLL_B * v) has a closed form, which is
// what the physics integrates exactly *and* what passing / AI prediction use,
// so a pass weighted for 15 m really stops near 15 m.

import { BALL_R, GRAVITY } from '../constants.ts';
import type { Vec2, Vec3, BallPathPoint } from '../../types/game.ts';

/** The physical part of a ball: what these functions read and write. */
export interface BallBody { pos: Vec3; vel: Vec3; spin?: Vec3 }
export interface PlayerBodyShape { x: number; z: number; vx: number; vz: number; radius: number; height: number }

export const BALL = {
  // Quadratic drag per metre: a = DRAG_K * |v| * v. A real ball is ~0.013;
  // slightly lower keeps the arcade punch on long shots.
  DRAG_K: 0.009,
  // Magnus: a = MAGNUS_K * (spin x vel). 40 rad/s sidespin at 25 m/s gives
  // ~7 m/s^2 of curl.
  MAGNUS_K: 0.007,
  AIR_SPIN_DECAY: 0.35, // 1/s
  RESTITUTION: 0.64, // vertical energy kept on a bounce (grass)
  BOUNCE_MIN: 0.6, // vertical speed below which the ball settles into a roll
  FRICTION_MU: 0.42, // ground friction coefficient (impulse + sliding)
  ROLL_A: 2.4, // rolling resistance, m/s^2
  ROLL_B: 0.25, // speed-proportional rolling loss, 1/s
  GROUND_SIDESPIN_DECAY: 3.0, // 1/s
  // Inertia ratio I/(m r^2) of a thin-walled ball.
  INERTIA_K: 2 / 3,
  BODY_RESTITUTION: 0.32,
};

const TANGENT_MASS = 1 + 1 / BALL.INERTIA_K; // effective inverse-mass factor at the contact point

export function ensureSpin(b: BallBody): Vec3 {
  if (!b.spin) b.spin = { x: 0, y: 0, z: 0 };
  return b.spin;
}

export function isRolling(b: BallBody): boolean {
  return b.pos.y <= BALL_R + 1e-4 && b.vel.y === 0;
}

/** Spin that matches rolling without slipping at the current velocity. */
export function setRollingSpin(b: BallBody, sideSpin = 0): void {
  const w = ensureSpin(b);
  w.x = b.vel.z / BALL_R;
  w.z = -b.vel.x / BALL_R;
  w.y = sideSpin;
}

/**
 * Give the ball spin for a kick, in terms of the direction of travel.
 * top > 0 = topspin (dips), top < 0 = backspin (floats/checks up),
 * side > 0 spins about +y and curls the ball towards (up x forward).
 */
export function setKickSpin(b: BallBody, top: number, side: number): void {
  const w = ensureSpin(b);
  const h = Math.hypot(b.vel.x, b.vel.z);
  if (h < 1e-6) { w.x = w.y = w.z = 0; return; }
  const fx = b.vel.x / h, fz = b.vel.z / h;
  // Rolling forward is spin = (vz, 0, -vx) / R, so the topspin axis is (fz, 0, -fx).
  w.x = fz * top;
  w.z = -fx * top;
  w.y = side;
}

/** Friction impulse at the contact point, capped by mu * normal impulse. */
function contactFriction(b: BallBody, maxImpulsePerMass: number): number {
  const w = ensureSpin(b);
  // Velocity of the contact point (bottom of the ball).
  const sx = b.vel.x + BALL_R * w.z;
  const sz = b.vel.z - BALL_R * w.x;
  const slip = Math.hypot(sx, sz);
  if (slip < 1e-6) return 0;
  // Impulse/mass that would stop the slip entirely.
  let j = slip / TANGENT_MASS;
  if (j > maxImpulsePerMass) j = maxImpulsePerMass;
  const jx = (-sx / slip) * j, jz = (-sz / slip) * j;
  b.vel.x += jx; b.vel.z += jz;
  // Angular change: (r x J) / I with r = (0, -R, 0).
  const inv = 1 / (BALL.INERTIA_K * BALL_R);
  w.x += -jz * inv;
  w.z += jx * inv;
  return slip;
}

function stepAir(b: BallBody, dt: number): 'bounce' | null {
  const v = b.vel, w = ensureSpin(b);
  const sp = Math.hypot(v.x, v.y, v.z);
  const drag = BALL.DRAG_K * sp;
  const mx = BALL.MAGNUS_K * (w.y * v.z - w.z * v.y);
  const my = BALL.MAGNUS_K * (w.z * v.x - w.x * v.z);
  const mz = BALL.MAGNUS_K * (w.x * v.y - w.y * v.x);
  v.x += (-drag * v.x + mx) * dt;
  v.y += (-drag * v.y + my - GRAVITY) * dt;
  v.z += (-drag * v.z + mz) * dt;
  const decay = Math.exp(-BALL.AIR_SPIN_DECAY * dt);
  w.x *= decay; w.y *= decay; w.z *= decay;
  b.pos.x += v.x * dt;
  b.pos.y += v.y * dt;
  b.pos.z += v.z * dt;
  if (b.pos.y <= BALL_R) {
    b.pos.y = BALL_R;
    if (v.y < -BALL.BOUNCE_MIN) {
      const vin = -v.y;
      // Harder impacts lose a little more energy.
      const e = BALL.RESTITUTION - Math.min(0.14, vin * 0.008);
      v.y = vin * e;
      contactFriction(b, BALL.FRICTION_MU * (1 + e) * vin);
      if (v.y < BALL.BOUNCE_MIN) v.y = 0;
      return 'bounce';
    }
    v.y = 0;
  }
  return null;
}

/** Closed-form ground speed after t seconds under decel = A + B v. */
export function rollSpeedAfter(v0: number, t: number): number {
  const { ROLL_A: A, ROLL_B: B } = BALL;
  if (v0 <= 0) return 0;
  const v = (v0 + A / B) * Math.exp(-B * t) - A / B;
  return v > 0 ? v : 0;
}

/** Time for a rolling ball to stop. */
export function rollStopTime(v0: number): number {
  const { ROLL_A: A, ROLL_B: B } = BALL;
  return v0 > 0 ? Math.log(1 + (B * v0) / A) / B : 0;
}

/** Distance rolled in t seconds (clamped at the stopping point). */
export function rollDistanceAfter(v0: number, t: number): number {
  const { ROLL_A: A, ROLL_B: B } = BALL;
  if (v0 <= 0) return 0;
  const tt = Math.min(t, rollStopTime(v0));
  return ((v0 + A / B) * (1 - Math.exp(-B * tt))) / B - (A / B) * tt;
}

export function rollDistance(v0: number): number {
  return rollDistanceAfter(v0, Infinity);
}

/** Launch speed for a rolling ball to travel `d` metres before stopping. */
export function speedForRollDistance(d: number): number {
  if (d <= 0) return 0;
  let lo = 0, hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rollDistance(mid) < d) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function stepGround(b: BallBody, dt: number): null {
  const v = b.vel, w = ensureSpin(b);
  v.y = 0;
  b.pos.y = BALL_R;
  // Sliding friction pulls the ball towards rolling without slipping.
  contactFriction(b, BALL.FRICTION_MU * GRAVITY * dt);
  const sx = v.x + BALL_R * w.z, sz = v.z - BALL_R * w.x;
  const slipping = Math.hypot(sx, sz) > 0.05;
  // Rolling resistance, integrated exactly.
  const h = Math.hypot(v.x, v.z);
  if (h > 0) {
    const nh = rollSpeedAfter(h, dt);
    v.x *= nh / h; v.z *= nh / h;
  }
  if (!slipping) { w.x = v.z / BALL_R; w.z = -v.x / BALL_R; }
  w.y *= Math.exp(-BALL.GROUND_SIDESPIN_DECAY * dt);
  b.pos.x += v.x * dt;
  b.pos.z += v.z * dt;
  return null;
}

/** Advance a free ball by dt. Returns 'bounce' when it bounced this step. */
export function integrateBall(b: BallBody, dt: number): 'bounce' | null {
  ensureSpin(b);
  if (b.pos.y <= BALL_R + 1e-4 && b.vel.y <= 0) {
    b.vel.y = 0;
    return stepGround(b, dt);
  }
  return stepAir(b, dt);
}

/** Number of sub-steps so a fast ball never jumps further than `maxStep`. */
export function substepsFor(b: BallBody, dt: number, maxStep = 0.18): number {
  const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  return Math.max(1, Math.min(10, Math.ceil((sp * dt) / maxStep)));
}

/**
 * Collide the ball with a player's body, modelled as an upright cylinder
 * (x, z, radius, height) moving with (vx, vz). Returns true on contact.
 */
export function collideBallWithBody(b: BallBody, body: PlayerBodyShape): boolean {
  if (b.pos.y - BALL_R > body.height) return false;
  const dx = b.pos.x - body.x, dz = b.pos.z - body.z;
  const minD = body.radius + BALL_R;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minD * minD) return false;
  const d = Math.sqrt(d2) || 1e-4;
  const nx = d2 > 0 ? dx / d : 1, nz = d2 > 0 ? dz / d : 0;
  const rvx = b.vel.x - body.vx, rvz = b.vel.z - body.vz;
  const vn = rvx * nx + rvz * nz;
  b.pos.x = body.x + nx * minD;
  b.pos.z = body.z + nz * minD;
  if (vn >= 0) return false; // already separating
  const e = BALL.BODY_RESTITUTION;
  const tx = rvx - vn * nx, tz = rvz - vn * nz;
  b.vel.x = body.vx + tx * 0.8 - e * vn * nx;
  b.vel.z = body.vz + tz * 0.8 - e * vn * nz;
  // Chest/thigh contacts take pace off the ball vertically too.
  if (b.pos.y > BALL_R + 0.05) b.vel.y *= 0.6;
  const w = ensureSpin(b);
  w.x *= 0.5; w.y *= 0.5; w.z *= 0.5;
  return true;
}

/**
 * Where a ground ball will be after t seconds (uses the exact rolling model;
 * an airborne ball is projected along its horizontal velocity).
 */
export function predictGroundBall(b: BallBody, t: number): Vec2 {
  const h = Math.hypot(b.vel.x, b.vel.z);
  if (h < 0.05) return { x: b.pos.x, z: b.pos.z };
  const d = rollDistanceAfter(h, t);
  return { x: b.pos.x + (b.vel.x / h) * d, z: b.pos.z + (b.vel.z / h) * d };
}

/**
 * Find launch velocities so a kick lands `distance` metres away after about
 * `flightTime` seconds, including drag and the given spin. Simulates the same
 * integrator the match uses, so the result is consistent with real flight.
 * Returns { h, vy } (horizontal speed and vertical speed).
 */
export function solveLoftedKick(distance: number, flightTime: number, top = 0): { h: number; vy: number } {
  let h = distance / flightTime;
  let vy = (GRAVITY * flightTime) / 2;
  const sim = { pos: { x: 0, y: BALL_R, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
  const dt = 1 / 120;
  for (let iter = 0; iter < 6; iter++) {
    sim.pos.x = 0; sim.pos.y = BALL_R + 0.01; sim.pos.z = 0;
    sim.vel.x = h; sim.vel.y = vy; sim.vel.z = 0;
    setKickSpin(sim, top, 0);
    let t = 0;
    while (t < 8) {
      stepAir(sim, dt);
      t += dt;
      if (sim.pos.y <= BALL_R && t > 0.05) break; // first landing
    }
    const land = Math.max(0.1, sim.pos.x);
    h *= distance / land;
    vy *= flightTime / Math.max(0.05, t);
  }
  return { h, vy };
}

/** Stop the ball dead (restarts, stoppages): no velocity and no spin. */
export function stopBall(b: BallBody): void {
  b.vel.x = b.vel.y = b.vel.z = 0;
  const w = ensureSpin(b);
  w.x = w.y = w.z = 0;
}

/**
 * Simulate a copy of the free ball forward and sample its position every
 * `step` seconds up to `horizon`. AI and receivers read this, so prediction
 * matches the real flight including spin, bounces and rolling.
 * Returns an array of { t, x, y, z }.
 */
export function computeBallPath(b: BallBody, horizon = 3, step = 0.1, dt = 1 / 60): BallPathPoint[] {
  const sim = {
    pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z },
    vel: { x: b.vel.x, y: b.vel.y, z: b.vel.z },
    spin: b.spin ? { x: b.spin.x, y: b.spin.y, z: b.spin.z } : { x: 0, y: 0, z: 0 },
  };
  const path = [{ t: 0, x: sim.pos.x, y: sim.pos.y, z: sim.pos.z }];
  let t = 0, next = step;
  const still = () => sim.pos.y <= BALL_R + 1e-4 && sim.vel.y === 0 && Math.hypot(sim.vel.x, sim.vel.z) < 1e-3;
  while (t < horizon - 1e-9) {
    if (still()) {
      for (; next <= horizon + 1e-9; next += step) path.push({ t: next, x: sim.pos.x, y: sim.pos.y, z: sim.pos.z });
      break;
    }
    const n = substepsFor(sim, dt);
    for (let i = 0; i < n; i++) integrateBall(sim, dt / n);
    t += dt;
    if (t >= next - 1e-9) {
      path.push({ t: next, x: sim.pos.x, y: sim.pos.y, z: sim.pos.z });
      next += step;
    }
  }
  return path;
}

/** Interpolate a path from computeBallPath at time t. */
export function samplePath(path: BallPathPoint[] | null | undefined, t: number): BallPathPoint | null {
  if (!path || !path.length) return null;
  if (t <= 0) return path[0];
  const last = path[path.length - 1];
  if (t >= last.t) return last;
  const step = path[1].t - path[0].t;
  const i = Math.min(path.length - 2, Math.floor(t / step));
  const a = path[i], c = path[i + 1];
  const k = (t - a.t) / (c.t - a.t);
  return { t, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k };
}

/**
 * Vertical launch speed so a ball struck at horizontal speed `h` (with the
 * given top/side spin) is at height `targetY` when it has travelled
 * `distance` metres. Also returns the sideways drift caused by curl at that
 * distance (positive = towards up x forward), so the caller can aim off.
 * Uses the real integrator, including drag, Magnus and bounces.
 */
export function solveKickToPoint(distance: number, h: number, targetY: number, top = 0, side = 0): { vy: number; drift: number; time: number } {
  const dt = 1 / 120;
  let vy = 1 + targetY;
  let drift = 0, time = distance / Math.max(1, h);
  const sim = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
  for (let iter = 0; iter < 7; iter++) {
    sim.pos.x = 0; sim.pos.y = BALL_R + 0.01; sim.pos.z = 0;
    sim.vel.x = h; sim.vel.y = vy; sim.vel.z = 0;
    setKickSpin(sim, top, side);
    let t = 0, px = 0, py = sim.pos.y, pz = 0;
    while (sim.pos.x < distance && t < 5) {
      px = sim.pos.x; py = sim.pos.y; pz = sim.pos.z;
      integrateBall(sim, dt);
      t += dt;
      if (Math.hypot(sim.vel.x, sim.vel.z) < 0.5) break;
    }
    const span = sim.pos.x - px;
    const k = span > 1e-6 ? Math.min(1, Math.max(0, (distance - px) / span)) : 1;
    const y = py + (sim.pos.y - py) * k;
    drift = pz + (sim.pos.z - pz) * k;
    time = t - dt * (1 - k);
    vy += (targetY - y) / Math.max(0.15, time);
    if (vy < 0) vy = 0;
  }
  return { vy, drift, time };
}

/** Gaussian random number (mean 0, sd 1). */
export function gauss(rng: () => number = Math.random): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
