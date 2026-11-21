// Player–player contact. Rapier keeps bodies from overlapping; this turns
// the contact into football consequences: an impulse estimate from the
// closing speed and masses, and a balance hit that depends on strength and
// balance (the weaker, less balanced, slower-braced player loses out).
import type { PhysicsEvents } from '../physics/PhysicsEvents.ts';
import type { Vec2 } from '../physics/Vec3.ts';

export interface CollisionBody {
  id: string;
  pos: Vec2;
  /** Velocity before this step's contact resolution. */
  velBefore: Vec2;
  radius: number;
  massKg: number;
  strength: number; // 0..1
  balanceSkill: number; // 0..1
  /** Bracing for contact (defensive stance, shielding). */
  braced: boolean;
  /** Receives balance damage (0..1 scale). */
  hit(severity: number, from: Vec2): void;
  setColliding(on: boolean): void;
}

export function resolvePlayerContacts(bodies: CollisionBody[], events: PhysicsEvents, time: number): void {
  for (const b of bodies) b.setColliding(false);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > a.radius + b.radius + 0.04 || d < 1e-6) continue;
      a.setColliding(true); b.setColliding(true);
      const nx = dx / d, nz = dz / d;
      // Closing speed along the contact normal (positive = approaching).
      const closing = (a.velBefore.x - b.velBefore.x) * nx + (a.velBefore.z - b.velBefore.z) * nz;
      if (closing <= 1.0) continue;
      const mu = (a.massKg * b.massKg) / (a.massKg + b.massKg);
      const impulse = mu * closing; // N·s
      events.emit({ type: 'playerCollision', a: a.id, b: b.id, impulse, time });
      const resist = (p: CollisionBody) => (0.55 + 0.6 * p.strength) * (0.6 + 0.6 * p.balanceSkill) * (p.braced ? 1.35 : 1) * (p.massKg / 75);
      const ra = resist(a), rb = resist(b);
      // Share of the hit: the less resistant player takes more.
      const base = impulse / 320;
      a.hit(base * (rb / (ra + rb)) * 1.6, b.pos);
      b.hit(base * (ra / (ra + rb)) * 1.6, a.pos);
    }
  }
}
