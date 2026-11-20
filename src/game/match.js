// Match engine: pure game logic with no rendering code, so it can run
// headless (tests) and be ported to Unity/Godot later.

import {
  HALF_L, HALF_W, GOAL, BOX, BALL_R, GRAVITY, ROLL_DECEL, AIR_DRAG, BOUNCE,
  CONTROL_RADIUS, DRIBBLE_OFFSET, PLAYER_RADIUS, SHOT_CHARGE_TIME,
  MUST_PASS_TIMEOUT, DIFFICULTY, FORMATION, FORMATIONS, INDOOR_FORMATION,
  PENALTY_SPOT, ASSIST, KEEP_RUN_TIME,
} from './constants.js';
import { updateAI, interceptPoint } from './ai.js';

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
 *   duration: seconds of real time per match,
 *   timeScale: game speed (1 = normal, 0.75 = 25% slower). The match clock
 *              still follows real time.
 *   assist: 'off' | 'assisted' | 'full'   (for human players)
 *   practice: true = no opponents except their goalkeeper, no time limit
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
      tackleTarget: null, // opponent close enough to tackle (highlighted)
      tackles: { tries: 0, won: 0, last: null }, // human tackle stats
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
        holding: false, // keeper has the ball in his hands
        charge: 0,
        dive: 0,
        aiTimer: Math.random() * 0.3,
        lastShotChecked: -1,
        kickAnim: 0,
      });
    };
    const startingSlots = cfg.indoor ? INDOOR_FORMATION : FORMATION;
    team.data.players.forEach((player, idx) => {
      const slot = startingSlots[idx] || FORMATION[idx];
      addPlayer(player, idx < startingSlots.length ? idx : -1, slot.role, idx < startingSlots.length);
    });
    (team.data.bench || []).forEach((pd, benchIndex) => addPlayer(pd, -1, pd.role, false, benchIndex));
  });

  if (cfg.practice) {
    for (let i = players.length - 1; i >= 0; i--) {
      if (players[i].team === 1 && players[i].role !== 'GK') players.splice(i, 1);
    }
  }

  const state = {
    teams,
    players,
    timeScale: cfg.timeScale || 1,
    assistName: cfg.assist || 'assisted',
    assist: ASSIST[cfg.assist || 'assisted'],
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
      directRestartOwnGoalBlockedBy: null,
      freeKickGoalRestrictedBy: null,
      shotId: 0,
      shotTeam: -1,
      shotLive: false,
    },
    clock: 0,
    duration: cfg.duration || 240,
    regulationDuration: cfg.duration || 240,
    extraTimeAllowed: !!cfg.extraTime,
    extraTimeDuration: cfg.extraTimeDuration || 60,
    extraTimeStarted: false,
    practice: !!cfg.practice,
    indoor: !!cfg.indoor,
    penalty: null,
    openingKickoff: 0,
    phase: 'kickoff',
    phaseTimer: 0,
    halftimeDone: false,
    restart: null,
    events: [],
    banner: null,
  };

  syncDirs(state);
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
  if (state.indoor) return false;
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

function formationFor(state, team) {
  return state.indoor ? INDOOR_FORMATION : (FORMATIONS[team.formation] || FORMATION);
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
  state.events.push({ type: 'substitution', team: team.index, outgoing: outgoing.id, incoming: incoming.id });
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
  p.kickCd = 0; p.mustPass = false; p.throwIn = false; p.holding = false;
  p.keepRun = null;
}

function setBanner(state, text, time = 1.6) {
  state.banner = { text, time };
  state.events.push({ type: 'banner', text });
}

/** Keeper with the ball in his hands: can't be pushed or tackled. */
export function isHolding(state, p) {
  return !!p.holding && state.ball.owner === p;
}

/** Ball can't be challenged: keeper's hands, or a set piece not yet taken. */
export function isProtected(state, p) {
  return state.ball.owner === p && (isHolding(state, p) || p.mustPass);
}

// ---------- human control ----------
export function setControlled(state, team, p) {
  if (!team.human) return;
  if (p?.sentOff) p = null;
  if (team.controlled === p) return;
  if (team.controlled) {
    const old = team.controlled;
    old.human = null;
    rememberRun(state, team, old);
  }
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

/**
 * When the human lets go of a player who was pushed forward, the AI keeps him
 * up there for KEEP_RUN_TIME seconds and carries on his run towards goal,
 * instead of pulling him straight back into formation.
 */
function rememberRun(state, team, p) {
  p.keepRun = null;
  if (state.phase !== 'play' || p.role === 'GK') return;
  const ax = p.pos.x * team.dir; // how far forward he is
  const shapeAx = FORMATION[p.idx].x * HALF_L;
  const forwardSpeed = p.vel.x * team.dir;
  if (ax > shapeAx + 3 || forwardSpeed > 1.5) {
    p.keepRun = {
      until: state.clock + KEEP_RUN_TIME,
      spot: { x: p.pos.x, z: p.pos.z },
      running: forwardSpeed > 1.5,
      sprint: forwardSpeed > 6,
    };
  }
}

// ---------- set pieces ----------
export function setupKickoff(state, teamIdx) {
  applyPendingSubstitutions(state);
  const b = state.ball;
  for (const team of state.teams) {
    const slots = formationFor(state, team);
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
  const taker = teamPlayers(state, teamIdx).find((p) => p.idx === (state.indoor ? 4 : 4) && !p.sentOff)
    || nearestTo(state, teamIdx, { x: 0, z: 0 }, null, true);
  if (!taker) return;
  b.pos.x = 0; b.pos.y = BALL_R; b.pos.z = 0;
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.owner = taker; b.lastTouch = taker; b.intended = null; b.shotLive = false;
  b.offsidePlayers = [];
  b.restartNoOffsideBy = null;
  b.restartDoubleTouchBy = taker;
  b.directThrowInGoalBlockedBy = null;
  b.directRestartOwnGoalBlockedBy = taker;
  b.freeKickGoalRestrictedBy = null;
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
  // Practice: the opponents only have a keeper, so we take every throw-in
  // and corner ourselves.
  if (state.practice && teamIdx === 1 && type !== 'goal kick') teamIdx = 0;
  const team = state.teams[teamIdx];
  let taker;
  if (type === 'goal kick') {
    taker = teamPlayers(state, teamIdx).find((p) => p.onPitch && p.role === 'GK' && !p.sentOff)
      || nearestTo(state, teamIdx, spot, null, true);
  } else {
    taker = nearestTo(state, teamIdx, spot) || nearestTo(state, teamIdx, spot, null, true);
  }
  if (!taker) taker = nearestTo(state, teamIdx, spot, null, true);
  if (!taker) return;
  const isFreeKick = type === 'free kick' || type === 'indirect free kick';
  const minDistance = type === 'throw-in' ? 2 : isFreeKick || type === 'corner' ? 9.15 : 5;
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
  if (isFreeKick) {
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
  const fx = type === 'corner' ? -Math.sign(spot.x) : type === 'goal kick' || isFreeKick ? team.dir : 0;
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
  b.directRestartOwnGoalBlockedBy = taker;
  b.freeKickGoalRestrictedBy = isFreeKick
    ? { player: taker, indirect: type === 'indirect free kick' }
    : null;
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
  state.ball.directRestartOwnGoalBlockedBy = null;
  state.ball.freeKickGoalRestrictedBy = null;
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
  // A player turning with the ball near his own goal line must not carry it
  // into his own net (that used to count as an own goal).
  const ownGoalX = -HALF_L * (p.team === 0 ? teamDirCache[0] : teamDirCache[1]);
  if (Math.sign(b.pos.x) === Math.sign(ownGoalX) && Math.abs(b.pos.x) > HALF_L - 0.3) {
    b.pos.x = Math.sign(b.pos.x) * (HALF_L - 0.3);
  }
}
// Each team's attacking direction, kept in sync for attachBall (changes at halftime).
const teamDirCache = [1, -1];
function syncDirs(state) { teamDirCache[0] = state.teams[0].dir; teamDirCache[1] = state.teams[1].dir; }

function release(state, p) {
  const b = state.ball;
  b.owner = null;
  b.lastTouch = p;
  // Someone other than the restart taker has now played the ball.
  if (b.restartDoubleTouchBy && b.restartDoubleTouchBy !== p) b.restartDoubleTouchBy = null;
  p.kickCd = 0.3;
  p.mustPass = false;
  p.throwIn = false;
  p.holding = false;
  p.charge = 0;
  p.kickAnim = 0.3;
  state.events.push({ type: 'kick', player: p.id });
}

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** Is an opponent standing in the lane between two points? */
function laneBlocked(state, from, to, team) {
  for (const o of state.players) {
    if (o.team === team) continue;
    if (dist(o.pos, from) < 1.2) continue;
    if (segDist(o.pos.x, o.pos.z, from.x, from.z, to.x, to.z) < 1.1) return true;
  }
  return false;
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
    // Favor a nearby option in the chosen direction so a normal tap is a
    // playable short pass; distance still matters after directional fit.
    // Also prefer teammates whose passing lane is clear and who aren't marked.
    let blocked = 0, marked = Infinity;
    for (const o of state.players) {
      if (o.team === p.team || !o.onPitch || o.sentOff) continue;
      marked = Math.min(marked, dist(o.pos, t.pos));
      const sd = segDist(o.pos.x, o.pos.z, p.pos.x, p.pos.z, t.pos.x, t.pos.z);
      if (sd < 1.4 && dist(o.pos, p.pos) > 1.2) blocked += 1;
    }
    const score = ang * 15 + d * 0.78 + (t.role === 'GK' ? 10 : 0) + (ang > 1.2 ? 40 : 0)
      + blocked * 14 + Math.max(0, 3.5 - marked) * 4;
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
  if (state.indoor || restartExempt) {
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
  const byHuman = !!p.human;
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

  const assisted = byHuman && state.assistName !== 'off';
  const chip = assisted && d > 9 && laneBlocked(state, b.pos, { x: tx, z: tz }, p.team);
  if (chip) {
    // Lane is blocked: lift it over the defender so it drops at the receiver.
    const flight = 0.9 + d / 40;
    const h = (d * 0.97) / flight;
    b.vel.x = ex * h; b.vel.z = ez * h;
    b.vel.y = (GRAVITY * flight) / 2;
  } else if (d > 24) {
    // Lofted long ball: lands around 80% of the distance then rolls.
    const flight = 1.25 + d / 60;
    const h = (d * (assisted ? 0.97 : 0.85)) / flight; // assisted: drops at his feet
    b.vel.x = ex * h; b.vel.z = ez * h;
    b.vel.y = (GRAVITY * flight) / 2;
  } else {
    // Match rolling speed to distance so a short pass stops near its target.
    // (Pressers are kept off a fresh pass by passGrace in updatePossession.)
    const speed = clamp(Math.sqrt(2 * ROLL_DECEL * d) + 0.5, 3.2, 22);
    b.vel.x = ex * speed; b.vel.z = ez * speed;
    b.vel.y = 0.4;
  }
  b.intended = target;
  b.shotLive = false;
  // For a moment the ball is "past" anyone pressing the passer, so a pass
  // isn't cut out by the defender standing right next to you.
  // This is passing help for human players only; AI passes play by the
  // normal interception rules.
  b.passGrace = byHuman ? 0.3 : 0;
  b.passByHuman = byHuman;
  b.passFrom = { x: p.pos.x, z: p.pos.z };
  release(state, p);

  // Control follows the pass: the receiver becomes the human's player and the
  // passer goes back to AI.
  if (team.human && p.human && target.role !== 'GK') setControlled(state, team, target);
  state.events.push({ type: 'pass', from: p.id, to: target.id, human: byHuman });
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
  b.shooter = p;
  b.shotClock = state.clock;
  b.shotDist = Math.hypot(goalX - p.pos.x, p.pos.z);
  b.shotLive = true;
  if (penaltyShot) {
    state.penalty.active = false;
    state.penalty.pending = true;
    state.penalty.elapsed = 0;
  }
  team.shots += 1;
  release(state, p);
  p.kickCd = 0.45;
  state.events.push({ type: 'shot', player: p.id, power, human: !!p.human });
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
  const team = state.teams[p.team];
  p.tackleCd = 0.6;
  p.kickAnim = 0.35;
  const victim = b.owner;
  // Every tackle attempt reports what happened, so the HUD and tests can show it.
  const report = (result) => {
    if (p.human) {
      team.tackles.tries += result === 'won' || result === 'missed' || result === 'foul' ? 1 : 0;
      if (result === 'won') team.tackles.won += 1;
      team.tackles.last = result;
    }
    state.events.push({ type: 'tackle', player: p.id, human: !!p.human, result, won: result === 'won' });
  };
  const clearRestartFlags = () => {
    b.restartDoubleTouchBy = null;
    b.directThrowInGoalBlockedBy = null;
    b.directRestartOwnGoalBlockedBy = null;
    b.freeKickGoalRestrictedBy = null;
  };

  if (!victim) {
    // Loose ball: a lunge that pokes it forward if close.
    if (dist(p.pos, b.pos) < 1.8 && b.pos.y < 0.8) {
      let px = p.face.x, pz = p.face.z;
      if (px * team.dir < 0.2) { px = team.dir * 0.6; pz = (pz >= 0 ? 1 : -1) * 0.8; } // not towards own goal
      b.vel.x = px * 7; b.vel.z = pz * 7; b.vel.y = 0.2;
      b.lastTouch = p; b.intended = null;
      clearRestartFlags();
      report('poke');
    } else report('nothing');
    return;
  }
  if (victim.team === p.team) return;
  if (isHolding(state, victim)) { report('keeper'); return; } // ball in his hands
  if (victim.mustPass) { report('set piece'); return; } // restart not taken yet

  const range = p.human ? state.assist.tackleRange : 1.7;
  const d = dist(p.pos, victim.pos);
  if (d > range) {
    // Too far: no penalty for humans, just feedback.
    if (!p.human) p.stun = 0.3;
    report('too far');
    return;
  }

  // Fouls: late, from-behind or full-speed challenges can give away a free
  // kick or penalty, and sometimes a card.
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
    report('foul');
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

  // Lunge towards the attacker.
  const nx = (victim.pos.x - p.pos.x) / (d || 1), nz = (victim.pos.z - p.pos.z) / (d || 1);
  p.face.x = nx; p.face.z = nz;
  p.pos.x += nx * Math.max(0, d - 0.8) * 0.5;
  p.pos.z += nz * Math.max(0, d - 0.8) * 0.5;

  // Chance: tackling vs dribbling matters, but a well-timed tackle should
  // usually work. Humans get a fairer base; assist adds a little more.
  const skill = (p.stats.tac - victim.stats.dri) / 150;
  let chance;
  if (p.human) {
    const bonus = state.assistName === 'off' ? 0 : 0.12;
    chance = clamp(0.7 + skill * 0.6 + bonus, 0.5, 0.92);
  } else {
    chance = clamp((0.52 + skill) * team.diff.tackle, 0.15, 0.85);
  }

  if (Math.random() < chance) {
    victim.stun = 0.6;
    victim.kickCd = 0.5;
    victim.charge = 0;
    b.lastTouch = p;
    b.intended = null;
    b.shotLive = false;
    clearRestartFlags();
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
    if (p.human && state.assistName !== 'off') {
      // Assisted: you come away with the ball.
      b.owner = p;
      b.vel.x = b.vel.y = b.vel.z = 0;
      attachBall(b, p);
    } else {
      b.owner = null;
      const kx = nx * 0.7 + rand(-0.4, 0.4), kz = nz * 0.7 + rand(-0.4, 0.4);
      b.vel.x = kx * 5; b.vel.z = kz * 5; b.vel.y = 0.3;
    }
    report('won');
  } else {
    p.stun = p.human ? 0.3 : 0.6;
    report('missed');
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
  const b = state.ball;
  for (const team of state.teams) {
    team.next = computeNext(state, team);
    const p = team.controlled;
    team.tackleTarget = null;
    if (p && b.owner && b.owner.team !== team.index && !isProtected(state, b.owner)
        && dist(p.pos, b.owner.pos) < state.assist.tackleRange && p.tackleCd <= 0) {
      team.tackleTarget = b.owner;
    }
  }
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
  // Only when they *win* it (not on every pass between them), and only if
  // your player is far from the ball.
  if (b.owner && b.owner.team !== team.index) {
    if (team.seenOpponentOwner === null) {
      team.seenOpponentOwner = b.owner;
      const n = nearestTo(state, team.index, b.pos);
      const myD = dist(p.pos, b.pos);
      if (n && n !== p && myD > 8 && dist(n.pos, b.pos) + 4 < myD) {
        p = n;
        setControlled(state, team, p);
      }
    }
  } else if (b.owner && b.owner.team === team.index) {
    team.seenOpponentOwner = null; // we have it again
  }
  // Fill in anything missing so a partial input never breaks aiming.
  input = {
    mx: Number(input && input.mx) || 0,
    mz: Number(input && input.mz) || 0,
    sprint: !!(input && input.sprint),
    passPressed: !!(input && input.passPressed),
    shootHeld: !!(input && input.shootHeld),
    shootPressed: !!(input && input.shootPressed),
  };
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

  p.assisting = null;
  // Receiving a pass: run to meet it. With no input always; with assist on,
  // also while you press anywhere except clearly away from the ball.
  if (b.intended === p && !b.owner) {
    const q = interceptPoint(p, b);
    const dx = q.x - p.pos.x, dz = q.z - p.pos.z;
    const l = len(dx, dz);
    const il = len(input.mx, input.mz);
    const cos = hasInput && l > 0 ? (input.mx * dx + input.mz * dz) / (il * l) : 1;
    const meet = !hasInput || (state.assistName !== 'off' && cos > -0.3);
    if (meet && l > 0.3) {
      it.mx = dx / l; it.mz = dz / l;
      it.sprint = it.sprint || l > 3;
      p.assisting = 'meet pass';
    }
  }

  // Assist: if you press roughly towards a loose ball (or the opponent who
  // has it), your player bends his run onto it by himself.
  const as = state.assist;
  if (b.owner !== p && b.intended !== p) {
    let target = null;
    if (!b.owner) target = interceptPoint(p, b);
    else if (b.owner.team !== p.team && dist(p.pos, b.owner.pos) < 12) {
      target = { x: b.owner.pos.x + b.owner.vel.x * 0.25, z: b.owner.pos.z + b.owner.vel.z * 0.25 };
    }
    if (target) {
      const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
      const d = len(dx, dz);
      if (d > 0.3) {
        const il = len(input.mx, input.mz);
        const cos = hasInput ? (input.mx * dx + input.mz * dz) / (il * d) : -1;
        if (hasInput && cos > as.steerCos) {
          it.mx = dx / d; it.mz = dz / d; p.assisting = 'steer';
        } else if (!hasInput && as.auto && !b.owner) {
          it.mx = dx / d; it.mz = dz / d; p.assisting = 'auto';
        }
      }
    }
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
      if (next) { setControlled(state, team, next); state.events.push({ type: 'manualSwitch', team: team.index }); }
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
        const nx = dx / d, nz = dz / d;
        // A keeper holding the ball can't be pushed: the other player moves
        // the whole way instead.
        const aFixed = isHolding(state, a), cFixed = isHolding(state, c);
        const total = min - d;
        const pa = aFixed ? 0 : cFixed ? total : total / 2;
        const pc = cFixed ? 0 : aFixed ? total : total / 2;
        a.pos.x -= nx * pa; a.pos.z -= nz * pa;
        c.pos.x += nx * pc; c.pos.z += nz * pc;
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
  if (state.indoor) return false;
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
    startRestart(state, 'indirect free kick', defendingTeam.index, spot);
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
  // Where the shot will cross the goal line: corners are much harder to save.
  const lineX = -HALF_L * team.dir;
  const t = b.vel.x !== 0 ? (lineX - b.pos.x) / b.vel.x : 0;
  const lineZ = b.pos.z + b.vel.z * Math.max(0, t);
  const corner = clamp(Math.abs(lineZ) / (GOAL.width / 2), 0, 1);
  // Long shots give the keeper time; close ones don't.
  const far = clamp(((b.shotDist ?? 14) - 9) / 22, -0.1, 0.45);
  const chance = clamp(
    0.7 + (gk.stats.gk - 85) / 50 + keeperMul - (speed - 20) / 50 - corner * corner * 0.35 + far,
    0.2, 0.95,
  );
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
    gk.holding = true;
    gk.mustPass = true;
    gk.mustPassTimer = 0;
    state.events.push({ type: 'save', player: gk.id, parry: false });
  }
  if (b.shotTeam >= 0) state.teams[b.shotTeam].onTarget += 1;
  return true;
}

function updatePossession(state, dt) {
  const b = state.ball;
  if (b.passGrace > 0) b.passGrace -= dt;
  if (b.owner) return;
  const speed = len(b.vel.x, b.vel.z);
  let best = null, bd = Infinity;
  for (const p of state.players) {
    if (!p.onPitch || p.sentOff) continue;
    if (p.kickCd > 0 || p.stun > 0) continue;
    const isGK = p.role === 'GK' && inOwnBox(state, p);
    const reachH = isGK ? 2.5 : 1.1;
    if (b.pos.y > reachH) continue;
    let r = isGK ? 1.25 + (p.dive > 0 ? 1.0 : 0)
      : CONTROL_RADIUS + (b.intended === p ? 0.25 : 0) + (p.human ? state.assist.controlBonus : 0);
    // An opponent cutting out a firm pass has to be right in its path.
    if (!isGK && b.passByHuman && b.intended && b.intended.team !== p.team && speed > 9) r *= 0.65;
    const d = dist(p.pos, b.pos);
    if (b.passGrace > 0 && b.intended && p.team !== b.intended.team && dist(p.pos, b.passFrom) < 2.2) continue;
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  // The intended receiver wins a tie for a pass meant for him.
  const rcv = b.intended;
  if (rcv && best !== rcv && rcv.kickCd <= 0 && rcv.stun <= 0 && b.pos.y <= 1.1
      && dist(rcv.pos, b.pos) < CONTROL_RADIUS + 0.25 + (rcv.human ? state.assist.controlBonus : 0)) {
    best = rcv;
  }

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
    startRestart(state, 'indirect free kick', opposingTeam, spot);
    return;
  }
  if (b.restartDoubleTouchBy) b.restartDoubleTouchBy = null;

  if (b.offsidePlayers.includes(best)) {
    const spot = { x: b.pos.x, z: b.pos.z };
    const defendingTeam = 1 - best.team;
    b.owner = null;
    b.intended = null;
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
    b.vel.x = b.vel.y = b.vel.z = 0;
    state.events.push({ type: 'offside', team: best.team, player: best.id });
    startRestart(state, 'indirect free kick', defendingTeam, spot);
    return;
  }

  const isGK = best.role === 'GK' && inOwnBox(state, best);
  if (isGK && b.shotLive && b.shotTeam !== best.team) {
    if (keeperSave(state, best)) {
      b.directThrowInGoalBlockedBy = null;
      b.directRestartOwnGoalBlockedBy = null;
      b.freeKickGoalRestrictedBy = null;
    } else best.kickCd = 0.5; // beaten without touching the ball
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
      b.directRestartOwnGoalBlockedBy = null;
      b.freeKickGoalRestrictedBy = null;
      best.kickCd = 0.3;
      state.events.push({ type: 'block', player: best.id });
      return;
    }
  }
  const prevTouch = b.lastTouch;
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
  b.directRestartOwnGoalBlockedBy = null;
  b.freeKickGoalRestrictedBy = null;
  b.shotLive = false;
  b.vel.y = 0;
  if (isGK) {
    // Back-pass rule: a ball played to the keeper by his own teammate stays at
    // his feet (and he can be tackled). Anything else he picks up in his hands.
    const backPass = prevTouch && prevTouch.team === best.team && prevTouch !== best;
    best.holding = !backPass;
    best.mustPass = !backPass;
    best.mustPassTimer = 0;
    best.holdTimer = backPass ? 0.5 : 1.0;
  } else {
    best.holding = false;
  }
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
      const restartTaker = b.directRestartOwnGoalBlockedBy;
      if (restartTaker && endSign !== state.teams[restartTaker.team].dir) {
        state.events.push({ type: 'directRestartOwnGoal' });
        startRestart(state, 'corner', 1 - restartTaker.team, {
          x: endSign * (HALF_L - 0.3), z: Math.sign(z || 1) * (HALF_W - 0.3),
        });
        return;
      }
      const freeKick = b.freeKickGoalRestrictedBy;
      if (freeKick?.indirect) {
        const defendingTeam = 1 - freeKick.player.team;
        state.events.push({ type: 'freeKickDirectGoal', ownGoalEnd: false, indirect: true });
        startRestart(state, 'goal kick', defendingTeam, {
          x: endSign * (HALF_L - 4), z: 0,
        });
        return;
      }
      const scorer = state.teams.find((t) => t.dir === endSign);
      scoreGoal(state, scorer.index);
      return;
    }
    if (state.indoor) {
      b.pos.x = Math.sign(x) * (HALF_L - BALL_R);
      b.vel.x *= -0.78;
      b.vel.z *= 0.96;
      b.lastTouch = null;
      state.events.push({ type: 'board' });
      return;
    }
    if (state.penalty?.pending) {
      const expired = !state.practice && state.clock >= state.duration;
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
    if (state.indoor) {
      b.pos.z = Math.sign(z) * (HALF_W - BALL_R);
      b.vel.z *= -0.78;
      b.vel.x *= 0.96;
      b.lastTouch = null;
      state.events.push({ type: 'board' });
      return;
    }
    if (state.penalty?.pending) {
      const expired = !state.practice && state.clock >= state.duration;
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
  let scorer = b.lastTouch;
  // A shot that goes in off a defender or the keeper still counts for the
  // shooter (it's not an own goal).
  if (scorer && scorer.team !== teamIdx && b.shooter && b.shooter.team === teamIdx
      && state.clock - (b.shotClock ?? -99) < 3) {
    scorer = b.shooter;
  }
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
  syncDirs(state);
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
      if (!state.practice && state.clock >= state.duration) endMatch(state);
      else setupKickoff(state, state.practice ? 0 : state.kickoffNext);
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
  state.clock += dt / state.timeScale; // clock follows real time, whatever the game speed
  if (state.penalty?.active) state.penalty.elapsed += dt;
  if (state.penalty?.pending) {
    state.penalty.elapsed += dt;
    if (state.penalty.elapsed > 10) {
      const expired = !state.practice && state.clock >= state.duration;
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
  updatePossession(state, dt);
  checkOutOfPlay(state);

  // A pass that nobody reached is no longer "intended".
  if (b.intended && !b.owner && len(b.vel.x, b.vel.z) < 0.5) b.intended = null;

  updateNext(state);
  if (!state.practice && !state.halftimeDone && state.clock >= state.duration / 2 && state.phase === 'play') {
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
  if (!state.practice && state.clock >= state.duration && state.phase === 'play'
      && !state.penalty?.active && !state.penalty?.pending) endMatch(state);
}

function endMatch(state) {
  if (state.extraTimeAllowed && !state.extraTimeStarted && state.teams[0].score === state.teams[1].score) {
    state.extraTimeStarted = true;
    state.duration += state.extraTimeDuration;
    setupKickoff(state, 1 - state.kickoffNext);
    setBanner(state, 'EXTRA TIME', 2.4);
    state.events.push({ type: 'extraTime' });
    return;
  }
  state.phase = 'fulltime';
  state.ball.owner = null;
  setBanner(state, 'FULL TIME', 99);
  state.events.push({ type: 'fulltime' });
}

/** Match clock shown as 0-90 minutes. */
export function displayMinute(state) {
  if (!Number.isFinite(state.duration)) return 0;
  return Math.min(90, Math.floor((state.clock / state.duration) * 90));
}
