// Match ⇄ Gold Standard engine bridge.
//
// The match (match.ts) keeps the football: rules, restarts, offside, cards,
// AI decisions, human control, keepers' judgement. The engine
// (packages/game-engine) does the physics: one Rapier world, every player on
// the shared PlayerController, and one PlayerBallInteraction authority for
// every touch, pass, shot and tackle. This bridge:
//   - maps coordinates (the match pitch runs along x, the engine's along z),
//   - mirrors rule-driven teleports (kick-off, restarts) into the engine,
//   - feeds AI/human intents to the controllers each fixed step,
//   - copies positions, velocities, facing, stamina, poses, the ball and
//     possession back into the match state,
//   - turns match pass/shot/tackle decisions into engine commands, running the
//     match's bookkeeping when the engine actually releases the ball,
//   - reports engine events (control, touches, deflections, woodwork,
//     tackles) back to the match through hooks.
import { Simulation } from '../../packages/game-engine/physics/Simulation.ts';
import { createCalibration } from '../../packages/game-engine/physics/PhysicsConfig.ts';
import { initPhysics } from '../../packages/game-engine/physics/PhysicsWorld.ts';
import { predictTrajectory } from '../../packages/game-engine/ball/BallPhysics.ts';
import { spinFromComponents } from '../../packages/game-engine/ball/BallSpin.ts';
import type { PlayerController } from '../../packages/game-engine/player/PlayerController.ts';
import type { KickCommand } from '../../packages/game-engine/player/PlayerBallInteraction.ts';
import { emptyInput, type KickKind, type PlayerAttributes, type PoseData } from '../../packages/game-engine/player/PlayerTypes.ts';
import { REFERENCE_ATTRIBUTES } from '../../packages/game-engine/player/PlayerAttributes.ts';
import type { BallPathPoint, MatchState, Player, Vec2, Vec3 } from '../types/game.ts';
import { GOAL, HALF_L, HALF_W, PITCH } from './constants.ts';

let ready = false;
/** Load the physics engine (Rapier WASM). Call once at start-up. */
export function preparePhysics(): Promise<void> {
  return initPhysics().then(() => { ready = true; });
}
export const physicsReady = (): boolean => ready;

/** Callbacks into the match rules. */
export interface BridgeHooks {
  /** A player gained control of the ball (first touch, interception, loose ball). */
  acquired(p: Player, prev: Player | null): void;
  /** The dribbler lost the ball (it escaped his control). */
  lost(p: Player): void;
  touch(p: Player): void;
  /** The ball struck a player's body. */
  deflect(p: Player): void;
  woodwork(what: 'post' | 'bar'): void;
  /** Engine tackle outcome. */
  tackle(p: Player, won: boolean, fouled: boolean): void;
}

// ---------- coordinates: match (x along the pitch, z across) → engine (z along, x across)
const toE = (v: Vec2): { x: number; z: number } => ({ x: -v.z, z: v.x });
const toM = (v: { x: number; z: number }): Vec2 => ({ x: v.z, z: -v.x });
const toE3 = (v: Vec3): Vec3 => ({ x: -v.z, y: v.y, z: v.x });
const toM3 = (v: Vec3): Vec3 => ({ x: v.z, y: v.y, z: -v.x });
/** Facing vector (match) → engine yaw, and back. */
const yawOf = (face: Vec2): number => { const e = toE(face); return Math.atan2(e.x, e.z); };
const faceOf = (yaw: number): Vec2 => toM({ x: Math.sin(yaw), z: Math.cos(yaw) });

/** Database attributes → engine attributes (missing ones from the overall). */
function engineAttributes(p: Player): PlayerAttributes {
  const a = p.attributes ?? {};
  const o = p.overall ?? 75;
  const g = (k: string, alt?: string): number => a[k] ?? (alt ? a[alt] : undefined) ?? o;
  const gk = p.role === 'GK';
  return {
    ...REFERENCE_ATTRIBUTES,
    overall: o, pace: g('pace'), acceleration: g('acceleration', 'pace'), sprintSpeed: g('sprintSpeed', 'pace'),
    agility: g('agility'), balance: g('balance', 'agility'), strength: g('strength'), stamina: g('stamina'),
    ballControl: g('ballControl', 'firstTouch'), dribbling: g('dribbling'), passing: g('passing', 'shortPassing'),
    shooting: g('shooting', 'shotPower'), finishing: g('finishing'), defensiveAwareness: g('defensiveAwareness', 'marking'),
    tackling: g('tackling'), interceptions: g('interceptions'), jumping: g('jumping'), heading: g('heading'),
    ...(gk ? { pace: Math.min(g('pace'), 65), sprintSpeed: Math.min(g('sprintSpeed', 'pace'), 65) } : {}),
  };
}

/** Engine kick kind for a match shot type. */
export function shotKind(type: string): KickKind {
  switch (type) {
    case 'power': return 'powerShot';
    case 'finesse': return 'finesseShot';
    case 'low': return 'lowDrivenShot';
    case 'chip': return 'chipShot';
    default: return 'shot';
  }
}

interface KickRequestArgs { command: KickCommand; kind: KickKind; vel: Vec3; commit: () => void }

/**
 * Local avoidance: a player heading into a teammate swerves round him
 * (footballers see each other), keeping his speed. Opponents are not
 * avoided: those contacts are part of the game. Gentler for a human's player.
 */
function avoidTeammates(state: MatchState, p: Player, mx: number, mz: number): { x: number; z: number } {
  const mag = Math.hypot(mx, mz);
  if (mag < 0.05) return { x: mx, z: mz };
  const dx0 = mx / mag, dz0 = mz / mag;
  let ax = 0, az = 0;
  for (const o of state.players) {
    if (o === p || o.team !== p.team || !o.onPitch || o.sentOff) continue;
    const ox = o.pos.x - p.pos.x, oz = o.pos.z - p.pos.z;
    const d = Math.hypot(ox, oz);
    if (d > AVOID_RADIUS || d < 1e-3) continue;
    const ahead = (ox * dx0 + oz * dz0) / d;
    if (ahead < 0.2) continue; // only someone in front of him
    // Step to the side he is already more on.
    const side = dx0 * oz - dz0 * ox >= 0 ? 1 : -1;
    const w = ((AVOID_RADIUS - d) / AVOID_RADIUS) * ahead;
    ax += -dz0 * side * w * -1 - (ox / d) * w * 0.5;
    az += dx0 * side * w * -1 - (oz / d) * w * 0.5;
  }
  if (ax === 0 && az === 0) return { x: mx, z: mz };
  const k = p.human ? 0.5 : 1.1;
  const nx = dx0 + ax * k, nz = dz0 + az * k;
  const nl = Math.hypot(nx, nz) || 1;
  return { x: (nx / nl) * mag, z: (nz / nl) * mag };
}
const AVOID_RADIUS = 1.8;

export class MatchPhysics {
  readonly sim: Simulation;
  private readonly ctrl = new Map<Player, PlayerController>();
  private readonly byId = new Map<string, Player>();
  private readonly written = new Map<Player, Vec2>();
  private ballWritten: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly releases = new Map<string, () => void>();
  private lastOwner: Player | null = null;
  /** Players whose tackles are pending an outcome. */
  private readonly tackling = new Set<Player>();
  /** A throw from the hands is on its way this step: don't re-hold the ball. */
  private readonly throwing = new Set<Player>();
  /**
   * Human kicks still waiting for the ball to leave the foot. If the swing
   * misses or the run-up expires while he keeps the ball, the press is
   * retried (twice at most) instead of being lost.
   */
  private readonly humanKicks = new Map<Player, { req: KickRequestArgs; tries: number; retry: boolean }>();

  constructor(state: MatchState) {
    this.sim = new Simulation(createCalibration({
      pitch: { length: PITCH.length, width: PITCH.width, goalWidth: GOAL.width, goalHeight: GOAL.height, goalDepth: GOAL.depth },
    }));
    this.syncRoster(state);
    this.pushBall(state, true);
  }

  controllerOf(p: Player): PlayerController | undefined { return this.ctrl.get(p); }

  // ================================================================ sync in
  /** Engine bodies for exactly the players on the pitch. */
  private syncRoster(state: MatchState): void {
    for (const p of state.players) {
      const active = p.onPitch && !p.sentOff;
      const c = this.ctrl.get(p);
      if (active && !c) {
        const id = `p${p.id}`;
        const e = toE(p.pos);
        const nc = this.sim.addPlayer({
          id, name: p.name, number: p.number, attributes: engineAttributes(p),
          heightM: (p.identity?.heightCm ?? 180) / 100, massKg: p.identity?.weightKg ?? 75,
          preferredFoot: p.identity?.foot === 'Left' ? 'L' : 'R', start: e, yaw: yawOf(p.face), seed: 1000 + p.id, team: p.team,
        });
        this.ctrl.set(p, nc);
        this.byId.set(id, p);
        this.written.set(p, { x: p.pos.x, z: p.pos.z });
      } else if (!active && c) {
        this.sim.removePlayer(c.id);
        this.ctrl.delete(p);
        this.byId.delete(c.id);
        this.written.delete(p);
        p.pose = null;
      }
    }
  }

  /** Rules moved a player (kick-off, restart, send-off): move his body too. */
  private pushTeleports(): void {
    for (const [p, c] of this.ctrl) {
      const w = this.written.get(p);
      if (!w || Math.abs(w.x - p.pos.x) > 0.01 || Math.abs(w.z - p.pos.z) > 0.01) {
        c.teleport(toE(p.pos), yawOf(p.face));
        this.written.set(p, { x: p.pos.x, z: p.pos.z });
      }
    }
  }

  /** Is the ball held by the rules this step (set piece not taken, keeper's hands, stoppage)? */
  private heldBy(state: MatchState, live: boolean): Player | null {
    const o = state.ball.owner;
    if (!o) return null;
    const c = this.ctrl.get(o);
    if (c?.kicking || this.throwing.has(o)) return null; // the taker is striking/throwing it: it's a free ball now
    const penaltyTaker = state.penalty?.active && state.penalty.shooter === o;
    return o.mustPass || o.holding || penaltyTaker || !live ? o : null;
  }

  private pushBall(state: MatchState, force: boolean, live = true): void {
    const b = state.ball;
    const held = this.heldBy(state, live);
    const c = held ? this.ctrl.get(held) : undefined;
    if (held && c) {
      this.sim.holdBall(c, toE3(b.pos), toE3({ x: held.vel.x, y: 0, z: held.vel.z }));
    } else {
      const w = this.ballWritten;
      if (force || Math.abs(w.x - b.pos.x) > 0.02 || Math.abs(w.y - b.pos.y) > 0.02 || Math.abs(w.z - b.pos.z) > 0.02) {
        // Rules placed the ball (restart spot, kick-off): put the real ball there.
        this.sim.placeBall(toE3(b.pos), toE3(b.vel));
        // A restart or kick-off: nobody is still swinging at the old ball.
        for (const c2 of this.ctrl.values()) c2.cancelKick();
        this.releases.clear();
        const oc = b.owner ? this.ctrl.get(b.owner) : undefined;
        if (oc) this.sim.interaction.holdBy(oc.id, this.sim.time);
      }
    }
    this.ballWritten = { ...b.pos };
  }

  // =============================================================== step
  /** One fixed step of engine physics for the match. `live` = open play. */
  step(state: MatchState, dt: number, hooks: BridgeHooks, live: boolean): void {
    this.syncRoster(state);
    this.pushTeleports();
    this.pushBall(state, false, live);
    const b = state.ball;
    for (const [p, c] of this.ctrl) {
      const input = emptyInput();
      // Restart takers stay planted until the kick, but a keeper carrying the
      // ball is allowed to move and choose his distribution. Treating every
      // mustPass holder as frozen made hand possessions feel like a hard lock.
      const frozen = (!live && state.phase !== 'goal')
        || (p.mustPass && !p.holding && b.owner === p && !c.kicking);
      if (frozen) {
        c.yaw = yawOf(p.face);
      } else {
        const it = p.intent;
        input.move = toE(avoidTeammates(state, p, it.mx, it.mz));
        input.assisted = !!p.assistOnly;
        input.sprint = !!it.sprint && p.stamina > 0.05 && !p.injured;
        let scale = 1;
        if (p.injured) scale *= 0.78;
        if (p.stun > 0) scale *= 0.35;
        if (p.stagger > 0) scale *= 0.6;
        if (!p.human) scale *= state.teams[p.team].diff.speed;
        if (p.dive > 0) scale *= 1.5;
        input.speedScale = scale;
      }
      // Match cooldowns: just kicked, stunned or beaten keeper can't play the ball.
      input.noBall = b.owner !== p && (p.kickCd > 0 || p.stun > 0);
      c.input = input;
    }
    this.retryHumanKicks(state);
    // Who the pass is for (match rules): he gets priority to receive it.
    const ic = b.intended ? this.ctrl.get(b.intended) : undefined;
    this.sim.interaction.intendedFor = ic ? ic.id : null;
    this.sim.pw.events.drain();
    this.sim.step(dt);
    this.pull(state, live);
    this.dispatch(state, hooks);
  }

  // =============================================================== sync out
  private pull(state: MatchState, live: boolean): void {
    for (const [p, c] of this.ctrl) {
      const m = toM(c.pos);
      // Keep players on (or just off) the field, like the match always has.
      const cx = Math.max(-HALF_L - 3, Math.min(HALF_L + 3, m.x)), cz = Math.max(-HALF_W - 2.5, Math.min(HALF_W + 2.5, m.z));
      if (cx !== m.x || cz !== m.z) { c.teleport(toE({ x: cx, z: cz }), c.yaw); }
      p.pos.x = cx; p.pos.z = cz;
      const v = toM(c.vel);
      p.vel.x = v.x; p.vel.z = v.z;
      const a = toM(c.accel);
      p.acc = { x: a.x, z: a.z };
      const f = faceOf(c.yaw);
      p.face.x = f.x; p.face.z = f.z;
      p.stamina = c.stamina;
      p.posePrev = p.pose ?? c.pose;
      p.pose = c.pose;
      this.written.set(p, { x: p.pos.x, z: p.pos.z });
    }
    const b = state.ball;
    if (!this.heldBy(state, live)) {
      const e = this.sim.ball.curr;
      const pos = toM3(e.position), vel = toM3(e.velocity), w = e.angularVelocity;
      b.pos.x = pos.x; b.pos.y = pos.y; b.pos.z = pos.z;
      b.vel.x = vel.x; b.vel.y = vel.y; b.vel.z = vel.z;
      b.spin = { x: w.z, y: w.y, z: -w.x };
    }
    this.ballWritten = { ...b.pos };
  }

  private dispatch(state: MatchState, hooks: BridgeHooks): void {
    const b = state.ball;
    for (const e of this.sim.pw.events.drain()) {
      const p = 'playerId' in e && e.playerId ? this.byId.get(e.playerId) ?? null : null;
      switch (e.type) {
        case 'BallRelease': {
          if (p) this.humanKicks.delete(p);
          const commit = this.releases.get(e.playerId);
          this.releases.delete(e.playerId);
          if (commit) commit();
          this.lastOwner = null;
          break;
        }
        case 'PassCommand': case 'ShotCommand':
          if (e.phase === 'rejected' || e.phase === 'expired') this.releases.delete(e.playerId);
          if (e.phase === 'expired' && p) this.markRetry(p);
          break;
        case 'BallContact':
          if (!e.hit && p) this.markRetry(p);
          break;
        case 'BallPossession': {
          const owner = e.owner ? this.byId.get(e.owner) ?? null : null;
          if (owner && owner !== this.lastOwner) {
            const prev = this.lastOwner;
            this.lastOwner = owner;
            if (b.owner !== owner) { b.owner = owner; hooks.acquired(owner, prev); }
          } else if (!owner && e.state === 'PossessionLost' && this.lastOwner) {
            const lostBy = this.lastOwner;
            this.lastOwner = null;
            if (b.owner === lostBy) { b.owner = null; hooks.lost(lostBy); }
          } else if (!owner) {
            this.lastOwner = null;
          }
          break;
        }
        case 'DribbleTouch': if (p) hooks.touch(p); break;
        case 'SurfaceContact':
          if (e.surface === 'post') hooks.woodwork('post');
          else if (e.surface === 'crossbar') hooks.woodwork('bar');
          else if (e.surface === 'player' && p && p !== b.owner) hooks.deflect(p);
          break;
        case 'TackleContact':
          if (p) { this.tackling.delete(p); hooks.tackle(p, e.won, e.fouled); }
          break;
        default: break;
      }
    }
    // Keep the match's owner in step with the engine.
    const io = this.sim.interaction.owner;
    const engOwner = io ? this.byId.get(io) ?? null : null;
    if (!engOwner && b.owner && !b.owner.mustPass && !b.owner.holding && !this.ctrl.get(b.owner)?.kicking) {
      // The engine says nobody has it (e.g. released): trust the physics.
      if (this.sim.interaction.state === 'BallReleased' || this.sim.interaction.state === 'FreeBall') b.owner = null;
    }
  }

  // ============================================================ commands
  /**
   * Strike the ball for a match pass/shot: `vel` is the planned exit velocity
   * (match coordinates). `commit` runs the match bookkeeping when the engine
   * actually releases the ball at the contact frame.
   */
  kick(p: Player, command: KickCommand, kind: KickKind, vel: Vec3, commit: () => void): boolean {
    const c = this.ctrl.get(p);
    if (!c) return false;
    const r = this.commandKick(p, c, command, kind, toE3(vel));
    if (r === 'rejected') return false;
    this.releases.set(c.id, commit);
    if (p.human) this.humanKicks.set(p, { req: { command, kind, vel, commit }, tries: 0, retry: false });
    return true;
  }

  /**
   * Start an engine kick. A human's pass or shot cuts a stumble short (he
   * keeps his feet and plays it), so a bump doesn't swallow the button press;
   * a real fall still has to finish.
   */
  private commandKick(p: Player, c: PlayerController, command: KickCommand, kind: KickKind, ve: Vec3) {
    const h = Math.hypot(ve.x, ve.z) || 1;
    const req = { command, kind, power: 0.6, aim: { x: ve.x / h, z: ve.z / h }, velocity: ve };
    let r = c.commandKick(req, this.sim.time);
    if (r === 'rejected' && p.human && c.sm.action?.clip.name === 'stumble') {
      c.sm.action = null;
      r = c.commandKick(req, this.sim.time);
    }
    return r;
  }

  private markRetry(p: Player): void {
    const k = this.humanKicks.get(p);
    if (k) k.retry = true;
  }

  /** Re-issue a human kick that missed or expired, while he still has the ball. */
  private retryHumanKicks(state: MatchState): void {
    for (const [p, k] of this.humanKicks) {
      const c = this.ctrl.get(p);
      if (!c || state.ball.owner !== p || !p.human || k.tries >= 2) { this.humanKicks.delete(p); continue; }
      if (!k.retry || c.kicking) continue;
      if (c.sm.busy && c.sm.action?.clip.name !== 'stumble') continue; // down after a fall: wait
      const { command, kind, vel, commit } = k.req;
      const r = this.commandKick(p, c, command, kind, toE3(vel));
      if (r === 'rejected') continue; // not possible yet: try again next step
      k.retry = false;
      k.tries++;
      this.releases.set(c.id, commit);
    }
  }

  /** Hands: throw-in, keeper throw/drop-kick, keeper parry. Applied this step. */
  hands(p: Player, vel: Vec3, kind: 'throw-in' | 'keeper throw' | 'parry', commit?: () => void): void {
    const c = this.ctrl.get(p);
    if (!c) { commit?.(); return; }
    const ve = toE3(vel);
    const spin = kind === 'parry' ? { x: 0, y: 0, z: 0 } : spinFromComponents(ve, { top: -6 });
    this.throwing.add(p);
    this.sim.interaction.rulesImpulse(c.id, ve, spin, kind === 'parry' ? 'save' : 'throw', kind, c.preferredFoot, this.sim.time, () => {
      this.throwing.delete(p);
      commit?.();
    });
  }

  /** A tackle towards a victim (or the loose ball). Outcome comes back through hooks.tackle. */
  tackle(p: Player, target: Vec2): boolean {
    const c = this.ctrl.get(p);
    if (!c) return false;
    const d = toE({ x: target.x - p.pos.x, z: target.z - p.pos.z });
    const ok = c.commandTackle('standing', Math.atan2(d.x, d.z));
    if (ok) this.tackling.add(p);
    return ok;
  }

  /** A kick for this player is under way (swing or running onto the ball). */
  isKicking(p: Player): boolean { return !!this.ctrl.get(p)?.kicking; }
  cancelKick(p: Player): void {
    const c = this.ctrl.get(p);
    if (!c) return;
    c.cancelKick();
    this.releases.delete(c.id);
    this.humanKicks.delete(p);
  }

  // ============================================================ planning
  /**
   * Speed for a ground pass to reach `aim` from `from` with the engine's real
   * rolling ball (it rolls much further than the old model), arriving firm.
   */
  groundPassSpeed(from: Vec2, aim: Vec2, arrive = 3.2): number {
    const d = Math.hypot(aim.x - from.x, aim.z - from.z);
    const a = this.sim.cal.ball.rollingResistance * this.sim.cal.world.gravity;
    return Math.sqrt(2 * a * d + arrive * arrive);
  }

  /** Rolling arrival time under this engine's actual constant grass drag. */
  groundPassTime(distance: number, kind: 'ground' | 'through', driven = false): number {
    const d = Math.max(0, distance);
    const arrive = kind === 'through'
      ? Math.max(2.8, Math.min(6.2, 3.1 + d * 0.075))
      : driven ? Math.max(7.5, Math.min(12, 7 + d * 0.12))
        : Math.max(3.2, Math.min(8, 4 + d * 0.1));
    const a = this.sim.cal.ball.rollingResistance * this.sim.cal.world.gravity;
    const start = Math.sqrt(2 * a * d + arrive * arrive);
    return a > 0 ? (start - arrive) / a : d / Math.max(arrive, 0.1);
  }

  /** Match-coordinate trajectory from the same model Rapier advances. */
  ballPath(pos: Vec3, vel: Vec3, spin: Vec3, horizon = 3): BallPathPoint[] {
    return predictTrajectory(toE3(pos), toE3(vel), toE3(spin), this.sim.cal.ball, this.sim.cal.world.gravity, horizon, 1 / 60)
      .map((point) => {
        const p = toM3(point.p);
        return { t: point.t, x: p.x, y: p.y, z: p.z };
      });
  }

  /** Speed at a launch angle so the engine ball (drag + spin) lands at `aim`. */
  loftedSpeed(from: Vec3, aim: Vec2, elevDeg: number, top: number): number {
    const d = Math.hypot(aim.x - from.x, aim.z - from.z);
    const e = (elevDeg * Math.PI) / 180;
    const dirM = { x: (aim.x - from.x) / (d || 1), z: (aim.z - from.z) / (d || 1) };
    let lo = 4, hi = 40;
    for (let i = 0; i < 16; i++) {
      const s = (lo + hi) / 2;
      const v = toE3({ x: dirM.x * s * Math.cos(e), y: s * Math.sin(e), z: dirM.z * s * Math.cos(e) });
      const path = predictTrajectory(toE3(from), v, spinFromComponents(v, { top }), this.sim.cal.ball, this.sim.cal.world.gravity, 4, 1 / 60);
      let land = Infinity;
      for (let k = 1; k < path.length; k++) if (path[k].v.y < 0 && path[k].p.y <= this.sim.cal.ball.radius + 0.05) { const q = toM(path[k].p); land = Math.hypot(q.x - from.x, q.z - from.z); break; }
      if (land < d) lo = s; else hi = s;
    }
    return (lo + hi) / 2;
  }

  dispose(): void { this.sim.dispose(); }
}

declare module '../types/game.ts' {
  interface MatchState {
    /** Set when the Gold Standard engine runs this match's physics. */
    engine?: MatchPhysics | null;
  }
  interface Player {
    /** Engine pose for this fixed step (rendering), when the engine runs the match. */
    pose?: PoseData | null;
    /** Pose of the previous fixed step (render interpolation). */
    posePrev?: PoseData | null;
  }
}
