// Team AI. Drives every player that is not currently controlled by a human,
// including the human's own teammates and both goalkeepers.
//
// Positions are often worked out in "attack coordinates": ax grows towards
// the opponent's goal and az is mirrored the same way, so the same rules
// work for both teams.

import type { MatchState, Player, Team, Ball, Vec2, PassKind, ShotType } from '../types/game.ts';

/** Per-team view of who should chase the ball this step. */
export interface TeamContext { chaser: Player | null; second: Player | null; humanCloser: boolean; humanD: number }
import { HALF_L, HALF_W, GOAL, BOX, FORMATION, FORMATIONS, INDOOR_FORMATION } from './constants.ts';
import { predictGroundBall, samplePath } from './physics/ballPhysics.ts';
import { laneRisk } from './mechanics/lanes.ts';

const len = (x: number, z: number) => Math.hypot(x, z);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a = -1, b = 1) => a + Math.random() * (b - a);

function runSpeed(p: Player) {
  return p.phys ? p.phys.runSpeed : 4.6 + (p.stats.spd / 100) * 2.6;
}

/**
 * Where a free ball will be after t seconds. Uses the per-step simulated path
 * (spin, bounces, rolling) when the match has computed one, otherwise the
 * closed-form rolling model.
 */
function predictBall(b: Ball, t: number): { x: number; z: number; y: number } {
  if (b.owner) return { x: b.pos.x + b.vel.x * t, z: b.pos.z + b.vel.z * t, y: b.pos.y };
  if (b.path) { const q = samplePath(b.path, t); if (q) return q; }
  return { ...predictGroundBall(b, t), y: b.pos.y };
}

/**
 * Earliest point on the ball's path the player can get to while it is low
 * enough to play (so receivers run to where a lofted ball comes down).
 */
export function interceptPoint(p: Player, b: Ball, reachH = 1.3) {
  for (let t = 0; t <= 5 + 1e-9; t += 0.1) {
    const q = predictBall(b, t);
    if ((q.y ?? 0) > reachH) continue;
    if (canReachPoint(p, q, t, 1.16, 0.62)) return q;
  }
  return predictBall(b, 5);
}

/**
 * Where a receiver should take a pass: he comes towards the ball at a firm
 * jog, meeting it at the earliest point of its path he reaches at that pace
 * (not a sprint into it, which overruns, and not standing waiting). Returns
 * the point and the time the ball gets there.
 */
export function receivePoint(p: Player, b: Ball, reachH = 1.3): { x: number; z: number; t: number } {
  for (let t = 0.05; t <= 5 + 1e-9; t += 0.05) {
    const q = predictBall(b, t);
    if ((q.y ?? 0) > reachH) continue;
    if (canReachPoint(p, q, t, 0.82, 0.72)) return { x: q.x, z: q.z, t };
  }
  const q = interceptPoint(p, b, reachH);
  return { x: q.x, z: q.z, t: 5 };
}

/**
 * Estimate whether a player can arrive by time t without pretending he starts
 * at top speed. Direction changes and acceleration matter most on short passes
 * and loose balls, where the old distance = maxSpeed * time estimate was badly
 * optimistic and sent players to interception points they could never reach.
 */
function canReachPoint(p: Player, q: Vec2, t: number, speedFactor: number, allowance: number) {
  if (t <= 0) return dist(p.pos, q) <= allowance;
  const dx = q.x - p.pos.x, dz = q.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= allowance) return true;
  const ux = dx / d, uz = dz / d;
  const currentAlong = p.vel.x * ux + p.vel.z * uz;
  const speed = runSpeed(p) * speedFactor * (0.82 + 0.18 * p.stamina);
  const accel = Math.max(3, p.phys?.accel ?? 9) * 0.78;
  // Movement opposite the target first has to be cancelled. A small turn
  // allowance accounts for steering at pace without requiring a full path solver.
  const reverseTime = Math.min(0.45, Math.max(0, -currentAlong) / accel);
  const startSpeed = clamp(currentAlong, 0, speed);
  const usable = Math.max(0, t - reverseTime - 0.12);
  const toTop = Math.max(0, (speed - startSpeed) / accel);
  const ramp = Math.min(usable, toTop);
  const reachable = startSpeed * ramp + 0.5 * accel * ramp * ramp
    + Math.max(0, usable - ramp) * speed;
  return d <= reachable + allowance;
}

function setMove(p: Player, tx: number, tz: number, sprint: boolean = false, slowRadius: number = 1.5) {
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
function fromBehind(p: Player, o: Player) {
  return (p.pos.x - o.pos.x) * o.face.x + (p.pos.z - o.pos.z) * o.face.z < -0.35;
}

function opponents(state: MatchState, p: Player) {
  return state.players.filter((o) => o.team !== p.team && o.onPitch && !o.sentOff);
}

function nearestOpponentDist(state: MatchState, p: Player) {
  let m = Infinity;
  for (const o of opponents(state, p)) m = Math.min(m, dist(o.pos, p.pos));
  return m;
}

/** Score every teammate as a pass option. Returns {target, score} or null. */
export function bestPass(state: MatchState, p: Player, allowKeeper: boolean = false, safety = 0) {
  const team = state.teams[p.team];
  const dir = team.dir;
  const opps = opponents(state, p);
  let best = null;
  for (const t of state.players) {
    if (t.team !== p.team || t === p || !t.onPitch || t.sentOff) continue;
    if (t.role === 'GK' && !allowKeeper) continue;
    const d = dist(p.pos, t.pos);
    if (d < 4 || d > 42) continue;
    let open = Infinity;
    for (const o of opps) open = Math.min(open, dist(o.pos, t.pos));
    // Lane by timing (can a defender get to the ball on its way?). A pass too
    // long or too covered to play on the ground goes in the air (passKind),
    // where the lane matters less but a marked receiver still does.
    const risk = laneRisk(state, p.pos, t.pos, p.team);
    const aerial = d > 40 || (risk > 0.6 && d > 12);
    const forward = (t.pos.x - p.pos.x) * dir;
    // How likely it is lost: the lane (ground) or a marker close to the receiver (aerial).
    const danger = aerial ? clamp((3 - open) / 3, 0, 1) * 0.8 + 0.15 : risk;
    const score = forward * 0.5 * (1 - safety) + Math.min(open, 8) * 1.2 - (aerial ? 2.5 + Math.max(0, 3 - open) * 3 : risk * 22) - d * 0.08
      - danger * 10 * safety + (t.role === 'GK' ? -6 : 0);
    if (!best || score > best.score) best = { target: t, score, risk: danger };
  }
  return best;
}

function buildContext(state: MatchState, team: Team) {
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

function interceptPointRough(b: Ball) {
  return predictBall(b, 0.6);
}

export function updateAI(state: MatchState, dt: number) {
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
function offBallAI(state: MatchState, p: Player, team: Team, c: TeamContext, dt: number) {
  const b = state.ball;
  const dir = team.dir;
  const weHave = b.owner ? b.owner.team === p.team : (b.intended && b.intended.team === p.team);
  const theyHave = b.owner && b.owner.team !== p.team;

  // Tackle drill: teammates stay out of the way.
  if (p.drillPassive) { p.aiState = 'drill (waiting)'; setMove(p, p.pos.x, p.pos.z); return; }

  // A pass is on its way to me: go and meet it.
  const pending = b.pendingPass;
  if (pending?.target === p && b.owner === pending.passer) {
    p.aiState = 'move for pass';
    setMove(p, pending.aim.x, pending.aim.z, true, 0.45);
    return;
  }
  if (b.intended === p && !b.owner) {
    // Meet the ball where he can really get to it at a firm run (the same
    // search a human receiver gets), not at an optimistic earliest point he
    // can't reach in time, which lets the ball run past him.
    p.aiState = 'receive pass';
    const q = receivePoint(p, b);
    setMove(p, q.x, q.z, q.t > 0.6 && dist(p.pos, q) > 2.5, 0.4);
    return;
  }

  // Chase or press the ball.
  const humanHandling = c.humanCloser && c.humanD < 5;
  if (!weHave && p === c.chaser && !humanHandling) {
    p.aiState = theyHave ? 'press' : 'chase ball';
    if (theyHave) {
      const o = b.owner!; // theyHave guarantees an owner
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
      // Each midfielder keeps his own lane (formation slot), shifted towards
      // the ball side, so they offer different angles instead of one spot.
      ax = clamp(bax + 3 + (hx + HALF_L * 0.2) * 0.35 + tacticalPush * 5, -HALF_L + 10, HALF_L - 8);
      az = hz * 0.95 + baz * 0.3 + wobble * 0.6;
    } else {
      ax = clamp(Math.max(bax + 9, hx + 8) + tacticalPush * 6, -HALF_L + 10, HALF_L - 5);
      az = hz * 0.8 - baz * 0.15 + wobble;
      sprint = ax - p.pos.x * dir > 6;
    }
  } else {
    if (p === c.second && theyHave && bax < -HALF_L * 0.35 && dist(p.pos, b.owner!.pos) < 9) {
      // Danger zone: second defender closes the dribbler down too.
      const o = b.owner!;
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
      az = hz * 0.75 + baz * 0.4;
    } else {
      ax = clamp(bax * 0.4 + 4 + tacticalPush * 7, -10, 18);
      az = baz * 0.3 + hz;
    }
  }
  // Add a bounded, order-independent separation force to the formation
  // anchor. This keeps the shape while preventing several players from
  // selecting the same support lane near the ball.
  let sepX = 0, sepZ = 0;
  for (const o of state.players) {
    if (o === p || o.team !== p.team || !o.onPitch || o.sentOff || o.role === 'GK') continue;
    const ox = o.pos.x * dir, oz = o.pos.z * dir;
    const d = len(ax - ox, az - oz);
    if (d < SPACING && d > 1e-3) {
      const force = (SPACING - d) / SPACING;
      sepX += ((ax - ox) / d) * force;
      sepZ += ((az - oz) / d) * force;
    }
  }
  const separation = len(sepX, sepZ);
  if (separation > 1e-3) {
    const amount = Math.min(3.2, separation * 2.1);
    ax += (sepX / separation) * amount;
    az += (sepZ / separation) * amount;
  }
  az = clamp(az, -HALF_W + 2, HALF_W - 2);
  setMove(p, ax * dir, az * dir, sprint, 2);
}
/** Minimum gap (m) an off-ball player keeps from teammates' positions. */
const SPACING = 5;

/**
 * AI shot selection: low and placed up close, finesse from an angle, a chip
 * when the keeper is well off his line, power from distance.
 */
function chooseShotType(state: MatchState, p: Player, dGoal: number, gk: Player | undefined): ShotType {
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
function passKind(state: MatchState, p: Player, target: Player): PassKind | undefined {
  const dir = state.teams[p.team].dir;
  const d = dist(p.pos, target.pos);
  const ahead = (target.pos.x - p.pos.x) * dir;
  const running = target.vel.x * dir > 3;
  const blocked = laneRisk(state, p.pos, target.pos, p.team) > 0.6;
  if (target.role !== 'GK' && ahead > 6 && running && !blocked && d < 30) return 'through';
  if (blocked && d > 12) return 'lofted';
  return undefined; // let the engine pick ground / lofted by distance
}

// ---------- outfield, with the ball ----------
function withBallAI(state: MatchState, p: Player, team: Team, dt: number) {
  // A new possession if he wasn't on the ball a moment ago.
  if (p.aiHoldAt === undefined || state.clock - p.aiHoldAt > 0.2) p.aiHold = 0;
  p.aiHoldAt = state.clock;
  p.aiHold = (p.aiHold ?? 0) + dt;
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

  if (p.mustPass && state.kickoffPending) {
    // Kick-off: a short pass to a teammate level with or behind him (keeps
    // possession), never a punt forward into the opponents.
    if (p.mustPassTimer < 0.35 + team.diff.reaction * 0.5) return;
    let best: Player | null = null, bd = Infinity;
    for (const t of state.players) {
      if (t.team !== p.team || t === p || !t.onPitch || t.sentOff || t.role === 'GK') continue;
      const ahead = (t.pos.x - p.pos.x) * dir;
      const d = dist(p.pos, t.pos);
      if (ahead > 1 || d < 3 || d > 22) continue;
      const score = d + Math.max(0, -ahead - 12) * 0.5;
      if (score < bd) { bd = score; best = t; }
    }
    if (best) { it.action = { type: 'pass', target: best }; return; }
  }
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
  const wideShot = Math.abs(p.pos.z) >= 15 && Math.abs(p.pos.z) < 20 && dGoal < 18; // from an angle, closer in
  if (dGoal < 22 && (Math.abs(p.pos.z) < 15 || wideShot)) {
    const tacticBias = team.tactic === 'attacking' ? 0.12 : team.tactic === 'defensive' ? -0.08 : 0;
    // In range a forward should shoot rather than keep recycling the ball.
    const prob = clamp((wideShot ? 0.2 : dGoal < 11 ? 0.85 : dGoal < 16 ? 0.55 : 0.25) + tacticBias, 0.05, 0.95);
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

  // Tightly pressed: look for the safe ball rather than the ambitious one.
  const bp = bestPass(state, p, false, press < 2.6 ? 0.7 : 0);
  if (!bp) return;
  // Keep the ball moving: pressure, a good option, or simply having had it
  // a while all make a pass more likely (no endless solo dribbles).
  // Near goal he may carry it on towards a shot instead.
  // (Not a reason for an unpressured back-pass to the keeper.)
  // A pass likely to be cut out is held back (he keeps it, shields or carries
  // it on) unless he is about to be tackled.
  const held = bp.target.role === 'GK' ? 0 : Math.min(1, (p.aiHold ?? 0) / 2.5) * (dGoal < 30 ? 0.35 : 1);
  const doubt = press < 1.6 ? 0.3 : 1;
  const urge = ((press < 2.6 ? 0.6 : press < 4.5 ? 0.3 : 0) + (bp.score > 7 ? 0.3 : bp.score > 4 ? 0.15 : 0) + held * 0.45)
    * (1 - clamp(bp.risk, 0, 1) * 0.85 * doubt);
  if (Math.random() < Math.min(0.9, urge)) {
    it.action = { type: 'pass', target: bp.target, kind: passKind(state, p, bp.target) };
  }
}

// ---------- goalkeeper ----------
function keeperAI(state: MatchState, p: Player, team: Team, dt: number) {
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

  // Set position: on the line from the ball to the middle of the goal (the
  // bisector of the shooting angle), further off the line as the ball comes
  // closer in front; a poorer positional keeper drifts towards the near post.
  const pos = p.phys?.keeper?.positioning ?? 0.7;
  const bvx = b.pos.x - gx, bvz = b.pos.z;
  const bd = len(bvx, bvz) || 1;
  const ahead = Math.abs(bvx) / bd; // 1 = straight in front, 0 = level with the line
  const off = clamp(1.1 + (35 - Math.min(35, bd)) * 0.06, 1.1, 2.6) * (0.4 + 0.6 * ahead);
  let tx = gx + (bvx / bd) * off;
  let tz = clamp((bvz / bd) * off + (b.pos.z * 0.12) * (1 - pos), -GOAL.width / 2 + 0.3, GOAL.width / 2 - 0.3);
  if (Math.abs(bvx) > 40) { tx = gx + dir * 1.2; tz = clamp(b.pos.z * 0.1, -2, 2); }
  let sprint = false;

  const towardUs = -b.vel.x * dir;
  const ballAx = (b.pos.x - gx) * dir; // distance of ball from our goal line
  if (!b.owner && b.shotLive && b.shotTeam !== p.team && towardUs > 2) {
    const crossing = goalLineCrossing(b, gx, dir);
    if (crossing && crossing.t < 2.2 && crossing.y < 2.8) {
      const t = crossing.t;
      const zc = crossing.z;
      tx = gx + dir * 0.9;
      tz = clamp(zc, -GOAL.width / 2 - 0.6, GOAL.width / 2 + 0.6);
      sprint = true;
      // On the engine the save model (match keeperReadShot) decides when and where he dives.
      if (!state.engine && Math.abs(tz - p.pos.z) > 1.2 && p.dive <= 0 && t < 0.6) p.dive = 0.45;
    }
  } else if (!b.owner && ballAx < BOX.depth && Math.abs(b.pos.z) < BOX.width / 2
             && len(b.vel.x, b.vel.z) < 12) {
    // Loose ball in our box: claim it.
    const q = interceptPoint(p, b, p.phys?.keeper?.reach ?? 2.3);
    const advance = clamp((q.x - gx) * dir, 0.25, BOX.depth - 0.25);
    tx = gx + dir * advance;
    tz = clamp(q.z, -BOX.width / 2 + 0.25, BOX.width / 2 - 0.25);
    sprint = true;
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

/** Find the ball's first crossing of this keeper's goal line in its simulated path. */
function goalLineCrossing(b: Ball, gx: number, dir: number): { t: number; z: number; y: number } | null {
  const path = b.path;
  if (!path || path.length < 2) {
    const t = (gx - b.pos.x) / (b.vel.x || 1e-6);
    return t > 0 ? { t, z: b.pos.z + b.vel.z * t, y: b.pos.y + b.vel.y * t - 4.905 * t * t } : null;
  }
  for (let i = 1; i < path.length; i++) {
    const before = path[i - 1], after = path[i];
    if ((before.x - gx) * dir <= 0 || (after.x - gx) * dir > 0) continue;
    const dx = after.x - before.x;
    const u = Math.abs(dx) < 1e-6 ? 0 : clamp((gx - before.x) / dx, 0, 1);
    return {
      t: before.t + (after.t - before.t) * u,
      z: before.z + (after.z - before.z) * u,
      y: before.y + (after.y - before.y) * u,
    };
  }
  return null;
}
