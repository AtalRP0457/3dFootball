// Team AI. Drives every player that is not currently controlled by a human,
// including the human's own teammates and both goalkeepers.
//
// Positions are often worked out in "attack coordinates": ax grows towards
// the opponent's goal and az is mirrored the same way, so the same rules
// work for both teams.

import { HALF_L, HALF_W, GOAL, BOX, FORMATION, FORMATIONS, INDOOR_FORMATION } from './constants.js';
import { predictGroundBall, samplePath } from './physics/ballPhysics.js';

const len = (x, z) => Math.hypot(x, z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a = -1, b = 1) => a + Math.random() * (b - a);

function runSpeed(p) {
  return p.phys ? p.phys.runSpeed : 4.6 + (p.stats.spd / 100) * 2.6;
}

/**
 * Where a free ball will be after t seconds. Uses the per-step simulated path
 * (spin, bounces, rolling) when the match has computed one, otherwise the
 * closed-form rolling model.
 */
function predictBall(b, t) {
  if (b.owner) return { x: b.pos.x + b.vel.x * t, z: b.pos.z + b.vel.z * t, y: b.pos.y };
  if (b.path) return samplePath(b.path, t);
  return { ...predictGroundBall(b, t), y: b.pos.y };
}

/**
 * Earliest point on the ball's path the player can get to while it is low
 * enough to play (so receivers run to where a lofted ball comes down).
 */
export function interceptPoint(p, b, reachH = 1.3) {
  const s = runSpeed(p) * 1.2;
  for (let t = 0; t <= 3 + 1e-9; t += 0.1) {
    const q = predictBall(b, t);
    if ((q.y ?? 0) > reachH) continue;
    if (dist(p.pos, q) <= s * t + 0.6) return q;
  }
  return predictBall(b, 3);
}

function setMove(p, tx, tz, sprint = false, slowRadius = 1.5) {
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const d = len(dx, dz);
  const it = p.intent;
  if (d < 0.3) { it.mx = 0; it.mz = 0; it.sprint = false; return; }
  const s = Math.min(1, d / slowRadius);
  it.mx = (dx / d) * s;
  it.mz = (dz / d) * s;
  it.sprint = sprint && d > 3 && p.stamina > 0.25;
}

/** Is p behind the ball carrier o (relative to where o is facing)? */
function fromBehind(p, o) {
  return (p.pos.x - o.pos.x) * o.face.x + (p.pos.z - o.pos.z) * o.face.z < -0.35;
}

function opponents(state, p) {
  return state.players.filter((o) => o.team !== p.team && o.onPitch && !o.sentOff);
}

function nearestOpponentDist(state, p) {
  let m = Infinity;
  for (const o of opponents(state, p)) m = Math.min(m, dist(o.pos, p.pos));
  return m;
}

function segmentDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** Score every teammate as a pass option. Returns {target, score} or null. */
export function bestPass(state, p, allowKeeper = false) {
  const team = state.teams[p.team];
  const dir = team.dir;
  const opps = opponents(state, p);
  let best = null;
  for (const t of state.players) {
    if (t.team !== p.team || t === p || !t.onPitch || t.sentOff) continue;
    if (t.role === 'GK' && !allowKeeper) continue;
    const d = dist(p.pos, t.pos);
    if (d < 4 || d > 42) continue;
    let open = Infinity, blocked = false;
    for (const o of opps) {
      open = Math.min(open, dist(o.pos, t.pos));
      if (d <= 24 && segmentDist(o.pos.x, o.pos.z, p.pos.x, p.pos.z, t.pos.x, t.pos.z) < 1.3) blocked = true;
    }
    const forward = (t.pos.x - p.pos.x) * dir;
    const score = forward * 0.5 + Math.min(open, 8) * 1.2 - (blocked ? 12 : 0) - d * 0.08
      + (t.role === 'GK' ? -6 : 0);
    if (!best || score > best.score) best = { target: t, score };
  }
  return best;
}

function buildContext(state, team) {
  const b = state.ball;
  const target = b.owner ? b.owner.pos : interceptPointRough(b);
  let chaser = null, cd = Infinity, second = null, sd = Infinity;
  for (const p of state.players) {
    if (p.team !== team.index || !p.onPitch || p.role === 'GK' || p.human || p.sentOff) continue;
    const d = dist(p.pos, target);
    if (d < cd) { second = chaser; sd = cd; chaser = p; cd = d; }
    else if (d < sd) { second = p; sd = d; }
  }
  const h = team.controlled;
  const humanD = h ? dist(h.pos, target) : Infinity;
  return { chaser, second, humanCloser: humanD < cd, humanD };
}

function interceptPointRough(b) {
  return predictBall(b, 0.6);
}

export function updateAI(state, dt) {
  const b = state.ball;
  const ctx = state.teams.map((team) => buildContext(state, team));
  for (const p of state.players) {
    if (!p.onPitch || p.sentOff) {
      p.intent.mx = p.intent.mz = 0;
      p.intent.sprint = false;
      p.intent.action = null;
      continue;
    }
    if (p.human) continue;
    if (state.penalty?.active) {
      p.intent.mx = p.intent.mz = 0;
      p.intent.sprint = false;
      p.intent.action = p === state.penalty.shooter && b.owner === p
        ? { type: 'shoot', power: 0.78, aim: rand(-0.35, 0.35) }
        : null;
      continue;
    }
    const team = state.teams[p.team];
    if (p.role === 'GK') keeperAI(state, p, team, dt);
    else if (b.owner === p) withBallAI(state, p, team, dt);
    else offBallAI(state, p, team, ctx[p.team], dt);
  }
}

// ---------- outfield, without the ball ----------
function offBallAI(state, p, team, c, dt) {
  const b = state.ball;
  const dir = team.dir;
  const weHave = b.owner ? b.owner.team === p.team : (b.intended && b.intended.team === p.team);
  const theyHave = b.owner && b.owner.team !== p.team;

  // Tackle drill: teammates stay out of the way.
  if (p.drillPassive) { p.aiState = 'drill (waiting)'; setMove(p, p.pos.x, p.pos.z); return; }

  // A pass is on its way to me: go and meet it.
  if (b.intended === p && !b.owner) {
    p.aiState = 'receive pass';
    const q = interceptPoint(p, b);
    setMove(p, q.x, q.z, true, 0.4);
    return;
  }

  // Chase or press the ball.
  const humanHandling = c.humanCloser && c.humanD < 5;
  if (!weHave && p === c.chaser && !humanHandling) {
    p.aiState = theyHave ? 'press' : 'chase ball';
    if (theyHave) {
      const o = b.owner;
      if (o.holding || o.mustPass) {
        // Can't challenge: wait a few metres away, goal-side.
        const gx = -HALF_L * team.dir;
        const vx = gx - o.pos.x, vz = -o.pos.z;
        const l = len(vx, vz) || 1;
        setMove(p, o.pos.x + (vx / l) * 4, o.pos.z + (vz / l) * 4, false, 1);
        p.aiState = 'wait (protected ball)';
        return;
      }
      setMove(p, o.pos.x + o.vel.x * 0.25, o.pos.z + o.vel.z * 0.25, true, 0.3);
      const prot = o.mustPass || (o.holding && o === b.owner);
      if (!prot && p.tackleCd <= 0 && dist(p.pos, o.pos) < 1.6) {
        p.aiTimer -= dt;
        if (p.aiTimer <= 0) {
          // Defenders who read the game (marking, positioning, awareness) react sooner.
          p.aiTimer = team.diff.reaction * (1.35 - (p.phys?.defending ?? 0.65) * 0.6) + Math.random() * 0.3;
          // Don't dive in through the back of a player: jockey until goal-side.
          if (Math.random() < (fromBehind(p, o) ? 0.22 : 0.65) * team.diff.tackle) p.intent.action = { type: 'tackle' };
        }
      }
    } else {
      const q = interceptPoint(p, b);
      setMove(p, q.x, q.z, true, 0.3);
    }
    return;
  }

  p.aiState = weHave ? 'support' : (p === c.second && theyHave ? 'cover' : 'shape');
  // Keep the run the human started (see rememberRun in match.js): stay up
  // the pitch and keep going towards goal, unless the opponents win the ball.
  const kr = p.keepRun;
  if (kr) {
    if (state.clock >= kr.until || theyHave) {
      p.keepRun = null;
    } else {
      const gx = HALF_L * dir;
      const toGoal = Math.abs(gx - p.pos.x);
      if (kr.running && toGoal > 8) {
        // Carry on towards the goal, finishing in front of the posts.
        const tz = clamp(p.pos.z * 0.85, -GOAL.width - 3, GOAL.width + 3);
        setMove(p, gx - dir * 7, tz, kr.sprint, 2);
        p.aiState = `keep run (${(kr.until - state.clock).toFixed(1)}s)`;
      } else {
        // Hold the spot you left him in (or just in front of goal).
        const hx = kr.running ? p.pos.x : kr.spot.x;
        const hz = kr.running ? p.pos.z : kr.spot.z;
        setMove(p, hx, hz, false, 1.5);
        p.aiState = `hold spot (${(kr.until - state.clock).toFixed(1)}s)`;
      }
      return;
    }
  }

  // Shape: work out a target spot in attack coordinates.
  const slot = (state.indoor ? INDOOR_FORMATION : (FORMATIONS[team.formation] || FORMATION))[p.idx];
  const bax = b.pos.x * dir, baz = b.pos.z * dir;
  const hx = slot.x * HALF_L, hz = slot.z * HALF_W;
  let ax, az, sprint = false;
  const tacticalPush = team.tactic === 'attacking' ? 1 : team.tactic === 'defensive' ? -1 : 0;
  const wobble = Math.sin(state.clock * 0.7 + p.id * 1.7) * 2.5;

  if (weHave) {
    if (p.role === 'DEF') {
      ax = clamp(hx + bax * 0.5 + 5 + tacticalPush * 3, -HALF_L + 6, Math.max(-HALF_L + 6, bax - 4));
      az = hz + baz * 0.2;
    } else if (p.role === 'MID') {
      ax = clamp(bax + 3 + tacticalPush * 5, -HALF_L + 10, HALF_L - 8);
      az = (baz > 0 ? -7 : 7) + wobble;
    } else {
      ax = clamp(Math.max(bax + 9, hx + 8) + tacticalPush * 6, -HALF_L + 10, HALF_L - 5);
      az = -baz * 0.45 + wobble * 1.5;
      sprint = ax - p.pos.x * dir > 6;
    }
  } else {
    if (p === c.second && theyHave && bax < -HALF_L * 0.35 && dist(p.pos, b.owner.pos) < 9) {
      // Danger zone: second defender closes the dribbler down too.
      const o = b.owner;
      setMove(p, o.pos.x + o.vel.x * 0.3 - dir * 1.2, o.pos.z + o.vel.z * 0.3, true, 0.3);
      p.aiState = 'double team';
      if (!o.mustPass && !o.holding && p.tackleCd <= 0 && dist(p.pos, o.pos) < 1.6 && Math.random() < (fromBehind(p, o) ? 0.006 : 0.02) * team.diff.tackle) {
        p.intent.action = { type: 'tackle' };
      }
      return;
    } else if (p === c.second && theyHave) {
      // Cover: stand between the ball and our goal.
      const gx = -HALF_L;
      const vx = gx - bax, vz = -baz;
      const l = len(vx, vz) || 1;
      ax = bax + (vx / l) * 5;
      az = baz + (vz / l) * 5;
      sprint = true;
    } else if (p.role === 'DEF') {
      ax = clamp(Math.min(hx + bax * 0.45, bax - 3) + tacticalPush * 4, -HALF_L + 3, -2);
      az = hz * 0.7 + baz * 0.35;
      sprint = bax < p.pos.x * dir;
    } else if (p.role === 'MID') {
      ax = clamp(bax - 6 + tacticalPush * 5, -HALF_L + 8, HALF_L - 15);
      az = baz * 0.6;
    } else {
      ax = clamp(bax * 0.4 + 4 + tacticalPush * 7, -10, 18);
      az = baz * 0.3 + hz;
    }
  }
  az = clamp(az, -HALF_W + 2, HALF_W - 2);
  setMove(p, ax * dir, az * dir, sprint, 2);
}

/**
 * AI shot selection: low and placed up close, finesse from an angle, a chip
 * when the keeper is well off his line, power from distance.
 */
function chooseShotType(state, p, dGoal, gk) {
  const team = state.teams[p.team];
  const goalX = HALF_L * team.dir;
  const prof = p.phys;
  const r = Math.random();
  if (gk && dGoal > 12 && dGoal < 26 && Math.abs(gk.pos.x - goalX) > 6 && r < 0.6) return 'chip';
  if (Math.abs(p.pos.z) > 6 && dGoal < 22 && r < 0.45 + (prof ? prof.shotAccuracy * 0.2 : 0)) return 'finesse';
  if (dGoal > 22 && r < 0.5) return 'power';
  if (dGoal < 12 && r < 0.5) return 'low';
  return 'normal';
}

/** AI pass selection: through balls for runners, lofted over blocked lanes. */
function passKind(state, p, target) {
  const dir = state.teams[p.team].dir;
  const d = dist(p.pos, target.pos);
  const ahead = (target.pos.x - p.pos.x) * dir;
  const running = target.vel.x * dir > 3;
  let blocked = false;
  for (const o of opponents(state, p)) {
    if (segmentDist(o.pos.x, o.pos.z, p.pos.x, p.pos.z, target.pos.x, target.pos.z) < 1.3
        && dist(o.pos, p.pos) > 1.2) { blocked = true; break; }
  }
  if (target.role !== 'GK' && ahead > 6 && running && !blocked && d < 30) return 'through';
  if (blocked && d > 12) return 'lofted';
  return undefined; // let the engine pick ground / lofted by distance
}

// ---------- outfield, with the ball ----------
function withBallAI(state, p, team, dt) {
  const dir = team.dir;
  const goalX = HALF_L * dir;
  const it = p.intent;

  // Dribble direction: towards goal, steering away from nearby opponents.
  let dx = goalX - p.pos.x, dz = -p.pos.z * 0.6;
  let l = len(dx, dz) || 1;
  dx /= l; dz /= l;
  for (const o of opponents(state, p)) {
    const ox = p.pos.x - o.pos.x, oz = p.pos.z - o.pos.z;
    const d = len(ox, oz);
    const ahead = -(ox * dx + oz * dz);
    if (d < 6 && ahead > -1) {
      const w = 2.2 / Math.max(0.8, d * d) * 3;
      dx += (ox / d) * w * 0.4;
      dz += (oz / d) * w;
    }
  }
  // Keep away from the touchlines.
  if (Math.abs(p.pos.z) > HALF_W - 4) dz -= Math.sign(p.pos.z) * 0.8;
  l = len(dx, dz) || 1;
  it.mx = dx / l; it.mz = dz / l;
  const press = nearestOpponentDist(state, p);
  it.sprint = press > 3.5 && p.stamina > 0.3;

  p.aiState = 'dribble';
  if (p.drillNoPass) return; // tackle drill: keep dribbling, never pass or shoot
  p.aiTimer -= dt;
  if (p.aiTimer > 0) return;
  p.aiTimer = team.diff.reaction + Math.random() * 0.25;

  if (p.mustPass) {
    if (p.mustPassTimer < 0.5 + team.diff.reaction) return;
    const dGoal = len(goalX - p.pos.x, p.pos.z);
    if (!p.throwIn && p.role !== 'GK' && dGoal < 38) {
      const shotChance = dGoal < 13 ? 0.68 : dGoal < 22 ? 0.34 : 0.14;
      if (Math.random() < shotChance) {
        const gk = state.players.find((o) => o.team !== p.team && o.onPitch && !o.sentOff && o.role === 'GK');
        const away = gk && gk.pos.z > 0 ? -1 : 1;
        it.action = {
          type: 'shoot',
          power: clamp(0.55 + (38 - dGoal) / 70 + rand(0, 0.15), 0.45, 0.9),
          aim: away * rand(0.35, 0.9),
          shotType: chooseShotType(state, p, dGoal, gk),
        };
        return;
      }
    }
    const bp = bestPass(state, p, false) || bestPass(state, p, true);
    if (bp) it.action = { type: 'pass', target: bp.target, kind: passKind(state, p, bp.target) };
    return;
  }

  const dGoal = len(goalX - p.pos.x, p.pos.z);
  if (dGoal < 22 && Math.abs(p.pos.z) < 15) {
    const tacticBias = team.tactic === 'attacking' ? 0.12 : team.tactic === 'defensive' ? -0.08 : 0;
    const prob = clamp((dGoal < 11 ? 0.85 : dGoal < 16 ? 0.45 : 0.15) + tacticBias, 0.05, 0.95);
    if (Math.random() < prob) {
      const gk = state.players.find((o) => o.team !== p.team && o.onPitch && !o.sentOff && o.role === 'GK');
      const away = gk && gk.pos.z > 0 ? -1 : 1;
      it.action = {
        type: 'shoot',
        power: clamp(0.4 + dGoal / 40 + rand(0, 0.2), 0.3, 0.95),
        aim: away * rand(0.45, 1),
        shotType: chooseShotType(state, p, dGoal, gk),
      };
      return;
    }
  }

  const bp = bestPass(state, p);
  if (!bp) return;
  if ((press < 2.6 && Math.random() < 0.6) || (bp.score > 7 && Math.random() < 0.3)) {
    it.action = { type: 'pass', target: bp.target, kind: passKind(state, p, bp.target) };
  }
}

// ---------- goalkeeper ----------
function keeperAI(state, p, team, dt) {
  const b = state.ball;
  const dir = team.dir;
  const gx = -HALF_L * dir; // own goal line
  const it = p.intent;
  p.aiState = 'keeper';

  if (b.owner === p) {
    it.mx = 0; it.mz = 0;
    p.holdTimer -= dt;
    if (p.holdTimer <= 0) {
      const bp = bestPass(state, p);
      if (bp) it.action = { type: 'pass', target: bp.target, kind: passKind(state, p, bp.target) };
      p.holdTimer = 0.5;
    }
    return;
  }

  let tx = gx + dir * 1.2;
  let tz = clamp(b.pos.z * 0.3, -GOAL.width / 2 + 0.4, GOAL.width / 2 - 0.4);
  let sprint = false;

  const towardUs = -b.vel.x * dir;
  const ballAx = (b.pos.x - gx) * dir; // distance of ball from our goal line
  if (!b.owner && b.shotLive && b.shotTeam !== p.team && towardUs > 5) {
    const lineX = gx + dir * 0.9;
    const t = (lineX - b.pos.x) / (b.vel.x || 1e-6);
    if (t > 0 && t < 1.6) {
      const zc = b.pos.z + b.vel.z * t;
      tx = lineX;
      tz = clamp(zc, -GOAL.width / 2 - 0.6, GOAL.width / 2 + 0.6);
      sprint = true;
      if (Math.abs(tz - p.pos.z) > 1.2 && p.dive <= 0 && t < 0.6) p.dive = 0.45;
    }
  } else if (!b.owner && ballAx < BOX.depth && Math.abs(b.pos.z) < BOX.width / 2
             && len(b.vel.x, b.vel.z) < 12) {
    // Loose ball in our box: claim it.
    tx = b.pos.x; tz = b.pos.z; sprint = true;
  } else if (b.owner && b.owner.team !== p.team && ballAx < 16) {
    // Narrow the angle against an attacker.
    const vx = b.pos.x - gx, vz = b.pos.z;
    const l = len(vx, vz) || 1;
    // Good positional keepers come off their line to narrow the angle.
    const out = Math.min(4, ballAx * 0.3) * (0.7 + (p.phys?.keeper?.positioning ?? 0.7) * 0.45);
    tx = gx + (vx / l) * out;
    tz = (vz / l) * out;
  }
  setMove(p, tx, tz, sprint, 0.6);
}
