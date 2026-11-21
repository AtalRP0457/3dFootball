// The football as a Rapier rigid body plus the forces Rapier does not model:
// aerodynamic drag, Magnus lift, spin decay in flight, rolling resistance on
// grass and bounce settling. Contact (bounce, friction, slide → roll) is
// solved by Rapier itself. Also a matching analytic trajectory predictor for
// visualisation and AI.
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { ballInertia, type BallConfig } from '../physics/PhysicsConfig.ts';
import { aeroForce } from './BallAerodynamics.ts';
import { add3, cross3, lenH, scale3, type Vec3 } from '../physics/Vec3.ts';
import type { BallState, TrajectoryPoint } from './BallTypes.ts';

export class BallPhysics {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  grounded = false;

  constructor(private readonly pw: PhysicsWorld, start: Vec3) {
    const cfg = pw.cal.ball;
    this.body = pw.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true)
        .setLinearDamping(0).setAngularDamping(0).setCanSleep(false),
    );
    const I = ballInertia(cfg);
    this.collider = pw.world.createCollider(
      RAPIER.ColliderDesc.ball(cfg.radius)
        .setMassProperties(cfg.mass, { x: 0, y: 0, z: 0 }, { x: I, y: I, z: I }, { x: 0, y: 0, z: 0, w: 1 })
        .setRestitution(cfg.groundRestitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setFriction(cfg.groundFriction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    pw.tag(this.collider, { kind: 'wall' });
    pw.onSubstep((h) => this.applyForces(h));
  }

  get cfg(): BallConfig { return this.pw.cal.ball; }

  /** Forces for one substep. Forces persist in Rapier, so reset first. */
  private applyForces(h: number): void {
    const b = this.body, cfg = this.cfg;
    b.resetForces(false);
    b.resetTorques(false);
    const v = b.linvel(), w = b.angvel(), p = b.translation();
    this.grounded = p.y - cfg.radius < 0.012;
    const F = aeroForce(v, w, cfg);
    b.addForce(F, true);
    const I = ballInertia(cfg);
    if (!this.grounded) {
      // Spin decays slowly in flight (skin friction torque).
      b.addTorque(scale3(w, -I / cfg.spinDecayTime), true);
      return;
    }
    // Settle tiny bounces so the ball comes to rest without vibrating.
    if (Math.abs(v.y) < cfg.settleSpeed && v.y !== 0) b.setLinvel({ x: v.x, y: 0, z: v.z }, true);
    const speed = lenH(v);
    if (speed > 0.04) {
      // Rolling resistance: grass deformation opposes motion (decel = c·g).
      const f = -cfg.rollingResistance * cfg.mass * this.pw.cal.world.gravity / speed;
      b.addForce({ x: v.x * f, y: 0, z: v.z * f }, true);
      // Matching torque keeps the roll consistent with the slowing ball.
      const rollAxis = cross3({ x: 0, y: 1, z: 0 }, { x: v.x / speed, y: 0, z: v.z / speed });
      b.addTorque(scale3(rollAxis, -cfg.rollingResistance * cfg.mass * this.pw.cal.world.gravity * cfg.radius * 0.4), true);
      // Spin about the vertical axis bleeds off quickly on grass.
      if (Math.abs(w.y) > 0.01) b.setAngvel({ x: w.x, y: w.y * Math.exp(-h * 3), z: w.z }, true);
    } else if (Math.abs(v.y) < 0.05) {
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Apply a kick as an impulse that produces `velocity` and an angular impulse for `spin`. */
  kick(velocity: Vec3, spin: Vec3): void {
    const cfg = this.cfg, v = this.body.linvel(), w = this.body.angvel();
    this.body.applyImpulse({ x: cfg.mass * (velocity.x - v.x), y: cfg.mass * (velocity.y - v.y), z: cfg.mass * (velocity.z - v.z) }, true);
    const I = ballInertia(cfg);
    this.body.applyTorqueImpulse({ x: I * (spin.x - w.x), y: I * (spin.y - w.y), z: I * (spin.z - w.z) }, true);
  }
  /** Add an impulse (N·s) at the centre. */
  impulse(j: Vec3): void { this.body.applyImpulse(j, true); }

  reset(p: Vec3, v: Vec3 = { x: 0, y: 0, z: 0 }, w: Vec3 = { x: 0, y: 0, z: 0 }): void {
    this.body.setTranslation(p, true);
    this.body.setLinvel(v, true);
    this.body.setAngvel(w, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
  /** Scale linear and angular velocity (net absorption, cushioning). */
  damp(k: number): void {
    const v = this.body.linvel(), w = this.body.angvel();
    this.body.setLinvel(scale3(v, k), true);
    this.body.setAngvel(scale3(w, k), true);
  }

  snapshot(lastContact: BallState['lastContact'], lastTouchBy: string | null): BallState {
    const p = this.body.translation(), v = this.body.linvel(), w = this.body.angvel(), r = this.body.rotation();
    return {
      position: { x: p.x, y: p.y, z: p.z }, velocity: { x: v.x, y: v.y, z: v.z }, angularVelocity: { x: w.x, y: w.y, z: w.z },
      rotation: { x: r.x, y: r.y, z: r.z, w: r.w }, grounded: this.grounded, lastContact, lastTouchBy,
    };
  }

  dispose(): void {
    this.pw.untag(this.collider);
    this.pw.world.removeRigidBody(this.body);
  }
}

/**
 * Predict the flight with the same aerodynamic model (ground bounces and
 * rolling approximated, no goal frame). Used for trajectory display and AI.
 */
export function predictTrajectory(p0: Vec3, v0: Vec3, w0: Vec3, cfg: BallConfig, gravity: number, horizon = 4, dt = 1 / 120): TrajectoryPoint[] {
  let p = { ...p0 }, v = { ...v0 }, w = { ...w0 };
  const out: TrajectoryPoint[] = [{ t: 0, p: { ...p }, v: { ...v } }];
  for (let t = dt, i = 1; t <= horizon; t += dt, i++) {
    const grounded = p.y - cfg.radius < 0.012 && Math.abs(v.y) < cfg.settleSpeed;
    const F = aeroForce(v, w, cfg);
    const a = { x: F.x / cfg.mass, y: F.y / cfg.mass - gravity, z: F.z / cfg.mass };
    if (grounded) {
      a.y = 0; v.y = 0;
      const s = lenH(v);
      if (s < 0.04) break;
      a.x -= (cfg.rollingResistance * gravity * v.x) / s;
      a.z -= (cfg.rollingResistance * gravity * v.z) / s;
    } else {
      w = scale3(w, Math.exp(-dt / cfg.spinDecayTime));
    }
    v = add3(v, scale3(a, dt));
    p = add3(p, scale3(v, dt));
    if (p.y < cfg.radius) {
      p.y = cfg.radius;
      if (v.y < 0) {
        v.y = -v.y * cfg.groundRestitution;
        // Friction on bounce pushes towards rolling (keeps ~ 5/7 of the slip).
        const keep = 1 - Math.min(0.35, cfg.groundFriction * 0.5);
        v.x *= keep; v.z *= keep;
      }
    }
    if (i % 3 === 0) out.push({ t, p: { ...p }, v: { ...v } });
  }
  return out;
}
