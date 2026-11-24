// Shot-stopping: a keeper physically reaching for the ball instead of a dice
// roll when it comes near him.
//
//  1. Reaction. After the strike he needs a moment to read it: ~0.2 s for an
//     elite keeper, ~0.33 s for a poor one (reflexes), longer when the shot
//     comes through bodies (screened). Until then he can only save what is hit
//     at him. Penalties are different: he commits at the kick on a guess.
//  2. The dive. He reads the flight (the engine's predicted path; a knuckling
//     ball moves off it, which the prediction cannot know) and dives for the
//     point where it passes him. A dive is a push-off and a stretch: the hands'
//     lateral reach grows from ~0.75 m (arms) to 0.75 + 1.4-2.2 m (diving,
//     height) over ~0.6-0.75 s; top corners need more stretch than low ones.
//     Biomechanics studies put a dive to the low corner at ~0.6 s and the top
//     corner at ~1 s from the kick, the ball taking 0.4-0.6 s from the spot.
//     Once committed the direction is fixed: a deflection or a knuckle late in
//     the flight beats him.
//  3. The contact. When the ball reaches his plane, the margin between the
//     reach he has at that instant and the reach he needs, the pace of the
//     ball and his handling decide: held (at him, slower, good hands), parried
//     away from danger (wide, or over the bar), or fingertips that only bend
//     it (it can still go in, or onto the post).

import type { Vec2, Vec3, KeeperProfile } from '../../types/game.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Fraction of the full dive stretch at normalised time x: between a push-off ease-in and a quick start. */
const stretch = (x: number) => 0.5 * x * x * (3 - 2 * x) + 0.5 * x * (2 - x);

/** Arm reach (m) from the body's centre line, standing. */
export const ARM_REACH = 0.75;

export interface KeeperBody { pos: Vec2; heightCm?: number; keeper: KeeperProfile }

/** Reaction time (s) to a shot: reflexes, a screen, the AI difficulty bonus (−0.1 … +0.1). */
export function reactionTime(k: KeeperProfile, screened: boolean, bonus = 0): number {
  // Reading the shooter's body before contact (anticipation, positioning)
  // takes part of the visual reaction away: 0.13 s elite … 0.25 s poor.
  return clamp(0.11 + 0.1 * (1 - k.reflexes) + 0.04 * (1 - k.positioning) + (screened ? 0.12 : 0) - bonus * 0.3, 0.1, 0.6);
}

/** Dive capability: full extra stretch (m) and the time (s) to reach it. */
export function diveSpec(k: KeeperProfile, heightCm = 188): { dmax: number; td: number } {
  return {
    dmax: 1.35 + 0.75 * k.diving + clamp((heightCm - 188) * 0.012, -0.15, 0.15),
    td: 0.74 - 0.16 * k.diving,
  };
}

/** Lateral reach of the hands (m from where the dive started) τ seconds into it. */
export function reachAt(k: KeeperProfile, heightCm: number | undefined, tau: number): number {
  const { dmax, td } = diveSpec(k, heightCm);
  const x = clamp((tau - 0.05) / td, 0, 1);
  // Push-off then stretch: the first step is quick, the full stretch comes late.
  return ARM_REACH + dmax * stretch(x);
}

/** Height (m) his hands can get to τ seconds into a dive (or standing, τ = 0). */
export function heightAt(k: KeeperProfile, tau: number): number {
  const x = clamp((tau - 0.05) / 0.45, 0, 1);
  return k.reach + 0.45 * x;
}

/** Time (s) into a dive at which his reach first covers `need` metres (Infinity if never). */
export function timeToReach(k: KeeperProfile, heightCm: number | undefined, need: number): number {
  const { dmax, td } = diveSpec(k, heightCm);
  const r = need - ARM_REACH;
  if (r <= 0) return 0;
  if (r > dmax) return Infinity;
  // Invert the smoothstep by bisection.
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (stretch(m) < r / dmax) lo = m; else hi = m; }
  return 0.05 + ((lo + hi) / 2) * td;
}

/**
 * Where a predicted flight passes the keeper: the first point at which it
 * is level with him along its own direction. `lat` is the signed lateral
 * offset from him (+ = to his left as he faces the ball).
 */
export function passPoint(path: Array<{ t: number; x: number; y: number; z: number }>, at: Vec2): { t: number; x: number; y: number; z: number; lat: number; n: Vec2 } | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const nx = b.x - a.x, nz = b.z - a.z, nl = Math.hypot(nx, nz);
    if (nl < 1e-6) continue;
    const ux = nx / nl, uz = nz / nl;
    const da = (a.x - at.x) * ux + (a.z - at.z) * uz, db = (b.x - at.x) * ux + (b.z - at.z) * uz;
    if (da < 0 && db >= 0) {
      const u = -da / (db - da);
      const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = a.y + (b.y - a.y) * u;
      // Left of the keeper facing the ball (facing −u): left = (uz, −ux)·…
      const lat = (x - at.x) * -uz + (z - at.z) * ux;
      return { t: a.t + (b.t - a.t) * u, x, y, z, lat, n: { x: ux, z: uz } };
    }
  }
  return null;
}

export type SaveResult =
  | { result: 'beaten'; why: string }
  | { result: 'catch'; q: number }
  | { result: 'parry' | 'tip'; vel: Vec3; q: number };

/**
 * The ball reaches the keeper's plane: can his hands get there, and what
 * happens. `need` is the lateral distance (signed: + left), `y` the height,
 * `tau` the time since his dive started (negative: still reacting),
 * `diveDir` +1 left / −1 right / 0 set (no dive), `vel` the ball's velocity,
 * `goal` the goal line x and which way is out of the goal (`out`, ±1 in x).
 */
export function resolveSave(o: {
  k: KeeperProfile; heightCm?: number; need: number; y: number; tau: number; diveDir: number; vel: Vec3;
  ball: Vec3; goalX: number; out: number; rng: () => number;
  /** Set close to the shooter (spread to block). */
  spread?: boolean;
}): SaveResult {
  const { k, need, y, tau, diveDir, vel } = o;
  const speed = Math.hypot(vel.x, vel.y, vel.z);
  const abs = Math.abs(need);
  let reach: number, high: number;
  if (tau < 0) {
    // Still reading it: only a ball hit at him (hands, legs and body; a keeper
    // set close to the shooter is spread big).
    reach = o.spread ? 0.95 : 0.6; high = k.reach - 0.15;
    if (o.spread && y > 1.3) reach = 0.6;
  } else if (diveDir === 0) {
    // Set, stepping across: a short step and the arms.
    reach = ARM_REACH + 0.25 + Math.min(0.6, tau * 2.5); high = heightAt(k, tau * 0.6);
  } else {
    if (Math.sign(need) !== diveDir && abs > 0.45) return { result: 'beaten', why: 'wrong way' };
    reach = reachAt(k, o.heightCm, tau); high = heightAt(k, tau);
    // Stretching to a top corner is slower than a low dive.
    if (y > 1.8) reach *= 0.88;
  }
  if (y > high + 0.12) return { result: 'beaten', why: 'over his hands' };
  const margin = reach - abs;
  if (margin < 0) return { result: 'beaten', why: `${(-margin).toFixed(2)} m out of reach` };
  const q = clamp(margin / 0.8, 0, 1) * (0.7 + 0.3 * k.reflexes);
  // Held: at him, a slower ball, good hands; much less at full stretch.
  const atHim = abs < 0.6 && y < 1.9;
  const hold = k.handling * clamp(1.3 - speed / 26, 0, 1) * (atHim ? 1 : 0.3 + 0.6 * q) * (y > 2 ? 0.6 : 1);
  if (o.rng() < hold) return { result: 'catch', q };
  const out = o.out; // +1 or −1 in x: away from his goal
  const side = Math.sign(o.ball.z) || (o.rng() < 0.5 ? -1 : 1);
  if (q < 0.25 && !atHim) {
    // Fingertips: the ball keeps most of its pace and is only bent outward
    // (round the post, or up over the bar). It may still go in.
    const turn = (0.2 + 0.25 * q / 0.25) * (0.7 + 0.3 * k.diving);
    const v = { ...vel };
    if (y > 1.7) {
      v.y = Math.abs(v.y) * 0.4 + speed * Math.sin(turn) * 1.1;
      v.x *= 0.8; v.z *= 0.8;
    } else {
      const c = Math.cos(turn * side * Math.sign(vel.x || 1)), s = Math.sin(turn * side * Math.sign(vel.x || 1));
      v.x = (vel.x * c - vel.z * s) * 0.8; v.z = (vel.x * s + vel.z * c) * 0.8;
    }
    return { result: 'tip', vel: v, q };
  }
  // Parry away from danger: wide and back out (FC 26 deflection control),
  // over the bar when it is high; poor hands push it back into the middle.
  const pace = speed * (0.25 + 0.2 * q);
  const safe = 0.45 + 0.55 * k.handling;
  if (y > 1.9 && o.rng() < 0.7) {
    return { result: 'parry', vel: { x: -out * pace * 0.15, y: pace * 0.8 + 3, z: side * pace * 0.25 }, q };
  }
  const wide = o.rng() < safe;
  const vz = wide ? side * pace * (0.75 + 0.2 * o.rng()) : -side * pace * (0.3 + 0.4 * o.rng());
  const vx = out * pace * (wide ? 0.35 + 0.3 * o.rng() : 0.8);
  return { result: 'parry', vel: { x: vx, y: 1 + 2.5 * o.rng() * q, z: vz }, q };
}
