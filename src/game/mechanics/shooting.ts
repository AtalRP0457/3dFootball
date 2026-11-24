// Shot planning: turns "who shoots, where, how hard, what kind" into a launch
// velocity and spin for the ball physics, including a realistic error model.
//
// Shot types
//   normal   instep strike, height and pace grow with power
//   power    full-charge laced shot: fastest, flattest, least accurate
//   low      quick tap: low driven shot with heavy topspin that skims
//   finesse  side-foot curler aimed inside the far post, sidespin
//   chip     lob over the keeper with backspin
//
// Error grows with: low finishing, high power, running speed, body facing
// away from the target, the ball being far from the foot, fatigue/injury,
// and AI difficulty. A powerful shot is fast, not automatically accurate.

import { GOAL, BALL_R } from '../constants.ts';
import type { Vec2, Vec3, ShotType, ShotContact, PhysicalProfile } from '../../types/game.ts';
import { solveKickToPoint, solveLoftedKick, gauss } from '../physics/ballPhysics.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The shooter as the planner needs him (a match Player satisfies this). */
export interface Shooter {
  pos: Vec2; vel: Vec2; face: Vec2; stamina?: number; injured?: boolean;
  phys: Pick<PhysicalProfile, 'runSpeed' | 'sprintMul' | 'shotAccuracy' | 'shotPower' | 'curve'>;
}
export interface ShotInput {
  p: Shooter; ball: { pos: Vec3 }; goalX: number; aimZ: number; power: number; type?: ShotType;
  errMul?: number; keeper?: Vec2 | null; penalty?: boolean; rng?: () => number;
}
export interface ShotPlan { vel: Vec3; top: number; side: number; sigma: number; type: ShotType; dir: number }

export const SHOT_TYPES: ShotType[] = ['normal', 'power', 'low', 'finesse', 'chip'];

/** Pick the type a human's release means: modifiers first, then charge. */
export function shotTypeFromCharge(charge: number, modifier?: ShotType | null): ShotType {
  if (modifier === 'finesse' || modifier === 'chip') return modifier;
  if (charge < 0.3) return 'low';
  if (charge > 0.88) return 'power';
  return 'normal';
}

/**
 * @param o {
 *   p        shooter (pos, vel, face, phys, stamina, injured)
 *   ball     {pos}
 *   goalX    x of the goal line being attacked
 *   aimZ     intended z across the goal mouth
 *   power    0.2..1
 *   type     one of SHOT_TYPES
 *   errMul   AI difficulty multiplier (1 for humans)
 *   keeper   opposing keeper position (for chips) or null
 *   penalty  true for a penalty kick
 *   rng      random source (defaults to Math.random)
 * }
 * @returns { vel:{x,y,z}, top, side, sigma, type }
 */
export function planShot(o: ShotInput): ShotPlan {
  const { p, ball, goalX, power, errMul = 1 } = o;
  const rng = o.rng || Math.random;
  const type: ShotType = o.type && SHOT_TYPES.includes(o.type) ? o.type : 'normal';
  const prof = p.phys;
  const dir = Math.sign(goalX) || 1;
  const half = GOAL.width / 2;

  let aimZ = clamp(o.aimZ, -half + 0.3, half - 0.3);
  if (type === 'finesse') {
    // Side-foot towards the far post.
    const far = Math.abs(ball.pos.z) > 0.8 ? -Math.sign(ball.pos.z) : (Math.sign(aimZ) || 1);
    aimZ = far * (half - 0.55);
  }

  const dx = goalX - ball.pos.x, dz = aimZ - ball.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ux = dx / dist, uz = dz / dist;

  // ----- error model -----
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const runFactor = clamp(speed / (prof.runSpeed * prof.sprintMul), 0, 1.2);
  const faceDot = clamp(p.face.x * ux + p.face.z * uz, -1, 1);
  const bodyAngle = Math.acos(faceDot);
  const ballDist = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
  const fatigue = (1 + (1 - (p.stamina ?? 1)) * 0.25) * (p.injured ? 1.3 : 1);
  const curve = prof.curve ?? 0.7;
  // Finesse accuracy depends on the curve attribute.
  const typeMul = ({ normal: 1, power: 1.7, low: 1.05, finesse: 0.8 * (1.35 - curve * 0.5), chip: 1.2 } as Record<ShotType, number>)[type];
  const sigma = (0.012 + (1 - prof.shotAccuracy) * 0.075)
    * (1 + power * power * 0.6) * typeMul
    * (1 + runFactor * 0.8)
    * (1 + (bodyAngle / (Math.PI / 2)) * 1.2)
    * (1 + Math.max(0, ballDist - 0.7) * 0.9)
    * (1 + dist / 60)
    * fatigue * errMul;
  const angErr = gauss(rng) * sigma;
  const c = Math.cos(angErr), s = Math.sin(angErr);
  let ex = ux * c - uz * s, ez = ux * s + uz * c;

  // ----- type-specific pace, height and spin -----
  const pw = prof.shotPower;
  let h, targetY, top, side = 0;
  if (o.penalty) {
    h = 17 + 10 * power;
    targetY = 0.3 + power * 1.3;
    top = 4;
  } else if (type === 'power') {
    h = 24 + 10 * power * (0.7 + 0.5 * pw);
    targetY = 1.1 + power * 0.6;
    top = 4;
  } else if (type === 'low') {
    // A tapped shot is a low, placed side-foot (~15-16 m/s); more charge drives it.
    h = 12 + 14 * Math.max(power, 0.25) * (0.8 + 0.4 * pw);
    targetY = 0.28;
    top = 28;
  } else if (type === 'finesse') {
    h = 15 + 7 * power * (0.8 + 0.4 * pw);
    targetY = 0.8 + power * 0.5;
    top = 3;
    // Curl from outside the post back in: spin sign depends on which way
    // the target is relative to the run of the ball.
    side = (26 + 22 * power) * (0.65 + curve * 0.5); // better curve, more bend
  } else if (type === 'chip') {
    h = 0;
    targetY = 0;
    top = -16;
  } else {
    h = 11 + 17 * power * (0.8 + 0.4 * pw);
    targetY = 0.45 + power * 1.25;
    top = 7 + power * 6;
  }
  // Height error (metres at the goal line), and a mishit adds spin.
  targetY = Math.max(0.1, targetY + gauss(rng) * sigma * (4 + dist * 0.12));
  top += gauss(rng) * sigma * 40;
  side += gauss(rng) * sigma * 60;

  let vy;
  if (type === 'chip') {
    // Drop just inside the goal, over a keeper off his line.
    const land = Math.max(4, dist - 0.2);
    const flight = 0.95 + land / 26;
    const k = solveLoftedKick(land, flight, top);
    h = k.h * (1 + gauss(rng) * sigma * 0.6);
    vy = k.vy;
  } else {
    // In the solver's frame the shot travels +x and positive `drift` is
    // along local +z, which in the world is L = (-ez, ex) for a shot along
    // (ex, ez). Sidespin > 0 curls towards -L.
    if (type === 'finesse') {
      // Bend back towards the centre of the goal: -L . (0, -aimZ) = ex * aimZ.
      side = Math.abs(side) * (ex * aimZ >= 0 ? 1 : -1);
    }
    const sol = solveKickToPoint(dist, h, targetY, top, side);
    vy = sol.vy;
    if (Math.abs(sol.drift) > 1e-4) {
      // Aim off so the curl brings the ball back onto the target.
      const lx = -ez, lz = ex;
      const ax = ex * dist - lx * sol.drift, az = ez * dist - lz * sol.drift;
      const al = Math.hypot(ax, az);
      ex = ax / al; ez = az / al;
    }
  }

  return {
    vel: { x: ex * h, y: vy, z: ez * h },
    top, side, sigma, type, dir,
  };
}

// =====================================================================
// Engine shots
// =====================================================================
// With the Rapier engine the ball's flight has drag (with the drag crisis),
// Magnus lift from the strike's spin and knuckling. A shot is planned in
// three steps:
//   1. Effort → pace and spin. The swing's effort (charge 0.25 … 1) sets the
//      foot speed; the ball leaves at ~1.2-1.3× the foot speed (the impact
//      of a ~1-2 kg effective foot on a 0.43 kg ball, e ≈ 0.5), plus part of
//      the run-up. Each technique trades pace for control: a side-foot
//      finesse (~17-25 m/s, 7-10 rev/s sidespin) curls, a laced drive
//      (~18-31 m/s) has a little topspin, a power shot (~30-36 m/s) is struck
//      through the middle (a big hitter's can knuckle), a low drive is struck
//      over the ball with heavy topspin, a chip is scooped with backspin.
//   2. Aim → target in the goal mouth (stick across the goal, effort sets
//      the height, as in FC), then the elevation and direction that make the
//      engine's own predicted flight cross the goal line there (Newton on
//      the predictor), so curl, dip and drag are all accounted for.
//   3. Error. The launch is perturbed by the player's error: the attribute
//      for the shot (finishing close in, long shots from range, curve for a
//      finesse, heading, volleys), effort, running pace, body shape (angle
//      between facing and the shot, leaning back), pressure, a first-time
//      strike (incoming pace, how far the ball is turned), fatigue, injury,
//      and the AI difficulty. Over-hitting (effort near full) skies the ball.

/** Engine flight predictor in match coordinates (MatchPhysics.flight). */
export type FlyFn = (pos: Vec3, vel: Vec3, spin: Vec3, horizon: number) => Array<{ t: number; x: number; y: number; z: number }>;

export interface EngineShooter extends Shooter {
  phys: Shooter['phys'] & Partial<Pick<PhysicalProfile, 'finishing' | 'longShots' | 'heading' | 'balance' | 'firstTouch'>>;
}

export interface EngineShotInput {
  p: EngineShooter;
  ball: { pos: Vec3; vel?: Vec3 };
  goalX: number;
  /** Target across the goal mouth (m, world z), and optionally its height. */
  aimZ: number;
  aimY?: number;
  /** Effort 0.25 (tap) … 1 (full). */
  power: number;
  type?: ShotType;
  /** Low-driven modifier (all types but the chip). */
  lowDriven?: boolean;
  /** How the ball is met. */
  contact?: ShotContact;
  /** Distance (m) to the nearest opponent in front of the shooter. */
  pressure?: number;
  penalty?: boolean;
  errMul?: number;
  keeper?: Vec2 | null;
  rng?: () => number;
  fly: FlyFn;
}

export interface EngineShotPlan {
  vel: Vec3; top: number; side: number; sigma: number; type: ShotType; dir: number;
  /** Where the solved (error-free) flight crosses the goal line, and its pace there. */
  target: { z: number; y: number }; speed: number;
  lowDriven: boolean; contact: ShotContact; knuckle: boolean;
}

const G = 9.81;

/** Match-frame spin vector for top/side spin about the direction of travel (same as setKickSpin). */
export function spinVector(vx: number, vz: number, top: number, side: number): Vec3 {
  const h = Math.hypot(vx, vz);
  if (h < 1e-6) return { x: 0, y: side, z: 0 };
  return { x: (vz / h) * top, y: side, z: (-vx / h) * top };
}

/** Where a predicted flight first crosses the goal line x = goalX. */
export function goalLineCrossing(path: Array<{ t: number; x: number; y: number; z: number }>, goalX: number): { t: number; y: number; z: number } | null {
  const dir = Math.sign(goalX) || 1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if ((a.x - goalX) * dir < 0 && (b.x - goalX) * dir >= 0) {
      const u = (goalX - a.x) / ((b.x - a.x) || 1e-9);
      return { t: a.t + (b.t - a.t) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    }
  }
  return null;
}

/** Shot accuracy (0..1) for this shot: the attribute that governs it. */
function shotSkill(p: EngineShooter, dist: number, type: ShotType, contact: ShotContact, penalty: boolean): number {
  const ph = p.phys;
  const base = ph.shotAccuracy;
  const fin = ph.finishing ?? base, lng = ph.longShots ?? base;
  // Finishing close in, long shots from range (FC: "Long Shots" governs 20 m+).
  const w = clamp((dist - 14) / 12, 0, 1);
  let s = (fin * (1 - w) + lng * w) * 0.75 + base * 0.25;
  if (type === 'finesse') s = s * 0.6 + (ph.curve ?? 0.7) * 0.4;
  if (contact === 'header') s = (ph.heading ?? base) * 0.8 + base * 0.2;
  if (contact === 'volley') s = s * 0.7 + (ph.balance ?? 0.7) * 0.15 + (ph.firstTouch ?? 0.7) * 0.15;
  if (penalty) s = fin * 0.6 + base * 0.4;
  return clamp(s, 0.05, 1);
}

/**
 * Effort → launch pace (m/s) and spin (rad/s) for a shot, before error.
 * `along` is the shooter's speed along the shot (run-up into the ball).
 */
export function shotPaceAndSpin(type: ShotType, power: number, prof: EngineShooter['phys'], opts: {
  lowDriven?: boolean; contact?: ShotContact; penalty?: boolean; along?: number; incoming?: number; dist?: number; stamina?: number; knuckleRoll?: number;
}): { speed: number; top: number; side: number; knuckle: boolean } {
  const sp = prof.shotPower;
  const pw = clamp(power, 0.2, 1);
  const curve = prof.curve ?? 0.7;
  let speed: number, top: number, side = 0, knuckle = false;
  if (opts.penalty) {
    // Placed side-foot when soft, laced when struck hard.
    speed = 15 + (10 + 4 * sp) * pw;
    top = 12 + 6 * pw;
  } else if (type === 'power') {
    speed = 18 + (12 + 7 * sp) * pw;
    // Struck through the middle of the ball: little spin. A big hitter from
    // range can take almost all of it off: a knuckleball.
    const canKnuckle = sp > 0.78 && (opts.dist ?? 0) > 20 && pw > 0.8;
    knuckle = canKnuckle && (opts.knuckleRoll ?? 1) < (sp - 0.78) * 4;
    top = knuckle ? 2.5 : 14;
  } else if (type === 'finesse') {
    speed = 13 + (8 + 4 * sp) * pw;
    top = 6;
    side = (40 + 24 * curve) * (0.75 + 0.25 * pw); // ~6.5-10 rev/s
  } else if (type === 'chip') {
    speed = 0; // solved from the flight
    top = -(18 + 12 * pw);
  } else {
    // Laces (and the tapped placed finish).
    speed = 13 + (13 + 6 * sp) * Math.pow(pw, 0.85);
    // An instep drive carries ~2-3 rev/s of topspin (a knuckler has < 1).
    top = 12 + 8 * pw;
  }
  if (opts.lowDriven && type !== 'chip') {
    // Over the ball: heavy topspin, kept low; a fraction slower.
    speed *= 0.96;
    top = 12 + 8 * pw;
    side *= 0.75;
  }
  if (opts.contact === 'header') {
    // Pace from the neck and the incoming ball (redirected).
    const hd = prof.heading ?? prof.shotAccuracy;
    speed = clamp(7 + 10 * pw * (0.6 + 0.4 * hd) + 0.35 * (opts.incoming ?? 0), 6, 22);
    top = 0; side = 0;
  } else if (opts.contact === 'volley') {
    speed = Math.min(36, speed * 0.95 + 0.15 * (opts.incoming ?? 0));
    top = 10;
  }
  if (type !== 'chip' && opts.contact !== 'header') {
    // Running onto it adds part of the body's momentum (not for a penalty: no run-up speed to speak of).
    speed += clamp(opts.along ?? 0, -2, 9) * 0.3;
  }
  speed *= 0.9 + 0.1 * (opts.stamina ?? 1);
  return { speed, top, side, knuckle };
}

/** Plan a shot on the engine (see the section comment). */
export function planEngineShot(o: EngineShotInput): EngineShotPlan {
  const { p, ball, goalX, power, errMul = 1 } = o;
  const rng = o.rng || Math.random;
  const contact: ShotContact = o.contact ?? 'ground';
  let type: ShotType = o.type && SHOT_TYPES.includes(o.type) ? o.type : 'normal';
  if (contact !== 'ground' && type === 'chip') type = 'normal';
  const lowDriven = !!o.lowDriven && type !== 'chip' && contact !== 'header';
  const penalty = !!o.penalty;
  const prof = p.phys;
  const dir = Math.sign(goalX) || 1;
  const half = GOAL.width / 2;
  const pw = clamp(power, 0.2, 1);

  // ----- target in the goal mouth -----
  let aimZ = clamp(o.aimZ, -half + 0.3, half - 0.3);
  if (type === 'finesse' && !penalty) {
    const far = Math.abs(ball.pos.z) > 0.8 ? -Math.sign(ball.pos.z) : (Math.sign(aimZ) || 1);
    // Inside the far post, unless the stick asked for the near side.
    if (Math.sign(aimZ) !== far || Math.abs(aimZ) < half * 0.5) aimZ = far * (half - 0.6);
  }
  let aimY: number;
  if (o.aimY !== undefined) aimY = o.aimY;
  else if (penalty) aimY = 0.25 + 1.9 * Math.pow(pw, 1.5);
  else if (lowDriven) aimY = 0.42; // in under the keeper's hands, still in the air (a skidding ball loses its pace)
  else if (contact === 'header') aimY = 0.35 + 0.5 * (1 - pw);
  else if (type === 'power') aimY = 0.8 + 0.8 * pw;
  else if (type === 'finesse') aimY = 0.7 + 1.1 * pw;
  else if (type === 'chip') aimY = 1.5;
  else if (contact === 'volley') aimY = 0.6 + 1.2 * pw;
  else aimY = 0.3 + 1.7 * Math.pow(pw, 1.6);
  aimY = clamp(aimY, BALL_R + 0.02, GOAL.height - 0.22);

  const dx = goalX - ball.pos.x, dz = aimZ - ball.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ux = dx / dist, uz = dz / dist;

  // ----- effort → pace and spin -----
  const along = p.vel.x * ux + p.vel.z * uz;
  const inV = o.ball.vel ? Math.hypot(o.ball.vel.x - p.vel.x, o.ball.vel.y, o.ball.vel.z - p.vel.z) : 0;
  const ps = shotPaceAndSpin(type, pw, prof, {
    lowDriven, contact, penalty, along: penalty ? 0 : along, incoming: inV, dist, stamina: p.stamina, knuckleRoll: rng(),
  });
  let { speed } = ps;
  const { top, knuckle } = ps;
  let side = ps.side;
  if (side !== 0) {
    // Curl back towards the middle of the goal: side > 0 curls towards
    // (fz, -fx) for a flight along (fx, fz).
    const lz = -ux; // z component of the curl direction for side > 0
    side = Math.abs(side) * (((0 - aimZ) * lz) >= 0 ? 1 : -1);
  }

  // ----- solve the launch so the predicted flight crosses at the target -----
  const pos = ball.pos;
  const horizon = Math.min(4, dist / 8 + 1.2);
  const cross = (speedV: number, elev: number, yaw: number) => {
    const ce = Math.cos(elev);
    const v = { x: Math.cos(yaw) * ce * speedV, y: Math.sin(elev) * speedV, z: Math.sin(yaw) * ce * speedV };
    const path = o.fly(pos, v, spinVector(v.x, v.z, top, side), type === 'chip' ? 4.5 : horizon);
    const c = goalLineCrossing(path, goalX);
    if (c) return c;
    // Never reached the line (fell short): a point well below, beside the end.
    const last = path[path.length - 1];
    return { t: Infinity, y: -1 - Math.max(0, (goalX - last.x) * dir) * 0.3, z: last.z };
  };
  // Robust solve: bisection on the vertical control (elevation, or pace for
  // a chip) for the crossing height, then a secant step on the direction
  // for the crossing point across the goal; repeated until both converge.
  // (Bounces make the crossing height non-monotonic far from the answer, so
  // plain Newton can oscillate.)
  const dbg = typeof process !== 'undefined' && !!process.env?.DEBUG_SOLVE;
  const yaw0 = Math.atan2(uz, ux);
  let elev: number, yaw = yaw0;
  const chip = type === 'chip';
  if (chip) elev = ((o.keeper ? 38 + clamp(8 - Math.abs(o.keeper.x - pos.x) * 0.25, 0, 8) : 40) * Math.PI) / 180;
  else elev = Math.atan2(aimY - pos.y, dist);
  for (let k = 0; k < 4; k++) {
    // Vertical: bisection.
    let lo = chip ? 5 : -0.07, hi = chip ? 30 : 0.75;
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) / 2;
      const c = chip ? cross(m, elev, yaw) : cross(speed, m, yaw);
      if (c.y < aimY) lo = m; else hi = m;
    }
    if (chip) speed = (lo + hi) / 2; else elev = (lo + hi) / 2;
    // Across: secant on yaw.
    let c0 = cross(speed, elev, yaw);
    for (let i = 0; i < 3 && Math.abs(c0.z - aimZ) > 0.02; i++) {
      const c1 = cross(speed, elev, yaw + 0.004);
      const d = (c1.z - c0.z) / 0.004;
      if (Math.abs(d) < 1e-3) break;
      yaw -= clamp((c0.z - aimZ) / d, -0.1, 0.1);
      c0 = cross(speed, elev, yaw);
    }
    if (dbg) console.log('solve', k, { speed: speed.toFixed(2), elev: (elev * 57.3).toFixed(2), yaw: (yaw * 57.3).toFixed(2), y: c0.y.toFixed(2), z: c0.z.toFixed(2), t: c0.t.toFixed(2) });
    if (Math.abs(c0.y - aimY) < 0.04 && Math.abs(c0.z - aimZ) < 0.04) break;
  }

  // ----- error -----
  const skill = shotSkill(p, dist, type, contact, penalty);
  const runTop = prof.runSpeed * prof.sprintMul;
  const runFactor = clamp(Math.hypot(p.vel.x, p.vel.z) / runTop, 0, 1.2);
  const faceDot = clamp(p.face.x * ux + p.face.z * uz, -1, 1);
  const bodyAngle = Math.acos(faceDot);
  const ballDist = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);
  const fatigue = (1 + (1 - (p.stamina ?? 1)) * 0.3) * (p.injured ? 1.3 : 1);
  const pressure = o.pressure ?? 9;
  const press = clamp((2.6 - pressure) / 2.2, 0, 1) * (1.15 - skill * 0.5);
  const firstTime = o.ball.vel ? clamp(inV / 22, 0, 1.2) : 0;
  const typeMul = penalty ? 0.7 + 0.5 * pw * pw
    : contact === 'header' ? 1.5 : contact === 'volley' ? 1.6
      : ({ normal: 0.75 + 0.6 * pw * pw, power: 1.3 + 0.3 * pw, low: 1.05, finesse: 0.85 * (1.25 - 0.4 * (prof.curve ?? 0.7)), chip: 1.7 } as Record<ShotType, number>)[type];
  const sigma = clamp((0.010 + (1 - skill) * 0.05)
    * typeMul * (lowDriven ? 1.08 : 1)
    * (1 + runFactor * 0.55)
    // Body shape: shooting away from where he faces is hard on the run; a
    // player standing on the ball has a moment to open his body.
    * (1 + Math.max(0, bodyAngle - 0.45) / (Math.PI / 2) * (0.45 + 0.85 * clamp(runFactor * 1.4, 0, 1)))
    * (1 + Math.max(0, ballDist - 0.75) * 0.8)
    * (1 + press * 0.6)
    * (1 + firstTime * 0.8)
    * (1 + dist / 45)
    * fatigue * errMul, 0.004, 0.2);
  if (typeof process !== 'undefined' && process.env?.DEBUG_SHOT) console.log('sigma factors', { skill: skill.toFixed(2), typeMul: typeMul.toFixed(2), run: runFactor.toFixed(2), body: (bodyAngle * 57.3).toFixed(0), ballDist: ballDist.toFixed(2), press: press.toFixed(2), firstTime: firstTime.toFixed(2), dist: dist.toFixed(1), fatigue: fatigue.toFixed(2), errMul });
  // Height: the same spread, plus leaning back when striking hard on the run,
  // and over-hitting near full effort skies it (less for composed finishers).
  const lean = 0.012 * runFactor * pw * pw * (1.2 - (prof.balance ?? 0.7));
  const over = Math.max(0, pw - 0.9) * 0.09 * (1.2 - skill * 0.7) * (penalty ? 1.6 : 1);
  const noErr = typeof process !== 'undefined' && !!process.env?.NO_SHOT_ERR;
  const elevErr = noErr ? 0 : gauss(rng) * sigma * 0.72 + lean + over;
  const yawErr = noErr ? 0 : gauss(rng) * sigma;
  const speedErr = noErr ? 1 : 1 + gauss(rng) * 0.03 * (1 - skill);
  const topN = noErr ? top : top + gauss(rng) * sigma * 30;
  const sideN = noErr ? side : side + gauss(rng) * sigma * 40;

  const e2 = elev + elevErr, y2 = yaw + yawErr, s2 = speed * speedErr;
  const ce = Math.cos(e2);
  return {
    vel: { x: Math.cos(y2) * ce * s2, y: Math.sin(e2) * s2, z: Math.sin(y2) * ce * s2 },
    top: topN, side: sideN, sigma, type, dir,
    target: { z: aimZ, y: aimY }, speed: s2, lowDriven, contact, knuckle,
  };
}
