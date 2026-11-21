// Every way a player affects the ball. The ball is never attached or
// teleported: all effects are impulses applied at animation contact frames
// (kicks, skill touches, tackles) or at foot strikes (dribble touches), and
// only when the foot – located by forward kinematics of the current pose –
// actually reaches the ball.
import type { BallController } from '../ball/BallController.ts';
import { rollingSpin, spinFromComponents } from '../ball/BallSpin.ts';
import type { PhysicsEvents } from '../physics/PhysicsEvents.ts';
import { clamp, dirOf, headingOf, len3, type Vec2, type Vec3 } from '../physics/Vec3.ts';
import { footWorld, headWorld, type RigDims } from './PlayerRig.ts';
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
}

export interface KickParams { kind: KickKind; power: number; aim: Vec2; foot: Foot }

export interface KickOutcome { hit: boolean; quality: number; speed: number; distance: number }

/** Ball position in the player's body frame. */
export function ballLocal(a: InteractionActor, ball: Vec3): { fwd: number; left: number; up: number; dist: number } {
  const dx = ball.x - a.pos.x, dz = ball.z - a.pos.z;
  const f = dirOf(a.yaw);
  // Left of facing (+z) is +x, i.e. left = (f.z, −f.x).
  return { fwd: dx * f.x + dz * f.z, left: dx * f.z - dz * f.x, up: ball.y, dist: Math.hypot(dx, dz) };
}

/** Gaussian-ish deterministic noise from the actor's RNG. */
function noise(a: InteractionActor): number {
  return (a.rng() + a.rng() + a.rng() - 1.5) / 0.5;
}
const rot = (v: Vec2, ang: number): Vec2 => ({ x: v.x * Math.cos(ang) + v.z * Math.sin(ang), z: -v.x * Math.sin(ang) + v.z * Math.cos(ang) });
const D2R = Math.PI / 180;

/** Distance a rolling ball must be struck to travel `d` metres and arrive at `vEnd`. */
export function groundPassSpeed(d: number, vEnd: number, rollingResistance: number, g = 9.81): number {
  return Math.sqrt(2 * rollingResistance * g * d + vEnd * vEnd) * 1.04;
}

/** Spin fraction given on dribble touches (0 = pure skid, 1 = pure roll). */
const TOUCH_ROLL = 0.4;

/**
 * Relative gap between a touched ball and a player running at v: the ball
 * skids (friction μg) until it rolls, then slows by rolling resistance.
 * Returns the time until the player is back level with where the touch began.
 */
export function touchCatchTime(u0: number, v: number, mu: number, roll: number, rollFrac = TOUCH_ROLL, g = 9.81): { t: number; maxGap: number } {
  // Rolling speed reached after the skid for a thin-shell ball (I = 2/3 m r²).
  const ur = u0 * (1 + (2 / 3) * rollFrac) * 0.6;
  let u = u0, x = 0, t = 0, maxGap = 0;
  const dt = 0.01;
  while (t < 4) {
    const a = u > ur + 1e-3 ? mu * g : roll * g;
    u = Math.max(0, u - a * dt);
    x += (u - v) * dt;
    t += dt;
    if (x > maxGap) maxGap = x;
    if (x <= 0 && t > 0.05) return { t, maxGap };
  }
  return { t, maxGap };
}

export class PlayerBallInteraction {
  /** Foot used for the previous dribble touch (to alternate at close control). */
  private lastTouchFoot: Foot | null = null;

  constructor(private readonly events: PhysicsEvents, private readonly ballCfg: { radius: number; rollingResistance: number; groundFriction: number }) {}

  // ---------------------------------------------------------------- kicks
  /**
   * Resolve a kick at its contact frame. Returns whether the foot met the
   * ball; the impulse comes from foot speed, contact quality and attributes.
   */
  kick(a: InteractionActor, ball: BallController, k: KickParams, time: number): KickOutcome {
    const b = ball.curr.position;
    const header = k.kind === 'header';
    const contactPt = header ? headWorld(a.pose, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims) : footWorld(a.pose, k.foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
    const gap = Math.hypot(b.x - contactPt.x, b.y - contactPt.y, b.z - contactPt.z) - this.ballCfg.radius;
    const reach = header ? 0.35 : 0.34;
    if (gap > reach) return { hit: false, quality: 0, speed: 0, distance: gap };
    const t = a.tuning;
    // Contact quality: clean strike close to the foot, body square to the aim,
    // on balance, preferred foot, ball not too fast across the foot.
    const facing = dirOf(a.yaw);
    const aimAngle = Math.abs(Math.acos(clamp(facing.x * k.aim.x + facing.z * k.aim.z, -1, 1)));
    const relBall = Math.hypot(ball.curr.velocity.x - a.vel.x, ball.curr.velocity.z - a.vel.z);
    let q = 1 - clamp((gap - 0.04) / reach, 0, 1) * 0.6;
    q *= 1 - clamp((aimAngle - 50 * D2R) / (90 * D2R), 0, 0.45);
    q *= 0.7 + 0.3 * a.balance;
    q *= k.foot === a.preferredFoot ? 1 : 0.86;
    q *= 1 - clamp((relBall - 6) / 30, 0, 0.3);
    const passing = k.kind.endsWith('Pass') || k.kind === 'throughBall' || k.kind === 'cross';
    const skill = passing ? t.passSkill : header ? t.heading : (t.shotSkill + t.finishing) / 2;
    q = clamp(q * (0.82 + 0.18 * skill), 0.15, 1);

    const p = clamp(k.power, 0.05, 1);
    let speed = 10, elev = 0, top = 0, side = 0;
    const runSpeed = Math.hypot(a.vel.x, a.vel.z);
    switch (k.kind) {
      case 'shortPass': case 'firstTimePass': speed = groundPassSpeed(6 + 26 * p, 2.5, this.ballCfg.rollingResistance); break;
      case 'drivenPass': speed = 15 + 9 * p; elev = 3; top = 15; break;
      case 'throughBall': speed = groundPassSpeed(12 + 26 * p, 1.5, this.ballCfg.rollingResistance); break;
      case 'lobPass': speed = Math.sqrt((9.81 * (12 + 30 * p)) / Math.sin(2 * 38 * D2R)) * 1.08; elev = 38; top = -12; break;
      case 'longPass': speed = Math.sqrt((9.81 * (25 + 35 * p)) / Math.sin(2 * 27 * D2R)) * 1.12; elev = 27; top = -15; break;
      case 'cross': speed = Math.sqrt((9.81 * (18 + 25 * p)) / Math.sin(2 * 22 * D2R)) * 1.1; elev = 22; top = -10; side = k.foot === 'R' ? -30 : 30; break;
      case 'shot': speed = 19 + 10 * p * (0.8 + 0.2 * t.shotSkill); elev = 3 + 8 * p; top = 5; break;
      case 'powerShot': speed = 25 + 9 * p * (0.75 + 0.25 * t.shotSkill); elev = 5 + 9 * p; top = 8; break;
      case 'finesseShot': speed = 17 + 7 * p; elev = 6 + 5 * p; side = (k.foot === 'R' ? -1 : 1) * (38 + 18 * t.shotSkill); top = 4; break;
      case 'placedShot': speed = 15 + 6 * p; elev = 2 + 3 * p; break;
      case 'lowDrivenShot': speed = 22 + 8 * p; elev = 1.5; top = 28; break;
      case 'chipShot': speed = 11 + 6 * p; elev = 48; top = -32; break;
      case 'volley': speed = 19 + 10 * p; elev = 2 + 6 * p; top = 6; break;
      case 'halfVolley': speed = 21 + 9 * p; elev = 3 + 6 * p; top = 12; break;
      case 'header': speed = (8 + 9 * p) * (0.7 + 0.3 * t.heading) + len3(ball.curr.velocity) * 0.35; elev = -6 + 10 * p; break;
    }
    // Error: angular spread grows with poor contact, speed of run, power, fatigue.
    const shooting = !passing;
    const err = (0.8 + (1 - skill) * 5 + (1 - q) * 6 + (shooting ? p * 1.5 + runSpeed * 0.15 : 0)) * D2R;
    const dir = rot(k.aim, noise(a) * err);
    elev = elev + noise(a) * err / D2R * 0.5;
    const exit = speed * (0.72 + 0.28 * q);
    const ce = Math.cos(elev * D2R), se = Math.sin(elev * D2R);
    // Momentum of the run carries into the ball (partly).
    const carry = shooting ? 0.25 : 0.1;
    const vel: Vec3 = { x: dir.x * exit * ce + a.vel.x * carry, y: exit * se, z: dir.z * exit * ce + a.vel.z * carry };
    // Spin: from the kick type plus off-centre contact.
    const offCentre = (1 - q) * noise(a) * 25;
    let spin = spinFromComponents(vel, { top, side: side + offCentre });
    if (elev < 4 && (k.kind === 'shortPass' || k.kind === 'firstTimePass' || k.kind === 'throughBall')) {
      // Ground passes are struck through the centre: the ball rolls almost at once.
      const r = rollingSpin(vel, this.ballCfg.radius);
      spin = { x: r.x * 0.8 + spin.x * 0.2, y: spin.y, z: r.z * 0.8 + spin.z * 0.2 };
      vel.y = Math.min(vel.y, 0.8);
    }
    ball.kick(vel, spin, a.id);
    this.events.emit({ type: 'ballKick', playerId: a.id, kind: k.kind, speed: len3(vel), foot: k.foot, quality: q, time });
    return { hit: true, quality: q, speed: len3(vel), distance: gap };
  }

  // -------------------------------------------------------------- dribbling
  /**
   * Called when a foot strikes the ground while the player has the ball.
   * The other foot is swinging through: if the ball is at that foot, touch it
   * ahead along the stick direction. Touch length depends on speed and
   * dribbling; accuracy on ball control.
   */
  dribbleTouch(a: InteractionActor, ball: BallController, moveDir: Vec2, plantedFoot: Foot, shield: boolean, intendedSpeed: number, time: number): boolean {
    const b = ball.curr;
    if (b.position.y > 0.4) return false;
    const L = ballLocal(a, b.position);
    const speed = Math.hypot(a.vel.x, a.vel.z);
    // Swing foot = opposite the planted one; it passes ~0.3–0.9 m ahead.
    const swing: Foot = plantedFoot === 'L' ? 'R' : 'L';
    const trigger = 0.55 + speed * 0.06;
    if (L.fwd > trigger || L.fwd < -0.15 || Math.abs(L.left) > 0.55) return false;
    // Close control alternates feet: let a same-foot chance pass unless the ball is about to be overrun.
    if (speed < 6.2 && swing === this.lastTouchFoot && L.fwd > 0.3 && time - ball.lastTouchTime < 1.5) return false;
    const t = a.tuning;
    const dir = Math.hypot(moveDir.x, moveDir.z) > 0.1 ? moveDir : dirOf(a.yaw);
    const facing = dirOf(a.yaw);
    const turnAngle = Math.acos(clamp(dir.x * facing.x + dir.z * facing.z, -1, 1));
    // Size the touch for the speed the player is heading for, not just his current pace.
    const pace = Math.max(speed, Math.min(intendedSpeed, speed + 2.5));
    // Touch rhythm: time until the player is back on the ball. Faster running
    // means longer touches; better dribblers touch more often.
    let period = (0.42 + 0.09 * pace) * (1.12 - 0.25 * t.dribbleSkill);
    if (shield) period = 0.35;
    if (turnAngle > 70 * D2R) period = 0.4; // cut / drag: short touch
    const along = pace * Math.cos(Math.min(turnAngle, Math.PI / 2));
    // Solve the touch speed so the ball comes back to the feet after `period`.
    let lo = along, hi = along + 9;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (touchCatchTime(mid, along, this.ballCfg.groundFriction, this.ballCfg.rollingResistance).t < period) lo = mid; else hi = mid;
    }
    const u = Math.max(0.6, (lo + hi) / 2);
    const ahead = touchCatchTime(u, along, this.ballCfg.groundFriction, this.ballCfg.rollingResistance).maxGap;
    const err = ((1 - t.touchControl) * 6 + speed * 0.35 * (1 - t.dribbleSkill) + 0.5) * D2R;
    // Steer the ball back onto the player's line: aim at a point ahead on the
    // path rather than straight along the stick, cancelling lateral drift.
    const rel = { x: b.position.x - a.pos.x, z: b.position.z - a.pos.z };
    const along2 = rel.x * dir.x + rel.z * dir.z;
    const perp = { x: rel.x - dir.x * along2, z: rel.z - dir.z * along2 };
    const reachAhead = Math.max(1.2, ahead * 1.6 + 0.6);
    const aimV = { x: dir.x * reachAhead - perp.x, z: dir.z * reachAhead - perp.z };
    const al = Math.hypot(aimV.x, aimV.z) || 1;
    const d = rot({ x: aimV.x / al, z: aimV.z / al }, noise(a) * err);
    const vel: Vec3 = { x: d.x * u, y: 0, z: d.z * u };
    const rs = rollingSpin(vel, this.ballCfg.radius);
    ball.kick(vel, { x: rs.x * TOUCH_ROLL, y: 0, z: rs.z * TOUCH_ROLL }, a.id, 'touch');
    this.lastTouchFoot = swing;
    this.events.emit({ type: 'ballTouch', playerId: a.id, foot: swing, speed: u, time });
    return true;
  }

  /** Sole-stop: kill the ball's run when the player stops with it. */
  stopBall(a: InteractionActor, ball: BallController, time: number): boolean {
    const L = ballLocal(a, ball.curr.position);
    if (L.dist > 0.75 || ball.curr.position.y > 0.35 || L.fwd < -0.1) return false;
    const vel = { x: a.vel.x * 0.9, y: 0, z: a.vel.z * 0.9 };
    ball.kick(vel, rollingSpin(vel, this.ballCfg.radius), a.id, 'touch');
    this.events.emit({ type: 'ballTouch', playerId: a.id, foot: a.preferredFoot, speed: Math.hypot(vel.x, vel.z), time });
    return true;
  }

  // ----------------------------------------------------------- skill touches
  skillTouch(a: InteractionActor, ball: BallController, skill: ActionKind, which: 'touch' | 'touch2', exitSide: number, aim: Vec2, foot: Foot, time: number): boolean {
    const L = ballLocal(a, ball.curr.position);
    if (L.dist > 1.25 || ball.curr.position.y > 0.45) return false;
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
    }
    const err = ((1 - a.tuning.dribbleSkill) * 6 + 1) * D2R;
    const d = rot(dir, noise(a) * err);
    const vel: Vec3 = { x: d.x * u, y: 0, z: d.z * u };
    ball.kick(vel, rollingSpin(vel, this.ballCfg.radius), a.id, 'touch');
    this.events.emit({ type: 'ballTouch', playerId: a.id, foot, speed: u, time });
    return true;
  }

  // --------------------------------------------------------------- tackles
  /** Standing tackle: while the leg lunges, the foot pokes the ball if it reaches it. */
  standingTackle(a: InteractionActor, ball: BallController, foot: Foot, time: number): boolean {
    const f = footWorld(a.pose, foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
    const b = ball.curr.position;
    const gap = Math.hypot(b.x - f.x, b.y - f.y, b.z - f.z) - this.ballCfg.radius;
    const reach = 0.22 + 0.2 * a.tuning.tackleSkill;
    const won = gap <= reach;
    if (!won) return false;
    {
      const facing = dirOf(a.yaw);
      const d = rot(facing, noise(a) * (25 - 15 * a.tuning.tackleSkill) * D2R);
      const u = 3 + 3.5 * a.tuning.tackleSkill;
      const vel: Vec3 = { x: d.x * u + a.vel.x * 0.3, y: 0.4, z: d.z * u + a.vel.z * 0.3 };
      ball.kick(vel, rollingSpin(vel, this.ballCfg.radius), a.id);
    }
    this.events.emit({ type: 'tackle', playerId: a.id, kind: 'standing', won: true, time });
    return true;
  }

  /** Sliding tackle: the extended foot sweeps through the ball while sliding. */
  slidingSweep(a: InteractionActor, ball: BallController, foot: Foot, time: number): boolean {
    const f = footWorld(a.pose, foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
    const b = ball.curr.position;
    const gap = Math.hypot(b.x - f.x, b.y - f.y, b.z - f.z) - this.ballCfg.radius;
    if (gap > 0.3) return false;
    const facing = dirOf(a.yaw);
    const u = 5 + 4 * a.tuning.tackleSkill;
    const d = rot(facing, noise(a) * 20 * D2R);
    const vel: Vec3 = { x: d.x * u + a.vel.x * 0.4, y: 0.8, z: d.z * u + a.vel.z * 0.4 };
    ball.kick(vel, rollingSpin(vel, this.ballCfg.radius), a.id);
    this.events.emit({ type: 'tackle', playerId: a.id, kind: 'sliding', won: true, time });
    return true;
  }

  /** Where the tackling foot is (to test contact with an opponent's legs). */
  footPoint(a: InteractionActor, foot: Foot): Vec3 {
    return footWorld(a.pose, foot, { x: a.pos.x, y: 0, z: a.pos.z }, a.yaw, a.dims);
  }

  // ---------------------------------------------------- receiving / blocking
  /**
   * The ball arrives within reach of a player who is not busy: block a fast
   * low ball, otherwise control it with a cushioned first touch. Returns the
   * foot used, or null if out of reach.
   */
  receive(a: InteractionActor, ball: BallController, moveDir: Vec2, defending: boolean, time: number): Foot | null {
    const b = ball.curr;
    const L = ballLocal(a, b.position);
    const reach = a.tuning.interceptReach + (defending ? 0.25 : 0);
    if (L.dist > reach || b.position.y > 1.6) return null;
    const rel = { x: b.velocity.x - a.vel.x, z: b.velocity.z - a.vel.z };
    const relSpeed = Math.hypot(rel.x, rel.z);
    // Only when the ball is coming at us (or barely moving relative to us).
    const toward = -(rel.x * (b.position.x - a.pos.x) + rel.z * (b.position.z - a.pos.z)) / Math.max(L.dist, 1e-3);
    if (relSpeed > 1.2 && toward < 0.3) return null;
    const foot: Foot = L.left > 0 ? 'L' : 'R';
    const t = a.tuning;
    const speedAbs = len3(b.velocity);
    if (speedAbs > 15 && b.position.y < 1.2 && defending) {
      // Block: the ball deflects off the leg/body and loses most of its pace.
      const back = { x: -b.velocity.x * 0.25 + noise(a) * 2, y: Math.abs(b.velocity.y) * 0.3 + 0.5, z: -b.velocity.z * 0.25 + noise(a) * 2 };
      ball.kick(back, { x: 0, y: 0, z: 0 }, a.id, 'kick');
      this.events.emit({ type: 'ballTouch', playerId: a.id, foot, speed: len3(back), time });
      return foot;
    }
    // First touch: cushion to the player's pace, nudged towards the stick.
    const hard = clamp((relSpeed - 4) / 20, 0, 1) + clamp((b.position.y - 0.4) / 1.2, 0, 1) * 0.5;
    const err = (1 - t.touchControl) * (0.6 + hard) ;
    const dir = Math.hypot(moveDir.x, moveDir.z) > 0.1 ? moveDir : dirOf(a.yaw);
    const push = 0.5 + 0.6 * Math.hypot(moveDir.x, moveDir.z);
    const vel: Vec3 = {
      x: a.vel.x + dir.x * push + rel.x * err * 0.35 + noise(a) * err,
      y: Math.max(0, b.velocity.y * 0.15),
      z: a.vel.z + dir.z * push + rel.z * err * 0.35 + noise(a) * err,
    };
    ball.kick(vel, rollingSpin(vel, this.ballCfg.radius), a.id, 'touch');
    this.events.emit({ type: 'ballTouch', playerId: a.id, foot, speed: len3(vel), time });
    return foot;
  }

  /** Aim at the goal the player is attacking if it is in front of him. */
  static shotAim(a: InteractionActor, stick: Vec2, goalHalfLength: number, goalWidth: number): Vec2 {
    const facing = dirOf(a.yaw);
    const goalZ = facing.z >= 0 ? goalHalfLength : -goalHalfLength;
    const toGoal = { x: -a.pos.x, z: goalZ - a.pos.z };
    const dist = Math.hypot(toGoal.x, toGoal.z);
    const dirToGoal = { x: toGoal.x / dist, z: toGoal.z / dist };
    const inFront = facing.x * dirToGoal.x + facing.z * dirToGoal.z > 0.2 && dist < 45;
    if (!inFront) return Math.hypot(stick.x, stick.z) > 0.2 ? norm2(stick) : facing;
    // Stick left/right picks the corner (relative to the shooter's view).
    const leftAxis = { x: dirToGoal.z, z: -dirToGoal.x };
    const lateral = clamp(stick.x * leftAxis.x + stick.z * leftAxis.z, -1, 1);
    // Corner along the goal line, on the side the stick points (shooter's view).
    const target = { x: lateral * goalWidth * 0.38 * (leftAxis.x >= 0 ? 1 : -1), z: goalZ };
    const v = { x: target.x - a.pos.x, z: target.z - a.pos.z };
    return norm2(v);
  }
}

function norm2(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.z);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 1 };
}

export const headingTo = (from: Vec2, to: Vec2): number => headingOf(to.x - from.x, to.z - from.z);
