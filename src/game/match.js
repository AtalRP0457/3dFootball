// Match engine: pure game logic with no rendering code, so it can run
// headless (tests) and be ported to Unity/Godot later.

import {
  HALF_L, HALF_W, GOAL, BOX, BALL_R, GRAVITY, ROLL_DECEL, AIR_DRAG, BOUNCE,
  CONTROL_RADIUS, DRIBBLE_OFFSET, PLAYER_RADIUS, SHOT_CHARGE_TIME,
  MUST_PASS_TIMEOUT, DIFFICULTY, FORMATION, KICKOFF_ATTACK, KICKOFF_DEFEND,
} from './constants.js';
import { updateAI } from './ai.js';

// ---------- small vector helpers ----------
export const len = (x, z) => Math.hypot(x, z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a = -1, b = 1) => a + Math.random() * (b - a);

// ---------- kits ----------
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorDist(a, b) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
const ALT_KITS = [
  { shirt: '#111111', shorts: '#111111', socks: '#f5c400', gk: '#7dd3fc' },
  { shirt: '#d62828', shorts: '#ffffff', socks: '#d62828', gk: '#222222' },
];
function resolveKits(homeKit, awayKit) {
  if (colorDist(homeKit.shirt, awayKit.shirt) > 120) return [homeKit, awayKit];
  const alt = ALT_KITS.find((k) => colorDist(k.shirt, homeKit.shirt) > 160) || ALT_KITS[0];
  return [homeKit, alt];
}

// ---------- creation ----------
/**
 * cfg = {
 *   home: teamData, away: teamData,
 *   controllers: ['p1' | 'p2' | 'ai', 'p1' | 'p2' | 'ai'],
 *   difficulty: 'easy' | 'normal' | 'hard',   // used by AI-controlled teams
 *   duration: seconds of real time per match
 * }
 */
export function createMatch(cfg) {
  const [homeKit, awayKit] = resolveKits(cfg.home.kit, cfg.away.kit);
  const teams = [cfg.home, cfg.away].map((data, i) => {
    const ctrl = cfg.controllers[i];
    const human = ctrl === 'p1' || ctrl === 'p2' ? ctrl : null;
    return {
      index: i,
      data,
      kit: i === 0 ? homeKit : awayKit,
      dir: i === 0 ? 1 : -1, // attacking direction along x
      human,
      controlled: null, // player currently driven by the human
      next: null, // player the human would get on the next pass/switch
      lastInput: { mx: 0, mz: 0 },
      seenOpponentOwner: null,
      score: 0,
      shots: 0,
      onTarget: 0,
      possessionTime: 0,
      // AI on a human's team plays at normal level; pure-AI teams use the
      // chosen difficulty.
      diff: DIFFICULTY[human ? 'normal' : cfg.difficulty || 'normal'],
    };
  });

  const players = [];
  teams.forEach((team) => {
    FORMATION.forEach((slot, idx) => {
      const pd = team.data.players[idx];
      players.push({
        id: players.length,
        team: team.index,
        idx,
        role: slot.role,
        name: pd.name,
        number: pd.number,
        stats: pd.stats,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        face: { x: team.dir, z: 0 },
        stamina: 1,
        intent: { mx: 0, mz: 0, sprint: false, action: null },
        human: null,
        kickCd: 0,
        tackleCd: 0,
        stun: 0,
        mustPass: false,
        mustPassTimer: 0,
        holdTimer: 0,
        charge: 0,
        dive: 0,
        aiTimer: Math.random() * 0.3,
        lastShotChecked: -1,
        kickAnim: 0,
      });
    });
  });

  const state = {
    teams,
    players,
    ball: {
      pos: { x: 0, y: BALL_R, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      owner: null,
      lastTouch: null,
      intended: null, // player a pass is aimed at
      shotId: 0,
      shotTeam: -1,
      shotLive: false,
    },
    clock: 0,
    duration: cfg.duration || 240,
    phase: 'kickoff',
    phaseTimer: 0,
    restart: null,
    events: [],
    banner: null,
  };

  setupKickoff(state, 0);
  return state;
}

export function teamPlayers(state, t) {
  return state.players.filter((p) => p.team === t);
}

export function toWorld(team, fx, fz) {
  return { x: fx * HALF_L * team.dir, z: fz * HALF_W * team.dir };
}

function clampPlayer(p) {
  p.pos.x = clamp(p.pos.x, -HALF_L - 3, HALF_L + 3);
  p.pos.z = clamp(p.pos.z, -HALF_W - 2.5, HALF_W + 2.5);
}

function placePlayer(p, pos, faceDir) {
  p.pos.x = pos.x; p.pos.z = pos.z;
  p.vel.x = 0; p.vel.z = 0;
  p.face.x = faceDir; p.face.z = 0;
  p.charge = 0; p.stun = 0; p.dive = 0;
  p.kickCd = 0; p.mustPass = false; p.throwIn = false;
}

function setBanner(state, text, time = 1.6) {
  state.banner = { text, time };
  state.events.push({ type: 'banner', text });
}

// ---------- human control ----------
function setControlled(state, team, p) {
  if (!team.human) return;
  if (team.controlled === p) return;
  if (team.controlled) team.controlled.human = null;
  team.controlled = p;
  if (p) {
    p.human = team.human;
    p.charge = 0;
  }
  state.events.push({ type: 'switch', team: team.index, player: p ? p.id : null });
}

function nearestTo(state, teamIdx, point, exclude = null, allowGK = false) {
  let best = null, bd = Infinity;
  for (const p of state.players) {
    if (p.team !== teamIdx || p === exclude) continue;
    if (!allowGK && p.role === 'GK') continue;
    const d = dist(p.pos, point);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------- set pieces ----------
export function setupKickoff(state, teamIdx) {
  const b = state.ball;
  for (const team of state.teams) {
    const layout = team.index === teamIdx ? KICKOFF_ATTACK : KICKOFF_DEFEND;
    teamPlayers(state, team.index).forEach((p, i) => {
      placePlayer(p, toWorld(team, layout[i].x, layout[i].z), team.dir);
    });
  }
  const taker = teamPlayers(state, teamIdx)[4];
  b.pos.x = 0; b.pos.y = BALL_R; b.pos.z = 0;
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.owner = taker; b.lastTouch = taker; b.intended = null; b.shotLive = false;
  taker.mustPass = true; taker.mustPassTimer = 0;
  for (const t of state.teams) setControlled(state, t, t.index === teamIdx ? taker : nearestTo(state, t.index, b.pos));
  state.phase = 'kickoff';
  state.phaseTimer = 1.2;
  setBanner(state, 'KICK OFF', 1.2);
}

function startRestart(state, type, teamIdx, spot) {
  const b = state.ball;
  const team = state.teams[teamIdx];
  let taker;
  if (type === 'goal kick') {
    taker = teamPlayers(state, teamIdx)[0];
  } else {
    taker = nearestTo(state, teamIdx, spot);
  }
  // Everyone else drifts back to shape; opponents keep 5 m away.
  for (const p of state.players) {
    if (p === taker) continue;
    const d = dist(p.pos, spot);
    if (p.team !== teamIdx && d < 5) {
      const nx = (p.pos.x - spot.x) / (d || 1), nz = (p.pos.z - spot.z) / (d || 1);
      p.pos.x = spot.x + nx * 5; p.pos.z = spot.z + nz * 5;
      if (d === 0) p.pos.x = spot.x - team.dir * 5;
      // Stay on the field side of the spot.
      p.pos.x = clamp(p.pos.x, -HALF_L + 0.5, HALF_L - 0.5);
      p.pos.z = clamp(p.pos.z, -HALF_W + 0.5, HALF_W - 0.5);
    }
    p.vel.x = p.vel.z = 0;
    p.charge = 0;
  }
  // The taker faces into the pitch.
  const fx = type === 'corner' ? -Math.sign(spot.x) : type === 'goal kick' ? team.dir : 0;
  const fz = type === 'throw-in' ? -Math.sign(spot.z) : type === 'corner' ? -Math.sign(spot.z) * 0.6 : 0;
  placePlayer(taker, spot, 1);
  const fl = len(fx, fz) || 1;
  taker.face.x = fx / fl; taker.face.z = fz / fl;
  if (type === 'throw-in') taker.pos.z += Math.sign(spot.z) * 0.4;

  b.owner = taker; b.lastTouch = taker; b.intended = null; b.shotLive = false;
  b.vel.x = b.vel.y = b.vel.z = 0;
  attachBall(b, taker);
  taker.mustPass = true; taker.mustPassTimer = 0;
  taker.throwIn = type === 'throw-in';
  if (type === 'goal kick') taker.holdTimer = 0.6;
  if (team.human && taker.role !== 'GK') setControlled(state, team, taker);
  const other = state.teams[1 - teamIdx];
  if (other.human) setControlled(state, other, nearestTo(state, other.index, spot));

  state.restart = { type, team: teamIdx };
  state.phase = 'restart';
  state.phaseTimer = 0.9;
  setBanner(state, type.toUpperCase(), 1.1);
}

// ---------- ball actions ----------
function attachBall(b, p) {
  b.pos.x = p.pos.x + p.face.x * DRIBBLE_OFFSET;
  b.pos.z = p.pos.z + p.face.z * DRIBBLE_OFFSET;
  b.pos.y = BALL_R;
}

function release(state, p) {
  const b = state.ball;
  b.owner = null;
  b.lastTouch = p;
  p.kickCd = 0.3;
  p.mustPass = false;
  p.throwIn = false;
  p.charge = 0;
  p.kickAnim = 0.3;
  state.events.push({ type: 'kick', player: p.id });
}

/** Pick the best teammate in a direction (used by humans). */
export function choosePassTarget(state, p, dx, dz) {
  const l = len(dx, dz);
  if (l < 0.1) { dx = p.face.x; dz = p.face.z; } else { dx /= l; dz /= l; }
  let best = null, bestScore = Infinity;
  for (const t of state.players) {
    if (t.team !== p.team || t === p) continue;
    const ox = t.pos.x - p.pos.x, oz = t.pos.z - p.pos.z;
    const d = len(ox, oz);
    if (d < 1.5) continue;
    const cos = (ox * dx + oz * dz) / d;
    const ang = Math.acos(clamp(cos, -1, 1));
    const score = ang * 16 + d * 0.3 + (t.role === 'GK' ? 10 : 0) + (ang > 1.2 ? 40 : 0);
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

export function doPass(state, p, target) {
  const b = state.ball;
  const team = state.teams[p.team];
  if (!target) return;
  const lead = Math.min(1.0, dist(p.pos, target.pos) / 16);
  const tx = target.pos.x + target.vel.x * lead;
  const tz = target.pos.z + target.vel.z * lead;
  let dx = tx - b.pos.x, dz = tz - b.pos.z;
  const d = len(dx, dz) || 1;
  dx /= d; dz /= d;
  const errMul = p.human ? 1 : team.diff.error;
  const err = (1 - p.stats.pas / 100) * 0.22 * errMul * rand();
  const c = Math.cos(err), s = Math.sin(err);
  const ex = dx * c - dz * s, ez = dx * s + dz * c;

  if (d > 24) {
    // Lofted long ball: lands around 80% of the distance then rolls.
    const flight = 1.25 + d / 60;
    const h = (d * 0.85) / flight;
    b.vel.x = ex * h; b.vel.z = ez * h;
    b.vel.y = (GRAVITY * flight) / 2;
  } else {
    const speed = clamp(Math.sqrt(2 * ROLL_DECEL * d) + 4, 8, 22);
    b.vel.x = ex * speed; b.vel.z = ez * speed;
    b.vel.y = 0.4;
  }
  b.intended = target;
  b.shotLive = false;
  release(state, p);

  // Control follows the pass: the receiver becomes the human's player and the
  // passer goes back to AI.
  if (team.human && p.human && target.role !== 'GK') setControlled(state, team, target);
  state.events.push({ type: 'pass', from: p.id, to: target.id });
}

export function doShot(state, p, power, aimInput = 0) {
  const b = state.ball;
  const team = state.teams[p.team];
  const goalX = HALF_L * team.dir;
  power = clamp(power, 0.2, 1);
  const half = GOAL.width / 2 - 0.45;
  let aimZ = aimInput !== 0 ? clamp(aimInput, -1, 1) * half : rand(-0.6, 0.6) * half;
  let dx = goalX - b.pos.x, dz = aimZ - b.pos.z;
  const d = len(dx, dz) || 1;
  dx /= d; dz /= d;
  const errMul = p.human ? 1 : team.diff.error;
  const skill = 1 - p.stats.sho / 100;
  const err = (skill * 0.14 + (power > 0.85 ? 0.04 : 0) + d / 900) * errMul * rand();
  const c = Math.cos(err), s = Math.sin(err);
  const h = 15 + 15 * power;
  b.vel.x = (dx * c - dz * s) * h;
  b.vel.z = (dx * s + dz * c) * h;
  b.vel.y = 1 + 4.2 * power * power + skill * Math.random() * 3 + d * 0.03;
  b.intended = null;
  b.shotId += 1;
  b.shotTeam = p.team;
  b.shotLive = true;
  team.shots += 1;
  release(state, p);
  p.kickCd = 0.45;
  state.events.push({ type: 'shot', player: p.id, power });
}

function doTackle(state, p) {
  const b = state.ball;
  p.tackleCd = 0.9;
  p.kickAnim = 0.35;
  const victim = b.owner;
  if (!victim || victim.team === p.team || victim.role === 'GK') {
    // Tackling a loose ball: a lunge that pokes it forward if close.
    if (!b.owner && dist(p.pos, b.pos) < 1.6 && b.pos.y < 0.8) {
      b.vel.x = p.face.x * 7; b.vel.z = p.face.z * 7; b.vel.y = 0.2;
      b.lastTouch = p; b.intended = null;
    }
    // Nobody to tackle: just a short lunge (cooldown only, no freeze).
    return;
  }
  if (dist(p.pos, victim.pos) > 1.7) { p.stun = 0.45; return; }
  const team = state.teams[p.team];
  const mul = p.human ? 1 : team.diff.tackle;
  const chance = clamp((0.45 + (p.stats.tac - victim.stats.dri) / 90) * mul, 0.12, 0.88);
  if (Math.random() < chance) {
    b.owner = null;
    b.lastTouch = p;
    b.intended = null;
    const kx = p.face.x * 0.7 + rand(-0.4, 0.4), kz = p.face.z * 0.7 + rand(-0.4, 0.4);
    b.vel.x = kx * 6; b.vel.z = kz * 6; b.vel.y = 0.3;
    victim.stun = 0.5;
    victim.kickCd = 0.4;
    victim.charge = 0;
    state.events.push({ type: 'tackle', player: p.id, won: true });
  } else {
    p.stun = 0.6;
    state.events.push({ type: 'tackle', player: p.id, won: false });
  }
}

/**
 * The player the human would get next: with the ball, the teammate a pass
 * would go to (follows the stick); without it, the teammate a switch would
 * pick (nearest to the ball).
 */
export function computeNext(state, team) {
  const p = team.controlled;
  if (!team.human || !p) return null;
  const b = state.ball;
  const inp = team.lastInput || { mx: 0, mz: 0 };
  if (b.owner === p) return choosePassTarget(state, p, inp.mx, inp.mz);
  return nearestTo(state, team.index, b.pos, p);
}

function updateNext(state) {
  for (const team of state.teams) team.next = computeNext(state, team);
}

// ---------- per-step human input ----------
/**
 * input = { mx, mz, sprint, passPressed, shootHeld, shootPressed }
 * mx/mz in [-1,1]: screen right = +x, screen up = -z.
 */
function applyHumanInput(state, team, input, dt) {
  const b = state.ball;
  let p = team.controlled;
  if (!p || (p.role === 'GK')) {
    p = nearestTo(state, team.index, b.pos);
    setControlled(state, team, p);
  }
  // When a teammate (AI) gains the ball, take control of them.
  if (b.owner && b.owner.team === team.index && b.owner !== p && b.owner.role !== 'GK') {
    p = b.owner;
    setControlled(state, team, p);
  }
  // When an opponent wins the ball, jump to our player nearest the ball
  // (only if that is clearly closer than the one we have).
  if (b.owner && b.owner.team !== team.index) {
    if (team.seenOpponentOwner !== b.owner) {
      team.seenOpponentOwner = b.owner;
      const n = nearestTo(state, team.index, b.pos);
      if (n && n !== p && dist(n.pos, b.pos) + 3 < dist(p.pos, b.pos)) {
        p = n;
        setControlled(state, team, p);
      }
    }
  } else {
    team.seenOpponentOwner = null;
  }
  if (!input) input = { mx: 0, mz: 0 };
  team.lastInput = { mx: input.mx || 0, mz: input.mz || 0 };

  const it = p.intent;
  it.mx = input.mx; it.mz = input.mz; it.sprint = !!input.sprint; it.action = null;
  const hasInput = len(input.mx, input.mz) > 0.15;

  // Receiving a pass with no stick input: run onto the ball.
  if (!hasInput && b.intended === p && !b.owner) {
    const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z;
    const l = len(dx, dz);
    if (l > 0.4) { it.mx = dx / l; it.mz = dz / l; }
  }

  if (b.owner === p) {
    if (input.passPressed) {
      it.action = { type: 'pass', target: choosePassTarget(state, p, input.mx, input.mz) };
    } else if (input.shootHeld) {
      p.charge = Math.min(1, p.charge + dt / SHOT_CHARGE_TIME);
    } else if (p.charge > 0) {
      it.action = { type: 'shoot', power: Math.max(0.25, p.charge), aim: input.mz };
    }
  } else {
    p.charge = 0;
    if (input.passPressed) {
      // Switch to the teammate nearest the ball.
      const next = nearestTo(state, team.index, b.pos, p);
      if (next) setControlled(state, team, next);
    } else if (input.shootPressed && p.tackleCd <= 0) {
      it.action = { type: 'tackle' };
    }
  }
}

// ---------- movement ----------
function movePlayer(state, p, dt) {
  const b = state.ball;
  const it = p.intent;
  const team = state.teams[p.team];
  if (p.mustPass && b.owner === p) {
    p.vel.x = p.vel.z = 0;
    // Humans can turn to aim the throw/kick, but never so the ball ends up
    // outside the pitch.
    const l = len(it.mx, it.mz);
    if (p.human && l > 0.3) {
      const fx = it.mx / l, fz = it.mz / l;
      const bx = p.pos.x + fx * DRIBBLE_OFFSET, bz = p.pos.z + fz * DRIBBLE_OFFSET;
      if (Math.abs(bx) < HALF_L - 0.3 && Math.abs(bz) < HALF_W - 0.3) {
        p.face.x = fx; p.face.z = fz; attachBall(b, p);
      }
    }
    return;
  }
  let mx = it.mx, mz = it.mz;
  const l = len(mx, mz);
  if (l > 1) { mx /= l; mz /= l; }
  const canSprint = it.sprint && p.stamina > 0.05;
  let speed = 4.6 + (p.stats.spd / 100) * 2.6;
  if (canSprint) speed *= 1.3;
  if (b.owner === p) speed *= 0.86 + p.stats.dri / 1000;
  if (p.stun > 0) speed *= 0.35;
  if (!p.human) speed *= team.diff.speed;
  if (p.dive > 0) speed *= 1.5;

  const tx = mx * speed, tz = mz * speed;
  const accel = (b.owner === p ? 14 : 20) * dt;
  let dvx = tx - p.vel.x, dvz = tz - p.vel.z;
  const dl = len(dvx, dvz);
  if (dl > accel) { dvx *= accel / dl; dvz *= accel / dl; }
  p.vel.x += dvx; p.vel.z += dvz;
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  clampPlayer(p);

  const sp = len(p.vel.x, p.vel.z);
  if (sp > 0.3) {
    // Turn smoothly towards the direction of travel.
    const k = Math.min(1, dt * (b.owner === p ? 10 : 14));
    p.face.x += (p.vel.x / sp - p.face.x) * k;
    p.face.z += (p.vel.z / sp - p.face.z) * k;
    const fl = len(p.face.x, p.face.z) || 1;
    p.face.x /= fl; p.face.z /= fl;
  }
  if (canSprint && sp > 1) p.stamina = Math.max(0, p.stamina - dt * 0.11);
  else p.stamina = Math.min(1, p.stamina + dt * 0.05);
}

function separatePlayers(state) {
  const ps = state.players;
  const min = PLAYER_RADIUS * 2;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j];
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
      const d = len(dx, dz);
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        c.pos.x += nx * push; c.pos.z += nz * push;
        clampPlayer(a); clampPlayer(c);
      }
    }
  }
}

// ---------- ball physics ----------
function collidePosts(b) {
  const r = BALL_R + 0.06;
  for (const sx of [-1, 1]) {
    const gx = sx * HALF_L;
    if (Math.abs(b.pos.x - gx) > 1) continue;
    for (const sz of [-1, 1]) {
      const pz = sz * GOAL.width / 2;
      const dx = b.pos.x - gx, dz = b.pos.z - pz;
      const d = len(dx, dz);
      if (d < r && b.pos.y < GOAL.height + BALL_R) {
        const nx = dx / (d || 1), nz = dz / (d || 1);
        const vn = b.vel.x * nx + b.vel.z * nz;
        if (vn < 0) {
          b.vel.x -= 1.6 * vn * nx; b.vel.z -= 1.6 * vn * nz;
          b.pos.x = gx + nx * r; b.pos.z = pz + nz * r;
          return 'post';
        }
      }
    }
    // Crossbar
    if (Math.abs(b.pos.z) < GOAL.width / 2) {
      const dx = b.pos.x - gx, dy = b.pos.y - GOAL.height;
      const d = Math.hypot(dx, dy);
      if (d < r) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        const vn = b.vel.x * nx + b.vel.y * ny;
        if (vn < 0) {
          b.vel.x -= 1.6 * vn * nx; b.vel.y -= 1.6 * vn * ny;
          b.pos.x = gx + nx * r; b.pos.y = GOAL.height + ny * r;
          return 'bar';
        }
      }
    }
  }
  return null;
}

function updateBall(state, dt) {
  const b = state.ball;
  if (b.owner) {
    const p = b.owner;
    attachBall(b, p);
    b.vel.x = p.vel.x; b.vel.z = p.vel.z; b.vel.y = 0;
    return;
  }
  b.vel.y -= GRAVITY * dt;
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;
  if (b.pos.y <= BALL_R) {
    b.pos.y = BALL_R;
    if (b.vel.y < -1.2) {
      b.vel.y = -b.vel.y * BOUNCE;
      b.vel.x *= 0.85; b.vel.z *= 0.85;
    } else {
      b.vel.y = 0;
    }
  }
  const h = len(b.vel.x, b.vel.z);
  if (b.pos.y <= BALL_R + 0.01 && b.vel.y === 0) {
    const nh = Math.max(0, h - ROLL_DECEL * dt - h * 0.15 * dt);
    if (h > 0) { b.vel.x *= nh / h; b.vel.z *= nh / h; }
  } else {
    const k = 1 - AIR_DRAG * dt;
    b.vel.x *= k; b.vel.z *= k;
  }
  const hit = collidePosts(b);
  if (hit) state.events.push({ type: 'woodwork', what: hit });

  // Net: keep a scored ball inside the goal.
  if (state.phase === 'goal' && Math.abs(b.pos.x) > HALF_L) {
    const sx = Math.sign(b.pos.x);
    if (Math.abs(b.pos.x) > HALF_L + GOAL.depth) { b.pos.x = sx * (HALF_L + GOAL.depth); b.vel.x *= -0.2; }
    if (Math.abs(b.pos.z) > GOAL.width / 2) { b.pos.z = Math.sign(b.pos.z) * GOAL.width / 2; b.vel.z *= -0.2; }
    if (b.pos.y > GOAL.height) { b.pos.y = GOAL.height; b.vel.y = -Math.abs(b.vel.y) * 0.2; }
  }
}

// ---------- possession ----------
function inOwnBox(state, p) {
  const team = state.teams[p.team];
  const gx = -HALF_L * team.dir;
  return Math.abs(p.pos.x - gx) < BOX.depth && Math.abs(p.pos.z) < BOX.width / 2;
}

function keeperSave(state, gk) {
  const b = state.ball;
  const team = state.teams[gk.team];
  if (gk.lastShotChecked === b.shotId) return false;
  gk.lastShotChecked = b.shotId;
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const keeperMul = team.human ? 0 : team.diff.keeper;
  const chance = clamp(0.5 + (gk.stats.gk - 80) / 60 + keeperMul - (speed - 18) / 40, 0.15, 0.92);
  if (Math.random() >= chance) return false;
  b.shotLive = false;
  if (speed > 29 || Math.random() < (speed - 16) / 20) {
    // Parry: push the ball wide, can lead to a corner.
    b.vel.x = team.dir * rand(2, 6);
    b.vel.z = (b.pos.z >= 0 ? 1 : -1) * rand(5, 10);
    b.vel.y = rand(1, 4);
    b.lastTouch = gk;
    gk.kickCd = 0.6;
    state.events.push({ type: 'save', player: gk.id, parry: true });
  } else {
    b.owner = gk;
    b.lastTouch = gk;
    b.intended = null;
    gk.holdTimer = 1.0;
    gk.mustPass = true;
    gk.mustPassTimer = 0;
    state.events.push({ type: 'save', player: gk.id, parry: false });
  }
  if (b.shotTeam >= 0) state.teams[b.shotTeam].onTarget += 1;
  return true;
}

function updatePossession(state) {
  const b = state.ball;
  if (b.owner) return;
  const speed = len(b.vel.x, b.vel.z);
  let best = null, bd = Infinity;
  for (const p of state.players) {
    if (p.kickCd > 0 || p.stun > 0) continue;
    const isGK = p.role === 'GK' && inOwnBox(state, p);
    const reachH = isGK ? 2.5 : 1.1;
    if (b.pos.y > reachH) continue;
    const r = isGK ? 1.25 + (p.dive > 0 ? 1.0 : 0) : CONTROL_RADIUS + (b.intended === p ? 0.25 : 0);
    const d = dist(p.pos, b.pos);
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (!best) return;

  const isGK = best.role === 'GK' && inOwnBox(state, best);
  if (isGK && b.shotLive && b.shotTeam !== best.team) {
    if (!keeperSave(state, best)) best.kickCd = 0.5; // beaten
    return;
  }
  // Hard, fast balls are often blocked rather than controlled.
  if (!isGK && speed > 19 && b.intended !== best) {
    if (Math.random() < 0.55) {
      b.vel.x *= -0.25 + rand(-0.15, 0.15);
      b.vel.z = b.vel.z * 0.3 + rand(-4, 4);
      b.vel.y = Math.abs(b.vel.y) * 0.3 + 1;
      b.lastTouch = best;
      b.shotLive = false;
      best.kickCd = 0.3;
      state.events.push({ type: 'block', player: best.id });
      return;
    }
  }
  // Turn to face the ball so taking control doesn't teleport it (for example
  // over the touchline).
  const fx = b.pos.x - best.pos.x, fz = b.pos.z - best.pos.z;
  const fl = len(fx, fz);
  if (fl > 0.05) { best.face.x = fx / fl; best.face.z = fz / fl; }
  b.owner = best;
  b.lastTouch = best;
  b.intended = null;
  b.shotLive = false;
  b.vel.y = 0;
  if (isGK) { best.holdTimer = 1.0; best.mustPass = true; best.mustPassTimer = 0; }
  state.events.push({ type: 'control', player: best.id });
}

// ---------- rules: goals and out of play ----------
function checkOutOfPlay(state) {
  const b = state.ball;
  if (state.phase !== 'play') return;
  const x = b.pos.x, z = b.pos.z;
  if (Math.abs(x) > HALF_L + BALL_R) {
    const endSign = Math.sign(x);
    if (Math.abs(z) < GOAL.width / 2 && b.pos.y < GOAL.height) {
      const scorer = state.teams.find((t) => t.dir === endSign);
      scoreGoal(state, scorer.index);
      return;
    }
    const defending = state.teams.find((t) => t.dir === -endSign);
    const lastTeam = b.lastTouch ? b.lastTouch.team : -1;
    if (lastTeam === defending.index) {
      const attacker = 1 - defending.index;
      startRestart(state, 'corner', attacker, {
        x: endSign * (HALF_L - 0.3), z: Math.sign(z || 1) * (HALF_W - 0.3),
      });
    } else {
      startRestart(state, 'goal kick', defending.index, {
        x: endSign * (HALF_L - 4), z: 0,
      });
    }
    return;
  }
  if (Math.abs(z) > HALF_W + BALL_R) {
    const lastTeam = b.lastTouch ? b.lastTouch.team : 0;
    startRestart(state, 'throw-in', 1 - lastTeam, {
      x: clamp(x, -HALF_L + 1, HALF_L - 1), z: Math.sign(z) * HALF_W,
    });
  }
}

function scoreGoal(state, teamIdx) {
  const b = state.ball;
  const team = state.teams[teamIdx];
  team.score += 1;
  if (b.shotLive && b.shotTeam === teamIdx) team.onTarget += 1;
  const scorer = b.lastTouch;
  const own = scorer && scorer.team !== teamIdx;
  state.events.push({
    type: 'goal', team: teamIdx, scorer: scorer ? scorer.name : '', ownGoal: own,
  });
  state.lastGoal = { team: teamIdx, scorer: scorer ? scorer.name : '', ownGoal: own, clock: state.clock };
  setBanner(state, 'GOAL!', 2.4);
  b.shotLive = false;
  b.intended = null;
  state.phase = 'goal';
  state.phaseTimer = 2.6;
  state.kickoffNext = 1 - teamIdx;
}

// ---------- main step ----------
/**
 * Advance the match by dt seconds.
 * inputs = { p1: input|null, p2: input|null }
 */
export function stepMatch(state, inputs, dt) {
  if (state.phase === 'fulltime') return;
  const b = state.ball;
  if (state.banner) { state.banner.time -= dt; if (state.banner.time <= 0) state.banner = null; }

  // Timers
  for (const p of state.players) {
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.dive = Math.max(0, p.dive - dt);
    p.kickAnim = Math.max(0, p.kickAnim - dt);
  }

  if (state.phase === 'goal') {
    state.phaseTimer -= dt;
    updateBall(state, dt);
    for (const p of state.players) { p.intent.mx = 0; p.intent.mz = 0; movePlayer(state, p, dt); }
    if (state.phaseTimer <= 0) {
      if (state.clock >= state.duration) endMatch(state);
      else setupKickoff(state, state.kickoffNext);
    }
    return;
  }

  if (state.phase === 'kickoff' || state.phase === 'restart') {
    state.phaseTimer -= dt;
    updateNext(state);
    if (state.phaseTimer <= 0) { state.phase = 'play'; state.restart = null; }
    else return;
  }

  // ----- play -----
  state.clock += dt;
  if (b.owner) state.teams[b.owner.team].possessionTime += dt;

  for (const p of state.players) p.intent.action = null;
  for (const team of state.teams) {
    if (team.human) applyHumanInput(state, team, inputs[team.human], dt);
  }
  updateAI(state, dt);

  // Must-pass safety timeout (throw-ins, kick-offs, keeper holding).
  for (const p of state.players) {
    if (p.mustPass && b.owner === p) {
      p.mustPassTimer += dt;
      if (p.mustPassTimer > MUST_PASS_TIMEOUT && !p.intent.action) {
        p.intent.action = { type: 'pass', target: choosePassTarget(state, p, p.face.x, p.face.z) };
      }
    }
  }

  // Resolve actions
  for (const p of state.players) {
    const a = p.intent.action;
    if (!a) continue;
    if (a.type === 'pass' && b.owner === p) doPass(state, p, a.target);
    else if (a.type === 'shoot' && b.owner === p && p.throwIn) {
      // You can't shoot from a throw-in: throw it to a teammate instead.
      doPass(state, p, choosePassTarget(state, p, p.face.x, p.face.z));
    } else if (a.type === 'shoot' && b.owner === p) doShot(state, p, a.power, a.aim || 0);
    else if (a.type === 'tackle') doTackle(state, p);
  }

  for (const p of state.players) movePlayer(state, p, dt);
  separatePlayers(state);
  updateBall(state, dt);
  updatePossession(state);
  checkOutOfPlay(state);

  // A pass that nobody reached is no longer "intended".
  if (b.intended && !b.owner && len(b.vel.x, b.vel.z) < 0.5) b.intended = null;

  updateNext(state);
  if (state.clock >= state.duration && state.phase === 'play') endMatch(state);
}

function endMatch(state) {
  state.phase = 'fulltime';
  state.ball.owner = null;
  setBanner(state, 'FULL TIME', 99);
  state.events.push({ type: 'fulltime' });
}

/** Match clock shown as 0-90 minutes. */
export function displayMinute(state) {
  return Math.min(90, Math.floor((state.clock / state.duration) * 90));
}
