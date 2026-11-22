// The single authority over player–ball interaction (one per Simulation).
//
// Responsibilities: possession (typed state machine), kick commands (pass /
// shot: request → accept / buffer / reject), kick positioning during the
// wind-up, foot contact at the animation contact frame, the power model,
// dribbling (predictive, directional, alternating-foot touches), stopping,
// receiving / intercepting / blocking, skill touches and tackles.
//
// The ball stays a free rigid body. Nothing here sets its position. Every
// change to its velocity is an impulse QUEUED here and applied once per
// fixed step by flush(), highest priority first, so two systems can never
// write conflicting velocities in the same step.
import type { BallController } from '../ball/BallController.ts';
import { rollingSpin, spinFromComponents } from '../ball/BallSpin.ts';
import { ACTION_CLIPS } from '../animation/ActionClips.ts';
import { applyPartial, emptyPose, mirrorPartial, sampleKeys } from '../animation/AnimationBlending.ts';
import type { PhysicsCalibration } from '../physics/PhysicsConfig.ts';
import type { ImpulseSource, PhysicsEvents, PossessionState, TouchKind, TouchSurface } from '../physics/PhysicsEvents.ts';
import { clamp, dirOf, headingOf, len3, type Vec2, type Vec3 } from '../physics/Vec3.ts';
import { footWorld, headWorld, rigDims, type RigDims } from './PlayerRig.ts';
import type { ActionKind, Foot, KickKind, PlayerTuning, PoseData } from './PlayerTypes.ts';

/** What the interaction system needs to know about a player (implemented by PlayerController). */
export interface InteractionActor {
  readonly id: string;
  readonly tuning: PlayerTuning;
  readonly dims: RigDims;
  readonly preferredFoot: Foot;
  pos: Vec2;
  vel: Vec2;
  yaw: number;
  pose: PoseData;
  balance: number;
  rng(): number;
  /** Where the player will be after T seconds under the current input. */
  predict(T: number): { pos: Vec2; dir: Vec2; speed: number };
  /** Current stick direction (world, magnitude 0..1) and the speed it asks for. */
  stick(): Vec2;
  intendedSpeed(): number;
}

export type KickCommand = 'pass' | 'through' | 'lob' | 'shot';

export interface KickRequest {
  command: KickCommand;
  kind: KickKind;
  /** 0.25 (tap) … 1 (full hold). */
  power: number;
  aim: Vec2;
  /**
   * Planned exit velocity (world, m/s) from a match planner (receiver lead,
   * aim at goal). The strike still happens at the contact frame and scales
   * with contact quality; only its target changes.
   */
  velocity?: Vec3;
}

export interface KickPlan extends KickRequest {
  foot: Foot;
  /** Ball centre relative to the body at the contact frame (body frame, reference 1.80 m body). */
  contactLeft: number;
  contactFwd: number;
  /** First-time: the ball was moving at the player when the kick started. */
  firstTime: boolean;
}

export type KickDecision =
  | { result: 'accepted'; plan: KickPlan }
  | { result: 'buffered' }
  | { result: 'rejected'; reason: string };

interface QueuedImpulse {
  playerId: string;
  priority: number;
  vel: Vec3;
  spin: Vec3;
  touchKind: 'kick' | 'touch';
  source: ImpulseSource;
  kind: string;
  foot: Foot;
  quality: number;
  footSpeed: number;
  after?: () => void;
}

/** Ball position in the player's body frame. */
export function ballLocal(a: { pos: Vec2; yaw: number }, ball: Vec3): { fwd: number; left: number; up: number; dist: number } {
  const dx = ball.x - a.pos.x, dz = ball.z - a.pos.z;
  const f = dirOf(a.yaw);
  // Left of facing (+z) is +x, i.e. left = (f.z, −f.x).
  return { fwd: dx * f.x + dz * f.z, left: dx * f.z - dz * f.x, up: ball.y, dist: Math.hypot(dx, dz) };
}

const D2R = Math.PI / 180;
const rot = (v: Vec2, ang: number): Vec2 => ({ x: v.x * Math.cos(ang) + v.z * Math.sin(ang), z: -v.x * Math.sin(ang) + v.z * Math.cos(ang) });
const norm2 = (v: Vec2): Vec2 => { const l = Math.hypot(v.x, v.z); return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 }; };
const gauss = (a: { rng(): number }): number => (a.rng() + a.rng() + a.rng() - 1.5) / 0.5;

/** Hold time (s) → power 0.25 … 1 (tap ≈ 25%, 0.3 s ≈ 50%, 0.6 s ≈ 75%, 0.9 s = 100%). */
export const powerFromHold = (seconds: number): number => clamp(0.25 + seconds / 1.2, 0.25, 1);

/** Effective foot mass for the kick collision (kg) and foot–ball restitution. */
const FOOT_MASS = 1.2, FOOT_E = 0.5;

/** Seconds a first-time swing may start early relative to the ball's arrival. */
export const FIRST_TIME_SLACK = 0.04;

const PASS_KINDS: ReadonlySet<KickKind> = new Set<KickKind>(['shortPass', 'firstTimePass', 'drivenPass', 'throughBall', 'lobPass', 'longPass', 'cross']);
const REF_DIMS = rigDims(1.8);

export class PlayerBallInteraction {
  owner: string | null = null;
  state: PossessionState = 'FreeBall';
  stateSince = 0;
  private releasedBy: string | null = null;
  private releasedAt = -9;
  private lastTouchAt = -9;
  /** Foot used for the last touch (shown in the debug panel; drives alternation). */
  lastTouchFoot: Foot | null = null;
  private lostSince = -1;
  /** Most recent applied impulse and contact, for the debug panel. */
  lastImpulse: { playerId: string; source: ImpulseSource; kind: string; speed: number; impulse: number; time: number } | null = null;
  lastContact: { playerId: string; action: string; hit: boolean; gap: number; quality: number; time: number } | null = null;
  /** Impulses dropped because a higher-priority one won the same step. */
  conflicts = 0;
  /** Player a pass is meant for (match rules): wins ties, others reach less far. */
  intendedFor: string | null = null;
  private queue: QueuedImpulse[] = [];
  private contactCache = new Map<string, { left: number; fwd: number }>();

  constructor(private readonly events: PhysicsEvents, readonly ball: BallController, private readonly cal: PhysicsCalibration) {}

  // =========================================================== possession
  has(id: string): boolean { return this.owner === id; }

  setState(state: PossessionState, owner: string | null, reason: string, time: number): void {
    if (state === this.state && owner === this.owner) return;
    const prev = this.state;
    this.state = state;
    this.owner = owner;
    this.stateSince = time;
    this.events.emit({ type: 'BallPossession', owner, state, prev, reason, time });
  }

  /** Development tools: give a player the ball (e.g. "ball to feet"). */
  grant(id: string, time: number): void {
    this.queue = [];
    this.lastTouchAt = time;
    this.setState('PossessionAcquired', id, 'ball placed at feet', time);
  }
  /** Development tools: the ball was reset (tests); nobody owns it. */
  reset(time: number): void {
    this.queue = [];
    this.releasedBy = null;
    this.setState('FreeBall', null, 'ball reset', time);
  }

  /** After the physics step: lose possession if the ball has escaped. */
  postStep(actors: ReadonlyArray<InteractionActor>, time: number): void {
    if (this.state === 'BallReleased' && time - this.releasedAt > 0.6) this.setState('FreeBall', null, 'released ball is loose', time);
    if (this.state === 'PossessionLost' && time - this.stateSince > 0.3) this.setState('FreeBall', null, 'loose ball', time);
    if (!this.owner || this.state === 'Passing' || this.state === 'Shooting') { this.lostSince = -1; return; }
    const a = actors.find((p) => p.id === this.owner);
    if (!a) { this.setState('FreeBall', null, 'owner left', time); return; }
    const L = ballLocal(a, this.ball.curr.position);
    const limit = 2.4 + 0.35 * Math.hypot(a.vel.x, a.vel.z);
    if (L.dist > limit || this.ball.curr.position.y > 2.2) {
      if (this.lostSince < 0) this.lostSince = time;
      if (time - this.lostSince > 0.25) this.setState('PossessionLost', null, `ball ${L.dist.toFixed(1)} m away`, time);
    } else this.lostSince = -1;
  }

  // ============================================================ impulses
  private enqueue(q: QueuedImpulse): void { this.queue.push(q); }

  /** Apply this step's winning impulse. Called once per fixed step, before Rapier. */
  flush(time: number): void {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => b.priority - a.priority);
    const q = this.queue[0];
    this.conflicts += this.queue.length - 1;
    this.queue = [];
    const before = this.ball.curr.velocity;
    this.ball.kick(q.vel, q.spin, q.playerId, q.touchKind);
    const speed = len3(q.vel);
    const impulse = Math.hypot(q.vel.x - before.x, q.vel.y - before.y, q.vel.z - before.z) * this.cal.ball.mass;
    this.lastImpulse = { playerId: q.playerId, source: q.source, kind: q.kind, speed, impulse, time };
    this.events.emit({ type: 'BallImpulse', playerId: q.playerId, source: q.source, kind: q.kind, foot: q.foot, speed, impulse, footSpeed: q.footSpeed, quality: q.quality, time });
    q.after?.();
  }

  // ======================================================= kick commands
  /**
   * Can the player kick now? Accepted when he has the ball (or a free ball
   * is at his feet, or one is arriving for a first-time kick); buffered while
   * he runs onto a nearby ball; rejected otherwise.
   */
  requestKick(a: InteractionActor, req: KickRequest, busy: boolean, time: number, quiet = false): KickDecision {
    const shotLike = req.command === 'shot';
    const emit = (phase: 'requested' | 'accepted' | 'buffered' | 'rejected', kind: string, reason?: string) => {
      if (quiet && phase !== 'accepted') return;
      if (shotLike) this.events.emit({ type: 'ShotCommand', playerId: a.id, phase, kind, power: req.power, reason, time });
      else this.events.emit({ type: 'PassCommand', playerId: a.id, phase, kind, power: req.power, reason, time });
    };
    emit('requested', req.kind);
    if (busy) { emit('rejected', req.kind, 'player busy (action in progress)'); return { result: 'rejected', reason: 'busy' }; }
    const b = this.ball.curr;
    const L = ballLocal(a, b.position);
    const rel = { x: b.velocity.x - a.vel.x, z: b.velocity.z - a.vel.z };
    const relSpeed = Math.hypot(rel.x, rel.z);
    const approaching = L.dist > 0.3 ? -(rel.x * (b.position.x - a.pos.x) + rel.z * (b.position.z - a.pos.z)) / L.dist : 0;
    const mine = this.owner === a.id;
    const loose = this.owner === null && !(this.state === 'BallReleased' && this.releasedBy === a.id && time - this.releasedAt < 0.45);
    const arrive = approaching > 1 ? L.dist / approaching : Infinity;
    let kind = req.kind;
    let firstTime = false, ok = false;
    if ((mine && L.dist < 2.2 + 0.25 * Math.hypot(a.vel.x, a.vel.z)) || (loose && L.dist < 1.7 && relSpeed < 4)) ok = true;
    else if (loose && arrive < 0.9 && L.dist < 9) {
      // First time: start the swing so its contact frame meets the ball's
      // arrival. Until then the request stays buffered (the press is kept).
      const hy = b.position.y;
      let k2: KickKind = req.kind;
      if (hy > 1.4) k2 = 'header';
      else if (hy > 0.55 && shotLike) k2 = 'volley';
      else if (shotLike && b.velocity.y > 1.2) k2 = 'halfVolley';
      if (k2 === 'shortPass') k2 = 'firstTimePass';
      const clip = ACTION_CLIPS[k2];
      const tc = (clip.markers.find((m) => m.kind === 'contact')?.t ?? 0.55) * clip.duration;
      // The receiver checks his run as he swings, so time it on the ball's own speed.
      const ballIn = L.dist > 0.3 ? -(b.velocity.x * (b.position.x - a.pos.x) + b.velocity.z * (b.position.z - a.pos.z)) / L.dist : 0;
      const toContact = Math.max(0, L.dist - 0.6) / Math.max(1, ballIn, approaching * 0.6);
      if (toContact <= tc + FIRST_TIME_SLACK) { ok = true; firstTime = true; }
      else { emit('buffered', kind, `first time: ball ${toContact.toFixed(2)} s away`); return { result: 'buffered' }; }
    }
    if (!ok) {
      if (L.dist < 9 && (mine || loose)) { emit('buffered', kind, `ball ${L.dist.toFixed(1)} m away: running onto it`); return { result: 'buffered' }; }
      emit('rejected', kind, mine || loose ? 'ball too far away' : 'another player has the ball');
      return { result: 'rejected', reason: 'no ball' };
    }
    if (!firstTime) {
      // Can the wind-up bring the foot to the ball? If not, line up first.
      const clip = ACTION_CLIPS[kind];
      const tc = (clip.markers.find((m) => m.kind === 'contact')?.t ?? 0.55) * clip.duration;
      const sp = this.setupPoint(a, req.aim, kind, a.preferredFoot, tc);
      const miss = Math.hypot(sp.x - (a.pos.x + a.vel.x * tc), sp.z - (a.pos.z + a.vel.z * tc));
      if (miss > 1.1) {
        emit('buffered', kind, `lining up (${miss.toFixed(2)} m off)`);
        return { result: 'buffered' };
      }
    }
    const high = b.position.y;
    if (high > 1.4) kind = 'header';
    else if (high > 0.55 && shotLike) kind = 'volley';
    else if (shotLike && b.velocity.y > 1.2) kind = 'halfVolley';
    if (firstTime && kind === 'shortPass') kind = 'firstTimePass';
    // Foot: the preferred one unless the ball sits clearly on the other side of the aim line.
    const aimLeft = (b.position.x - a.pos.x) * req.aim.z - (b.position.z - a.pos.z) * req.aim.x;
    const foot: Foot = kind === 'header' ? a.preferredFoot : aimLeft > 0.18 ? 'L' : aimLeft < -0.18 ? 'R' : a.preferredFoot;
    const c = this.contactOffset(kind, foot);
    const plan: KickPlan = { ...req, kind, foot, contactLeft: c.left, contactFwd: c.fwd, firstTime };
    emit('accepted', kind);
    this.setState(shotLike ? 'Shooting' : 'Passing', a.id, `${kind} accepted`, time);
    return { result: 'accepted', plan };
  }

  /** Where the ball centre must be (body frame) at the clip's contact frame. */
  private contactOffset(kind: KickKind, foot: Foot): { left: number; fwd: number } {
    const key = `${kind}|${foot}`;
    const hit = this.contactCache.get(key);
    if (hit) return hit;
    const clip = ACTION_CLIPS[kind];
    const t = clip.markers.find((m) => m.kind === 'contact')?.t ?? 0.55;
    const pose = emptyPose();
    let keys = sampleKeys(clip.keys, t);
    if (foot === 'L') keys = mirrorPartial(keys);
    applyPartial(pose, keys, 1);
    const f = kind === 'header' ? headWorld(pose, { x: 0, y: 0, z: 0 }, 0, REF_DIMS) : footWorld(pose, foot, { x: 0, y: 0, z: 0 }, 0, REF_DIMS);
    // Instep contact: the ball centre sits a little ahead of the striking surface.
    const out = { left: f.x, fwd: f.z + (kind === 'header' ? 0.05 : 0.09) };
    this.contactCache.set(key, out);
    return out;
  }

  /** Body position that puts the ball at the striking foot at the contact frame (t s from now). */
  setupPoint(a: InteractionActor, aim: Vec2, kind: KickKind, foot: Foot, t: number): Vec2 {
    const c = this.contactOffset(kind, foot);
    const b = this.ball.curr;
    const bp = { x: b.position.x + b.velocity.x * t, z: b.position.z + b.velocity.z * t };
    const f = norm2(aim);
    const s = a.tuning.heightM / 1.8;
    return { x: bp.x - f.x * c.fwd * s - f.z * c.left * s, z: bp.z - f.z * c.fwd * s + f.x * c.left * s };
  }

  /**
   * During the wind-up: where the player should move so that, at the
   * contact frame, the ball is at the striking foot (the player adjusts his
   * approach; the ball is never moved). Returns this step's velocity and the
   * yaw to turn to.
   */
  kickSetup(a: InteractionActor, plan: KickPlan, timeToContact: number): { vel: Vec2; yaw: number } {
    const b = this.ball.curr;
    const t = Math.max(0, timeToContact);
    const bp = { x: b.position.x + b.velocity.x * t, z: b.position.z + b.velocity.z * t };
    const yaw = headingOf(plan.aim.x, plan.aim.z);
    const f = dirOf(yaw);
    const s = a.tuning.heightM / 1.8;
    // Body position that puts the ball at (contactLeft, contactFwd) when facing the aim.
    const want = {
      x: bp.x - f.x * plan.contactFwd * s - f.z * plan.contactLeft * s,
      z: bp.z - f.z * plan.contactFwd * s + f.x * plan.contactLeft * s,
    };
    const dx = want.x - a.pos.x, dz = want.z - a.pos.z;
    const k = 1 / Math.max(t, 0.1);
    let vx = dx * k, vz = dz * k;
    const cap = Math.max(4.5, Math.hypot(a.vel.x, a.vel.z) + 2.5);
    const m = Math.hypot(vx, vz);
    if (m > cap) { vx *= cap / m; vz *= cap / m; }
    return { vel: { x: vx, z: vz }, yaw };
  }

  /**
   * The contact frame: if the striking foot (forward kinematics of the
   * current pose) reaches the ball, compute and queue the impulse.
   */
  resolveKick(a: InteractionActor, planIn: KickPlan, time: number): boolean {
    let plan = planIn;
    const b = this.ball.curr.position;
    const header = plan.kind === 'header';
    const pt = header ? headWorld(a.pose, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims) : footWorld(a.pose, plan.foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
    const gap = Math.hypot(b.x - pt.x, b.y - pt.y, b.z - pt.z) - this.cal.ball.radius;
    const reach = header ? 0.34 : 0.36;
    const shot = plan.command === 'shot';
    if (gap > reach) {
      this.lastContact = { playerId: a.id, action: plan.kind, hit: false, gap, quality: 0, time };
      this.events.emit({ type: 'BallContact', playerId: a.id, action: plan.kind, foot: plan.foot, hit: false, gap, quality: 0, time });
      // Missed: possession continues if the ball is still close, otherwise it is loose.
      const L = ballLocal(a, b);
      if (L.dist < 1.8) this.setState('ControlledDribbling', a.id, `${plan.kind} missed the ball`, time);
      else this.setState('PossessionLost', null, `${plan.kind} missed the ball`, time);
      return false;
    }
    const t = a.tuning;
    const facing = dirOf(a.yaw);
    const aimAngle = Math.acos(clamp(facing.x * plan.aim.x + facing.z * plan.aim.z, -1, 1));
    const ballV = this.ball.curr.velocity;
    const relBall = Math.hypot(ballV.x - a.vel.x, ballV.z - a.vel.z);
    // Contact quality: clean strike, body square to the aim, balance, foot, incoming ball.
    let q = 1 - clamp((gap - 0.03) / reach, 0, 1) * 0.5;
    q *= 1 - clamp((aimAngle - 35 * D2R) / (90 * D2R), 0, 0.4);
    q *= 0.75 + 0.25 * a.balance;
    q *= plan.foot === a.preferredFoot ? 1 : 0.88;
    q *= 1 - clamp((relBall - 8) / 30, 0, 0.25);
    q = clamp(q, 0.2, 1);
    const passing = PASS_KINDS.has(plan.kind);
    const skill = passing ? t.passSkill : header ? t.heading : (t.shotSkill + t.finishing) / 2;

    // Foot speed from the swing (input power × technique); the collision gives
    // the ball (1 + e)·M/(M + m) of it.
    const p = clamp(plan.power, 0.25, 1);
    let foot = 10, elev = 0, top = 0, side = 0;
    const g = this.cal.world.gravity;
    const transfer = ((1 + FOOT_E) * FOOT_MASS) / (FOOT_MASS + this.cal.ball.mass);
    const lobFoot = (dist: number, deg: number) => (Math.sqrt((g * dist) / Math.sin(2 * deg * D2R)) * 1.12) / transfer;
    switch (plan.kind) {
      case 'shortPass': case 'firstTimePass': foot = 4 + 13 * p; elev = 0.5; break;
      case 'drivenPass': foot = 7 + 14 * p; elev = 3; top = 14; break;
      case 'throughBall': foot = 6.5 + 12 * p; elev = p > 0.7 ? 2.5 : 0.5; break;
      case 'lobPass': foot = lobFoot(12 + 30 * p, 36); elev = 36; top = -12; break;
      case 'longPass': foot = lobFoot(25 + 35 * p, 28); elev = 28; top = -14; break;
      case 'cross': foot = lobFoot(18 + 25 * p, 22); elev = 22; top = -10; side = plan.foot === 'R' ? -32 : 32; break;
      case 'shot': foot = 9.5 + 18 * p; elev = 3 + 7 * p; top = 6; break;
      case 'powerShot': foot = 12.5 + 18 * p; elev = 5 + 8 * p; top = 9; break;
      case 'finesseShot': foot = 10 + 10 * p; elev = 6 + 5 * p; side = (plan.foot === 'R' ? -1 : 1) * (36 + 18 * t.shotSkill); top = 4; break;
      case 'placedShot': foot = 9 + 8 * p; elev = 2 + 3 * p; break;
      case 'lowDrivenShot': foot = 11 + 14 * p; elev = 1.5; top = 28; break;
      case 'chipShot': foot = 7.5 + 6 * p; elev = 48; top = -32; break;
      case 'volley': foot = 10 + 15 * p; elev = 2 + 6 * p; top = 6; break;
      case 'halfVolley': foot = 11 + 14 * p; elev = 3 + 6 * p; top = 12; break;
      case 'header': foot = (6 + 8 * p) * (0.7 + 0.3 * t.heading) + len3(ballV) * 0.3; elev = -6 + 10 * p; break;
    }
    const technique = (0.86 + 0.14 * skill) * (0.85 + 0.15 * a.balance);
    let exit = foot * transfer * technique * (0.78 + 0.22 * q);
    if (plan.velocity) {
      // A planned strike: the planner chose speed and direction; contact quality still matters.
      const v = plan.velocity;
      const h = Math.hypot(v.x, v.z);
      exit = len3(v) * (0.9 + 0.1 * q);
      elev = Math.atan2(v.y, h) / D2R;
      plan = { ...plan, aim: h > 1e-6 ? { x: v.x / h, z: v.z / h } : plan.aim };
    }
    // Direction: a small error from skill and contact quality (never the strength).
    const runSpeed = Math.hypot(a.vel.x, a.vel.z);
    const spread = plan.velocity ? (1 - q) * 3 * D2R : (0.6 + (1 - skill) * 4 + (1 - q) * 5 + (shot ? p * 1.2 + runSpeed * 0.12 : 0)) * D2R;
    const noise = gauss(a);
    const dir = rot(plan.aim, noise * spread);
    elev += noise * (spread / D2R) * 0.3;
    const ce = Math.cos(elev * D2R), se = Math.sin(elev * D2R);
    const carry = plan.velocity ? 0 : shot ? 0.2 : 0.08;
    const vel: Vec3 = { x: dir.x * exit * ce + a.vel.x * carry, y: exit * se, z: dir.z * exit * ce + a.vel.z * carry };
    let spin = spinFromComponents(vel, { top, side: side + (1 - q) * noise * 18 });
    if (elev < 4 && passing) {
      // Ground passes are struck through the middle and roll almost at once.
      const rs = rollingSpin(vel, this.cal.ball.radius);
      spin = { x: rs.x * 0.85, y: spin.y, z: rs.z * 0.85 };
      vel.y = Math.min(vel.y, 0.6);
    }
    this.lastContact = { playerId: a.id, action: plan.kind, hit: true, gap, quality: q, time };
    this.events.emit({ type: 'BallContact', playerId: a.id, action: plan.kind, foot: plan.foot, hit: true, gap, quality: q, time });
    this.enqueue({
      playerId: a.id, priority: 3, vel, spin, touchKind: 'kick', source: header ? 'header' : shot ? 'shot' : 'pass', kind: plan.kind,
      foot: plan.foot, quality: q, footSpeed: foot,
      after: () => {
        this.releasedBy = a.id;
        this.releasedAt = time;
        this.setState('BallReleased', null, `${plan.kind} struck`, time);
        this.events.emit({ type: 'BallRelease', playerId: a.id, kind: plan.kind, time });
      },
    });
    return true;
  }

  // ============================================================== rules
  /**
   * A touch decided by match rules rather than a foot (keeper saves and
   * parries, throw-ins, throws from the keeper's hands). Still queued here, so
   * the ball has exactly one writer.
   */
  rulesImpulse(playerId: string, vel: Vec3, spin: Vec3, source: ImpulseSource, kind: string, foot: Foot, time: number, after?: () => void): void {
    this.enqueue({ playerId, priority: 4, vel, spin, touchKind: source === 'save' ? 'touch' : 'kick', source, kind, foot, quality: 1, footSpeed: 0,
      after: () => {
        if (source === 'save') this.setState('PossessionLost', null, `${kind} by ${playerId}`, time);
        else { this.releasedBy = playerId; this.releasedAt = time; this.setState('BallReleased', null, `${kind} by ${playerId}`, time); this.events.emit({ type: 'BallRelease', playerId, kind, time }); }
        after?.();
      } });
  }
  /** Match rules give a player the ball (kick-off taker, keeper's hands, set piece). */
  holdBy(playerId: string, time: number): void {
    // Drop dribble touches, but never a throw or save already queued.
    this.queue = this.queue.filter((q) => q.priority >= 4);
    this.lastTouchAt = time;
    if (this.owner !== playerId || (this.state !== 'ControlledDribbling' && this.state !== 'PossessionAcquired')) this.setState('PossessionAcquired', playerId, 'rules: ball held', time);
  }

  // ============================================================ dribbling
  /**
   * Per fixed step for the player in possession (when not kicking).
   * Touches happen on foot strikes, or earlier when the ball would leave
   * the control zone or the player changes direction. Each touch is aimed
   * at where the player will be (movement prediction) plus a lead ahead of
   * him, so the ball follows the intended direction and stays reachable.
   */
  dribble(a: InteractionActor, strike: Foot | null, shield: boolean, time: number): void {
    if (this.owner !== a.id || this.state === 'Passing' || this.state === 'Shooting') return;
    const b = this.ball.curr;
    if (b.position.y > 0.45) return;
    const L = ballLocal(a, b.position);
    const t = a.tuning;
    const since = time - this.lastTouchAt;
    const stick = a.stick();
    const hasStick = Math.hypot(stick.x, stick.z) > 0.1;
    const speed = Math.hypot(a.vel.x, a.vel.z);
    // A running stride reaches further ahead of the hips than to the side or behind.
    const inReach = this.reachable(L, speed) && since > 0.14;
    const relV = { x: b.velocity.x - a.vel.x, z: b.velocity.z - a.vel.z };

    if (!hasStick) {
      // Pulling up: cushion the ball while slowing, then put the sole on it.
      if (inReach && speed < 1.8 && Math.hypot(relV.x, relV.z) > 0.35) this.queueTouch(a, { x: a.vel.x * 0.85, z: a.vel.z * 0.85 }, L.left > 0 ? 'L' : 'R', 'sole', 'stop', time);
      else if (inReach && speed >= 1.8 && since > 0.3) {
        const bs = Math.hypot(b.velocity.x, b.velocity.z);
        // Match the ball to where the slowing player will be, so it stays just ahead.
        const pr = a.predict(0.45);
        const sp = Math.max(0, pr.speed + 0.35);
        if (bs > sp + 0.3) this.queueTouch(a, { x: pr.dir.x * sp, z: pr.dir.z * sp }, L.left > 0 ? 'L' : 'R', 'inside', 'stop', time);
      }
      if (this.state !== 'ControlledDribbling') this.setState('ControlledDribbling', a.id, 'holding the ball', time);
      return;
    }
    const target = a.intendedSpeed();
    const sprinting = target > t.runSpeed + 0.3;
    const facing = dirOf(a.yaw);
    const sd = norm2(stick);
    const turnAngle = Math.acos(clamp(sd.x * facing.x + sd.z * facing.z, -1, 1));
    const turning = turnAngle > 35 * D2R;
    const st: PossessionState = turning ? 'TurningWithBall' : sprinting ? 'SprintDribbling' : 'ControlledDribbling';
    if (this.state !== st) this.setState(st, a.id, turning ? `turning ${(turnAngle / D2R).toFixed(0)}°` : sprinting ? 'sprinting with the ball' : 'dribbling', time);

    // Touch interval grows with pace; better dribblers touch more often.
    const T = shield ? 0.3 : turning ? 0.34 : (0.3 + 0.055 * Math.max(speed, target * 0.7)) * (1.12 - 0.25 * t.dribbleSkill);
    const pred = a.predict(T);
    const lead = shield ? 0.35 : 0.42 + 0.1 * pred.speed * (sprinting ? 1.6 : 1);
    // Alternate feet: aim slightly to the side of the foot that plays next.
    const nextFoot: Foot = this.lastTouchFoot === 'L' ? 'R' : 'L';
    const sideOff = (nextFoot === 'L' ? 1 : -1) * 0.1;
    const pl = { x: pred.dir.z, z: -pred.dir.x };
    const goal = { x: pred.pos.x + pred.dir.x * lead + pl.x * sideOff, z: pred.pos.z + pred.dir.z * lead + pl.z * sideOff };
    // Where the ball would be without a touch (rolling).
    const ar = this.cal.ball.rollingResistance * this.cal.world.gravity;
    const bs = Math.hypot(b.velocity.x, b.velocity.z);
    const tt = Math.min(T, bs / ar);
    const roll = bs > 1e-3 ? (bs * tt - 0.5 * ar * tt * tt) / bs : 0;
    const free = { x: b.position.x + b.velocity.x * roll, z: b.position.z + b.velocity.z * roll };
    const err = Math.hypot(free.x - goal.x, free.z - goal.z);
    const overrun = L.fwd < 0.3;
    const needed = strike ? err > 0.25 || overrun : err > 0.75 || overrun || (turning && err > 0.45);
    if (!inReach || !needed) return;
    // Solve the touch: reach `goal` in T under rolling resistance.
    const dx = goal.x - b.position.x, dz = goal.z - b.position.z;
    const d = Math.hypot(dx, dz);
    const u = Math.min(d / T + 0.5 * ar * T, pred.speed + 5.5);
    const spread = ((1 - t.touchControl) * 5 + speed * 0.3 * (1 - t.dribbleSkill) + 0.4) * D2R;
    const dir = rot(d > 1e-4 ? { x: dx / d, z: dz / d } : pred.dir, gauss(a) * spread);
    // Alternate feet unless the ball is clearly on one side.
    const foot: Foot = Math.abs(L.left) > 0.3 ? (L.left > 0 ? 'L' : 'R') : nextFoot;
    // Inside or outside of that foot, depending on which way the ball goes.
    const lateral = dir.x * facing.z - dir.z * facing.x; // + = to the left
    const surface: TouchSurface = sprinting && !turning ? 'laces' : (foot === 'L') === (lateral > 0) ? 'outside' : 'inside';
    const kind: TouchKind = turning ? 'directional' : sprinting ? 'sprint' : speed < 2.5 ? 'slow' : 'normal';
    this.queueTouch(a, { x: dir.x * u, z: dir.z * u }, foot, surface, kind, time);
  }

  /** Can a foot reach the ball this step? (forward reach grows with stride length) */
  reachable(L: { fwd: number; left: number; dist: number }, speed: number): boolean {
    const fwdReach = 0.75 + 0.12 * speed;
    if (L.fwd > fwdReach || L.fwd < -0.55 || Math.abs(L.left) > 0.7) return false;
    return L.dist < Math.max(0.95, fwdReach);
  }

  /**
   * While in possession: where the player should run to keep the ball. When
   * the ball is out of reach and the stick asks for a different direction,
   * he first goes to the ball (then turns it with a touch); otherwise null.
   */
  collectDirection(a: InteractionActor): Vec2 | null {
    if (this.owner !== a.id) return null;
    const b = this.ball.curr;
    const L = ballLocal(a, b.position);
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (this.reachable(L, speed) || b.position.y > 0.6) return null;
    const stick = a.stick();
    const t = clamp(L.dist / Math.max(speed, 3), 0.1, 0.6);
    const tx = b.position.x + b.velocity.x * t - a.pos.x, tz = b.position.z + b.velocity.z * t - a.pos.z;
    const l = Math.hypot(tx, tz);
    if (l < 1e-3) return null;
    const toBall = { x: tx / l, z: tz / l };
    // Stick released with the ball rolling on: go and stop it.
    if (Math.hypot(stick.x, stick.z) < 0.1) return Math.hypot(b.velocity.x, b.velocity.z) > 0.4 ? toBall : null;
    const sd = norm2(stick);
    if (toBall.x * sd.x + toBall.z * sd.z > Math.cos(30 * D2R)) return null; // already heading to it
    return toBall;
  }

  private queueTouch(a: InteractionActor, v: Vec2, foot: Foot, surface: TouchSurface, kind: TouchKind, time: number): void {
    const vel: Vec3 = { x: v.x, y: 0, z: v.z };
    this.lastTouchAt = time;
    this.lastTouchFoot = foot;
    const speed = Math.hypot(v.x, v.z);
    this.enqueue({
      playerId: a.id, priority: 1, vel, spin: rollingSpin(vel, this.cal.ball.radius), touchKind: 'touch',
      source: kind === 'stop' ? 'stop' : 'dribble', kind: `${kind} ${surface}`, foot, quality: 1, footSpeed: speed,
      after: () => this.events.emit({ type: 'DribbleTouch', playerId: a.id, foot, surface, kind, speed, time }),
    });
  }

  // ===================================================== receiving / loose
  /**
   * Any player not in possession: control a ball that arrives within reach
   * (first touch), block a hard low one when defending, or pick up a loose
   * ball / a ball the dribbler has knocked too far.
   */
  receive(a: InteractionActor, others: ReadonlyArray<InteractionActor>, defending: boolean, time: number): Foot | null {
    if (this.owner === a.id) return null;
    if (this.releasedBy === a.id && time - this.releasedAt < 0.45) return null;
    const b = this.ball.curr;
    const L = ballLocal(a, b.position);
    // A fast ball is hard to reach for: the reach shrinks with its pace
    // (except for the player it was meant for).
    const relPace = Math.hypot(b.velocity.x - a.vel.x, b.velocity.z - a.vel.z);
    const meant = this.intendedFor === a.id;
    const paceFactor = meant ? 1 : clamp(1.15 - relPace / 22, 0.45, 1);
    const reach = (a.tuning.interceptReach + (defending ? 0.25 : 0)) * paceFactor * (this.intendedFor && !meant ? 0.85 : 1) + (meant ? 0.25 : 0);
    if (L.dist > reach || b.position.y > 1.7) return null;
    if (this.owner) {
      // Someone is dribbling: only a ball knocked away from him can be taken.
      const o = others.find((p) => p.id === this.owner);
      if (o && Math.hypot(b.position.x - o.pos.x, b.position.z - o.pos.z) < 1.0) return null;
    }
    const rel = { x: b.velocity.x - a.vel.x, z: b.velocity.z - a.vel.z };
    const relSpeed = Math.hypot(rel.x, rel.z);
    const toward = -(rel.x * (b.position.x - a.pos.x) + rel.z * (b.position.z - a.pos.z)) / Math.max(L.dist, 1e-3);
    if (relSpeed > 1.2 && toward < 0.2 && L.dist > 0.6) return null;
    const foot: Foot = L.left > 0 ? 'L' : 'R';
    const prevOwner = this.owner;
    if (len3(b.velocity) > 15 && b.position.y < 1.2 && defending) {
      const back: Vec3 = { x: -b.velocity.x * 0.25, y: Math.abs(b.velocity.y) * 0.3 + 0.5, z: -b.velocity.z * 0.25 };
      this.enqueue({ playerId: a.id, priority: 2, vel: back, spin: { x: 0, y: 0, z: 0 }, touchKind: 'kick', source: 'block', kind: 'block', foot, quality: 1, footSpeed: 0,
        after: () => this.setState('PossessionLost', null, `blocked by ${a.id}`, time) });
      return foot;
    }
    // Cushioned first touch to the player's pace, nudged along the stick.
    const hard = clamp((relSpeed - 5) / 20, 0, 1) + clamp((b.position.y - 0.45) / 1.2, 0, 1) * 0.5;
    const miss = (1 - a.tuning.touchControl) * (0.4 + hard);
    const stick = a.stick();
    const dir = Math.hypot(stick.x, stick.z) > 0.1 ? norm2(stick) : dirOf(a.yaw);
    const push = 0.6 + 0.8 * Math.hypot(stick.x, stick.z);
    const noise = gauss(a);
    const vel: Vec3 = {
      x: a.vel.x + dir.x * push + rel.x * miss * 0.3 + noise * miss * 0.6,
      y: Math.max(0, b.velocity.y * 0.15),
      z: a.vel.z + dir.z * push + rel.z * miss * 0.3 + noise * miss * 0.6,
    };
    this.lastTouchAt = time;
    this.lastTouchFoot = foot;
    this.enqueue({ playerId: a.id, priority: 2, vel, spin: rollingSpin(vel, this.cal.ball.radius), touchKind: 'touch', source: 'control', kind: 'first touch', foot, quality: 1 - miss, footSpeed: 0,
      after: () => this.setState('PossessionAcquired', a.id, prevOwner ? `won from ${prevOwner}` : relSpeed > 3 ? 'first touch' : 'picked up loose ball', time) });
    return foot;
  }

  // ======================================================= skills/tackles
  skillTouch(a: InteractionActor, skill: ActionKind, which: 'touch' | 'touch2', exitSide: number, aim: Vec2, foot: Foot, time: number): boolean {
    const L = ballLocal(a, this.ball.curr.position);
    if (L.dist > 1.25 || this.ball.curr.position.y > 0.45) return false;
    const facing = dirOf(a.yaw);
    const speed = Math.hypot(a.vel.x, a.vel.z);
    let dir: Vec2 = facing, u = speed + 1.2;
    switch (skill) {
      case 'stepOver': case 'doubleStepOver': dir = rot(facing, -exitSide * 55 * D2R); u = Math.max(speed, 2) + 1.8; break;
      case 'bodyFeint': dir = rot(facing, -exitSide * 45 * D2R); u = Math.max(speed, 2.5) + 1.6; break;
      case 'ballRoll': dir = rot(facing, -exitSide * 90 * D2R); u = 1.5; break;
      case 'dragBack': dir = { x: -facing.x, z: -facing.z }; u = 2.2; break;
      case 'roulette': dir = which === 'touch' ? rot(facing, -exitSide * 120 * D2R) : aim; u = which === 'touch' ? 0.9 : 2.6; break;
      case 'heelToHeel': dir = rot(facing, -exitSide * 30 * D2R); u = Math.max(speed, 2) + 2.2; break;
      case 'fakeShot': dir = rot(facing, -exitSide * 80 * D2R); u = 2.6; break;
      default: break;
    }
    const d = rot(dir, gauss(a) * ((1 - a.tuning.dribbleSkill) * 6 + 1) * D2R);
    const vel: Vec3 = { x: d.x * u, y: 0, z: d.z * u };
    this.lastTouchAt = time;
    this.lastTouchFoot = foot;
    this.enqueue({ playerId: a.id, priority: 2, vel, spin: rollingSpin(vel, this.cal.ball.radius), touchKind: 'touch', source: 'skill', kind: skill, foot, quality: 1, footSpeed: u,
      after: () => this.setState('ControlledDribbling', a.id, `${skill} touch`, time) });
    return true;
  }

  /** Tackle foot reaches the ball? (standing: during the lunge; sliding: during the slide). */
  tackle(a: InteractionActor, kind: 'standing' | 'sliding', foot: Foot, time: number): boolean {
    const f = footWorld(a.pose, foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
    const b = this.ball.curr.position;
    const gap = Math.hypot(b.x - f.x, b.y - f.y, b.z - f.z) - this.cal.ball.radius;
    const reach = kind === 'sliding' ? 0.3 : 0.22 + 0.2 * a.tuning.tackleSkill;
    if (gap > reach) return false;
    const facing = dirOf(a.yaw);
    const d = rot(facing, gauss(a) * (kind === 'sliding' ? 20 : 25 - 15 * a.tuning.tackleSkill) * D2R);
    const u = kind === 'sliding' ? 5 + 4 * a.tuning.tackleSkill : 3 + 3.5 * a.tuning.tackleSkill;
    const vel: Vec3 = { x: d.x * u + a.vel.x * 0.35, y: kind === 'sliding' ? 0.8 : 0.4, z: d.z * u + a.vel.z * 0.35 };
    const prev = this.owner;
    this.enqueue({ playerId: a.id, priority: 3, vel, spin: rollingSpin(vel, this.cal.ball.radius), touchKind: 'kick', source: 'tackle', kind: `${kind} tackle`, foot, quality: 1, footSpeed: u,
      after: () => {
        this.events.emit({ type: 'TackleContact', playerId: a.id, kind, won: true, fouled: false, time });
        this.setState('PossessionLost', null, prev ? `tackled by ${a.id}` : `cleared by ${a.id}`, time);
      } });
    return true;
  }
  tackleMissed(a: InteractionActor, kind: 'standing' | 'sliding', fouled: boolean, time: number): void {
    this.events.emit({ type: 'TackleContact', playerId: a.id, kind, won: false, fouled, time });
  }

  /** Where a tackling foot is (to test contact with an opponent's legs). */
  footPoint(a: InteractionActor, foot: Foot): Vec3 {
    return footWorld(a.pose, foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
  }

  /** Aim at the goal the player is attacking if it is in front of him. */
  static shotAim(a: { pos: Vec2; yaw: number }, stick: Vec2, goalHalfLength: number, goalWidth: number): Vec2 {
    const facing = dirOf(a.yaw);
    const goalZ = facing.z >= 0 ? goalHalfLength : -goalHalfLength;
    const toGoal = { x: -a.pos.x, z: goalZ - a.pos.z };
    const dist = Math.hypot(toGoal.x, toGoal.z);
    const dirToGoal = { x: toGoal.x / dist, z: toGoal.z / dist };
    const inFront = facing.x * dirToGoal.x + facing.z * dirToGoal.z > 0.2 && dist < 45;
    if (!inFront) return Math.hypot(stick.x, stick.z) > 0.2 ? norm2(stick) : facing;
    const leftAxis = { x: dirToGoal.z, z: -dirToGoal.x };
    const lateral = clamp(stick.x * leftAxis.x + stick.z * leftAxis.z, -1, 1);
    // Corner along the goal line, on the side the stick points (shooter's view).
    const target = { x: lateral * goalWidth * 0.38 * (leftAxis.x >= 0 ? 1 : -1), z: goalZ };
    return norm2({ x: target.x - a.pos.x, z: target.z - a.pos.z });
  }
}
