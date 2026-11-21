// The Rapier world: turf, goal frames and nets, plus bookkeeping that maps
// collider handles to surfaces so collision events can be understood.
// One world is stepped with a fixed dt split into substeps; systems hook in
// before every substep (forces) and after every fixed step (gameplay).
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsCalibration } from './PhysicsConfig.ts';
import { PhysicsEvents, type SurfaceKind } from './PhysicsEvents.ts';

export { RAPIER };

let ready: Promise<void> | null = null;
/** Load the Rapier WASM module once (safe to call repeatedly). */
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export interface SurfaceInfo { kind: SurfaceKind; playerId?: string }
export type CollisionListener = (a: SurfaceInfo, b: SurfaceInfo, handleA: number, handleB: number) => void;

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly events = new PhysicsEvents();
  private readonly queue: RAPIER.EventQueue;
  private readonly surfaces = new Map<number, SurfaceInfo>();
  private readonly substepHooks: Array<(h: number) => void> = [];
  private readonly collisionListeners: CollisionListener[] = [];
  /** Simulated time (s). */
  time = 0;
  /** The turf collider (its material follows calibration changes). */
  groundCollider: RAPIER.Collider | null = null;

  constructor(public cal: PhysicsCalibration) {
    this.world = new RAPIER.World({ x: 0, y: -cal.world.gravity, z: 0 });
    this.queue = new RAPIER.EventQueue(true);
    this.buildGround();
    this.buildGoal(1);
    this.buildGoal(-1);
  }

  /** Register a collider so events can name what it is. */
  tag(collider: RAPIER.Collider, info: SurfaceInfo): void {
    this.surfaces.set(collider.handle, info);
  }
  surfaceOf(handle: number): SurfaceInfo | undefined {
    return this.surfaces.get(handle);
  }
  untag(collider: RAPIER.Collider): void {
    this.surfaces.delete(collider.handle);
  }
  onSubstep(fn: (h: number) => void): void {
    this.substepHooks.push(fn);
  }
  onCollision(fn: CollisionListener): void {
    this.collisionListeners.push(fn);
  }

  /** One fixed step of `dt`, split into the configured substeps. */
  step(dt: number): void {
    const n = Math.max(1, Math.round(this.cal.world.substeps));
    const h = dt / n;
    this.world.timestep = h;
    for (let i = 0; i < n; i++) {
      for (const hook of this.substepHooks) hook(h);
      this.world.step(this.queue);
      this.queue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const a = this.surfaces.get(h1), b = this.surfaces.get(h2);
        if (!a || !b) return;
        for (const l of this.collisionListeners) l(a, b, h1, h2);
      });
    }
    this.time += dt;
  }

  private buildGround(): void {
    const { ball } = this.cal;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(500, 0.5, 500)
        .setTranslation(0, -0.5, 0)
        .setRestitution(ball.groundRestitution)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setFriction(ball.groundFriction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    this.groundCollider = c;
    this.tag(c, { kind: 'ground' });
  }

  /** Goal at +z (side = 1) or −z (side = −1): posts, crossbar, net. */
  private buildGoal(side: 1 | -1): void {
    const { pitch, ball } = this.cal;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const lineZ = side * pitch.length / 2;
    const r = pitch.postRadius;
    const halfW = pitch.goalWidth / 2 + r;
    const frame = (desc: RAPIER.ColliderDesc, kind: SurfaceKind) => {
      desc.setRestitution(ball.postRestitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setFriction(0.3).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.tag(this.world.createCollider(desc, body), { kind });
    };
    for (const sx of [-1, 1]) {
      frame(RAPIER.ColliderDesc.cylinder(pitch.goalHeight / 2 + r, r).setTranslation(sx * halfW, (pitch.goalHeight + r) / 2, lineZ + side * r), 'post');
    }
    // Crossbar: cylinder along x (rotate the y-axis cylinder 90° about z).
    const q = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    frame(RAPIER.ColliderDesc.cylinder(halfW, r).setTranslation(0, pitch.goalHeight + r, lineZ + side * r).setRotation(q), 'crossbar');

    const net = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => {
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
        .setRestitution(ball.netRestitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setFriction(0.9).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.tag(this.world.createCollider(desc, body), { kind: 'net' });
    };
    const d = pitch.goalDepth, t = 0.02, H = pitch.goalHeight, W = pitch.goalWidth / 2;
    const backZ = lineZ + side * (d + 2 * r);
    net(W + 2 * r, H / 2, t, 0, H / 2, backZ + side * t);                         // back
    // Roof and sides start behind the frame so they never shadow the posts/bar.
    const nz = lineZ + side * (2 * r + d / 2 + 0.01);
    net(W + 2 * r, t, d / 2, 0, H + 2 * r - t, nz);                                // roof
    for (const sx of [-1, 1]) net(t, H / 2, d / 2, sx * (W + t), H / 2, nz);        // sides
  }

  dispose(): void {
    this.world.free();
    this.queue.free();
  }
}
