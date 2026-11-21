// The one player controller. Humans and AI both drive it with PlayerInput;
// every footballer differs only by attributes, body and appearance.
//
// Per fixed step:
//   1. read the Rapier body (velocity includes last step's contacts)
//   2. buttons → kick commands (via the central PlayerBallInteraction) /
//      instant actions; buffered kicks run the player onto the ball
//   3. momentum movement → body velocity (during a kick's wind-up the
//      interaction system positions the player so the foot meets the ball)
//   4. stride phase advanced by distance travelled → foot strikes
//   5. state machine → animation events; pose (IK) for this step
//   6. events and dribbling go to the interaction system, which queues
//      impulses; the Simulation applies them once per step (flush)
import { KICK_ACTIONS, SKILL_ACTIONS, ACTION_CLIPS } from '../animation/ActionClips.ts';
import { AnimationStateMachine } from '../animation/AnimationStateMachine.ts';
import { emptyPose } from '../animation/AnimationBlending.ts';
import { FootContact, gaitFor, type GaitParams } from '../animation/FootContact.ts';
import type { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import type { PitchConfig } from '../physics/PhysicsConfig.ts';
import { angleDiff, clamp, dirOf, headingOf, type Vec2 } from '../physics/Vec3.ts';
import type { BallController } from '../ball/BallController.ts';
import { REFERENCE_ATTRIBUTES, deriveTuning } from './PlayerAttributes.ts';
import { computePose } from './PlayerAnimation.ts';
import {
  PlayerBallInteraction, ballLocal, powerFromHold,
  type InteractionActor, type KickCommand, type KickPlan, type KickRequest,
} from './PlayerBallInteraction.ts';
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
const CHARGE_COMMAND: Record<ChargeKey, KickCommand> = { pass: 'pass', through: 'through', lob: 'lob', shoot: 'shot' };

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
  /** Accepted kick being executed (until its contact frame). */
  kick: KickPlan | null = null;
  /** Kick waiting for the ball to come within reach. */
  buffered: { req: KickRequest; since: number } | null = null;
  /** Charge start times (sim s) of held kick buttons. */
  private charges = new Map<ChargeKey, number>();
  /** Shot modifiers held at any point while the shot was charging. */
  private chargeMods = { finesse: false, lowDriven: false, chip: false, powerMod: false };
  /** Last released kick button: hold time and power (debug panel). */
  lastCharge: { key: ChargeKey; seconds: number; power: number } | null = null;
  private lastSetVel: Vec2 = { x: 0, z: 0 };
  private actionYaw0 = 0;
  private actionAim: Vec2 = { x: 0, z: 1 };
  private seed: number;
  /** Interpolation snapshots. */
  prev: PlayerSnapshot;
  curr: PlayerSnapshot;

  constructor(private readonly pw: PhysicsWorld, private readonly ix: PlayerBallInteraction, setup: PlayerSetup) {
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
  /** In possession (owned by the central interaction system). */
  get hasBall(): boolean { return this.ix.has(this.id); }
  // Lining up a kick with the ball at his feet: settle it (no stick-driven
  // touches), or the touches push it away and the foot never reaches it.
  stick(): Vec2 { return this.buffered && this.hasBall ? { x: 0, z: 0 } : this.input.move; }
  intendedSpeed(): number { return targetSpeedFor(this.input, this.tuning, this.stamina); }

  /** Simulate the movement model forward under the current input (dribble prediction). */
  predict(T: number): { pos: Vec2; dir: Vec2; speed: number } {
    let vel = { ...this.vel }, yaw = this.yaw, yawRate = this.yawRate, stamina = this.stamina;
    let x = this.pos.x, z = this.pos.z;
    const dt = 1 / 30;
    const mode = this.moveMode(null);
    for (let t = 0; t < T - 1e-6; t += dt) {
      const h = Math.min(dt, T - t);
      const r = stepMovement({ vel, yaw, yawRate, stamina }, this.input, this.tuning, mode, h);
      vel = r.vel; yaw = r.yaw; yawRate = r.yawRate; stamina = r.stamina;
      x += vel.x * h; z += vel.z * h;
    }
    const s = Math.hypot(vel.x, vel.z);
    return { pos: { x, z }, dir: s > 0.3 ? { x: vel.x / s, z: vel.z / s } : dirOf(yaw), speed: s };
  }

  // ------------------------------------------------------------------ step
  preStep(dt: number, ctx: StepContext): void {
    const ball = ctx.ball, now = ctx.time;
    this.prev = this.curr;
    this.pos = this.physics.position();
    this.vel = this.physics.velocity();
    const bl = ballLocal(this, ball.curr.position);

    this.handleButtons(ctx);
    let moveInput: PlayerInput = this.input;
    if (this.buffered) {
      // Run onto the ball until the kick can be accepted.
      const d = this.ix.requestKick(this, this.buffered.req, this.sm.busy, now, true);
      if (d.result === 'accepted') { this.buffered = null; this.startKick(d.plan); }
      else if (now - this.buffered.since > 1.2 || d.result === 'rejected') {
        const r = this.buffered.req;
        const reason = d.result === 'rejected' ? 'ball no longer available' : 'ball never came within reach';
        if (r.command === 'shot') this.pw.events.emit({ type: 'ShotCommand', playerId: this.id, phase: 'expired', kind: r.kind, power: r.power, reason, time: now });
        else this.pw.events.emit({ type: 'PassCommand', playerId: this.id, phase: 'expired', kind: r.kind, power: r.power, reason, time: now });
        this.buffered = null;
      } else {
        // Step to the spot that lines the kicking foot up with the ball.
        const r = this.buffered.req;
        const sp = this.ix.setupPoint(this, r.aim, r.kind, this.preferredFoot, 0.3);
        const to = { x: sp.x - this.pos.x, z: sp.z - this.pos.z };
        const l = Math.hypot(to.x, to.z) || 1;
        moveInput = { ...this.input, move: { x: to.x / l, z: to.z / l }, jog: false, walk: false, sprint: l > 2.5 };
      }
    }

    // In possession with the ball out of reach and the stick turning away:
    // go and collect it first (the directional touch then turns it).
    if (!this.buffered && !this.sm.action && this.hasBall) {
      const c = this.ix.collectDirection(this);
      if (c) {
        const mag = Math.max(Math.hypot(this.input.move.x, this.input.move.z), 1);
        const bs = Math.hypot(ball.curr.velocity.x, ball.curr.velocity.z);
        moveInput = { ...moveInput, move: { x: c.x * mag, z: c.z * mag }, sprint: moveInput.sprint || bs > this.tuning.runSpeed - 0.3, jog: false, walk: false };
      }
    }

    // ---- movement ----
    const a = this.sm.action;
    const defend = this.input.defend;
    const mode = this.moveMode(ctx);
    if (this.balance < 0.6) mode.control = (mode.control ?? 1) * clamp(this.balance / 0.6, 0.25, 1);
    const res = stepMovement({ vel: this.vel, yaw: this.yaw, yawRate: this.yawRate, stamina: this.stamina }, moveInput, this.tuning, mode, dt);
    this.vel = res.vel;
    this.yaw = res.yaw;
    this.yawRate = res.yawRate;
    this.stamina = res.stamina;
    this.accel = res.accel;
    // Kick wind-up: adjust the approach so the foot meets the ball at the contact frame.
    if (a && this.kick && KICK_ACTIONS.has(a.clip.name) && !a.resolved) {
      const c = a.clip.markers.find((m) => m.kind === 'contact')?.t ?? 0.55;
      const tLeft = c * a.clip.duration - a.time;
      if (tLeft > 0) {
        const s = this.ix.kickSetup(this, this.kick, tLeft);
        const k = Math.min(1, dt * 14);
        const nv = { x: this.vel.x + (s.vel.x - this.vel.x) * k, z: this.vel.z + (s.vel.z - this.vel.z) * k };
        this.accel = { x: (nv.x - this.vel.x) / dt, z: (nv.z - this.vel.z) / dt };
        this.vel = nv;
        const dy = angleDiff(this.yaw, s.yaw);
        this.yaw += clamp(dy, -11 * dt, 11 * dt);
      }
    }

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

    // ---- ball interaction (through the central system) ----
    for (const e of events) this.onAnimEvent(e.kind, a, ctx);
    this.continuous(ctx);
    this.balance = Math.min(1, this.balance + dt * (0.3 + 0.5 * this.tuning.balance));
    this.prevInput = { ...this.input, move: { ...this.input.move } };
  }

  /** Movement mode for the current action / stance. */
  private moveMode(ctx: StepContext | null): MoveMode {
    const a = this.sm.action;
    if (a) {
      const mode: MoveMode = { kind: a.clip.move, control: a.clip.control, speedCap: a.clip.speedCap };
      if (KICK_ACTIONS.has(a.clip.name)) mode.facing = headingOf(this.actionAim.x, this.actionAim.z);
      return mode;
    }
    if (this.input.defend && this.hasBall) return { kind: 'dribble', speedCap: 2.6, facing: ctx ? this.shieldYaw(ctx) : undefined };
    if (this.input.defend && ctx) {
      const b = ctx.ball.curr.position;
      const d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z);
      return { kind: 'jockey', facing: d < 30 ? headingOf(b.x - this.pos.x, b.z - this.pos.z) : this.yaw };
    }
    // With the ball, top speed drops a little (more for weaker dribblers).
    if (this.hasBall) return { kind: 'dribble', speedCap: this.tuning.sprintSpeed * (0.86 + 0.1 * this.tuning.dribbleSkill) };
    return { kind: 'normal' };
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
    const lose = () => { this.kick = null; this.buffered = null; };
    if (this.balance < 0.12) { this.sm.start('fall', { foot: 'R', force: true }); lose(); this.pw.events.emit({ type: 'balanceLost', playerId: this.id, severity, time: this.pw.time }); }
    else if (this.balance < 0.45 && name !== 'stumble') { this.sm.start('stumble', { foot: 'R', force: true }); lose(); this.pw.events.emit({ type: 'balanceLost', playerId: this.id, severity, time: this.pw.time }); }
  }

  teleport(p: Vec2, yaw = this.yaw): void {
    this.physics.teleport(p);
    this.pos = { ...p }; this.vel = { x: 0, z: 0 }; this.yaw = yaw; this.yawRate = 0;
    this.sm.action = null; this.kick = null; this.buffered = null; this.balance = 1;
    this.curr = this.snapshot(); this.prev = this.curr;
  }

  /**
   * Programmatic kick (AI / match rules): same pipeline as a button release.
   * Returns the decision ('accepted' starts the swing, 'buffered' runs onto
   * the ball first).
   */
  commandKick(req: KickRequest, now: number): 'accepted' | 'buffered' | 'rejected' {
    if (this.kick || this.buffered) return 'rejected';
    const d = this.ix.requestKick(this, req, this.sm.busy, now);
    if (d.result === 'accepted') this.startKick(d.plan);
    else if (d.result === 'buffered') this.buffered = { req, since: now };
    return d.result;
  }
  /** Programmatic tackle towards a heading (AI / match). */
  commandTackle(kind: 'standing' | 'sliding', yaw: number): boolean {
    if (this.sm.busy) return false;
    this.yaw = yaw;
    if (kind === 'sliding') {
      this.startAction('slidingTackle', this.preferredFoot);
      const f = dirOf(this.yaw), s = Math.max(this.speed, 5 + 2 * this.tuning.tackleSkill);
      this.vel = { x: f.x * s, z: f.z * s };
      this.physics.setVelocity(this.vel);
    } else this.startAction('standingTackle', this.preferredFoot);
    return true;
  }
  /** Is a kick in progress or waiting for the ball? */
  get kicking(): boolean { return !!(this.kick || this.buffered); }
  /** Drop any kick in progress (possession changed hands, restart). */
  cancelKick(): void { this.kick = null; this.buffered = null; }

  /** Charge level 0.25..1 for a held kick button (for the HUD), 0 when not held. */
  charge(k: ChargeKey, now: number): number {
    const s = this.charges.get(k);
    return s === undefined ? 0 : powerFromHold(now - s);
  }
  /** Seconds the button has been held (0 when not held). */
  holdTime(k: ChargeKey, now: number): number {
    const s = this.charges.get(k);
    return s === undefined ? 0 : now - s;
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
        const seconds = now - start;
        const power = powerFromHold(seconds);
        this.lastCharge = { key: k, seconds, power };
        this.command(k, power, ctx);
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

  /** Build a pass/shot command from the released button and hand it to the interaction system. */
  private command(k: ChargeKey, power: number, ctx: StepContext): void {
    const stick = this.input.move;
    const hasStick = Math.hypot(stick.x, stick.z) > 0.25;
    const facing = dirOf(this.yaw);
    let aim = hasStick ? norm(stick) : facing;
    let kind: KickKind;
    if (k === 'pass') kind = power > 0.8 ? 'drivenPass' : 'shortPass';
    else if (k === 'through') kind = 'throughBall';
    else if (k === 'lob') {
      const wide = Math.abs(this.pos.x) > ctx.pitch.width / 2 - 16 && Math.abs(this.pos.z) > ctx.pitch.length / 2 - 30;
      kind = wide ? 'cross' : power > 0.75 ? 'longPass' : 'lobPass';
      if (wide) aim = norm({ x: -this.pos.x * 0.85, z: Math.sign(this.pos.z) * (ctx.pitch.length / 2 - 9) - this.pos.z });
    } else {
      const m = this.chargeMods;
      kind = m.finesse ? 'finesseShot' : m.lowDriven ? 'lowDrivenShot' : m.chip ? 'chipShot' : m.powerMod ? 'powerShot' : 'shot';
      aim = PlayerBallInteraction.shotAim(this, stick, ctx.pitch.length / 2, ctx.pitch.goalWidth);
    }
    const req: KickRequest = { command: CHARGE_COMMAND[k], kind, power, aim };
    const d = this.ix.requestKick(this, req, this.sm.busy, ctx.time);
    if (d.result === 'accepted') this.startKick(d.plan);
    else if (d.result === 'buffered') this.buffered = { req, since: ctx.time };
  }

  private startKick(plan: KickPlan): void {
    this.kick = plan;
    this.actionAim = plan.aim;
    this.sm.start(plan.kind, { foot: plan.foot, power: plan.power, aim: plan.aim, force: true });
    this.actionYaw0 = this.yaw;
  }

  private startAction(kind: ActionKind, foot: Foot, power = 0.5, side = 1): void {
    if (this.sm.start(kind, { foot, power, aim: this.actionAim, side })) {
      this.actionYaw0 = this.yaw;
      if (!KICK_ACTIONS.has(kind)) this.kick = null;
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

  private onAnimEvent(kind: string, action: AnimationStateMachine['action'], ctx: StepContext): void {
    const now = ctx.time;
    const name = action?.clip.name ?? null;
    if (kind === 'contact' && this.kick && name === this.kick.kind && action) {
      action.resolved = true;
      this.ix.resolveKick(this, this.kick, now);
      this.kick = null;
      return;
    }
    if (kind === 'contact' && name === 'jump') {
      // Jumping header if the ball is at the head.
      const plan: KickPlan = { command: 'shot', kind: 'header', power: 0.6, aim: dirOf(this.yaw), foot: this.preferredFoot, contactLeft: 0, contactFwd: 0.2, firstTime: true };
      const b = ctx.ball.curr.position;
      if (b.y > 1.3 && Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < 1.2) this.ix.resolveKick(this, plan, now);
      return;
    }
    if ((kind === 'touch' || kind === 'touch2') && action && SKILL_ACTIONS.has(action.clip.name)) {
      this.ix.skillTouch(this, action.clip.name, kind, action.side, this.actionAim, action.foot, now);
    }
  }

  /** A tackle that misses the ball but catches the opponent's legs trips him. */
  private tripCheck(ctx: StepContext, foot: Foot, severity: number): boolean {
    const p = this.ix.footPoint(this, foot);
    let hit = false;
    for (const o of ctx.others) {
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < 0.42 && p.y < 0.7) { o.knock(severity); hit = true; }
    }
    return hit;
  }

  private continuous(ctx: StepContext): void {
    const a = this.sm.action, now = ctx.time;
    if (a && a.clip.name === 'slidingTackle') {
      const t = a.time / a.clip.duration;
      if (t > 0.1 && t < 0.8) {
        if (!a.resolved && this.ix.tackle(this, 'sliding', a.foot, now)) a.resolved = true;
        this.tripCheck(ctx, a.foot, a.resolved ? 0.5 : 1.2);
      }
      if (t >= 0.8 && !a.resolved) { a.resolved = true; this.ix.tackleMissed(this, 'sliding', false, now); }
      return;
    }
    if (a && a.clip.name === 'standingTackle') {
      const t = a.time / a.clip.duration;
      if (!a.resolved && t > 0.2 && t < 0.58 && this.ix.tackle(this, 'standing', a.foot, now)) a.resolved = true;
      if (!a.resolved && t >= 0.58) { a.resolved = true; this.ix.tackleMissed(this, 'standing', this.tripCheck(ctx, a.foot, 0.95), now); }
      return;
    }
    if (a && a.clip.interruptible === false) return;
    if (this.kick) return;
    // Lining up a kick keeps the ball under control (touches continue).
    if (this.hasBall) { this.ix.dribble(this, this.contact.struck, this.input.defend, now); return; }
    if (this.buffered) return;
    if (this.input.noBall) return;
    const foot = this.ix.receive(this, ctx.others, this.input.defend, now);
    if (foot) this.sm.start('trap', { foot, force: true });
  }
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.z);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 };
}
