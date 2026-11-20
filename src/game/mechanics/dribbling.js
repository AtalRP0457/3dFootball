// Touch-based dribbling. The ball is never glued to the player: it is a
// free physical object that the owner keeps playing.
//
// - Slow (close control): many small, soft touches steer the ball to a spot
//   just in front of the feet. It lags behind sharp turns rather than snapping.
// - Running / sprinting: discrete touches knock the ball ahead; the faster
//   the player, the longer the touch. The player then runs onto it.
// - A ball that gets too far from its owner (a heavy touch, a sharp turn at
//   full speed) is lost and becomes a loose ball anyone can win.

import { BALL, setRollingSpin, gauss } from '../physics/ballPhysics.js';
import { BALL_R } from '../constants.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Speed below which the dribbler uses continuous close control. */
export const CLOSE_CONTROL_SPEED = 2.6;

/** How far in front of the body the ball sits/leads at a given speed. */
export function touchLead(p, speed) {
  const prof = p.phys;
  const run = prof.runSpeed;
  const sprintExtra = Math.max(0, speed - run * 1.02) * 0.4;
  const skill = 1.3 - prof.dribbling * 0.6; // good dribblers keep it closer
  return 0.62 + (speed * 0.12 + sprintExtra) * skill;
}

/** Distance from the body within which the player can strike the ball. */
export function kickReach(p) {
  return 1.25 + p.phys.control * 0.35;
}

export function canKick(p, b) {
  if (p.mustPass || p.holding) return true;
  const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
  return d <= kickReach(p) && b.pos.y < 0.9;
}

/** The direction the dribbler wants to take the ball. */
function wantedDirection(p) {
  const it = p.intent;
  const il = Math.hypot(it.mx, it.mz);
  if (il > 0.2) return { x: it.mx / il, z: it.mz / il };
  const s = Math.hypot(p.vel.x, p.vel.z);
  if (s > 0.6) return { x: p.vel.x / s, z: p.vel.z / s };
  return { x: p.face.x, z: p.face.z };
}

/**
 * Keep the ball under control after it has been integrated as a free ball
 * this step. Returns 'lost' when the dribbler has lost it, 'touch' on a
 * touch, or null.
 */
export function updateDribble(p, b, dt, bounds) {
  const prof = p.phys;
  p.touchCd = Math.max(0, (p.touchCd || 0) - dt);
  const s = Math.hypot(p.vel.x, p.vel.z);
  const rx = b.pos.x - p.pos.x, rz = b.pos.z - p.pos.z;
  const d = Math.hypot(rx, rz);
  const lead = touchLead(p, s);
  // The ball was knocked out at the lead of the speed it was touched at; when
  // the player brakes it is still out there, so the "lost" distance decays
  // gradually instead of shrinking with his speed.
  p.dribbleLead = Math.max(lead, (p.dribbleLead || lead) - dt * 0.9);

  // Too far away, or popped up out of reach: possession is gone.
  if (d > p.dribbleLead + 1.7 || (b.pos.y > 1.2 && d > 0.9)) return 'lost';
  if (b.pos.y > BALL_R + 0.35) return null; // wait for it to drop

  const dir = wantedDirection(p);
  // Spot to steer the ball to, kept inside the field so close control never
  // walks the ball over a line (or into your own net).
  let tx = p.pos.x + dir.x * lead + p.vel.x * 0.05;
  let tz = p.pos.z + dir.z * lead + p.vel.z * 0.05;
  if (bounds) {
    tx = clamp(tx, -bounds.x, bounds.x);
    tz = clamp(tz, -bounds.z, bounds.z);
  }

  if (s < CLOSE_CONTROL_SPEED) {
    // The foot can only steer a ball it can reach; further out the player
    // has to go and get it.
    if (d > kickReach(p)) return null;
    // Close control: a soft spring-damper towards the spot in front of the
    // feet, limited by how hard the foot can push. Weaker dribblers are
    // looser (lower stiffness).
    const k = 14 + prof.dribbling * 16;
    const c = 2 * Math.sqrt(k) * 0.9;
    let ax = (tx - b.pos.x) * k + (p.vel.x - b.vel.x) * c;
    let az = (tz - b.pos.z) * k + (p.vel.z - b.vel.z) * c;
    const amax = 30 + prof.control * 25;
    const al = Math.hypot(ax, az);
    if (al > amax) { ax *= amax / al; az *= amax / al; }
    b.vel.x += ax * dt;
    b.vel.z += az * dt;
    b.vel.y = 0;
    setRollingSpin(b);
    return null;
  }

  // A player about to pass or shoot doesn't knock the ball on again: he
  // runs onto it and strikes it (see queuedAction in match.js).
  if (p.queuedAction) return null;

  // Running: touch when the player has caught up with the ball.
  const fx = p.vel.x / s, fz = p.vel.z / s;
  const along = rx * fx + rz * fz;
  const turnWanted = Math.acos(clamp(dir.x * fx + dir.z * fz, -1, 1));
  if (p.touchCd <= 0 && turnWanted > 1.6 && d <= kickReach(p)) {
    // Sharp change of direction with the ball in reach: stop it with the
    // sole / drag it back into the new direction. Clean for good dribblers,
    // scrappy (it squirts away) for poor ones, worse the faster you go.
    const mess = (1 - prof.dribbling) * (0.4 + s * 0.12);
    const ang = gauss() * mess * 0.8;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const v = 0.9 + s * 0.08 + Math.abs(gauss()) * mess * 2.2;
    b.vel.x = (dir.x * c - dir.z * sn) * v;
    b.vel.z = (dir.x * sn + dir.z * c) * v;
    b.vel.y = 0;
    setRollingSpin(b);
    p.touchCd = 0.3;
    p.touchAnim = 0.3;
    return 'touch';
  }
  if (p.touchCd > 0 || along > lead * 0.6 || d > kickReach(p)) return null;

  // Aim the touch at a spot ahead along the wanted line, so a ball that
  // drifted to the side is brought back in front.
  const ahead = lead + s * 0.3;
  let ax = p.pos.x + dir.x * ahead - b.pos.x;
  let az = p.pos.z + dir.z * ahead - b.pos.z;
  const al = Math.hypot(ax, az) || 1;
  ax /= al; az /= al;
  // Turning hard at speed makes the touch less accurate and heavier.
  const turn = Math.acos(clamp(dir.x * fx + dir.z * fz, -1, 1));
  const sprintFactor = s / (prof.runSpeed * prof.sprintMul);
  const sigma = 0.02 + (1 - prof.dribbling) * 0.09 + turn * sprintFactor * 0.12;
  const err = gauss() * sigma;
  const c = Math.cos(err), sn = Math.sin(err);
  const ex = ax * c - az * sn, ez = ax * sn + az * c;
  // Relative speed so the ball rolls out to about `lead` ahead of the feet
  // before the player catches it again: k^2 = 2 a L.
  const decel = BALL.ROLL_A + BALL.ROLL_B * s;
  const extra = Math.sqrt(2 * decel * lead * 0.75) * (1 + turn * sprintFactor * 0.5) * (1 + gauss() * sigma);
  const u = s * Math.max(0, ex * fx + ez * fz) + extra;
  b.vel.x = ex * u;
  b.vel.z = ez * u;
  b.vel.y = 0;
  setRollingSpin(b);
  p.touchCd = 0.16 + (1 - prof.dribbling) * 0.12;
  p.touchAnim = 0.22;
  return 'touch';
}
