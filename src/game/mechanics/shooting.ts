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

import { GOAL } from '../constants.ts';
import type { Vec2, Vec3, ShotType, PhysicalProfile } from '../../types/game.ts';
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
    h = 25 + 9 * power * (0.7 + 0.5 * pw);
    targetY = 1.1 + power * 0.6;
    top = 4;
  } else if (type === 'low') {
    h = 18 + 9 * Math.max(power, 0.35) * (0.8 + 0.4 * pw);
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
    h = 16 + 12 * power * (0.8 + 0.4 * pw);
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
