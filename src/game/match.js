// Match engine: pure game logic with no rendering code, so it can run
// headless (tests) and be ported to Unity/Godot later.

import {
  HALF_L, HALF_W, GOAL, BOX, BALL_R, GRAVITY, ROLL_DECEL, AIR_DRAG, BOUNCE,
  CONTROL_RADIUS, DRIBBLE_OFFSET, PLAYER_RADIUS, SHOT_CHARGE_TIME,
  MUST_PASS_TIMEOUT, DIFFICULTY, FORMATION, FORMATIONS,
  PENALTY_SPOT,
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
      yellowCards: 0,
      redCards: 0,
      injuries: 0,
      substitutions: 0,
      pendingSubstitution: null,
      tactic: 'balanced',
      formation: '4-3-3',
      // AI on a human's team plays at normal level; pure-AI teams use the
      // chosen difficulty.
      diff: DIFFICULTY[human ? 'normal' : cfg.difficulty || 'normal'],
    };
  });

  const players = [];
  teams.forEach((team) => {
    const addPlayer = (pd, idx, role, onPitch, benchIndex = -1) => {
      players.push({
        id: players.length,
        team: team.index,
        idx,
        role,
        benchRole: role,
        benchIndex,
        onPitch,
        name: pd.name,
        number: pd.number,
        stats: pd.stats,
        yellowCards: 0,
        sentOff: false,
        subbedOff: false,
        injured: false,
        pos: onPitch
          ? { x: 0, z: 0 }
          : { x: team.dir * (HALF_L - 1), z: team.dir * (HALF_W - 1) },
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
    };
    FORMATION.forEach((slot, idx) => addPlayer(team.data.players[idx], idx, slot.role, true));
    (team.data.bench || []).forEach((pd, benchIndex) => addPlayer(pd, -1, pd.role, false, benchIndex));
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
      offsidePlayers: [], // players in an offside position at the last teammate pass
      restartNoOffsideBy: null, // restart taker exempt from offside on the first kick
      restartDoubleTouchBy: null, // restart taker cannot play the ball twice in succession
      directThrowInGoalBlockedBy: null, // throw-ins cannot score directly before another touch
      shotId: 0,
      shotTeam: -1,
      shotLive: false,
    },
    clock: 0,
    duration: cfg.duration || 240,
    penalty: null,
    openingKickoff: 0,
    phase: 'kickoff',
    phaseTimer: 0,
    halftimeDone: false,
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

export function setTeamTactic(state, teamIdx, tactic) {
  const team = state.teams[teamIdx];
  if (!team || !['balanced', 'attacking', 'defensive'].includes(tactic)) return false;
  if (team.tactic === tactic) return true;
  team.tactic = tactic;
  state.events.push({ type: 'tactic', team: teamIdx, tactic });
  return true;
}

export function setTeamFormation(state, teamIdx, formation) {
  const team = state.teams[teamIdx];
  const slots = FORMATIONS[formation];
  if (!team || !slots) return false;
  if (team.formation === formation) return true;
  team.formation = formation;
  for (const player of teamPlayers(state, teamIdx)) {
    if (player.onPitch && !player.sentOff) player.role = slots[player.idx].role;
  }
  state.events.push({ type: 'formation', team: teamIdx, formation });
  return true;
}

/** Make the change now at a stoppage, or queue it for the next dead ball. */
export function makeSubstitution(state, teamIdx, outgoingId, incomingId) {
  const team = state.teams[teamIdx];
  const outgoing = state.players[outgoingId];
  const incoming = state.players[incomingId];
  if (!team || !outgoing || !incoming || outgoing.team !== teamIdx || incoming.team !== teamIdx) return false;
  if (!outgoing.onPitch || outgoing.sentOff || incoming.onPitch || incoming.sentOff || incoming.subbedOff) return false;
  if (team.substitutions >= 3 || team.pendingSubstitution
      || state.penalty?.active || state.penalty?.pending) return false;
  if (!['kickoff', 'restart', 'goal', 'halftime'].includes(state.phase)) {
    team.pendingSubstitution = { outgoing: outgoingId, incoming: incomingId };
    state.events.push({ type: 'substitutionQueued', team: teamIdx, outgoing: outgoingId, incoming: incomingId });
    return true;
  }
  return applySubstitution(state, team, outgoing, incoming);
}

export function cancelPendingSubstitution(state, teamIdx) {
  const team = state.teams[teamIdx];
  if (!team?.pendingSubstitution) return false;
  team.pendingSubstitution = null;
  state.events.push({ type: 'substitutionCancelled', team: teamIdx });
  return true;
}

function applySubstitution(state, team, outgoing, incoming) {
  if (!outgoing.onPitch || outgoing.sentOff || incoming.onPitch || incoming.sentOff || incoming.subbedOff) return false;
  if (team.substitutions >= 3) return false;
  const slot = outgoing.idx;
  const position = { ...outgoing.pos };
  const wasControlled = team.controlled === outgoing;
  const hadBall = state.ball.owner === outgoing;
  const oldRole = outgoing.role;
  const outgoingMustPass = outgoing.mustPass;
  const outgoingThrowIn = outgoing.throwIn;
  const outgoingHoldTimer = outgoing.holdTimer;

  outgoing.onPitch = false;
  outgoing.subbedOff = true;
  outgoing.idx = -1;
  outgoing.benchRole = oldRole;
  outgoing.pos.x = team.dir * (HALF_L - 1);
  outgoing.pos.z = team.dir * (HALF_W - 1);
  outgoing.vel.x = outgoing.vel.z = 0;
  outgoing.intent.mx = outgoing.intent.mz = 0;
  outgoing.intent.action = null;
  outgoing.human = null;
  outgoing.charge = 0;

  incoming.onPitch = true;
  incoming.idx = slot;
  incoming.role = oldRole;
  incoming.pos.x = position.x;
  incoming.pos.z = position.z;
  incoming.face.x = outgoing.face.x;
  incoming.face.z = outgoing.face.z;
  incoming.vel.x = incoming.vel.z = 0;
  incoming.stun = 0;
  incoming.intent.mx = incoming.intent.mz = 0;
  incoming.intent.action = null;
  incoming.mustPass = hadBall && outgoingMustPass;
  incoming.mustPassTimer = hadBall ? outgoing.mustPassTimer : 0;
  incoming.throwIn = hadBall && outgoingThrowIn;
  incoming.holdTimer = hadBall ? outgoingHoldTimer : 0;
  outgoing.mustPass = false;
  outgoing.throwIn = false;

  if (hadBall) {
    state.ball.owner = incoming;
    state.ball.lastTouch = incoming;
    state.ball.intended = null;
  } else if (state.ball.intended === outgoing) {
    state.ball.intended = incoming;
  }
  state.ball.offsidePlayers = state.ball.offsidePlayers.filter((player) => player !== outgoing);
  if (wasControlled) setControlled(state, team, incoming);
  team.substitutions++;
  state.events.push({ type: 'substitution', team: teamIdx, outgoing: outgoing.id, incoming: incoming.id });
  return true;
}

function applyPendingSubstitutions(state) {
  for (const team of state.teams) {
    const pending = team.pendingSubstitution;
    if (!pending) continue;
    team.pendingSubstitution = null;
    const applied = applySubstitution(state, team, state.players[pending.outgoing], state.players[pending.incoming]);
    if (!applied) state.events.push({ type: 'substitutionCancelled', team: team.index });
  }
}

function automateHalftimeSubstitutions(state) {
  for (const team of state.teams) {
    if (team.human || team.substitutions >= 3) continue;
    while (team.substitutions < 3) {
      const replaceable = state.players.filter((player) => player.team === team.index
        && player.onPitch && !player.sentOff && !player.subbedOff
        && (player.injured || player.stamina <= 0.58)
        && state.players.some((reserve) => reserve.team === team.index && !reserve.onPitch
          && !reserve.sentOff && !reserve.subbedOff));
      const outgoing = replaceable.sort((a, b) =>
        Number(b.injured) - Number(a.injured) || a.stamina - b.stamina,
      )[0];
      if (!outgoing) break;
      const incoming = state.players
        .filter((p) => p.team === team.index && !p.onPitch && !p.sentOff && !p.subbedOff)
        .sort((a, b) => ratingForRole(b, outgoing.role) - ratingForRole(a, outgoing.role))[0];
      if (!incoming || !makeSubstitution(state, team.index, outgoing.id, incoming.id)) break;
    }
  }
}

function ratingForRole(player, role = player.role) {
  const s = player.stats;
  if (role === 'GK') return s.gk;
  if (role === 'DEF') return s.tac * 0.55 + s.spd * 0.2 + s.pas * 0.15 + s.dri * 0.1;
  if (role === 'MID') return s.pas * 0.35 + s.dri * 0.25 + s.spd * 0.2 + s.tac * 0.2;
  return s.sho * 0.4 + s.spd * 0.25 + s.dri * 0.25 + s.pas * 0.1;
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
  if (p?.sentOff) p = null;
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
    if (p.team !== teamIdx || p === exclude || !p.onPitch || p.sentOff) continue;
    if (!allowGK && p.role === 'GK') continue;
    const d = dist(p.pos, point);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------- set pieces ----------
export function setupKickoff(state, teamIdx) {
  applyPendingSubstitutions(state);
  const b = state.ball;
  for (const team of state.teams) {
    const slots = FORMATIONS[team.formation] || FORMATION;
    teamPlayers(state, team.index).forEach((p) => {
      if (!p.onPitch) return;
      if (p.sentOff) {
        p.pos.x = team.dir * (HALF_L + 2.5);
        p.pos.z = 0;
        p.vel.x = p.vel.z = 0;
        p.intent.mx = p.intent.mz = 0;
        return;
      }
      const slot = slots[p.idx];
      const localX = team.index === teamIdx
        ? (p.idx === 4 ? -0.02 : slot.x)
        : Math.min(slot.x, -0.2);
      placePlayer(p, toWorld(team, localX, team.index === teamIdx && p.idx === 4 ? 0 : slot.z), team.dir);
    });
  }
  const taker = teamPlayers(state, teamIdx).find((p) => p.idx === 4 && !p.sentOff)
    || nearestTo(state, teamIdx, { x: 0, z: 0 }, null, true);
  if (!taker) return;
  b.pos.x = 0; b.pos.y = BALL_R; b.pos.z = 0;
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.owner = taker; b.lastTouch = taker; b.intended = null; b.shotLive = false;
  b.offsidePlayers = [];
  b.restartNoOffsideBy = null;
  b.restartDoubleTouchBy = taker;
  b.directThrowInGoalBlockedBy = null;
  taker.mustPass = true; taker.mustPassTimer = 0;
  for (const t of state.teams) setControlled(state, t, t.index === teamIdx ? taker : nearestTo(state, t.index, b.pos));
  state.phase = 'kickoff';
  state.phaseTimer = 1.2;
  setBanner(state, 'KICK OFF', 1.2);
}

function startRestart(state, type, teamIdx, spot) {
  applyPendingSubstitutions(state);
  const b = state.ball;
  state.penalty = null;
  const team = state.teams[teamIdx];
  let taker;
  if (type === 'goal kick') {
    taker = teamPlayers(state, teamIdx).find((p) => p.onPitch && p.role === 'GK' && !p.sentOff)
      || nearestTo(state, teamIdx, spot, null, true);
  } else {
    taker = nearestTo(state, teamIdx, spot);
  }
  if (!taker) taker = nearestTo(state, teamIdx, spot, null, true);
  if (!taker) return;
  const minDistance = type === 'throw-in' ? 2 : ['free kick', 'corner'].includes(type) ? 9.15 : 5;
  // Everyone else drifts back to shape; opponents respect the restart distance.
  for (const p of state.players) {
    if (!p.onPitch || p === taker || p.sentOff) continue;
    const d = dist(p.pos, spot);
    if (p.team !== teamIdx && d < minDistance) {
      const nx = (p.pos.x - spot.x) / (d || 1), nz = (p.pos.z - spot.z) / (d || 1);
      p.pos.x = spot.x + nx * minDistance; p.pos.z = spot.z + nz * minDistance;
      if (d === 0) p.pos.x = spot.x - team.dir * minDistance;
      // Stay on the field side of the spot.
      p.pos.x = clamp(p.pos.x, -HALF_L + 0.5, HALF_L - 0.5);
      p.pos.z = clamp(p.pos.z, -HALF_W + 0.5, HALF_W - 0.5);
    }
    p.vel.x = p.vel.z = 0;
    p.charge = 0;
  }
  if (type === 'free kick') {
    const goalX = HALF_L * team.dir;
    const toGoalX = goalX - spot.x, toGoalZ = -spot.z;
    const goalDistance = len(toGoalX, toGoalZ);
    if (goalDistance < 42) {
      const gx = toGoalX / (goalDistance || 1), gz = toGoalZ / (goalDistance || 1);
      const wallSize = goalDistance < 28 ? 4 : goalDistance < 36 ? 3 : 2;
      const wall = teamPlayers(state, 1 - teamIdx)
        .filter((p) => p.onPitch && !p.sentOff && p.role !== 'GK')
        .sort((a, b) => dist(a.pos, spot) - dist(b.pos, spot))
        .slice(0, wallSize);
      const centerX = spot.x + gx * minDistance;
      const centerZ = spot.z + gz * minDistance;
      wall.forEach((p, i) => {
        const offset = (i - (wall.length - 1) / 2) * 1.15;
        p.pos.x = clamp(centerX - gz * offset, -HALF_L + 0.5, HALF_L - 0.5);
        p.pos.z = clamp(centerZ + gx * offset, -HALF_W + 0.5, HALF_W - 0.5);
        p.vel.x = p.vel.z = 0;
        p.face.x = -gx; p.face.z = -gz;
      });
    }
  }
  // The taker faces into the pitch.
  const fx = type === 'corner' ? -Math.sign(spot.x) : type === 'goal kick' || type === 'free kick' ? team.dir : 0;
  const fz = type === 'throw-in' ? -Math.sign(spot.z) : type === 'corner' ? -Math.sign(spot.z) * 0.6 : 0;
  placePlayer(taker, spot, 1);
  const fl = len(fx, fz) || 1;
  taker.face.x = fx / fl; taker.face.z = fz / fl;
  if (type === 'throw-in') taker.pos.z += Math.sign(spot.z) * 0.4;

  b.owner = taker; b.lastTouch = taker; b.intended = null; b.shotLive = false;
  b.offsidePlayers = [];
  b.restartNoOffsideBy = ['throw-in', 'goal kick', 'corner'].includes(type) ? taker : null;
  b.restartDoubleTouchBy = taker;
  b.directThrowInGoalBlockedBy = type === 'throw-in' ? taker : null;
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

function inPenaltyArea(state, defendingTeamIdx, point) {
  const defendingTeam = state.teams[defendingTeamIdx];
  const goalX = -HALF_L * defendingTeam.dir;
  return Math.abs(point.x - goalX) < BOX.depth && Math.abs(point.z) < BOX.width / 2;
}

function startPenalty(state, teamIdx) {
  const team = state.teams[teamIdx];
  const opponent = state.teams[1 - teamIdx];
  const candidates = teamPlayers(state, teamIdx).filter((p) => p.onPitch && p.role !== 'GK' && !p.sentOff);
  const shooter = team.human && team.controlled && !team.controlled.sentOff && team.controlled.role !== 'GK'
    ? team.controlled
    : candidates.reduce((best, p) => !best || p.stats.sho > best.stats.sho ? p : best, null)
      || teamPlayers(state, teamIdx).find((p) => p.onPitch && p.role === 'GK' && !p.sentOff);
  const keeper = teamPlayers(state, opponent.index).find((p) => p.onPitch && p.role === 'GK' && !p.sentOff);
  if (!shooter) return;
  const goalX = HALF_L * team.dir;
  const spot = { x: goalX - team.dir * PENALTY_SPOT, z: 0 };

  // Keep everyone behind the penalty arc until the kick is taken.
  for (const p of state.players) {
    if (!p.onPitch || p.sentOff || p === shooter || p === keeper) continue;
    const teamOffset = p.team === teamIdx ? -1.2 : 1.2;
    const z = (p.idx - 5.5) * 5.1 + teamOffset;
    const x = -team.dir * 3 + (p.team === teamIdx ? -3 : 3);
    placePlayer(p, { x, z }, team.dir);
  }
  placePlayer(shooter, { x: spot.x - team.dir * DRIBBLE_OFFSET, z: 0 }, team.dir);
  if (keeper) placePlayer(keeper, { x: goalX - team.dir * 0.15, z: 0 }, -team.dir);

  state.ball.pos.x = spot.x;
  state.ball.pos.y = BALL_R;
  state.ball.pos.z = 0;
  state.ball.vel.x = state.ball.vel.y = state.ball.vel.z = 0;
  state.ball.owner = shooter;
  state.ball.lastTouch = shooter;
  state.ball.intended = null;
  state.ball.offsidePlayers = [];
  state.ball.restartNoOffsideBy = null;
  state.ball.restartDoubleTouchBy = shooter;
  state.ball.directThrowInGoalBlockedBy = null;
  state.ball.shotLive = false;
  shooter.mustPass = false;
  shooter.charge = 0;
  setControlled(state, team, shooter);
  if (opponent.human) setControlled(state, opponent, nearestTo(state, opponent.index, spot));

  state.penalty = { attacker: teamIdx, shooter, active: true, pending: false, elapsed: 0 };
  state.restart = { type: 'penalty', team: teamIdx };
  state.phase = 'penalty';
  state.phaseTimer = 1.6;
  setBanner(state, 'PENALTY', 1.6);
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
    if (t.team !== p.team || t === p || !t.onPitch || t.sentOff) continue;
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
  // Offside position is judged when the ball is played. A player must be in
  // the opponents' half and ahead of both the ball and the second-last rival.
  const restartExempt = b.restartNoOffsideBy === p;
  if (restartExempt) b.restartNoOffsideBy = null;
  if (restartExempt) {
    b.offsidePlayers = [];
  } else {
    const dir = team.dir;
    const defenders = state.players
      .filter((other) => other.team !== p.team && other.onPitch && !other.sentOff)
      .map((other) => other.pos.x * dir)
      .sort((a, b) => b - a);
    const secondLastDefender = defenders[1] ?? HALF_L;
    const ballLine = b.pos.x * dir;
    b.offsidePlayers = teamPlayers(state, p.team).filter((teammate) =>
      teammate.onPitch
        && !teammate.sentOff
        && teammate !== p
        && teammate.pos.x * dir > 0
        && teammate.pos.x * dir > ballLine + 0.05
        && teammate.pos.x * dir > secondLastDefender + 0.05,
    );
  }
  const lead = Math.min(1.0, dist(p.pos, target.pos) / 16);
  const tx = target.pos.x + target.vel.x * lead;
  const tz = target.pos.z + target.vel.z * lead;
  let dx = tx - b.pos.x, dz = tz - b.pos.z;
  const d = len(dx, dz) || 1;
  dx /= d; dz /= d;
  const errMul = p.human ? 1 : team.diff.error;
  const fatigue = (1 + (1 - p.stamina) * 0.25) * (p.injured ? 1.3 : 1);
  const err = (1 - p.stats.pas / 100) * 0.22 * errMul * fatigue * rand();
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
  const penaltyShot = state.penalty?.active && state.penalty.shooter === p;
  const goalX = HALF_L * team.dir;
  power = clamp(power, 0.2, 1);
  const half = GOAL.width / 2 - 0.45;
  let aimZ = aimInput !== 0 ? clamp(aimInput, -1, 1) * half : rand(-0.6, 0.6) * half;
  let dx = goalX - b.pos.x, dz = aimZ - b.pos.z;
  const d = len(dx, dz) || 1;
  dx /= d; dz /= d;
  const errMul = p.human ? 1 : team.diff.error;
  const skill = 1 - p.stats.sho / 100;
  const fatigue = (1 + (1 - p.stamina) * 0.25) * (p.injured ? 1.3 : 1);
  const err = (skill * 0.14 + (power > 0.85 ? 0.04 : 0) + d / 900) * errMul * fatigue * rand();
  const c = Math.cos(err), s = Math.sin(err);
  const h = 15 + 15 * power;
  b.vel.x = (dx * c - dz * s) * h;
  b.vel.z = (dx * s + dz * c) * h;
  b.vel.y = penaltyShot
    ? 0.35 + power * 0.9
    : 1 + 4.2 * power * power + skill * Math.random() * 3 + d * 0.03;
  b.intended = null;
  b.offsidePlayers = [];
  b.restartNoOffsideBy = null;
  b.shotId += 1;
  b.shotTeam = p.team;
  b.shotLive = true;
  if (penaltyShot) {
    state.penalty.active = false;
    state.penalty.pending = true;
    state.penalty.elapsed = 0;
  }
  team.shots += 1;
  release(state, p);
  p.kickCd = 0.45;
  state.events.push({ type: 'shot', player: p.id, power });
}

function sendOff(state, p, secondYellow = false) {
  const team = state.teams[p.team];
  p.sentOff = true;
  p.human = null;
  p.charge = 0;
  p.vel.x = p.vel.z = 0;
  p.intent.mx = p.intent.mz = 0;
  p.intent.sprint = false;
  p.pos.x = team.dir * (HALF_L + 2.5);
  p.pos.z = 0;
  team.redCards++;
  if (team.controlled === p) setControlled(state, team, nearestTo(state, team.index, p.pos));
  state.events.push({ type: 'card', team: team.index, player: p.id, color: 'red', secondYellow });
}

function issueCard(state, p, color) {
  const team = state.teams[p.team];
  if (color === 'red') {
    sendOff(state, p);
    return;
  }
  p.yellowCards++;
  team.yellowCards++;
  if (p.yellowCards >= 2) sendOff(state, p, true);
  else state.events.push({ type: 'card', team: team.index, player: p.id, color: 'yellow', secondYellow: false });
}

function injurePlayer(state, p) {
  if (p.injured) return;
  p.injured = true;
  p.stun = Math.max(p.stun, 0.9);
  state.teams[p.team].injuries++;
  state.events.push({ type: 'injury', team: p.team, player: p.id });
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
      b.restartDoubleTouchBy = null;
      b.directThrowInGoalBlockedBy = null;
    }
    // Nobody to tackle: just a short lunge (cooldown only, no freeze).
    return;
  }
  if (dist(p.pos, victim.pos) > 1.7) { p.stun = 0.45; return; }
  const team = state.teams[p.team];
  const behind = (p.pos.x - victim.pos.x) * victim.face.x
    + (p.pos.z - victim.pos.z) * victim.face.z < -0.35;
  const movingFast = p.intent.sprint || len(p.vel.x, p.vel.z) > 5;
  const foulChance = clamp(
    0.035 + (behind ? 0.18 : 0) + (movingFast ? 0.07 : 0)
      + Math.max(0, victim.stats.dri - p.stats.tac) / 1250,
    0.02, 0.38,
  );
  if (Math.random() < foulChance) {
    const spot = { x: victim.pos.x, z: victim.pos.z };
    const penalty = inPenaltyArea(state, p.team, spot);
    victim.stun = 0.25;
    p.stun = 0.35;
    state.events.push({ type: 'foul', team: victim.team, player: p.id, victim: victim.id, penalty });
    if (movingFast && Math.random() < 0.045) injurePlayer(state, victim);
    if (p.role !== 'GK') {
      if (behind && movingFast && Math.random() < 0.12) issueCard(state, p, 'red');
      else if ((behind || movingFast) && Math.random() < 0.45) issueCard(state, p, 'yellow');
    }
    if (penalty) startPenalty(state, victim.team);
    else startRestart(state, 'free kick', victim.team, spot);
    return;
  }
  const mul = p.human ? 1 : team.diff.tackle;
  const chance = clamp((0.45 + (p.stats.tac - victim.stats.dri) / 90) * mul, 0.12, 0.88);
  if (Math.random() < chance) {
    b.owner = null;
    b.lastTouch = p;
    b.intended = null;
    b.restartDoubleTouchBy = null;
    b.directThrowInGoalBlockedBy = null;
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
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
  if (!team.human || !p || p.sentOff) return null;
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
  if (!p || p.sentOff || (p.role === 'GK')) {
    p = nearestTo(state, team.index, b.pos);
    if (!p) return;
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
  if (state.penalty?.active) {
    it.mx = it.mz = 0;
    it.sprint = false;
    if (p === state.penalty.shooter && b.owner === p) {
      if (input.shootHeld) p.charge = Math.min(1, p.charge + dt / SHOT_CHARGE_TIME);
      else if (p.charge > 0) it.action = { type: 'shoot', power: Math.max(0.25, p.charge), aim: input.mz };
    } else {
      p.charge = 0;
    }
    return;
  }
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
  if (!p.onPitch || p.sentOff) {
    p.vel.x = p.vel.z = 0;
    p.intent.mx = p.intent.mz = 0;
    p.intent.action = null;
    return;
  }
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
  const canSprint = it.sprint && p.stamina > 0.05 && !p.injured;
  let speed = 4.6 + (p.stats.spd / 100) * 2.6;
  // Fatigue has a gradual effect so tired players remain controllable but
  // cannot match a fresh player's pace for the whole match.
  speed *= 1 - (1 - p.stamina) * 0.18;
  if (p.injured) speed *= 0.78;
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
      if (!a.onPitch || !c.onPitch || a.sentOff || c.sentOff) continue;
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

function checkOffsideChallenge(state) {
  const b = state.ball;
  if (b.owner || b.pos.y > 2.2 || !b.offsidePlayers.length) return false;
  for (const attacker of b.offsidePlayers) {
    if (!attacker.onPitch || attacker.sentOff) continue;
    const defender = state.players.find((p) => p.onPitch && !p.sentOff
      && p.team !== attacker.team
      && dist(p.pos, b.pos) < 2.2
      && dist(p.pos, attacker.pos) < 1.7);
    if (!defender) continue;

    const spot = { x: attacker.pos.x, z: attacker.pos.z };
    const defendingTeam = state.teams[defender.team];
    b.owner = null;
    b.intended = null;
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
    b.shotLive = false;
    b.vel.x = b.vel.y = b.vel.z = 0;
    state.events.push({ type: 'offside', team: attacker.team, player: attacker.id, interference: true });
    startRestart(state, 'free kick', defendingTeam.index, spot);
    return true;
  }
  return false;
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
    if (state.penalty?.pending) state.penalty = null;
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
    if (!p.onPitch || p.sentOff) continue;
    if (p.kickCd > 0 || p.stun > 0) continue;
    const isGK = p.role === 'GK' && inOwnBox(state, p);
    const reachH = isGK ? 2.5 : 1.1;
    if (b.pos.y > reachH) continue;
    const r = isGK ? 1.25 + (p.dive > 0 ? 1.0 : 0) : CONTROL_RADIUS + (b.intended === p ? 0.25 : 0);
    const d = dist(p.pos, b.pos);
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (!best) return;

  if (b.restartDoubleTouchBy === best) {
    const spot = { x: b.pos.x, z: b.pos.z };
    const opposingTeam = 1 - best.team;
    b.owner = null;
    b.intended = null;
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
    b.restartDoubleTouchBy = null;
    b.shotLive = false;
    b.vel.x = b.vel.y = b.vel.z = 0;
    state.events.push({ type: 'doubleTouch', team: best.team, player: best.id });
    startRestart(state, 'free kick', opposingTeam, spot);
    return;
  }
  if (b.restartDoubleTouchBy) b.restartDoubleTouchBy = null;
  if (b.directThrowInGoalBlockedBy && b.directThrowInGoalBlockedBy !== best) b.directThrowInGoalBlockedBy = null;

  if (b.offsidePlayers.includes(best)) {
    const spot = { x: b.pos.x, z: b.pos.z };
    const defendingTeam = 1 - best.team;
    b.owner = null;
    b.intended = null;
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
    b.vel.x = b.vel.y = b.vel.z = 0;
    state.events.push({ type: 'offside', team: best.team, player: best.id });
    startRestart(state, 'free kick', defendingTeam, spot);
    return;
  }

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
      b.restartDoubleTouchBy = null;
      b.directThrowInGoalBlockedBy = null;
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
  b.offsidePlayers = [];
  b.restartNoOffsideBy = null;
  b.restartDoubleTouchBy = null;
  b.directThrowInGoalBlockedBy = null;
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
      const thrower = b.directThrowInGoalBlockedBy;
      if (thrower) {
        const ownGoalEnd = endSign !== state.teams[thrower.team].dir;
        state.events.push({ type: 'throwInGoal', ownGoalEnd });
        if (endSign === state.teams[thrower.team].dir) {
          startRestart(state, 'goal kick', 1 - thrower.team, {
            x: endSign * (HALF_L - 4), z: 0,
          });
        } else {
          startRestart(state, 'corner', 1 - thrower.team, {
            x: endSign * (HALF_L - 0.3), z: Math.sign(z || 1) * (HALF_W - 0.3),
          });
        }
        return;
      }
      const scorer = state.teams.find((t) => t.dir === endSign);
      scoreGoal(state, scorer.index);
      return;
    }
    if (state.penalty?.pending) {
      const expired = state.clock >= state.duration;
      state.penalty = null;
      if (expired) { endMatch(state); return; }
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
    if (state.penalty?.pending) {
      const expired = state.clock >= state.duration;
      state.penalty = null;
      if (expired) { endMatch(state); return; }
    }
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
  state.penalty = null;
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

  // Stop the match clock at the midpoint, change ends, then restart with
  // the team that did not take the opening kick-off.
  if (state.phase === 'halftime') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      for (const team of state.teams) team.dir *= -1;
      setupKickoff(state, 1 - state.openingKickoff);
    }
    return;
  }

  if (state.phase === 'penalty') {
    state.phaseTimer -= dt;
    updateNext(state);
    if (state.phaseTimer <= 0) {
      state.phase = 'play';
      state.restart = null;
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
  if (state.penalty?.active) state.penalty.elapsed += dt;
  if (state.penalty?.pending) {
    state.penalty.elapsed += dt;
    if (state.penalty.elapsed > 10) {
      const expired = state.clock >= state.duration;
      state.penalty = null;
      if (expired) { endMatch(state); return; }
    }
  }
  if (b.owner) state.teams[b.owner.team].possessionTime += dt;

  for (const p of state.players) p.intent.action = null;
  for (const team of state.teams) {
    if (team.human) applyHumanInput(state, team, inputs[team.human], dt);
  }
  updateAI(state, dt);
  if (state.penalty?.active && state.penalty.elapsed > 8
      && !state.penalty.shooter.intent.action) {
    state.penalty.shooter.intent.action = { type: 'shoot', power: 0.65, aim: 0 };
  }

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
    if (state.phase !== 'play') break;
  }

  // A foul or dismissal starts a stoppage; do not run another movement or
  // ball step after the restart has been positioned.
  if (state.phase !== 'play') return;

  for (const p of state.players) movePlayer(state, p, dt);
  separatePlayers(state);
  updateBall(state, dt);
  if (checkOffsideChallenge(state)) return;
  updatePossession(state);
  checkOutOfPlay(state);

  // A pass that nobody reached is no longer "intended".
  if (b.intended && !b.owner && len(b.vel.x, b.vel.z) < 0.5) b.intended = null;

  updateNext(state);
  if (!state.halftimeDone && state.clock >= state.duration / 2 && state.phase === 'play') {
    state.halftimeDone = true;
    state.phase = 'halftime';
    state.phaseTimer = 3;
    state.ball.owner = null;
    state.ball.intended = null;
    state.ball.offsidePlayers = [];
    state.ball.restartNoOffsideBy = null;
    state.ball.vel.x = state.ball.vel.y = state.ball.vel.z = 0;
    setBanner(state, 'HALF TIME', 3);
    state.events.push({ type: 'halftime' });
    applyPendingSubstitutions(state);
    automateHalftimeSubstitutions(state);
    return;
  }
  if (state.clock >= state.duration && state.phase === 'play'
      && !state.penalty?.active && !state.penalty?.pending) endMatch(state);
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
