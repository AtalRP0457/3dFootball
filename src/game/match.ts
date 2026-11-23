// Match engine: pure game logic with no rendering code, so it can run
// headless (tests) and be ported to Unity/Godot later.

import type {
  MatchState, MatchConfig, Player, Team, Ball, Vec2, Inputs, InputFrame, Kit, PlayerData, HumanId, Action, PassKind, ShotType, Role,
} from '../types/game.ts';
import {
  HALF_L, HALF_W, GOAL, BOX, BALL_R, CONTROL_RADIUS, DRIBBLE_OFFSET, PLAYER_RADIUS, SHOT_CHARGE_TIME, CENTER_CIRCLE_RADIUS,
  MUST_PASS_TIMEOUT, DIFFICULTY, FORMATION, FORMATIONS, INDOOR_FORMATION,
  PENALTY_SPOT, ASSIST, KEEP_RUN_TIME,
} from './constants.ts';
import { updateAI, interceptPoint, receivePoint } from './ai.ts';
import { physicalProfile } from './physics/attributes.ts';
import { playerIdentity } from './players/identity.ts';
import { stepLocomotion, resolvePlayerContacts } from './physics/playerPhysics.ts';
import {
  integrateBall, substepsFor, collideBallWithBody, setRollingSpin, setKickSpin,
  stopBall, ensureSpin, computeBallPath,
} from './physics/ballPhysics.ts';
import { updateDribble, updateStickyDribble, canKick } from './mechanics/dribbling.ts';
import { planShot, shotTypeFromCharge } from './mechanics/shooting.ts';
import { planPass } from './mechanics/passing.ts';
import { shotKind, type BridgeHooks } from './engineBridge.ts';
import type { KickKind } from '../../packages/game-engine/player/PlayerTypes.ts';

// Player body used for ball contacts: an upright cylinder.
const BODY_RADIUS = 0.3;
const BODY_HEIGHT = 1.85;

// ---------- small vector helpers ----------
export const len = (x: number, z: number) => Math.hypot(x, z);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a = -1, b = 1) => a + Math.random() * (b - a);

// ---------- kits ----------
function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function colorDist(a: string, b: string) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
const ALT_KITS: Kit[] = [
  { shirt: '#111111', shorts: '#111111', socks: '#f5c400', gk: '#7dd3fc' },
  { shirt: '#d62828', shorts: '#ffffff', socks: '#d62828', gk: '#222222' },
];
function resolveKits(homeKit: Kit, awayKit: Kit): [Kit, Kit] {
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
export function createMatch(cfg: MatchConfig) {
  const [homeKit, awayKit] = resolveKits(cfg.home.kit, cfg.away.kit);
  const teams = [cfg.home, cfg.away].map((data, i): Team => {
    const ctrl = cfg.controllers[i];
    const human = ctrl === 'p1' || ctrl === 'p2' ? ctrl : null;
    return {
      index: i,
      data,
      kit: i === 0 ? homeKit : awayKit,
      dir: (i === 0 ? 1 : -1) as 1 | -1, // attacking direction along x
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
      tactic: 'balanced' as Team['tactic'],
      formation: '4-3-3',
      // AI on a human's team plays at normal level; pure-AI teams use the
      // chosen difficulty.
      diff: DIFFICULTY[human ? 'normal' : cfg.difficulty || 'normal'],
    };
  });

  const players: Player[] = [];
  teams.forEach((team) => {
    const addPlayer = (pd: PlayerData, idx: number, role: Role, onPitch: boolean, benchIndex = -1) => {
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
        attributes: pd.attributes || null,
        overall: pd.overall ?? null,
        captain: !!pd.captain,
        // One identity for the engine, the 3D character and the cards.
        identity: pd.identity || playerIdentity({ ...pd, position: pd.position || role, appearance: undefined }),
        phys: null as unknown as Player['phys'], // filled below from attributes + identity
        yellowCards: 0,
        sentOff: false,
        subbedOff: false,
        injured: false,
        pos: onPitch
          ? { x: 0, z: 0 }
          : { x: team.dir * (HALF_L - 1), z: team.dir * (HALF_W - 1) },
        vel: { x: 0, z: 0 },
        acc: { x: 0, z: 0 },
        face: { x: team.dir, z: 0 },
        prevPos: null,
        stagger: 0,
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
    // (players get their physical profile after creation, see below)
    team.data.players.forEach((player, idx) => {
      const slot = startingSlots[idx] || FORMATION[idx];
      addPlayer(player, idx < startingSlots.length ? idx : -1, slot.role, idx < startingSlots.length);
    });
    (team.data.bench || []).forEach((pd, benchIndex) => addPlayer(pd, -1, pd.role || 'MID', false, benchIndex));
  });

  for (const p of players) p.phys = physicalProfile(p.stats, p.attributes, p.identity);

  if (cfg.practice) {
    for (let i = players.length - 1; i >= 0; i--) {
      if (players[i].team === 1 && players[i].role !== 'GK') players.splice(i, 1);
    }
  }

  const state: MatchState = {
    teams,
    players,
    timeScale: cfg.timeScale || 1,
    // 'sticky' (arcade default): the ball stays at the feet until a pass,
    // shot or tackle. 'touch' (realistic): touch-based dribbling where the
    // ball can run away from you.
    dribbleStyle: cfg.dribbleStyle === 'touch' ? 'touch' : 'sticky',
    assistName: cfg.assist || 'assisted',
    assist: ASSIST[cfg.assist || 'assisted'],
    ball: {
      pos: { x: 0, y: BALL_R, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      spin: { x: 0, y: 0, z: 0 },
      prevPos: null,
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
    flow: 'KICKOFF',
    transition: null,
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

export function teamPlayers(state: MatchState, t: number): Player[] {
  return state.players.filter((p) => p.team === t);
}

export function setTeamTactic(state: MatchState, teamIdx: number, tactic: string) {
  const team = state.teams[teamIdx];
  if (!team || !['balanced', 'attacking', 'defensive'].includes(tactic)) return false;
  if (team.tactic === tactic) return true;
  team.tactic = tactic as Team['tactic'];
  state.events.push({ type: 'tactic', team: teamIdx, tactic });
  return true;
}

export function setTeamFormation(state: MatchState, teamIdx: number, formation: string) {
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

function formationFor(state: MatchState, team: Team) {
  return state.indoor ? INDOOR_FORMATION : (FORMATIONS[team.formation] || FORMATION);
}

/** Make the change now at a stoppage, or queue it for the next dead ball. */
export function makeSubstitution(state: MatchState, teamIdx: number, outgoingId: number, incomingId: number) {
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

export function cancelPendingSubstitution(state: MatchState, teamIdx: number) {
  const team = state.teams[teamIdx];
  if (!team?.pendingSubstitution) return false;
  team.pendingSubstitution = null;
  state.events.push({ type: 'substitutionCancelled', team: teamIdx });
  return true;
}

function applySubstitution(state: MatchState, team: Team, outgoing: Player, incoming: Player) {
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

function applyPendingSubstitutions(state: MatchState) {
  for (const team of state.teams) {
    const pending = team.pendingSubstitution;
    if (!pending) continue;
    team.pendingSubstitution = null;
    const applied = applySubstitution(state, team, state.players[pending.outgoing], state.players[pending.incoming]);
    if (!applied) state.events.push({ type: 'substitutionCancelled', team: team.index });
  }
}

function automateHalftimeSubstitutions(state: MatchState) {
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

function ratingForRole(player: Player, role: string = player.role) {
  const s = player.stats;
  if (role === 'GK') return s.gk;
  if (role === 'DEF') return s.tac * 0.55 + s.spd * 0.2 + s.pas * 0.15 + s.dri * 0.1;
  if (role === 'MID') return s.pas * 0.35 + s.dri * 0.25 + s.spd * 0.2 + s.tac * 0.2;
  return s.sho * 0.4 + s.spd * 0.25 + s.dri * 0.25 + s.pas * 0.1;
}

export function toWorld(team: Team, fx: number, fz: number) {
  return { x: fx * HALF_L * team.dir, z: fz * HALF_W * team.dir };
}

function clampPlayer(p: Player) {
  p.pos.x = clamp(p.pos.x, -HALF_L - 3, HALF_L + 3);
  p.pos.z = clamp(p.pos.z, -HALF_W - 2.5, HALF_W + 2.5);
}

function placePlayer(p: Player, pos: Vec2, faceDir: number) {
  p.pos.x = pos.x; p.pos.z = pos.z;
  p.vel.x = 0; p.vel.z = 0;
  p.face.x = faceDir; p.face.z = 0;
  p.charge = 0; p.stun = 0; p.dive = 0; p.stagger = 0;
  p.kickCd = 0; p.mustPass = false; p.throwIn = false; p.holding = false;
  p.keepRun = null;
}

function setBanner(state: MatchState, text: string, time = 1.6) {
  state.banner = { text, time };
  state.events.push({ type: 'banner', text });
}

/** Keeper with the ball in his hands: can't be pushed or tackled. */
export function isHolding(state: MatchState, p: Player) {
  return !!p.holding && state.ball.owner === p;
}

/** Ball can't be challenged: keeper's hands, or a set piece not yet taken. */
export function isProtected(state: MatchState, p: Player) {
  return state.ball.owner === p && (isHolding(state, p) || p.mustPass);
}

// ---------- human control ----------
export function setControlled(state: MatchState, team: Team, p: Player | null | undefined) {
  if (!team.human) return;
  if (!p || p.sentOff) p = null;
  if (team.controlled === p) { team.manualKeeperControl = p?.role === 'GK'; return; }
  if (team.controlled) {
    const old = team.controlled;
    old.human = null;
    rememberRun(state, team, old);
  }
  team.controlled = p;
  team.manualKeeperControl = p?.role === 'GK';
  if (p) {
    p.human = team.human;
    p.charge = 0;
  }
  state.events.push({ type: 'switch', team: team.index, player: p ? p.id : null });
}

function nearestTo(state: MatchState, teamIdx: number, point: Vec2, exclude: Player | null = null, allowGK: boolean = false) {
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
function rememberRun(state: MatchState, team: Team, p: Player) {
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
export function setupKickoff(state: MatchState, teamIdx: number) {
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
      const kickoffPair = team.index === teamIdx && (p.idx === 3 || p.idx === 4);
      // Everyone except the two players taking the restart stays in their
      // own half and outside the centre circle until the ball is struck.
      const homeHalfLimit = (CENTER_CIRCLE_RADIUS + 1) / HALF_L;
      const localX = kickoffPair ? (p.idx === 4 ? -0.02 : -0.16) : Math.min(slot.x, -homeHalfLimit);
      const localZ = kickoffPair ? 0 : slot.z;
      placePlayer(p, toWorld(team, localX, localZ), team.dir);
    });
  }
  const taker = teamPlayers(state, teamIdx).find((p) => p.idx === (state.indoor ? 4 : 4) && !p.sentOff)
    || nearestTo(state, teamIdx, { x: 0, z: 0 }, null, true);
  if (!taker) return;
  b.pos.x = 0; b.pos.y = BALL_R; b.pos.z = 0;
  stopBall(b);
  b.owner = taker; b.lastTouch = taker; b.intended = null; b.pendingPass = null; b.shotLive = false;
  b.offsidePlayers = [];
  b.restartNoOffsideBy = null;
  b.restartDoubleTouchBy = taker;
  b.directThrowInGoalBlockedBy = null;
  b.directRestartOwnGoalBlockedBy = taker;
  b.freeKickGoalRestrictedBy = null;
  taker.mustPass = true; taker.mustPassTimer = 0;
  for (const t of state.teams) setControlled(state, t, t.index === teamIdx ? taker : nearestTo(state, t.index, b.pos));
  clearActionBuffers(state);
  state.phase = 'kickoff';
  state.phaseTimer = 1.2;
  state.flow = 'KICKOFF';
  state.transition = null;
  setBanner(state, 'KICK OFF', 1.2);
}

/**
 * Drop every buffered press and shot charge. Called at each stoppage so a
 * press made before the whistle never fires into the restart.
 */
function clearActionBuffers(state: MatchState): void {
  for (const p of state.players) { p.queuedAction = null; p.charge = 0; p.chargeType = null; p.intent.action = null; }
}

/** Seconds a pass/shot pressed before the ball arrives stays valid. */
export const RECEIVE_BUFFER = 0.9;
/** Loose balls further than this are never steered onto by assist (m). */
export const ASSIST_STEER_RANGE = 18;
/** With no input, the controlled player goes for a loose ball within this range (m). */
export const AUTO_CHASE_RANGE = 20;

/**
 * Is the free ball coming to this player (pass to him, or a ball that will
 * pass within reach soon)? Then a pass/shot press is a first-time action, not
 * a player switch.
 */
function ballComingTo(state: MatchState, p: Player): boolean {
  const b = state.ball;
  if (b.owner) return false;
  const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
  const d = len(dx, dz);
  if (d < 2) return true;
  const rvx = b.vel.x - p.vel.x, rvz = b.vel.z - p.vel.z;
  const closing = (rvx * dx + rvz * dz) / d;
  // A pass played to him counts however long it is (pressing pass then must
  // never switch control back to the passer).
  if (b.intended === p) return closing > 0.5 || d < 6;
  if (d > 22 || closing < 1.5) return false;
  // Closest approach of the ball's line to the player.
  const t = Math.min(d / closing, 1.4);
  const cx = b.pos.x + b.vel.x * t - (p.pos.x + p.vel.x * t), cz = b.pos.z + b.vel.z * t - (p.pos.z + p.vel.z * t);
  return len(cx, cz) < 1.6;
}

function setupRestart(state: MatchState, type: string, teamIdx: number, spot: Vec2) {
  applyPendingSubstitutions(state);
  clearActionBuffers(state);
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
  stopBall(b);
  attachBall(b, taker);
  taker.mustPass = true; taker.mustPassTimer = 0;
  taker.throwIn = type === 'throw-in';
  if (type === 'goal kick') taker.holdTimer = 0.6;
  if (team.human) setControlled(state, team, taker);
  const other = state.teams[1 - teamIdx];
  if (other.human) setControlled(state, other, nearestTo(state, other.index, spot));

  state.restart = { type, team: teamIdx };
  state.phase = 'restart';
  state.phaseTimer = 0.9;
  setBanner(state, type.toUpperCase(), 1.1);
}

function transitionSnapshot(state: MatchState) {
  const fromPlayers: Record<number, Vec2> = {};
  for (const p of state.players) fromPlayers[p.id] = { x: p.pos.x, z: p.pos.z };
  return { fromPlayers, fromBall: { ...state.ball.pos } };
}

function startKickoffSetup(state: MatchState, teamIdx: number) {
  const snap = transitionSnapshot(state);
  setupKickoff(state, teamIdx);
  state.phase = 'kickoff';
  state.phaseTimer = 1.1;
  state.flow = 'SET_PIECE_SETUP';
  state.transition = { state: 'SET_PIECE_SETUP', elapsed: 0, duration: 0.7, ...snap };
}

/** Schedule, rather than apply, a stoppage so play has a cinematic settle. */
function startRestart(state: MatchState, type: string, team: number, spot: Vec2) {
  const snap = transitionSnapshot(state);
  clearActionBuffers(state);
  state.ball.owner = null;
  state.ball.intended = null;
  state.ball.pendingPass = null;
  state.ball.shotLive = false;
  // A whistle stops the ball at the infringement. Keep the old position in
  // the transition snapshot so the renderer can ease it to the free-kick spot;
  // boundary restarts still let the out-of-play ball settle under physics.
  if (type === 'free kick' || type === 'indirect free kick') {
    state.ball.pos.x = spot.x;
    state.ball.pos.y = BALL_R;
    state.ball.pos.z = spot.z;
    stopBall(state.ball);
  }
  state.restart = { type, team };
  state.phase = 'restart';
  state.phaseTimer = 1.65;
  state.flow = 'OUT_OF_BOUNDS_TRANSITION';
  state.transition = {
    state: 'OUT_OF_BOUNDS_TRANSITION', elapsed: 0, duration: 1.05,
    ...snap, pendingRestart: { type, team, spot: { ...spot } },
  };
  setBanner(state, type.toUpperCase(), 1.65);
}

function inPenaltyArea(state: MatchState, defendingTeamIdx: number, point: Vec2) {
  const defendingTeam = state.teams[defendingTeamIdx];
  const goalX = -HALF_L * defendingTeam.dir;
  return Math.abs(point.x - goalX) < BOX.depth && Math.abs(point.z) < BOX.width / 2;
}

function startPenalty(state: MatchState, teamIdx: number) {
  const snap = transitionSnapshot(state);
  clearActionBuffers(state);
  state.ball.pendingPass = null;
  const team = state.teams[teamIdx];
  const opponent = state.teams[1 - teamIdx];
  const candidates = teamPlayers(state, teamIdx).filter((p) => p.onPitch && p.role !== 'GK' && !p.sentOff);
  const shooter = team.human && team.controlled && !team.controlled.sentOff && team.controlled.role !== 'GK'
    ? team.controlled
    : candidates.reduce<Player | null>((best, p) => !best || p.stats.sho > best.stats.sho ? p : best, null)
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
  stopBall(state.ball);
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
  state.flow = 'SET_PIECE_SETUP';
  state.transition = { state: 'SET_PIECE_SETUP', elapsed: 0, duration: 0.8, ...snap };
  setBanner(state, 'PENALTY', 1.6);
}

// ---------- ball actions ----------
function attachBall(b: Ball, p: Player) {
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
function syncDirs(state: MatchState) { teamDirCache[0] = state.teams[0].dir; teamDirCache[1] = state.teams[1].dir; }

function release(state: MatchState, p: Player) {
  const b = state.ball;
  b.pendingPass = null;
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

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** Is an opponent standing in the lane between two points? */
function laneBlocked(state: MatchState, from: Vec2, to: Vec2, team: number) {
  for (const o of state.players) {
    if (o.team === team) continue;
    if (dist(o.pos, from) < 1.2) continue;
    if (segDist(o.pos.x, o.pos.z, from.x, from.z, to.x, to.z) < 1.1) return true;
  }
  return false;
}

/** Pick the best teammate in a direction (used by humans). */
export function choosePassTarget(state: MatchState, p: Player, dx: number, dz: number, mode: boolean | 'ground' | 'through' | 'lofted' = false) {
  const through = mode === true || mode === 'through';
  const aerial = mode === 'lofted';
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
    // The stick picks the direction first; distance only separates options
    // in about the same direction (a ground tap prefers the nearer one, a
    // lofted or through ball barely cares). A lofted ball flies over the lane.
    const distW = aerial ? 0.12 : through ? 0.2 : 0.3;
    let score = ang * 30 + d * distW + (t.role === 'GK' ? 10 : 0) + (ang > 1.2 ? 40 : 0)
      + blocked * (aerial ? 2 : 10) + Math.max(0, 3.5 - marked) * 4;
    if (through) {
      // Through balls: favour runners ahead of the ball going forward.
      const dir = state.teams[p.team].dir;
      score -= Math.max(0, (t.pos.x - p.pos.x) * dir) * 0.6 + Math.max(0, t.vel.x * dir) * 1.5;
    }
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/**
 * Play a pass. Returns false only when the engine could not start the kick
 * yet (player busy, e.g. stumbling or getting up): the caller may retry.
 */
export function doPass(state: MatchState, p: Player, target: Player | null, opts: { kind?: PassKind; driven?: boolean } = {}): boolean {
  const b = state.ball;
  const team = state.teams[p.team];
  if (!target) return true;
  const byHuman = !!p.human;
  const assisted = byHuman && state.assistName !== 'off';
  const d = dist(b.pos, target.pos);
  let kind = opts.kind || 'ground';
  // A tap is a ground pass. Only a pass too long to roll there (or a long
  // throw) goes in the air; a blocked lane is the passer's problem (it can be
  // intercepted), not something the game silently turns into a chip.
  if (!opts.kind && (d > 40 || (p.throwIn && d > 14))) kind = 'lofted';
  // A lofted ball from a wide attacking area into the box is a cross.
  const attackX = b.pos.x * team.dir;
  const cross = kind === 'lofted' && !p.throwIn && !p.holding && attackX > HALF_L - 34 && Math.abs(b.pos.z) > 12
    && target.pos.x * team.dir > HALF_L - 22 && Math.abs(target.pos.z) < 14;
  // Pressure: an opponent within a couple of metres hurries the pass.
  let nearestOpp = Infinity;
  for (const o of state.players) {
    if (o.team !== p.team && o.onPitch && !o.sentOff) nearestOpp = Math.min(nearestOpp, dist(o.pos, p.pos));
  }
  const plan = planPass({
    p, target, ball: b, kind, cross,
    driven: !!opts.driven,
    errMul: p.human ? 1 : team.diff.error,
    pressure: clamp((2.5 - nearestOpp) / 2.5, 0, 1),
    attackDir: team.dir,
    assisted,
    groundPassTime: state.engine
      ? (distance, passKind, driven) => passKind === 'ground' || passKind === 'through'
        ? state.engine!.groundPassTime(distance, passKind, driven)
        : 0
      : undefined,
  });
  // Everything below the strike is bookkeeping; with the engine it runs when
  // the foot actually releases the ball at the animation contact frame.
  const finish = () => {
  // Offside is evaluated at foot contact, after the receiver has had time to
  // start his run during the passer's wind-up.
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
  b.passKind = plan.kind;
  b.passAim = plan.aim;
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
  if (team.human && p.human) setControlled(state, team, target);
  p.kickType = plan.kind === 'ground' && d > 18 ? 'longPass' : plan.kind === 'ground' ? 'pass' : plan.kind;
  state.events.push({ type: 'pass', from: p.id, to: target.id, human: byHuman, kind: plan.kind });
  };
  if (state.engine) {
    const eng = state.engine;
    const h = len(plan.vel.x, plan.vel.z) || 1;
    const dir = { x: plan.vel.x / h, z: plan.vel.z / h };
    const pd = Math.hypot(plan.aim.x - b.pos.x, plan.aim.z - b.pos.z);
    let vel;
    if (plan.kind === 'ground' || plan.kind === 'through') {
      // Weighted for the engine's rolling ball by the speed it should still
      // have on arrival: a ground pass arrives firm (to feet, ~1 s over
      // 12 m), a driven one much harder (quicker through a gap, harder to
      // control), a through ball softer so the runner can take it in stride.
      const arrive = plan.kind === 'through' ? clamp(3.1 + pd * 0.075, 2.8, 6.2)
        : opts.driven ? clamp(7 + pd * 0.12, 7.5, 12)
          : clamp(4 + pd * 0.1, 3.2, 8);
      const s = eng.groundPassSpeed(b.pos, plan.aim, arrive) * plan.weight;
      vel = { x: dir.x * s, y: 0, z: dir.z * s };
    } else {
      // Crosses are whipped in flatter; lofted passes and switches higher.
      const elev = cross ? 19 : Math.max(12, (Math.atan2(plan.vel.y, h) * 180) / Math.PI);
      const s = eng.loftedSpeed(b.pos, plan.aim, elev, plan.kind === 'chip' ? -25 : cross ? -8 : -12) * plan.weight;
      const e = (elev * Math.PI) / 180;
      vel = { x: dir.x * s * Math.cos(e), y: s * Math.sin(e), z: dir.z * s * Math.cos(e) };
    }
    if (p.throwIn || p.holding) {
      b.pendingPass = { passer: p, target, aim: { ...plan.aim }, kind: plan.kind, expiresAt: state.clock + 2.5 };
      if (team.human && p.human) setControlled(state, team, target);
      eng.hands(p, vel, p.throwIn ? 'throw-in' : 'keeper throw', finish);
      return true;
    }
    const kind: KickKind = plan.kind === 'through' ? 'throughBall' : plan.kind === 'ground' ? (opts.driven ? 'drivenPass' : 'shortPass')
      : cross ? 'cross' : d > 30 ? 'longPass' : 'lobPass';
    const started = eng.kick(p, plan.kind === 'through' ? 'through' : plan.kind === 'ground' ? 'pass' : 'lob', kind, vel, finish);
    if (started) {
      b.pendingPass = { passer: p, target, aim: { ...plan.aim }, kind: plan.kind, expiresAt: state.clock + 2.5 };
      if (team.human && p.human) setControlled(state, team, target);
    }
    return started;
  }
  b.vel.x = plan.vel.x; b.vel.y = plan.vel.y; b.vel.z = plan.vel.z;
  if (plan.top === null) setRollingSpin(b); else setKickSpin(b, plan.top, 0);
  finish();
  return true;
}

/** Take a shot. Returns false when the engine could not start the kick yet (see doPass). */
export function doShot(state: MatchState, p: Player, power: number, aimInput = 0, type: ShotType = 'normal'): boolean {
  const b = state.ball;
  const team = state.teams[p.team];
  if (p.holding && p.role === 'GK') {
    // A charged shot while holding the ball is a keeper punt. Aim steers the
    // launch across the field; the engine releases it through the hands path.
    power = clamp(power, 0.2, 1);
    const side = { x: p.face.z, z: -p.face.x };
    const dx = p.face.x + side.x * clamp(aimInput, -1, 1) * 0.35;
    const dz = p.face.z + side.z * clamp(aimInput, -1, 1) * 0.35;
    const l = len(dx, dz) || 1;
    const speed = 18 + power * 10;
    const velocity = { x: dx / l * speed, y: 6 + power * 5, z: dz / l * speed };
    const finish = () => {
      release(state, p);
      b.shotLive = false; b.intended = null;
      p.kickType = 'punt';
      state.events.push({ type: 'keeperPunt', player: p.id, human: !!p.human });
    };
    if (state.engine) { state.engine.hands(p, velocity, 'keeper throw', finish); return true; }
    b.vel = velocity;
    setKickSpin(b, -6, 0);
    finish();
    return true;
  }
  const penaltyShot = state.penalty?.active && state.penalty.shooter === p;
  const goalX = HALF_L * team.dir;
  power = clamp(power, 0.2, 1);
  const half = GOAL.width / 2 - 0.45;
  const aimZ = aimInput !== 0 ? clamp(aimInput, -1, 1) * half : rand(-0.6, 0.6) * half;
  const keeper = state.players.find((o) => o.team !== p.team && o.onPitch && !o.sentOff && o.role === 'GK');
  const plan = planShot({
    p, ball: b, goalX, aimZ, power,
    type: penaltyShot ? 'normal' : type,
    errMul: p.human ? 1 : team.diff.error,
    keeper: keeper ? keeper.pos : null,
    penalty: penaltyShot,
  });
  const finish = () => {
  b.shotType = plan.type;
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
    state.penalty!.active = false;
    state.penalty!.pending = true;
    state.penalty!.elapsed = 0;
  }
  team.shots += 1;
  release(state, p);
  p.kickCd = 0.45;
  p.kickType = 'shot';
  state.events.push({ type: 'shot', player: p.id, power, human: !!p.human, shotType: plan.type });
  };
  if (state.engine) {
    // The planner aimed the shot; the engine strikes it at the contact frame.
    return state.engine.kick(p, 'shot', shotKind(plan.type), plan.vel, finish);
  }
  b.vel.x = plan.vel.x; b.vel.y = plan.vel.y; b.vel.z = plan.vel.z;
  setKickSpin(b, plan.top, plan.side);
  finish();
  return true;
}

function sendOff(state: MatchState, p: Player, secondYellow: boolean = false) {
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

function issueCard(state: MatchState, p: Player, color: 'yellow' | 'red') {
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

function injurePlayer(state: MatchState, p: Player) {
  if (p.injured) return;
  p.injured = true;
  p.stun = Math.max(p.stun, 0.9);
  state.teams[p.team].injuries++;
  state.events.push({ type: 'injury', team: p.team, player: p.id });
}

function doTackle(state: MatchState, p: Player) {
  const b = state.ball;
  const team = state.teams[p.team];
  p.tackleCd = 0.6;
  p.kickAnim = 0.35;
  const victim = b.owner;
  // Every tackle attempt reports what happened, so the HUD and tests can show it.
  const report = (result: string) => {
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
    if (state.engine) {
      if (dist(p.pos, b.pos) < 2.2 && b.pos.y < 0.8) { pendingTackle.set(p, null); state.engine.tackle(p, b.pos); }
      else report('nothing');
      return;
    }
    // Loose ball: a lunge that pokes it forward if close.
    if (dist(p.pos, b.pos) < 1.8 && b.pos.y < 0.8) {
      let px = p.face.x, pz = p.face.z;
      if (px * team.dir < 0.2) { px = team.dir * 0.6; pz = (pz >= 0 ? 1 : -1) * 0.8; } // not towards own goal
      b.vel.x = px * 7; b.vel.z = pz * 7; b.vel.y = 0.2;
      setKickSpin(b, 8, rand(-6, 6));
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

  if (state.engine) {
    // The engine decides physically: the tackling foot reaches the ball (won),
    // misses it (missed) or catches the dribbler's legs (foul). See tackleOutcome.
    pendingTackle.set(p, victim);
    state.engine.tackle(p, victim.pos);
    return;
  }

  // Fouls: late, from-behind or full-speed challenges can give away a free
  // kick or penalty, and sometimes a card.
  const behind = (p.pos.x - victim.pos.x) * victim.face.x
    + (p.pos.z - victim.pos.z) * victim.face.z < -0.35;
  const movingFast = p.intent.sprint || len(p.vel.x, p.vel.z) > 5;
  // Most challenges are clean; fouls come from tackling through the back
  // or flying in at full speed, and from being outclassed by the dribbler.
  const foulChance = clamp(
    0.006 + (behind ? 0.06 : 0) + (movingFast ? 0.02 : 0)
      + Math.max(0, victim.phys.dribbling - p.phys.tackling) * 100 / 4000,
    0.004, 0.14,
  );
  if (Math.random() < foulChance) {
    report('foul');
    commitFoul(state, p, victim, behind, movingFast);
    return;
  }

  // Lunge towards the attacker.
  const nx = (victim.pos.x - p.pos.x) / (d || 1), nz = (victim.pos.z - p.pos.z) / (d || 1);
  // Lunge: a burst of velocity towards the attacker (the locomotion and
  // contact code then move him; no teleporting).
  const lunge = Math.min(5.5, 2 + Math.max(0, d - 0.8) * 3);
  const lungeSpeed = Math.max(lunge, p.vel.x * nx + p.vel.z * nz);
  p.vel.x = nx * lungeSpeed;
  p.vel.z = nz * lungeSpeed;

  // Chance: tackling vs dribbling matters, but a well-timed tackle should
  // usually work. Humans get a fairer base; assist adds a little more.
  // Tackling and strength against dribbling, balance and strength.
  const atk = p.phys.tackling * 0.7 + p.phys.strength * 0.3;
  const hold = victim.phys.dribbling * 0.6 + victim.phys.balance * 0.25 + victim.phys.strength * 0.15;
  const skill = (atk - hold) * 100 / 150;
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
      // Assisted: you come away with the ball - it is nicked back towards
      // your feet and you play on from there.
      b.owner = p;
      p.touchCd = 0.25;
      const fx = p.pos.x + nx * 0.6 - b.pos.x, fz = p.pos.z + nz * 0.6 - b.pos.z;
      b.vel.x = fx * 2.2 + p.vel.x * 0.5; b.vel.z = fz * 2.2 + p.vel.z * 0.5; b.vel.y = 0;
      setRollingSpin(b);
    } else {
      b.owner = null;
      const kx = nx * 0.7 + rand(-0.4, 0.4), kz = nz * 0.7 + rand(-0.4, 0.4);
      b.vel.x = kx * 5; b.vel.z = kz * 5; b.vel.y = 0.3;
      setKickSpin(b, 5, rand(-8, 8));
    }
    report('won');
  } else {
    p.stun = p.human ? 0.3 : 0.6;
    report('missed');
  }
}

/** Free kick or penalty for a foul, with injury and card chances. */
function commitFoul(state: MatchState, p: Player, victim: Player, behind: boolean, movingFast: boolean) {
  const spot = { x: victim.pos.x, z: victim.pos.z };
  const penalty = inPenaltyArea(state, p.team, spot);
  victim.stun = 0.25;
  p.stun = 0.35;
  state.events.push({ type: 'foul', team: victim.team, player: p.id, victim: victim.id, penalty });
  if (movingFast && Math.random() < 0.045) injurePlayer(state, victim);
  if (p.role !== 'GK') {
    if (behind && movingFast && Math.random() < 0.06) issueCard(state, p, 'red');
    else if (behind && movingFast && Math.random() < 0.4) issueCard(state, p, 'yellow');
    else if ((behind || movingFast) && Math.random() < 0.12) issueCard(state, p, 'yellow');
  }
  if (penalty) startPenalty(state, victim.team);
  else startRestart(state, 'free kick', victim.team, spot);
}

// ---------- Gold Standard engine: rules on top of engine physics ----------
/** Tackles waiting for the engine's outcome: tackler → victim (null = loose ball). */
const pendingTackle = new WeakMap<Player, Player | null>();

/** Ball held by the rules (set piece, keeper's hands, penalty): kept at the holder's feet/hands. */
function engineHeldBall(state: MatchState) {
  const b = state.ball, owner = b.owner;
  if (!owner) return;
  const penaltyTaker = state.penalty?.active && state.penalty.shooter === owner;
  if (!(owner.mustPass || owner.holding || penaltyTaker)) return;
  if (state.engine?.isKicking(owner)) return;
  // Humans can turn to aim the throw/kick, but never so the ball ends up outside the pitch.
  const it = owner.intent, l = len(it.mx, it.mz);
  if (owner.human && l > 0.3) {
    const fx = it.mx / l, fz = it.mz / l;
    const bx = owner.pos.x + fx * DRIBBLE_OFFSET, bz = owner.pos.z + fz * DRIBBLE_OFFSET;
    if (Math.abs(bx) < HALF_L - 0.3 && Math.abs(bz) < HALF_W - 0.3) { owner.face.x = fx; owner.face.z = fz; }
  }
  attachBall(b, owner);
  b.vel.x = 0; b.vel.y = 0; b.vel.z = 0;
}

/** Keepers read shots with the match's save model; the result is an engine impulse (parry) or a catch. */
function engineKeeperChecks(state: MatchState) {
  const b = state.ball;
  if (b.owner || !b.shotLive || !state.engine) return;
  for (const gk of state.players) {
    if (gk.role !== 'GK' || !gk.onPitch || gk.sentOff || gk.team === b.shotTeam) continue;
    if (!inOwnBox(state, gk) || gk.kickCd > 0 || gk.stun > 0) continue;
    const reach = 1.25 + (gk.dive > 0 ? 1.0 : 0);
    if (dist(gk.pos, b.pos) > reach || b.pos.y > gk.phys.keeper.reach + 0.35) continue;
    if (keeperSave(state, gk)) {
      b.directThrowInGoalBlockedBy = null;
      b.directRestartOwnGoalBlockedBy = null;
      b.freeKickGoalRestrictedBy = null;
      if (b.owner === gk) { b.vel.x = b.vel.y = b.vel.z = 0; attachBall(b, gk); }
      else state.engine.hands(gk, { x: b.vel.x, y: b.vel.y, z: b.vel.z }, 'parry');
    } else gk.kickCd = 0.5; // beaten
    return;
  }
}

/** Match rules for what the engine's physics did this step. */
function engineHooks(state: MatchState): BridgeHooks {
  const b = state.ball;
  const clearRestartFlags = () => {
    b.restartDoubleTouchBy = null;
    b.directThrowInGoalBlockedBy = null;
    b.directRestartOwnGoalBlockedBy = null;
    b.freeKickGoalRestrictedBy = null;
  };
  return {
    acquired(best, prev) {
      if (state.phase !== 'play') return;
      if (b.restartDoubleTouchBy === best) {
        const spot = { x: b.pos.x, z: b.pos.z };
        b.owner = null; b.intended = null; b.offsidePlayers = []; b.restartNoOffsideBy = null; b.restartDoubleTouchBy = null; b.shotLive = false;
        stopBall(b);
        state.events.push({ type: 'doubleTouch', team: best.team, player: best.id });
        startRestart(state, 'indirect free kick', 1 - best.team, spot);
        return;
      }
      if (b.restartDoubleTouchBy) b.restartDoubleTouchBy = null;
      if (b.offsidePlayers.includes(best)) {
        const spot = { x: b.pos.x, z: b.pos.z };
        b.owner = null; b.intended = null; b.offsidePlayers = []; b.restartNoOffsideBy = null;
        stopBall(b);
        state.events.push({ type: 'offside', team: best.team, player: best.id });
        startRestart(state, 'indirect free kick', 1 - best.team, spot);
        return;
      }
      const isGK = best.role === 'GK' && inOwnBox(state, best);
      const prevTouch = b.lastTouch;
      if (prev && prev.team !== best.team) state.events.push({ type: 'steal', player: best.id, from: prev.id });
      if (isGK && b.shotLive && b.shotTeam !== best.team && b.shotTeam >= 0) state.teams[b.shotTeam].onTarget += 1;
      b.owner = best;
      b.lastTouch = best;
      b.intended = null;
      b.offsidePlayers = [];
      b.restartNoOffsideBy = null;
      clearRestartFlags();
      b.shotLive = false;
      best.touchCd = 0.15;
      if (isGK) {
        // Back-pass rule: a ball played to the keeper by a teammate stays at his feet.
        const backPass = prevTouch && prevTouch.team === best.team && prevTouch !== best;
        best.holding = !backPass;
        best.mustPass = !backPass;
        best.mustPassTimer = 0;
        best.holdTimer = backPass ? 0.5 : 1.0;
      } else best.holding = false;
      state.events.push({ type: 'control', player: best.id });
    },
    lost(p) {
      b.lastTouch = p;
      state.events.push({ type: 'lostBall', player: p.id });
    },
    touch(p) {
      p.touchAnim = 0.2;
      state.events.push({ type: 'touch', player: p.id });
    },
    deflect(p) {
      if (b.lastTouch === p) return;
      b.lastTouch = p;
      clearRestartFlags();
      state.events.push({ type: 'deflect', player: p.id });
    },
    woodwork(what) { state.events.push({ type: 'woodwork', what }); },
    tackle(p, won, fouled) {
      const team = state.teams[p.team];
      const victim = pendingTackle.get(p) ?? null;
      pendingTackle.delete(p);
      p.tackleCd = 0.6;
      const result = won ? (victim ? 'won' : 'poke') : fouled && victim ? 'foul' : 'missed';
      if (p.human) {
        team.tackles.tries += result === 'won' || result === 'missed' || result === 'foul' ? 1 : 0;
        if (result === 'won') team.tackles.won += 1;
        team.tackles.last = result;
      }
      state.events.push({ type: 'tackle', player: p.id, human: !!p.human, result, won: result === 'won' });
      if (won) {
        if (victim) { victim.stun = 0.6; victim.kickCd = 0.5; victim.charge = 0; }
        b.lastTouch = p; b.intended = null; b.shotLive = false; b.offsidePlayers = []; b.restartNoOffsideBy = null;
        clearRestartFlags();
      } else if (fouled && victim && state.phase === 'play') {
        const behind = (p.pos.x - victim.pos.x) * victim.face.x + (p.pos.z - victim.pos.z) * victim.face.z < -0.35;
        commitFoul(state, p, victim, behind, len(p.vel.x, p.vel.z) > 5);
      } else {
        p.stun = p.human ? 0.3 : 0.6;
      }
    },
  };
}

/**
 * The player the human would get next: with the ball, the teammate a pass
 * would go to (follows the stick); without it, the teammate a switch would
 * pick (nearest to the ball).
 */
export function computeNext(state: MatchState, team: Team) {
  const p = team.controlled;
  if (!team.human || !p || p.sentOff) return null;
  const b = state.ball;
  const inp = team.lastInput || { mx: 0, mz: 0 };
  if (b.owner === p) return choosePassTarget(state, p, inp.mx, inp.mz);
  const keeper = teamPlayers(state, team.index).find((candidate) => candidate.role === 'GK' && candidate.onPitch && !candidate.sentOff);
  const keeperAvailable = !!keeper && (b.owner === keeper || inPenaltyArea(state, team.index, b.pos));
  return nearestTo(state, team.index, b.pos, p, keeperAvailable);
}

function updateNext(state: MatchState) {
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
function applyHumanInput(state: MatchState, team: Team, input: InputFrame | null | undefined, dt: number) {
  const b = state.ball;
  const manualKeeperPressed = !!input?.keeperSwitchPressed;
  let p = team.controlled;
  if (!p || p.sentOff) {
    const keeper = teamPlayers(state, team.index).find((candidate) => candidate.role === 'GK' && candidate.onPitch && !candidate.sentOff);
    p = nearestTo(state, team.index, b.pos, null, !!keeper && (b.owner === keeper || inPenaltyArea(state, team.index, b.pos)));
    if (!p) return;
    setControlled(state, team, p);
  }
  // When a teammate (AI) gains the ball, take control of them.
  if (b.owner && b.owner.team === team.index && b.owner !== p && !manualKeeperPressed && !team.manualKeeperControl
      && !(b.pendingPass?.target === p && b.pendingPass.passer === b.owner)) {
    p = b.owner;
    setControlled(state, team, p);
  }
  // When an opponent wins the ball, jump to our player nearest the ball
  // (only if that is clearly closer than the one we have).
  // Only when they *win* it (not on every pass between them), and only if
  // your player is far from the ball.
  if (b.owner && b.owner.team !== team.index && !manualKeeperPressed && !team.manualKeeperControl) {
    if (team.seenOpponentOwner === null) {
      team.seenOpponentOwner = b.owner;
      const keeper = teamPlayers(state, team.index).find((candidate) => candidate.role === 'GK' && candidate.onPitch && !candidate.sentOff);
      const n = nearestTo(state, team.index, b.pos, null, !!keeper && inPenaltyArea(state, team.index, b.pos));
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
  const frame: Required<InputFrame> = {
    mx: Number(input && input.mx) || 0,
    mz: Number(input && input.mz) || 0,
    sprint: !!(input && input.sprint),
    passPressed: !!(input && input.passPressed),
    loftPressed: !!(input && input.loftPressed),
    throughPressed: !!(input && input.throughPressed),
    drivenPressed: !!(input && input.drivenPressed),
    shootHeld: !!(input && input.shootHeld),
    shootPressed: !!(input && input.shootPressed),
    finesseHeld: !!(input && input.finesseHeld),
    chipHeld: !!(input && input.chipHeld),
    keeperSwitchPressed: manualKeeperPressed,
  };
  team.lastInput = { mx: frame.mx || 0, mz: frame.mz || 0 };

  if (frame.keeperSwitchPressed) {
    const keeper = teamPlayers(state, team.index).find((candidate) => candidate.role === 'GK' && candidate.onPitch && !candidate.sentOff);
    if (keeper) { p = keeper; setControlled(state, team, keeper); }
  }

  const it = p.intent;
  it.mx = frame.mx; it.mz = frame.mz; it.sprint = !!frame.sprint; it.action = null;
  if (state.penalty?.active) {
    it.mx = it.mz = 0;
    it.sprint = false;
    if (p === state.penalty.shooter && b.owner === p) {
      if (frame.shootHeld) p.charge = Math.min(1, p.charge + dt / SHOT_CHARGE_TIME);
      else if (p.charge > 0) it.action = { type: 'shoot', power: Math.max(0.25, p.charge), aim: frame.mz };
    } else {
      p.charge = 0;
    }
    return;
  }
  const hasInput = len(frame.mx, frame.mz) > 0.15;
  p.assisting = null;
  p.assistOnly = false;
  const pending = b.pendingPass;
  if (pending?.target === p && b.owner === pending.passer && !hasInput) {
    const dx = pending.aim.x - p.pos.x, dz = pending.aim.z - p.pos.z;
    const d = len(dx, dz) || 1;
    it.mx = dx / d; it.mz = dz / d; it.sprint = d > 2;
    p.assistOnly = true;
    p.assisting = 'move for pass';
  }
  // Receiving a pass: run to meet it. With no input always; with assist on,
  // also while you press anywhere except clearly away from the ball.
  if (b.intended === p && !b.owner) {
    const q = receivePoint(p, b);
    const dx = q.x - p.pos.x, dz = q.z - p.pos.z;
    const l = len(dx, dz);
    const il = len(frame.mx, frame.mz);
    const cos = hasInput && l > 0 ? (frame.mx * dx + frame.mz * dz) / (il * l) : 1;
    // He comes to meet the ball unless the stick points clearly away from it
    // (that means "run there": the pass may then be cut out).
    const meet = !hasInput || (state.assistName !== 'off' && cos > -0.2);
    const ballNear = len(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 2.4;
    if (meet && ballNear) {
      // Last steps: the stick decides the touch. No stick: keep stepping
      // into the ball (slowly) and cushion it at his feet. Stick: go that
      // way and take the first touch in that direction, running on with it.
      // Not on the ball's line yet: get there first.
      const onLine = l < 0.45;
      const gx = onLine ? b.pos.x - p.pos.x : dx, gz = onLine ? b.pos.z - p.pos.z : dz, gl = len(gx, gz) || 1;
      // On the line he walks into the ball to meet it (cushioned touch).
      const m = onLine ? 0.4 : clamp(l / 1.2, 0.35, 0.75);
      it.mx = hasInput ? frame.mx : (gx / gl) * m; it.mz = hasInput ? frame.mz : (gz / gl) * m;
      p.assistOnly = !hasInput;
      it.sprint = hasInput && !!frame.sprint;
      p.assisting = 'meet pass';
    } else if (meet && l > 0.3) {
      // Arrive in time, not as fast as possible: pace = distance / time
      // left, easing off over the last metres so he is set for the touch.
      const run = p.phys?.runSpeed ?? 5.5;
      const need = l / Math.max(0.15, q.t);
      const mag = clamp(Math.max(need / run, 0.35), 0, 1) * Math.min(1, l / 1.2);
      it.mx = (dx / l) * mag; it.mz = (dz / l) * mag;
      it.sprint = it.sprint || need > run * 0.95;
      p.assisting = 'meet pass';
    } else if (meet) {
      it.mx = 0; it.mz = 0; it.sprint = false; // on the line: set and wait
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
        const il = len(frame.mx, frame.mz);
        const cos = hasInput ? (frame.mx * dx + frame.mz * dz) / (il * d) : -1;
        if (hasInput && cos > as.steerCos && d < ASSIST_STEER_RANGE) {
          it.mx = dx / d; it.mz = dz / d; p.assisting = 'steer';
        } else if (!hasInput && !b.owner && (as.auto || (state.assistName === 'assisted' && d < AUTO_CHASE_RANGE
          && !(b.intended && b.intended.team === p.team && b.intended !== p)))) {
          // Hands off the stick and the ball is loose nearby: go and get it
          // (but leave a pass meant for a teammate to him).
          it.mx = dx / d; it.mz = dz / d; it.sprint = d > 4; p.assisting = 'auto';
        }
      }
    }
  }

  if (b.owner === p) {
    const anyPass = frame.passPressed || frame.loftPressed || frame.throughPressed || frame.drivenPressed;
    if (anyPass) {
      // Priority when several pass buttons land on the same step:
      // through > lofted > driven > ground.
      const kind = frame.throughPressed ? 'through' : frame.loftPressed ? 'lofted' : undefined;
      it.action = {
        type: 'pass',
        target: choosePassTarget(state, p, frame.mx, frame.mz, kind === 'through' ? 'through' : kind === 'lofted' ? 'lofted' : 'ground'),
        kind,
        driven: frame.drivenPressed && !kind,
      };
    } else if (frame.shootHeld) {
      if (p.charge === 0) p.chargeType = null;
      if (frame.chipHeld) p.chargeType = 'chip';
      else if (frame.finesseHeld && p.chargeType !== 'chip') p.chargeType = 'finesse';
      p.charge = Math.min(1, p.charge + dt / SHOT_CHARGE_TIME);
    } else if (p.charge > 0) {
      it.action = {
        type: 'shoot',
        power: Math.max(0.25, p.charge),
        aim: frame.mz,
        shotType: shotTypeFromCharge(p.charge, p.chargeType),
      };
      // The release is the decision: if the ball is not in reach yet the
      // shot is held for a moment (see queuedAction), not re-issued forever.
      p.charge = 0;
      p.chargeType = null;
    }
  } else if (state.engine && ballComingTo(state, p)) {
    // The ball is on its way to us: a pass or shot press now is a first-time
    // action (buffered until the ball can be struck), not a player switch.
    const anyPass = frame.passPressed || frame.loftPressed || frame.throughPressed || frame.drivenPressed;
    if (anyPass) {
      const kind = frame.throughPressed ? 'through' : frame.loftPressed ? 'lofted' : undefined;
      it.action = {
        type: 'pass', receive: true,
        target: choosePassTarget(state, p, frame.mx, frame.mz, kind === 'through' ? 'through' : kind === 'lofted' ? 'lofted' : 'ground'),
        kind, driven: frame.drivenPressed && !kind,
      };
      p.charge = 0;
    } else if (frame.shootHeld) {
      if (p.charge === 0) p.chargeType = null;
      if (frame.chipHeld) p.chargeType = 'chip';
      else if (frame.finesseHeld && p.chargeType !== 'chip') p.chargeType = 'finesse';
      p.charge = Math.min(1, p.charge + dt / SHOT_CHARGE_TIME);
    } else if (p.charge > 0) {
      it.action = { type: 'shoot', receive: true, power: Math.max(0.25, p.charge), aim: frame.mz, shotType: shotTypeFromCharge(p.charge, p.chargeType) };
      p.charge = 0;
      p.chargeType = null;
    }
  } else {
    p.charge = 0;
    if (frame.passPressed || frame.loftPressed || frame.throughPressed || frame.drivenPressed) {
      // Switch to the teammate nearest the ball.
      const keeper = teamPlayers(state, team.index).find((candidate) => candidate.role === 'GK' && candidate.onPitch && !candidate.sentOff);
      const next = nearestTo(state, team.index, b.pos, p, !!keeper && (b.owner === keeper || inPenaltyArea(state, team.index, b.pos)));
      if (next) { setControlled(state, team, next); state.events.push({ type: 'manualSwitch', team: team.index }); }
    } else if (frame.shootPressed && p.tackleCd <= 0) {
      it.action = { type: 'tackle' };
    }
  }

  // Keep a manually controlled keeper inside the penalty area while still
  // allowing lateral shuffling and safe distribution from the hands.
  if (p.role === 'GK' && !it.action) {
    const forward = p.pos.x * team.dir + it.mx * team.dir * 2.5;
    const lateral = p.pos.z * team.dir + it.mz * team.dir * 2.5;
    const fx = clamp(forward, -HALF_L + 0.5, -HALF_L + BOX.depth - 0.5);
    const fz = clamp(lateral, -BOX.width / 2 + 0.5, BOX.width / 2 - 0.5);
    const dx = (fx - p.pos.x * team.dir) * team.dir;
    const dz = (fz - p.pos.z * team.dir) * team.dir;
    const d = len(dx, dz);
    if (d < 0.05) it.mx = it.mz = 0;
    else { it.mx = dx / d; it.mz = dz / d; }
  }
}

// ---------- movement ----------
function movePlayer(state: MatchState, p: Player, dt: number) {
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
  const prof = p.phys;
  const canSprint = it.sprint && p.stamina > 0.05 && !p.injured;
  let speed = prof.runSpeed;
  // Fatigue has a gradual effect so tired players remain controllable but
  // cannot match a fresh player's pace for the whole match.
  speed *= 1 - (1 - p.stamina) * 0.18;
  if (p.injured) speed *= 0.78;
  if (canSprint) speed *= prof.sprintMul;
  const dribbling = b.owner === p;
  if (dribbling) speed *= 0.86 + p.stats.dri / 1000;
  if (p.stun > 0) speed *= 0.35;
  if (p.stagger > 0) speed *= 0.6;
  if (!p.human) speed *= team.diff.speed;
  let accelMul = dribbling ? 0.85 : 1;
  let turnMul = p.stagger > 0 ? 0.6 : 1;
  if (p.dive > 0) { speed *= 1.5; accelMul = 3; turnMul = 4; }

  stepLocomotion(p, prof, { dx: it.mx, dz: it.mz, top: speed, accelMul, turnMul }, dt);
  clampPlayer(p);

  const sp = len(p.vel.x, p.vel.z);
  if (canSprint && sp > 1) p.stamina = Math.max(0, p.stamina - dt * prof.staminaDrain);
  else p.stamina = Math.min(1, p.stamina + dt * prof.staminaRecover);
}

function separatePlayers(state: MatchState) {
  resolvePlayerContacts(state.players, PLAYER_RADIUS, (p) => isHolding(state, p));
  for (const p of state.players) if (p.onPitch) clampPlayer(p);
}

// ---------- ball physics ----------
function collidePosts(b: Ball) {
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
          const w = ensureSpin(b); w.x *= 0.4; w.y *= -0.4; w.z *= 0.4;
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

/**
 * The ball cannot pass through players. Anyone who could take the ball this
 * step is left to updatePossession (control / block / save); everyone else -
 * the ball above their reach, or a player who just kicked, was stunned or is
 * on cooldown - is a solid body the ball deflects off.
 */
/** Close control keeps the ball inside the field (and out of your own net). */
function ownerBounds(state: MatchState, p: Player) {
  if (Math.abs(p.pos.x) > HALF_L - 0.2 || Math.abs(p.pos.z) > HALF_W - 0.2) return null;
  return { x: HALF_L - 0.45, z: HALF_W - 0.35 };
}

function collideBodies(state: MatchState, b: Ball) {
  for (const p of state.players) {
    if (!p.onPitch || p.sentOff || p === b.owner) continue;
    if (Math.abs(p.pos.x - b.pos.x) > 1 || Math.abs(p.pos.z - b.pos.z) > 1) continue;
    const isGK = p.role === 'GK' && inOwnBox(state, p);
    const reach = isGK ? 2.5 : 1.1;
    const canPlay = p.kickCd <= 0 && p.stun <= 0 && b.pos.y <= reach;
    if (canPlay) continue;
    // The ball is leaving the foot of the player who just played it.
    if (b.lastTouch === p && p.kickCd > 0) continue;
    const touched = collideBallWithBody(b, {
      x: p.pos.x, z: p.pos.z, vx: p.vel.x, vz: p.vel.z, radius: BODY_RADIUS, height: BODY_HEIGHT,
    });
    if (touched && b.lastTouch !== p) {
      b.lastTouch = p;
      b.restartDoubleTouchBy = null;
      b.directThrowInGoalBlockedBy = null;
      b.directRestartOwnGoalBlockedBy = null;
      b.freeKickGoalRestrictedBy = null;
      state.events.push({ type: 'deflect', player: p.id });
    }
  }
}

function updateBall(state: MatchState, dt: number) {
  const b = state.ball;
  const owner = b.owner;
  const penaltyTaker = state.penalty?.active && state.penalty.shooter === owner;
  if (owner && (owner.mustPass || owner.holding || penaltyTaker || state.phase !== 'play')) {
    // Set pieces and the keeper's hands: the ball is held, not dribbled.
    attachBall(b, owner);
    b.vel.x = owner.vel.x; b.vel.z = owner.vel.z; b.vel.y = 0;
    setRollingSpin(b);
    return;
  }
  if (owner && state.dribbleStyle === 'sticky') {
    if (updateStickyDribble(owner, b, dt, ownerBounds(state, owner)) === 'touch') {
      state.events.push({ type: 'touch', player: owner.id });
    }
    return;
  }
  const n = substepsFor(b, dt);
  const h = dt / n;
  const live = state.phase === 'play';
  for (let i = 0; i < n; i++) {
    integrateBall(b, h);
    const hit = collidePosts(b);
    if (hit) state.events.push({ type: 'woodwork', what: hit });
    if (live) collideBodies(state, b);
  }
  if (owner) {
    const res = updateDribble(owner, b, dt, ownerBounds(state, owner));
    if (res === 'lost') {
      b.owner = null;
      b.lastTouch = owner;
      state.events.push({ type: 'lostBall', player: owner.id });
    } else if (res === 'touch') {
      state.events.push({ type: 'touch', player: owner.id });
    }
  }

  // Net: keep a scored ball inside the goal.
  if (state.phase === 'goal' && Math.abs(b.pos.x) > HALF_L) {
    const sx = Math.sign(b.pos.x);
    if (Math.abs(b.pos.x) > HALF_L + GOAL.depth) { b.pos.x = sx * (HALF_L + GOAL.depth); b.vel.x *= -0.2; }
    if (Math.abs(b.pos.z) > GOAL.width / 2) { b.pos.z = Math.sign(b.pos.z) * GOAL.width / 2; b.vel.z *= -0.2; }
    if (b.pos.y > GOAL.height) { b.pos.y = GOAL.height; b.vel.y = -Math.abs(b.vel.y) * 0.2; }
  }
}

// ---------- possession ----------
function inOwnBox(state: MatchState, p: Player) {
  const team = state.teams[p.team];
  const gx = -HALF_L * team.dir;
  return Math.abs(p.pos.x - gx) < BOX.depth && Math.abs(p.pos.z) < BOX.width / 2;
}

function checkOffsideChallenge(state: MatchState) {
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
    stopBall(b);
    state.events.push({ type: 'offside', team: attacker.team, player: attacker.id, interference: true });
    startRestart(state, 'indirect free kick', defendingTeam.index, spot);
    return true;
  }
  return false;
}

function keeperSave(state: MatchState, gk: Player) {
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
  // Reflexes for everything, diving for the corners, positioning for shots
  // he is already set for.
  const k = gk.phys.keeper;
  const gkSkill = k.reflexes * 0.4 + k.diving * (0.3 + corner * 0.3) + k.positioning * (0.3 - corner * 0.3);
  const chance = clamp(
    0.7 + (gkSkill * 100 - 85) / 50 + keeperMul - (speed - 20) / 50 - corner * corner * 0.35 + far,
    0.2, 0.95,
  );
  if (Math.random() >= chance) return false;
  b.shotLive = false;
  // Safe hands catch more; poor handling spills more into parries.
  if (speed > 29 || Math.random() < ((speed - 16) / 20) * (1.4 - k.handling * 0.6)) {
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

/** Chance that a player fails to control the ball as it arrives. */
function firstTouchFails(state: MatchState, p: Player, b: Ball, speed: number) {
  const rel = Math.hypot(b.vel.x - p.vel.x, b.vel.z - p.vel.z);
  const height = b.pos.y - BALL_R;
  const control = p.phys.control;
  let difficulty = Math.max(0, rel - 7) / 16 + Math.max(0, height - 0.35) * 0.45
    + (p.stagger > 0 ? 0.25 : 0);
  if (b.intended === p) difficulty *= 0.6;
  if (p.human && state.assistName !== 'off') difficulty *= 0.75;
  const chance = clamp(difficulty * (1.2 - control), 0, 0.45);
  return chance > 0 && Math.random() < chance;
}

/**
 * A good first touch takes the pace off the ball and sets it a little in
 * front of the receiver, keeping part of its momentum. No teleporting: the
 * ball keeps its position and only its velocity changes.
 */
function cushionBall(p: Player, b: Ball) {
  const it = p.intent;
  const il = len(it.mx, it.mz);
  const s = len(p.vel.x, p.vel.z);
  let dx, dz;
  if (il > 0.2) { dx = it.mx / il; dz = it.mz / il; }
  else if (s > 0.6) { dx = p.vel.x / s; dz = p.vel.z / s; }
  else { dx = p.face.x; dz = p.face.z; }
  const keep = 0.12 * (1.2 - p.phys.control);
  b.vel.x = p.vel.x + dx * 1.2 + (b.vel.x - p.vel.x) * keep;
  b.vel.z = p.vel.z + dz * 1.2 + (b.vel.z - p.vel.z) * keep;
  if (b.pos.y > BALL_R + 0.3) b.vel.y = Math.min(b.vel.y, -0.5); // chest/thigh it down
  else b.vel.y = 0;
  setRollingSpin(b);
}

function updatePossession(state: MatchState, dt: number) {
  const b = state.ball;
  if (b.passGrace && b.passGrace > 0) b.passGrace -= dt;
  // While dribbling, the ball can be nicked by an opponent only when it is
  // away from the owner's feet (between touches).
  const contestedBy = b.owner && !b.owner.mustPass && !b.owner.holding
    && dist(b.owner.pos, b.pos) > 1.05 ? b.owner : null;
  if (b.owner && !contestedBy) return;
  const speed = len(b.vel.x, b.vel.z);
  let best = null, bd = Infinity;
  for (const p of state.players) {
    if (!p.onPitch || p.sentOff) continue;
    if (p.kickCd > 0 || p.stun > 0) continue;
    if (contestedBy && p.team === contestedBy.team) continue;
    const isGK = p.role === 'GK' && inOwnBox(state, p);
    const reachH = isGK ? p.phys.keeper.reach + 0.35 : 1.1;
    if (b.pos.y > reachH) continue;
    let r = isGK ? 1.25 + (p.dive > 0 ? 1.0 : 0)
      : CONTROL_RADIUS + (b.intended === p ? 0.25 : 0) + (p.human ? state.assist.controlBonus : 0);
    // An opponent cutting out a firm pass has to be right in its path.
    if (!isGK && b.passByHuman && b.intended && b.intended.team !== p.team && speed > 9) r *= 0.65;
    // Reading a pass: better interceptors reach further for the opponents' ball.
    if (!isGK && b.intended && b.intended.team !== p.team) r *= 0.82 + p.phys.interceptions * 0.3;
    const d = dist(p.pos, b.pos);
    if (b.passGrace && b.passGrace > 0 && b.intended && b.passFrom && p.team !== b.intended.team && dist(p.pos, b.passFrom) < 2.2) continue;
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
    stopBall(b);
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
    stopBall(b);
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
  if (contestedBy) state.events.push({ type: 'steal', player: best.id, from: contestedBy.id });
  // First touch: a hard or high ball, a poor first touch or a player off
  // balance can spill it. Keepers use their hands (handled below).
  if (!isGK && firstTouchFails(state, best, b, speed)) {
    const k = rand(0.3, 0.5);
    const rvx = (b.vel.x - best.vel.x) * k, rvz = (b.vel.z - best.vel.z) * k;
    const a = rand(-0.8, 0.8), c = Math.cos(a), sn = Math.sin(a);
    b.vel.x = best.vel.x + rvx * c - rvz * sn;
    b.vel.z = best.vel.z + rvx * sn + rvz * c;
    b.vel.y = Math.max(b.vel.y * -0.3, rand(0.5, 2));
    setKickSpin(b, rand(-10, 10), rand(-10, 10));
    b.owner = null;
    b.lastTouch = best;
    b.intended = null;
    b.offsidePlayers = [];
    b.restartNoOffsideBy = null;
    b.restartDoubleTouchBy = null;
    b.directThrowInGoalBlockedBy = null;
    b.directRestartOwnGoalBlockedBy = null;
    b.freeKickGoalRestrictedBy = null;
    b.shotLive = false;
    best.kickCd = 0.3;
    state.events.push({ type: 'miscontrol', player: best.id });
    return;
  }
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
  if (!isGK) cushionBall(best, b);
  else b.vel.y = 0;
  best.touchCd = 0.15;
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
function checkOutOfPlay(state: MatchState) {
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
      const scorer = state.teams.find((t) => t.dir === endSign)!; // one team attacks each end
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
    const defending = state.teams.find((t) => t.dir === -endSign)!;
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

function scoreGoal(state: MatchState, teamIdx: number) {
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
    type: 'goal', team: teamIdx, scorer: scorer ? scorer.name : '', scorerId: scorer ? scorer.id : null, ownGoal: own,
  });
  state.lastGoal = {
    team: teamIdx, scorer: scorer ? scorer.name : '', scorerId: scorer ? scorer.id : null, ownGoal: !!own, clock: state.clock,
    // Where the scorer runs to celebrate: towards the nearest corner flag.
    runTo: scorer ? {
      x: clamp(scorer.pos.x, -HALF_L + 8, HALF_L - 8) * 0.9 + Math.sign(scorer.pos.x || 1) * 4,
      z: Math.sign(scorer.pos.z || 1) * (HALF_W - 5),
    } : null,
  };
  setBanner(state, 'GOAL!', 2.4);
  b.shotLive = false;
  b.intended = null;
  b.pendingPass = null;
  state.penalty = null;
  clearActionBuffers(state);
  state.phase = 'goal';
  state.flow = 'GOAL_SCORED';
  state.transition = null;
  state.phaseTimer = GOAL_PAUSE;
  state.kickoffNext = 1 - teamIdx;
}

// ---------- goal celebrations ----------
/** Seconds between a goal and the restart (celebration, then the replay). */
export const GOAL_PAUSE = 4.2;

/**
 * After a goal the scorer runs off to celebrate and his teammates run to
 * join him; the other team stops. Uses the normal locomotion, so the
 * celebration has real running and stopping.
 */
function celebrationIntents(state: MatchState) {
  const g = state.lastGoal;
  const elapsed = GOAL_PAUSE - state.phaseTimer;
  const scorer = g && g.scorerId != null && !g.ownGoal ? state.players[g.scorerId] : null;
  for (const p of state.players) {
    const it = p.intent;
    it.mx = 0; it.mz = 0; it.sprint = false; it.action = null;
    if (!g || !scorer || !p.onPitch || p.sentOff || p.team !== g.team) continue;
    let tx, tz, stop;
    if (p === scorer) {
      if (elapsed > 2.6) continue;
      if (!g.runTo) continue;
      tx = g.runTo.x; tz = g.runTo.z; stop = 0.5;
    } else {
      if (p.role === 'GK' || elapsed < 0.5 || dist(p.pos, scorer.pos) > 32) continue;
      tx = scorer.pos.x; tz = scorer.pos.z; stop = 1.6;
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = len(dx, dz);
    if (d < stop) continue;
    const m = Math.min(1, (d - stop) / 2);
    it.mx = (dx / d) * m; it.mz = (dz / d) * m;
    it.sprint = p === scorer ? elapsed < 1.6 : d > 8;
  }
}

// ---------- main step ----------
/**
 * Advance the match by dt seconds.
 * inputs = { p1: input|null, p2: input|null }
 */
export function stepMatch(state: MatchState, inputs: Inputs, dt: number) {
  if (state.phase === 'fulltime') return;
  syncDirs(state);
  const b = state.ball;
  if (state.banner) { state.banner.time -= dt; if (state.banner.time <= 0) state.banner = null; }

  // Remember where everything was, so the renderer can interpolate between
  // physics steps.
  for (const p of state.players) {
    if (!p.prevPos) p.prevPos = { x: p.pos.x, z: p.pos.z };
    else { p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z; }
  }
  if (!b.prevPos) b.prevPos = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
  else { b.prevPos.x = b.pos.x; b.prevPos.y = b.pos.y; b.prevPos.z = b.pos.z; }

  // Timers
  for (const p of state.players) {
    p.stagger = Math.max(0, (p.stagger || 0) - dt);
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.dive = Math.max(0, p.dive - dt);
    p.kickAnim = Math.max(0, p.kickAnim - dt);
    p.touchAnim = Math.max(0, (p.touchAnim || 0) - dt);
  }

  // Stoppages run as two explicit flow states. The first lets the live ball
  // settle under physics; the second eases the visible players and ball into
  // their restart positions while gameplay input remains locked.
  if (state.flow === 'OUT_OF_BOUNDS_TRANSITION') {
    const tr = state.transition;
    if (tr) tr.elapsed += dt;
    state.phaseTimer = Math.max(0, state.phaseTimer - dt);
    if (state.engine) state.engine.step(state, dt, engineHooks(state), false);
    else {
      updateBall(state, dt);
      const damping = Math.exp(-3.2 * dt);
      for (const p of state.players) if (p.onPitch && !p.sentOff) {
        p.vel.x *= damping; p.vel.z *= damping;
        p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
      }
    }
    if (tr && tr.elapsed >= tr.duration && tr.pendingRestart) {
      const { type, team, spot } = tr.pendingRestart;
      // The first phase has finished visually at the ball's settled position.
      // Snapshot that handoff before setupRestart moves players and ball; reusing
      // the original snapshot reset interpolation to zero and visibly pulled
      // everything back for a frame before the set-piece lineup eased in.
      const setupFrom = transitionSnapshot(state);
      setupRestart(state, type, team, spot);
      state.flow = 'SET_PIECE_SETUP';
      state.transition = {
        state: 'SET_PIECE_SETUP', elapsed: 0, duration: 0.6,
        ...setupFrom,
      };
    }
    return;
  }
  if (state.flow === 'SET_PIECE_SETUP') {
    const tr = state.transition;
    if (tr) tr.elapsed += dt;
    state.phaseTimer = Math.max(0, state.phaseTimer - dt);
    if (state.engine) state.engine.step(state, dt, engineHooks(state), false);
    else updateBall(state, dt);
    if (!tr || tr.elapsed >= tr.duration) {
      state.transition = null;
      state.flow = state.phase === 'kickoff' ? 'KICKOFF' : 'PLAYING';
      if (state.phaseTimer <= 0 && (state.phase === 'kickoff' || state.phase === 'restart')) {
        state.phase = 'play'; state.restart = null; state.flow = 'PLAYING';
      }
    }
    return;
  }

  if (state.phase === 'goal') {
    state.phaseTimer -= dt;
    if (state.engine) {
      celebrationIntents(state);
      state.engine.step(state, dt, engineHooks(state), false);
    } else {
      updateBall(state, dt);
      celebrationIntents(state);
      for (const p of state.players) movePlayer(state, p, dt);
      separatePlayers(state);
    }
    if (state.phaseTimer <= 0) {
      if (!state.practice && state.clock >= state.duration) endMatch(state);
      else startKickoffSetup(state, state.practice ? 0 : state.kickoffNext ?? 0);
    }
    return;
  }

  // Stop the match clock at the midpoint, change ends, then restart with
  // the team that did not take the opening kick-off.
  if (state.phase === 'halftime') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      for (const team of state.teams) team.dir *= -1;
      startKickoffSetup(state, 1 - state.openingKickoff);
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
    if (state.phaseTimer <= 0) { state.phase = 'play'; state.restart = null; state.flow = 'PLAYING'; }
    else return;
  }

  // ----- play -----
  state.clock += dt / state.timeScale; // clock follows real time, whatever the game speed
  if (b.pendingPass && (state.clock > b.pendingPass.expiresAt || b.owner !== b.pendingPass.passer)) b.pendingPass = null;
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
  // One shared prediction of the free ball's flight for every AI decision
  // and receiver this step (same integrator as the real ball).
  b.path = b.owner ? null : state.engine
    ? state.engine.ballPath(b.pos, b.vel, b.spin, 5)
    : computeBallPath(b, 5);
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

  // Resolve actions. A pass or shot needs the ball within reach of the foot;
  // otherwise it is held for a moment while the player gets to the ball.
  for (const p of state.players) {
    let a = p.intent.action;
    if (!a && p.queuedAction) {
      p.queuedAction.ttl -= dt;
      const qa = p.queuedAction.action;
      const receiving = (qa.type === 'pass' || qa.type === 'shoot') && qa.receive;
      // A first-time press waits for the ball; it dies if anyone else gets it.
      const valid = receiving ? (b.owner === p || (!b.owner && ballComingTo(state, p))) : b.owner === p;
      if (p.queuedAction.ttl <= 0 || !valid) p.queuedAction = null;
      else a = qa;
    }
    if (!a) continue;
    const firstTime = (a.type === 'pass' || a.type === 'shoot') && a.receive && !b.owner;
    if (state.engine && (a.type === 'pass' || a.type === 'shoot') && state.engine.isKicking(p)) {
      // Already striking or running onto the ball: this press is that kick.
      p.queuedAction = null;
      continue;
    }
    if (!state.engine && (a.type === 'pass' || a.type === 'shoot') && b.owner === p && !canKick(p, b)) {
      if (!p.queuedAction || p.queuedAction.action !== a) p.queuedAction = { action: a, ttl: 1.6 };
      continue;
    }
    const queued = p.queuedAction?.action === a ? p.queuedAction : null;
    p.queuedAction = null;
    let started = true;
    if (firstTime) {
      // Strike the incoming ball first time; the engine buffers it until
      // the ball is in reach (or rejects it while it is still far off).
      started = a.type === 'pass' ? doPass(state, p, a.target, { kind: a.kind, driven: a.driven })
        : a.type === 'shoot' ? doShot(state, p, a.power, a.aim || 0, a.shotType || 'normal') : true;
      if (!started && p.human) p.queuedAction = queued ?? { action: a, ttl: RECEIVE_BUFFER };
      continue;
    }
    if (a.type === 'pass' && b.owner === p) started = doPass(state, p, a.target, { kind: a.kind, driven: a.driven });
    else if (a.type === 'shoot' && b.owner === p && p.throwIn) {
      // You can't shoot from a throw-in: throw it to a teammate instead.
      started = doPass(state, p, choosePassTarget(state, p, p.face.x, p.face.z));
    } else if (a.type === 'shoot' && b.owner === p) started = doShot(state, p, a.power, a.aim || 0, a.shotType || 'normal');
    // The engine can't start the kick yet (stumbling after a bump, falling and
    // getting up, finishing a turn): keep a human's press while he keeps the
    // ball and strike as soon as he can, instead of silently dropping it.
    // 2.5 s covers a fall plus getting up; set-piece takers wait a bit longer.
    if (!started && p.human) p.queuedAction = queued ?? { action: a, ttl: p.mustPass ? 3 : 2.5 };
    else if (a.type === 'tackle') doTackle(state, p);
    if (state.phase !== 'play') break;
  }

  // A foul or dismissal starts a stoppage; do not run another movement or
  // ball step after the restart has been positioned.
  if (state.phase !== 'play') return;

  // A player who has committed to a pass or shot runs onto the ball to
  // strike it (the button press is the decision; releasing the stick must
  // not leave the ball rolling away from him).
  for (const p of state.players) {
    if (state.engine) break; // the engine runs players onto the ball for their kicks
    if (!p.queuedAction || b.owner !== p) continue;
    const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z;
    const d = len(dx, dz) || 1;
    p.intent.mx = dx / d; p.intent.mz = dz / d;
    p.intent.sprint = d > 1.4;
  }

  if (state.engine) {
    // Gold Standard engine: physics for every body and every touch; match rules on top.
    engineHeldBall(state);
    engineKeeperChecks(state);
    if (state.phase !== 'play') return;
    state.engine.step(state, dt, engineHooks(state), true);
    if (state.phase !== 'play') return;
    if (checkOffsideChallenge(state)) return;
  } else {
    for (const p of state.players) movePlayer(state, p, dt);
    separatePlayers(state);
    updateBall(state, dt);
    if (checkOffsideChallenge(state)) return;
    updatePossession(state, dt);
  }
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
    stopBall(state.ball);
    setBanner(state, 'HALF TIME', 3);
    state.events.push({ type: 'halftime' });
    applyPendingSubstitutions(state);
    automateHalftimeSubstitutions(state);
    return;
  }
  if (!state.practice && state.clock >= state.duration && state.phase === 'play'
      && !state.penalty?.active && !state.penalty?.pending) endMatch(state);
}

function endMatch(state: MatchState) {
  if (state.extraTimeAllowed && !state.extraTimeStarted && state.teams[0].score === state.teams[1].score) {
    state.extraTimeStarted = true;
    state.duration += state.extraTimeDuration;
    setupKickoff(state, 1 - (state.kickoffNext ?? 1));
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
export function displayMinute(state: MatchState) {
  if (!Number.isFinite(state.duration)) return 0;
  return Math.min(90, Math.floor((state.clock / state.duration) * 90));
}
