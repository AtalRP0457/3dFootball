// A footballer's body in Rapier: a 75 kg capsule (legs to head) that cannot
// tip over or leave the ground plane. Movement sets its velocity each fixed
// step from the momentum model; Rapier resolves contacts with other players
// and the ball, and the resulting velocity feeds back into the next step.
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld.ts';
import type { Vec2 } from '../physics/Vec3.ts';

/** Capsule from 0.2 m (shins) to head height. */
export const BODY_BOTTOM = 0.2;

export class PlayerPhysics {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly radius: number;
  readonly centerY: number;

  constructor(private readonly pw: PhysicsWorld, readonly id: string, start: Vec2, massKg: number, heightM: number, radius = 0.26) {
    this.radius = radius;
    const length = heightM + 0.05 - BODY_BOTTOM;
    const half = Math.max(0.05, length / 2 - radius);
    this.centerY = BODY_BOTTOM + length / 2;
    this.body = pw.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, this.centerY, start.z)
        .lockRotations().enabledTranslations(true, false, true).setGravityScale(0)
        .setLinearDamping(0).setCanSleep(false),
    );
    this.collider = pw.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, radius).setMass(massKg)
        .setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    pw.tag(this.collider, { kind: 'player', playerId: id });
  }

  position(): Vec2 { const t = this.body.translation(); return { x: t.x, z: t.z }; }
  velocity(): Vec2 { const v = this.body.linvel(); return { x: v.x, z: v.z }; }
  setVelocity(v: Vec2): void { this.body.setLinvel({ x: v.x, y: 0, z: v.z }, true); }
  teleport(p: Vec2): void {
    this.body.setTranslation({ x: p.x, y: this.centerY, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  dispose(): void {
    this.pw.untag(this.collider);
    this.pw.world.removeRigidBody(this.body);
  }
}
