// Ball contact handling on top of Rapier's solver: names the surface, emits
// events, and lets the net absorb the ball (a soft net is not a rigid wall).
import type { PhysicsWorld, SurfaceInfo } from '../physics/PhysicsWorld.ts';
import type { SurfaceKind } from '../physics/PhysicsEvents.ts';
import type { BallPhysics } from './BallPhysics.ts';
import { len3 } from '../physics/Vec3.ts';

export interface BallContactLog { surface: SurfaceKind; time: number; speed: number; playerId?: string }

export class BallCollision {
  last: BallContactLog | null = null;
  readonly log: BallContactLog[] = [];

  constructor(private readonly pw: PhysicsWorld, private readonly ball: BallPhysics) {
    pw.onCollision((a, b, ha, hb) => {
      const self = ball.collider.handle;
      let other: SurfaceInfo | null = null;
      if (ha === self) other = b; else if (hb === self) other = a;
      if (!other) return;
      this.handle(other);
    });
  }

  private handle(other: SurfaceInfo): void {
    const speed = len3(this.ball.body.linvel());
    if (other.kind === 'net') this.ball.damp(this.pw.cal.ball.netDamping);
    const entry: BallContactLog = { surface: other.kind, time: this.pw.time, speed, playerId: other.playerId };
    // Rolling generates continuous ground contacts; only log real bounces.
    if (other.kind === 'ground' && speed < 0.6 && this.last?.surface === 'ground') return;
    this.last = entry;
    this.log.push(entry);
    if (this.log.length > 40) this.log.shift();
    this.pw.events.emit({ type: 'ballContact', surface: other.kind, speed, time: this.pw.time, playerId: other.playerId });
  }
}
