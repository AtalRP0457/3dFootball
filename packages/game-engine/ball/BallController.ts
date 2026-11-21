// Public face of the ball: one instance per match/lab. Owns the Rapier
// body, collision handling and interpolation snapshots. The ball is always
// a free physical object; players only ever act on it through impulses.
import type { PhysicsWorld } from '../physics/PhysicsWorld.ts';
import { BallPhysics, predictTrajectory } from './BallPhysics.ts';
import { BallCollision } from './BallCollision.ts';
import type { BallState, TrajectoryPoint } from './BallTypes.ts';
import type { Vec3 } from '../physics/Vec3.ts';

export class BallController {
  readonly physics: BallPhysics;
  readonly collision: BallCollision;
  /** State after the previous and the latest fixed step (render interpolation). */
  prev: BallState;
  curr: BallState;
  lastTouchBy: string | null = null;
  /** 'kick' (pass/shot/tackle: possession released) or 'touch' (dribble/control). */
  lastTouchKind: 'kick' | 'touch' = 'touch';
  /** Sim time of the last player touch. */
  lastTouchTime = -1;
  /** Recent positions for the trajectory trail. */
  readonly trail: Vec3[] = [];

  constructor(private readonly pw: PhysicsWorld, start: Vec3 = { x: 0, y: 0.11, z: 0 }) {
    this.physics = new BallPhysics(pw, start);
    this.collision = new BallCollision(pw, this.physics);
    this.curr = this.physics.snapshot(null, null);
    this.prev = this.curr;
  }

  /** Call after every fixed step. */
  capture(): void {
    this.prev = this.curr;
    const last = this.collision.last ? { surface: this.collision.last.surface, time: this.collision.last.time } : null;
    this.curr = this.physics.snapshot(last, this.lastTouchBy);
    const p = this.curr.position;
    const t = this.trail[this.trail.length - 1];
    if (!t || Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) > 0.25) {
      this.trail.push({ ...p });
      if (this.trail.length > 240) this.trail.shift();
    }
  }

  kick(velocity: Vec3, spin: Vec3, playerId: string, kind: 'kick' | 'touch' = 'kick'): void {
    this.physics.kick(velocity, spin);
    this.touched(playerId, kind);
  }
  impulse(j: Vec3, playerId: string): void {
    this.physics.impulse(j);
    this.touched(playerId, 'touch');
  }
  touched(playerId: string, kind: 'kick' | 'touch' = 'touch'): void {
    this.lastTouchBy = playerId;
    this.lastTouchTime = this.pw.time;
    this.lastTouchKind = kind;
  }

  reset(p: Vec3, v?: Vec3, w?: Vec3): void {
    this.physics.reset(p, v, w);
    this.trail.length = 0;
    this.curr = this.physics.snapshot(null, null);
    this.prev = this.curr;
  }

  predict(horizon = 4): TrajectoryPoint[] {
    const s = this.curr;
    return predictTrajectory(s.position, s.velocity, s.angularVelocity, this.pw.cal.ball, this.pw.cal.world.gravity, horizon);
  }
}
