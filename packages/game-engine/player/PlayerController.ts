// The one player controller. Humans and AI both drive it with PlayerInput;
// every footballer differs only by attributes, body and appearance.
//
// Per fixed step:
//   1. read the Rapier body (velocity includes last step's contacts)
//   2. buttons → charged kicks / instant actions
//   3. pending kick: approach the ball until the contact frame will line up
//   4. momentum movement → body velocity
//   5. stride phase advanced by distance travelled → foot strikes
//   6. state machine → animation events; pose (IK) for this step
//   7. events act on the ball at the exact frame (kick, touch, tackle)
import type { BallController } from '../ball/BallController.ts';
import { ACTION_CLIPS, KICK_ACTIONS, SKILL_ACTIONS } from '../animation/ActionClips.ts';
import { AnimationStateMachine } from '../animation/AnimationStateMachine.ts';
import { emptyPose } from '../animation/AnimationBlending.ts';
import { FootContact, gaitFor, type GaitParams } from '../animation/FootContact.ts';
import type { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import type { PitchConfig } from '../physics/PhysicsConfig.ts';
import { angleDiff, clamp, dirOf, headingOf, type Vec2 } from '../physics/Vec3.ts';
import { REFERENCE_ATTRIBUTES, deriveTuning } from './PlayerAttributes.ts';
import { computePose } from './PlayerAnimation.ts';
import { PlayerBallInteraction, ballLocal, type InteractionActor } from './PlayerBallInteraction.ts';
import type { CollisionBody } from './PlayerCollision.ts';
import { stepMovement, targetSpeedFor, type MoveMode } from './PlayerMovement.ts';
import { PlayerPhysics } from './PlayerPhysics.ts';
import { rigDims, type RigDims } from './PlayerRig.ts';
import {
  emptyInput, type ActionKind, type Foot, type KickKind, type MovementState, type PlayerAttributes,
  type PlayerInput, type PlayerSnapshot, type PlayerTuning, type PoseData,
} from './PlayerTypes.ts';

export interface PlayerSetup {
  id: string;
  name: string;
  number: number;
  attributes?: PlayerAttributes;
  heightM?: number;
  massKg?: number;
  preferredFoot?: Foot;
  start: Vec2;
  yaw?: number;
  seed?: number;
}

export interface StepContext {
  ball: BallController;
  others: readonly PlayerController[];
  time: number;
  pitch: PitchConfig;
}

type ChargeKey = 'pass' | 'through' | 'lob' | 'shoot';
interface PendingKick { kind: KickKind; power: number; aim: Vec2; since: number }

const D2R = Math.PI / 180;
const SPIN_SKILLS: ReadonlySet<ActionKind> = new Set<ActionKind>(['dragBack', 'roulette']);

export class PlayerController implements InteractionActor {
  readonly id: string;
  readonly name: string;
  readonly number: number;
  readonly attributes: PlayerAttributes;
  readonly tuning: PlayerTuning;
  readonly dims: RigDims;
  readonly preferredFoot: Foot;
  readonly physics: PlayerPhysics;
  readonly sm = new AnimationStateMachine();
  readonly contact = new FootContact();
  private readonly interaction: PlayerBallInteraction;

  input: PlayerInput = emptyInput();
  private prevInput: PlayerInput = emptyInput();
  pos: Vec2;
  vel: Vec2 = { x: 0, z: 0 };
  accel: Vec2 = { x: 0, z: 0 };
  yaw: number;
  yawRate = 0;
  stamina = 1;
  balance = 1;
  movement: MovementState = 'idle';
  gait: GaitParams = gaitFor(0);
  pose: PoseData = emptyPose();
  colliding = false;
  hasBall = false;
  pending: PendingKick | null = null;
  /** Charge start times (sim s) of held kick buttons. */
  private charges = new Map<ChargeKey, number>();
  /** Shot modifiers held at any point while the shot was charging. */
  private chargeMods = { finesse: false, lowDriven: false, chip: false, powerMod: false };
  private lastSetVel: Vec2 = { x: 0, z: 0 };
  private actionYaw0 = 0;
  private actionAim: Vec2 = { x: 0, z: 1 };
  private actionKind: KickKind | null = null;
  private seed: number;
  /** Interpolation snapshots. */
  prev: PlayerSnapshot;
  curr: PlayerSnapshot;

  constructor(private readonly pw: PhysicsWorld, setup: PlayerSetup) {
    this.id = setup.id;
    this.name = setup.name;
    this.number = setup.number;
    this.attributes = { ...(setup.attributes ?? REFERENCE_ATTRIBUTES) };
    const heightM = setup.heightM ?? pw.cal.player.heightM;
    const massKg = setup.massKg ?? pw.cal.player.massKg;
    this.tuning = deriveTuning(this.attributes, pw.cal.player, { massKg, heightM });
    this.dims = rigDims(heightM);
    this.preferredFoot = setup.preferredFoot ?? 'R';
    this.pos = { ...setup.start };
    this.yaw = setup.yaw ?? 0;
    this.seed = (setup.seed ?? 1234567) >>> 0;
    this.physics = new PlayerPhysics(pw, this.id, setup.start, massKg, heightM);
    this.interaction = new PlayerBallInteraction(pw.events, pw.cal.ball);
    this.curr = this.snapshot();
    this.prev = this.curr;
  }

  /** Deterministic RNG (mulberry32) so tests and replays are repeatable. */
  rng(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get speed(): number { return Math.hypot(this.vel.x, this.vel.z); }
  get actionName(): string { return this.sm.current; }

  // ------------------------------------------------------------------ step
  preStep(dt: number, ctx: StepContext): void {
    const ball = ctx.ball, now = ctx.time;
    this.prev = this.curr;
    this.pos = this.physics.position();
    this.vel = this.physics.velocity();
    const bl = ballLocal(this, ball.curr.position);
    this.hasBall = ball.lastTouchBy === this.id && ball.lastTouchKind === 'touch' && bl.dist < 2.4 + this.speed * 0.25 && ball.curr.position.y < 0.7 && now - ball.lastTouchTime < 4;

    this.handleButtons(ctx);
    let moveInput: PlayerInput = this.input;
    let approach = false;
    if (this.pending) {
      const o = this.approach(ctx);
      if (o) {
        // Run to the ball whatever pace modifier is held; sprint if it is getting away.
        const bs = Math.hypot(ball.curr.velocity.x, ball.curr.velocity.z);
        moveInput = { ...this.input, move: o, jog: false, walk: false, sprint: this.input.sprint || bs > this.tuning.runSpeed - 0.5 || bl.dist > 3 };
        approach = true;
      }
    }

    // ---- movement mode ----
    const a = this.sm.action;
    const defend = this.input.defend;
    let mode: MoveMode;
    if (a) {
      mode = { kind: a.clip.move, control: a.clip.control, speedCap: a.clip.speedCap };
      if (KICK_ACTIONS.has(a.clip.name)) mode.facing = headingOf(this.actionAim.x, this.actionAim.z);
    } else if (defend && this.hasBall) {
      mode = { kind: 'dribble', speedCap: 2.6, facing: this.shieldYaw(ctx) };
    } else if (defend) {
      const toBall = headingOf(ball.curr.position.x - this.pos.x, ball.curr.position.z - this.pos.z);
      mode = { kind: 'jockey', facing: bl.dist < 30 ? toBall : this.yaw };
    } else {
      // With the ball, top speed drops a little (more for weaker dribblers).
      const dribbleCap = this.hasBall ? this.tuning.sprintSpeed * (0.86 + 0.1 * this.tuning.dribbleSkill) : undefined;
      const ballSpeed = Math.hypot(ball.curr.velocity.x, ball.curr.velocity.z);
      mode = { kind: this.hasBall ? 'dribble' : 'normal', speedCap: approach ? Math.max(this.approachCap(bl.dist), ballSpeed + 1.4) : dribbleCap };
    }
    if (this.balance < 0.6) mode.control = (mode.control ?? 1) * clamp(this.balance / 0.6, 0.25, 1);
    const res = stepMovement({ vel: this.vel, yaw: this.yaw, yawRate: this.yawRate, stamina: this.stamina }, moveInput, this.tuning, mode, dt);
    this.vel = res.vel;
    this.yaw = res.yaw;
    this.yawRate = res.yawRate;
    this.stamina = res.stamina;
    this.accel = res.accel;

    // ---- stride ----
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const f = dirOf(this.yaw);
    const forward = this.vel.x * f.x + this.vel.z * f.z;
    const left = this.vel.x * f.z - this.vel.z * f.x;
    const style = defend && !this.hasBall ? 'jockey' : this.hasBall ? 'dribble' : 'normal';
    this.gait = gaitFor(speed, this.tuning.heightM / 1.8, style);
    let gaitYaw = 0, signed = speed;
    if (speed > 0.2) {
      let ang = Math.atan2(left, forward);
      if (Math.abs(ang) > 100 * D2R) { ang -= Math.PI * Math.sign(ang); signed = -speed; }
      gaitYaw = clamp(ang, -1.35, 1.35);
    }
    const grounded = !a || (a.clip.move !== 'slide' && a.clip.move !== 'down');
    if (grounded) {
      if (speed < 0.25 && Math.abs(this.yawRate) > 1.2) this.contact.advance(Math.abs(this.yawRate) * 0.16 * dt, gaitFor(1));
      else this.contact.advance(signed * dt, this.gait);
    } else this.contact.struck = null;
    if (this.contact.struck) this.pw.events.emit({ type: 'footPlant', playerId: this.id, foot: this.contact.struck, time: now });

    // ---- animation ----
    const events = this.sm.update(dt, {
      speed, forward, left, braking: res.braking, turning: res.turning, yawRate: this.yawRate,
      jockey: defend && !this.hasBall, dribbling: this.hasBall, sprintSpeed: this.tuning.sprintSpeed, runSpeed: this.tuning.runSpeed,
    }, now);
    const toBallYaw = headingOf(ball.curr.position.x - this.pos.x, ball.curr.position.z - this.pos.z);
    const relV = { x: ball.curr.velocity.x - this.vel.x, z: ball.curr.velocity.z - this.vel.z };
    const coming = bl.dist > 0.5 ? -(relV.x * (ball.curr.position.x - this.pos.x) + relV.z * (ball.curr.position.z - this.pos.z)) / bl.dist : 0;
    const readiness = !this.hasBall && bl.dist < 12 && coming > 2 ? clamp((12 - bl.dist) / 8, 0, 1) : 0;
    this.pose = computePose({
      sm: this.sm, gait: this.gait, contact: this.contact, dims: this.dims, movement: this.sm.locomotion, speed, gaitYaw,
      accelForward: this.accel.x * f.x + this.accel.z * f.z, accelLeft: this.accel.x * f.z - this.accel.z * f.x,
      yawRate: this.yawRate, time: now, readiness,
      lookYaw: bl.dist < 35 ? angleDiff(this.yaw, toBallYaw) : null,
      lookDown: this.hasBall ? 0.8 : bl.dist < 6 ? 0.3 : 0, defending: defend,
    });
    if (this.sm.action && SPIN_SKILLS.has(this.sm.action.clip.name)) {
      // Skills that turn the body hand their rotation to the physics yaw.
      this.yaw = this.actionYaw0 + this.pose.yawOffset;
      this.pose.yawOffset = 0;
    }
    this.movement = this.sm.action ? this.movementForAction() : this.sm.locomotion;

    this.physics.setVelocity(this.vel);
    this.lastSetVel = { ...this.vel };

    // ---- ball interaction at the exact frame ----
    for (const e of events) this.onAnimEvent(e.kind, ctx);
    this.continuous(ctx);
    this.balance = Math.min(1, this.balance + dt * (0.3 + 0.5 * this.tuning.balance));
    this.prevInput = { ...this.input, move: { ...this.input.move } };
  }

  /** After the physics step: capture the state for rendering and debug. */
  postStep(): void {
    this.pos = this.physics.position();
    this.curr = this.snapshot();
  }

  snapshot(): PlayerSnapshot {
    return {
      id: this.id, position: { x: this.pos.x, y: 0, z: this.pos.z }, velocity: { x: this.vel.x, y: 0, z: this.vel.z },
      acceleration: { x: this.accel.x, y: 0, z: this.accel.z }, yaw: this.yaw, yawRate: this.yawRate, speed: this.speed,
      stamina: this.stamina, balance: this.balance, grounded: this.pose.lift < 0.02, colliding: this.colliding,
      movement: this.movement, animation: this.sm.current, pose: this.pose,
    };
  }

  /** Adapter for PlayerCollision. */
  collisionBody(): CollisionBody {
    return {
      id: this.id, pos: this.physics.position(), velBefore: this.lastSetVel, radius: this.physics.radius,
      massKg: this.tuning.massKg, strength: this.tuning.strength, balanceSkill: this.tuning.balance,
      braced: this.input.defend, hit: (sev) => this.knock(sev), setColliding: (on) => { this.colliding = on; },
    };
  }

  /** Balance damage from contact (0..1+). */
  knock(severity: number): void {
    if (severity <= 0.02) return;
    this.balance = Math.max(0, this.balance - severity);
    const name = this.sm.action?.clip.name;
    if (name === 'fall' || name === 'getUp' || name === 'slidingTackle') return;
    if (this.balance < 0.12) { this.sm.start('fall', { foot: 'R', force: true }); this.pending = null; this.pw.events.emit({ type: 'balanceLost', playerId: this.id, severity, time: this.pw.time }); }
    else if (this.balance < 0.45 && name !== 'stumble') { this.sm.start('stumble', { foot: 'R', force: true }); this.pending = null; this.pw.events.emit({ type: 'balanceLost', playerId: this.id, severity, time: this.pw.time }); }
  }

  teleport(p: Vec2, yaw = this.yaw): void {
    this.physics.teleport(p);
    this.pos = { ...p }; this.vel = { x: 0, z: 0 }; this.yaw = yaw; this.yawRate = 0;
    this.sm.action = null; this.pending = null; this.balance = 1;
    this.curr = this.snapshot(); this.prev = this.curr;
  }

  // ------------------------------------------------------------- internals
  private movementForAction(): MovementState {
    const a = this.sm.action;
    if (!a) return this.sm.locomotion;
    if (a.clip.move === 'slide') return 'slide';
    if (a.clip.name === 'stumble') return 'stumble';
    if (a.clip.name === 'fall') return 'fallen';
    if (a.clip.name === 'getUp') return 'getUp';
    return 'action';
  }

  private pressed(k: keyof PlayerInput): boolean { return !!this.input[k] && !this.prevInput[k]; }
  private released(k: keyof PlayerInput): boolean { return !this.input[k] && !!this.prevInput[k]; }

  private handleButtons(ctx: StepContext): void {
    const now = ctx.time;
    if (this.pressed('shoot')) this.chargeMods = { finesse: false, lowDriven: false, chip: false, powerMod: false };
    if (this.input.shoot || this.prevInput.shoot) {
      for (const m of ['finesse', 'lowDriven', 'chip', 'powerMod'] as const) if (this.input[m]) this.chargeMods[m] = true;
    }
    for (const k of ['pass', 'through', 'lob', 'shoot'] as const) {
      if (this.pressed(k)) this.charges.set(k, now);
      if (this.released(k)) {
        const start = this.charges.get(k) ?? now;
        this.charges.delete(k);
        const power = clamp((now - start) / 0.9, 0.08, 1);
        this.requestKick(k, power, ctx);
      }
    }
    const busy = this.sm.busy;
    if (this.pressed('standTackle') && !busy) this.startAction('standingTackle', this.preferredFoot);
    if (this.pressed('slideTackle') && !busy) {
      this.startAction('slidingTackle', this.preferredFoot);
      const f = dirOf(this.yaw);
      const s = Math.max(this.speed, 5 + 2 * this.tuning.tackleSkill);
      this.vel = { x: f.x * s, z: f.z * s };
      this.physics.setVelocity(this.vel);
    }
    if (this.pressed('jump') && !busy) this.startAction('jump', this.preferredFoot);
    if (this.pressed('celebrate') && !busy) this.startAction('celebrate', this.preferredFoot);
    if (this.input.skillMove && this.input.skill && this.input.skillMove !== this.prevInput.skillMove && !busy) this.startSkill(this.input.skillMove, ctx);
  }

  /** Charge-meter level 0..1 for a held kick button (for the HUD). */
  charge(k: ChargeKey, now: number): number {
    const s = this.charges.get(k);
    return s === undefined ? 0 : clamp((now - s) / 0.9, 0.08, 1);
  }

  private requestKick(k: ChargeKey, power: number, ctx: StepContext): void {
    const stick = this.input.move;
    const hasStick = Math.hypot(stick.x, stick.z) > 0.25;
    const facing = dirOf(this.yaw);
    const aimPass = hasStick ? norm(stick) : facing;
    let kind: KickKind;
    let aim = aimPass;
    if (k === 'pass') kind = power > 0.72 ? 'drivenPass' : 'shortPass';
    else if (k === 'through') kind = 'throughBall';
    else if (k === 'lob') {
      const wide = Math.abs(this.pos.x) > ctx.pitch.width / 2 - 16 && Math.abs(this.pos.z) > ctx.pitch.length / 2 - 30;
      kind = wide ? 'cross' : power > 0.7 ? 'longPass' : 'lobPass';
      if (wide) aim = norm({ x: -this.pos.x * 0.85, z: Math.sign(this.pos.z) * (ctx.pitch.length / 2 - 9) - this.pos.z });
    } else {
      const m = this.chargeMods;
      kind = m.finesse ? 'finesseShot' : m.lowDriven ? 'lowDrivenShot' : m.chip ? 'chipShot'
        : m.powerMod ? 'powerShot' : power < 0.2 ? 'placedShot' : 'shot';
      aim = PlayerBallInteraction.shotAim(this, stick, ctx.pitch.length / 2, ctx.pitch.goalWidth);
    }
    this.pending = { kind, power, aim, since: ctx.time };
  }

  private approachCap(dist: number): number {
    return dist < 1.2 ? 2.5 : dist < 3 ? 4.5 : 9;
  }

  /**
   * Work towards a kick: start the swing when the ball will be at the
   * kicking foot at the contact frame, otherwise steer to the ball.
   * Returns a movement override while approaching.
   */
  private approach(ctx: StepContext): Vec2 | null {
    const p = this.pending;
    if (!p) return null;
    if (ctx.time - p.since > 1.6) { this.pending = null; return null; }
    if (this.sm.busy) return null;
    const b = ctx.ball.curr;
    let kind = p.kind;
    const shotLike = !kind.endsWith('Pass') && kind !== 'throughBall' && kind !== 'cross';
    if (b.position.y > 1.3) kind = 'header';
    else if (b.position.y > 0.5) kind = shotLike ? 'volley' : kind;
    else if (shotLike && b.velocity.y > 1.2 && b.position.y < 0.5) kind = 'halfVolley';
    const relV = { x: b.velocity.x - this.vel.x, z: b.velocity.z - this.vel.z };
    const ballMoving = Math.hypot(relV.x, relV.z) > 4 && !this.hasBall;
    if (kind === 'shortPass' && ballMoving) kind = 'firstTimePass';
    const clip = ACTION_CLIPS[kind];
    const contactT = clip.markers.find((m) => m.kind === 'contact')?.t ?? 0.55;
    const tc = clip.duration * contactT;
    const g = this.pw.cal.world.gravity, r = this.pw.cal.ball.radius;
    const bp = { x: b.position.x + b.velocity.x * tc, y: Math.max(r, b.position.y + b.velocity.y * tc - 0.5 * g * tc * tc), z: b.position.z + b.velocity.z * tc };
    const pp = { x: this.pos.x + this.vel.x * tc * 0.6, z: this.pos.z + this.vel.z * tc * 0.6 };
    const f = dirOf(this.yaw);
    const dx = bp.x - pp.x, dz = bp.z - pp.z;
    const fwd = dx * f.x + dz * f.z, left = dx * f.z - dz * f.x;
    const foot: Foot = kind === 'header' ? this.preferredFoot : left > 0.14 ? 'L' : left < -0.14 ? 'R' : this.preferredFoot;
    const idealFwd = kind === 'header' ? 0.2 : kind === 'volley' ? 0.55 : 0.42;
    const idealLeft = kind === 'header' ? 0 : foot === 'R' ? -0.13 : 0.13;
    const heightOk = kind === 'header' ? bp.y > 1.55 && bp.y < 2.6 : kind === 'volley' ? bp.y < 1.3 : bp.y < 0.55;
    if (Math.abs(fwd - idealFwd) < 0.36 && Math.abs(left - idealLeft) < 0.34 && heightOk) {
      this.actionKind = kind;
      this.actionAim = p.aim;
      this.startAction(kind, foot, p.power);
      this.pending = null;
      return null;
    }
    // Steer to a spot just behind the ball on the line of the aim.
    const dist = Math.hypot(b.position.x - this.pos.x, b.position.z - this.pos.z);
    if (dist > 5 && !ballMoving) { this.pending = null; return null; }
    const lead = ballMoving ? 0.35 : 0.15;
    const target = { x: b.position.x + b.velocity.x * lead - p.aim.x * 0.5, z: b.position.z + b.velocity.z * lead - p.aim.z * 0.5 };
    const to = { x: target.x - this.pos.x, z: target.z - this.pos.z };
    const d = Math.hypot(to.x, to.z);
    if (d < 0.12) return { x: p.aim.x * 0.5, z: p.aim.z * 0.5 };
    return { x: to.x / d, z: to.z / d };
  }

  private startAction(kind: ActionKind, foot: Foot, power = 0.5, side = 1): void {
    if (this.sm.start(kind, { foot, power, aim: this.actionAim, side })) {
      this.actionYaw0 = this.yaw;
      if (!KICK_ACTIONS.has(kind)) this.actionKind = null;
    }
  }

  private startSkill(kind: ActionKind, ctx: StepContext): void {
    if (!SKILL_ACTIONS.has(kind)) return;
    const bl = ballLocal(this, ctx.ball.curr.position);
    if (bl.dist > 1.4) return;
    const clip = ACTION_CLIPS[kind];
    const e = clip.exitSide ?? 0;
    // Stick to the left/right of facing chooses the exit side (mirror the move).
    const f = dirOf(this.yaw);
    const stickLeft = this.input.move.x * f.z - this.input.move.z * f.x;
    const want = stickLeft > 0.3 ? 1 : stickLeft < -0.3 ? -1 : (e === 0 || e === 2 ? 0 : Math.sign(e));
    let foot: Foot = this.preferredFoot;
    if (e === 1 || e === -1) foot = Math.sign(e) === (want || Math.sign(e)) ? 'R' : 'L';
    const side = e === 1 || e === -1 ? e * (foot === 'R' ? 1 : -1) : want || 1;
    this.actionAim = Math.hypot(this.input.move.x, this.input.move.z) > 0.2 ? norm(this.input.move) : f;
    this.startAction(kind, foot, 0.5, side);
  }

  private shieldYaw(ctx: StepContext): number | undefined {
    let best: PlayerController | null = null, bd = 4;
    for (const o of ctx.others) {
      const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return undefined;
    return headingOf(this.pos.x - best.pos.x, this.pos.z - best.pos.z);
  }

  private onAnimEvent(kind: string, ctx: StepContext): void {
    const a = this.sm.action ?? null;
    const ball = ctx.ball, now = ctx.time;
    // The action may have ended this step; markers still belong to it.
    const name = a?.clip.name ?? null;
    if (kind === 'contact' && this.actionKind && (name === this.actionKind || name === null)) {
      this.interaction.kick(this, ball, { kind: this.actionKind, power: a?.power ?? 0.5, aim: this.actionAim, foot: a?.foot ?? this.preferredFoot }, now);
      this.actionKind = null;
      return;
    }
    if (kind === 'contact' && name === 'jump') {
      // Jumping header if the ball is at the head.
      this.interaction.kick(this, ball, { kind: 'header', power: 0.6, aim: dirOf(this.yaw), foot: this.preferredFoot }, now);
      return;
    }
    if ((kind === 'touch' || kind === 'touch2') && a && SKILL_ACTIONS.has(a.clip.name)) {
      this.interaction.skillTouch(this, ball, a.clip.name, kind, a.side, this.actionAim, a.foot, now);
    }
  }

  /** A tackle that misses the ball but catches the opponent's legs trips him. */
  private tripCheck(ctx: StepContext, foot: Foot, severity: number): void {
    const p = this.interaction.footPoint(this, foot);
    for (const o of ctx.others) {
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < 0.42 && p.y < 0.7) o.knock(severity);
    }
  }

  private continuous(ctx: StepContext): void {
    const a = this.sm.action, ball = ctx.ball, now = ctx.time;
    if (a && a.clip.name === 'slidingTackle') {
      const t = a.time / a.clip.duration;
      if (t > 0.1 && t < 0.8) {
        if (!a.resolved && this.interaction.slidingSweep(this, ball, a.foot, now)) a.resolved = true;
        if (!a.resolved) this.tripCheck(ctx, a.foot, 1.2);
        else this.tripCheck(ctx, a.foot, 0.5);
      }
      return;
    }
    if (a && a.clip.name === 'standingTackle') {
      const t = a.time / a.clip.duration;
      if (!a.resolved && t > 0.2 && t < 0.58 && this.interaction.standingTackle(this, ball, a.foot, now)) a.resolved = true;
      if (!a.resolved && t >= 0.58) {
        a.resolved = true;
        this.pw.events.emit({ type: 'tackle', playerId: this.id, kind: 'standing', won: false, time: now });
        this.tripCheck(ctx, a.foot, 0.95);
      }
      return;
    }
    if (a && a.clip.interruptible === false) return;
    // Dribble touch when a foot strikes while we have the ball.
    const struck = this.contact.struck;
    const stick = this.input.move;
    const hasStick = Math.hypot(stick.x, stick.z) > 0.1;
    if (this.hasBall && !this.pending && hasStick) {
      // Touch on a foot strike; or a saving touch if the ball is about to go under us.
      const L = ballLocal(this, ball.curr.position);
      const urgent = L.fwd < 0.3 && L.fwd > -0.1 && now - ball.lastTouchTime > 0.2;
      const foot = struck ?? (urgent ? (this.contact.supportFoot(this.gait)) : null);
      const intended = targetSpeedFor(this.input, this.tuning, this.stamina);
      if (foot && this.interaction.dribbleTouch(this, ball, norm(stick), foot, this.input.defend, intended, now)) return;
    }
    if (this.hasBall && !this.pending && !hasStick && this.speed < 1.8) {
      const rel = Math.hypot(ball.curr.velocity.x - this.vel.x, ball.curr.velocity.z - this.vel.z);
      if (rel > 0.6 && this.interaction.stopBall(this, ball, now)) return;
    }
    // Receive / intercept / block.
    if (this.pending) return;
    const mine = ball.lastTouchBy === this.id && now - ball.lastTouchTime < 0.45;
    if (mine) return;
    if (ball.lastTouchBy === this.id && this.hasBall) return;
    const foot = this.interaction.receive(this, ball, stick, this.input.defend, now);
    if (foot) this.sm.start('trap', { foot, force: true });
  }
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.z);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 };
}
