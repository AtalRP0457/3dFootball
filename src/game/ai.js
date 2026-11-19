// Team AI. Drives every player that is not currently controlled by a human,
// including the human's own teammates and both goalkeepers.
//
// Positions are often worked out in "attack coordinates": ax grows towards
// the opponent's goal and az is mirrored the same way, so the same rules
// work for both teams.

import { HALF_L, HALF_W, GOAL, BOX, ROLL_DECEL, FORMATION } from './constants.js';

const len = (x, z) => Math.hypot(x, z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a = -1, b = 1) => a + Math.random() * (b - a);

function runSpeed(p) {
  return 4.6 + (p.stats.spd / 100) * 2.6;
}

/** Where a free ball will be after t seconds (rolling approximation). */
function predictBall(b, t) {
  if (b.owner) return { x: b.pos.x + b.vel.x * t, z: b.pos.z + b.vel.z * t };
  const h = len(b.vel.x, b.vel.z);
  if (h < 0.05) return { x: b.pos.x, z: b.pos.z };
  const a = ROLL_DECEL + h * 0.15;
  const tt = Math.min(t, h / a);
  const d = h * tt - 0.5 * a * tt * tt;
  return { x: b.pos.x + (b.vel.x / h) * d, z: b.pos.z + (b.vel.z / h) * d };
}

function interceptPoint(p, b) {
  const s = runSpeed(p) * 1.2;
  for (let t = 0; t <= 3; t += 0.1) {
    const q = predictBall(b, t);
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

function opponents(state, p) {
  return state.players.filter((o) => o.team !== p.team);
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
    if (t.team !== p.team || t === p) continue;
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
    if (p.team !== team.index || p.role === 'GK' || p.human) continue;
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
    if (p.human) continue;
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

  // A pass is on its way to me: go and meet it.
  if (b.intended === p && !b.owner) {
    const q = interceptPoint(p, b);
    setMove(p, q.x, q.z, true, 0.4);
    return;
  }

  // Chase or press the ball.
  const humanHandling = c.humanCloser && c.humanD < 5;
  if (!weHave && p === c.chaser && !humanHandling) {
    if (theyHave) {
      const o = b.owner;
      setMove(p, o.pos.x + o.vel.x * 0.25, o.pos.z + o.vel.z * 0.25, true, 0.3);
      if (o.role !== 'GK' && p.tackleCd <= 0 && dist(p.pos, o.pos) < 1.5) {
        p.aiTimer -= dt;
        if (p.aiTimer <= 0) {
          p.aiTimer = team.diff.reaction + Math.random() * 0.5;
          if (Math.random() < 0.55) p.intent.action = { type: 'tackle' };
        }
      }
    } else {
      const q = interceptPoint(p, b);
      setMove(p, q.x, q.z, true, 0.3);
    }
    return;
  }

  // Shape: work out a target spot in attack coordinates.
  const slot = FORMATION[p.idx];
  const bax = b.pos.x * dir, baz = b.pos.z * dir;
  const hx = slot.x * HALF_L, hz = slot.z * HALF_W;
  let ax, az, sprint = false;
  const wobble = Math.sin(state.clock * 0.7 + p.id * 1.7) * 2.5;

  if (weHave) {
    if (p.role === 'DEF') {
      ax = clamp(hx + bax * 0.5 + 5, -HALF_L + 6, Math.max(-HALF_L + 6, bax - 4));
      az = hz + baz * 0.2;
    } else if (p.role === 'MID') {
      ax = clamp(bax + 3, -HALF_L + 10, HALF_L - 8);
      az = (baz > 0 ? -7 : 7) + wobble;
    } else {
      ax = clamp(Math.max(bax + 9, hx + 8), -HALF_L + 10, HALF_L - 5);
      az = -baz * 0.45 + wobble * 1.5;
      sprint = ax - p.pos.x * dir > 6;
    }
  } else {
    if (p === c.second && theyHave) {
      // Cover: stand between the ball and our goal.
      const gx = -HALF_L;
      const vx = gx - bax, vz = -baz;
      const l = len(vx, vz) || 1;
      ax = bax + (vx / l) * 5;
      az = baz + (vz / l) * 5;
      sprint = true;
    } else if (p.role === 'DEF') {
      ax = clamp(Math.min(hx + bax * 0.45, bax - 3), -HALF_L + 3, -2);
      az = hz * 0.7 + baz * 0.35;
      sprint = bax < p.pos.x * dir;
    } else if (p.role === 'MID') {
      ax = clamp(bax - 6, -HALF_L + 8, HALF_L - 15);
      az = baz * 0.6;
    } else {
      ax = clamp(bax * 0.4 + 4, -10, 18);
      az = baz * 0.3 + hz;
    }
  }
  az = clamp(az, -HALF_W + 2, HALF_W - 2);
  setMove(p, ax * dir, az * dir, sprint, 2);
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

  p.aiTimer -= dt;
  if (p.aiTimer > 0) return;
  p.aiTimer = team.diff.reaction + Math.random() * 0.25;

  if (p.mustPass) {
    if (p.mustPassTimer < 0.5 + team.diff.reaction) return;
    const bp = bestPass(state, p, false) || bestPass(state, p, true);
    if (bp) it.action = { type: 'pass', target: bp.target };
    return;
  }

  const dGoal = len(goalX - p.pos.x, p.pos.z);
  if (dGoal < 22 && Math.abs(p.pos.z) < 15) {
    const prob = dGoal < 11 ? 0.85 : dGoal < 16 ? 0.45 : 0.15;
    if (Math.random() < prob) {
      const gk = state.players.find((o) => o.team !== p.team && o.role === 'GK');
      const away = gk && gk.pos.z > 0 ? -1 : 1;
      it.action = {
        type: 'shoot',
        power: clamp(0.4 + dGoal / 40 + rand(0, 0.2), 0.3, 0.95),
        aim: away * rand(0.45, 1),
      };
      return;
    }
  }

  const bp = bestPass(state, p);
  if (!bp) return;
  if ((press < 2.6 && Math.random() < 0.6) || (bp.score > 7 && Math.random() < 0.3)) {
    it.action = { type: 'pass', target: bp.target };
  }
}

// ---------- goalkeeper ----------
function keeperAI(state, p, team, dt) {
  const b = state.ball;
  const dir = team.dir;
  const gx = -HALF_L * dir; // own goal line
  const it = p.intent;

  if (b.owner === p) {
    it.mx = 0; it.mz = 0;
    p.holdTimer -= dt;
    if (p.holdTimer <= 0) {
      const bp = bestPass(state, p);
      if (bp) it.action = { type: 'pass', target: bp.target };
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
    const out = Math.min(4, ballAx * 0.3);
    tx = gx + (vx / l) * out;
    tz = (vz / l) * out;
  }
  setMove(p, tx, tz, sprint, 0.6);
}
