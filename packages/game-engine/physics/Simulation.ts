// One simulation = one Rapier world, one ball, any number of players, all
// stepped at a fixed rate. Order per fixed step:
//   inputs → players (movement, animation, ball impulses) → Rapier substeps
//   (ball forces each substep) → capture snapshots → player contacts.
// The lab, the tests and (later) the match all use this class, so there is
// exactly one physics implementation for everybody.
import { BallController } from '../ball/BallController.ts';
import { PlayerController, type PlayerSetup } from '../player/PlayerController.ts';
import { PlayerBallInteraction } from '../player/PlayerBallInteraction.ts';
import { resolvePlayerContacts } from '../player/PlayerCollision.ts';
import { createCalibration, type PhysicsCalibration } from './PhysicsConfig.ts';
import { FixedTimestep, type StepResult } from './FixedTimestep.ts';
import { initPhysics, PhysicsWorld } from './PhysicsWorld.ts';

export class Simulation {
  readonly pw: PhysicsWorld;
  readonly ball: BallController;
  /** The one authority over player–ball interaction and possession. */
  readonly interaction: PlayerBallInteraction;
  readonly players: PlayerController[] = [];
  readonly clock: FixedTimestep;
  /** Called before every fixed step (set AI/human inputs here). */
  beforeStep: ((dt: number, sim: Simulation) => void) | null = null;

  static async create(cal: PhysicsCalibration = createCalibration()): Promise<Simulation> {
    await initPhysics();
    return new Simulation(cal);
  }

  /** Use Simulation.create() unless Rapier is already initialised. */
  constructor(readonly cal: PhysicsCalibration) {
    this.pw = new PhysicsWorld(cal);
    this.ball = new BallController(this.pw, { x: 0, y: cal.ball.radius, z: 0 });
    this.interaction = new PlayerBallInteraction(this.pw.events, this.ball, cal);
    this.clock = new FixedTimestep(cal.world.fixedDt, cal.world.maxStepsPerFrame);
  }

  get time(): number { return this.pw.time; }

  addPlayer(setup: PlayerSetup): PlayerController {
    const p = new PlayerController(this.pw, this.interaction, setup);
    this.players.push(p);
    return p;
  }
  removePlayer(id: string): void {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players[i].physics.dispose();
    this.players.splice(i, 1);
  }

  /** Exactly one fixed step. */
  step(dt: number = this.cal.world.fixedDt): void {
    this.beforeStep?.(dt, this);
    const time = this.pw.time;
    for (const p of this.players) {
      p.preStep(dt, { ball: this.ball, others: this.players.filter((o) => o !== p), time, pitch: this.cal.pitch });
    }
    // Exactly one impulse per step reaches the ball (highest priority wins).
    this.interaction.flush(time);
    this.pw.step(dt);
    this.ball.capture();
    for (const p of this.players) p.postStep();
    this.interaction.postStep(this.players, this.pw.time);
    resolvePlayerContacts(this.players.map((p) => p.collisionBody()), this.pw.events, this.pw.time);
  }

  /** Development tools: put the ball at a player's feet and give him possession. */
  giveBall(p: PlayerController, ahead = 0.6): void {
    const f = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    this.ball.reset({ x: p.pos.x + f.x * ahead, y: this.cal.ball.radius, z: p.pos.z + f.z * ahead });
    this.ball.touched(p.id, 'touch');
    this.interaction.grant(p.id, this.time);
  }
  /** Match rules: the ball is held by a player at a spot (set piece, keeper's hands). */
  holdBall(p: PlayerController, pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): void {
    this.ball.reset(pos, vel);
    this.ball.touched(p.id, 'touch');
    this.interaction.holdBy(p.id, this.time);
  }
  /** Development tools: place the ball (free) with a velocity and spin. */
  placeBall(pos: { x: number; y: number; z: number }, v?: { x: number; y: number; z: number }, w?: { x: number; y: number; z: number }): void {
    this.ball.reset(pos, v, w);
    this.ball.lastTouchBy = null;
    this.interaction.reset(this.time);
  }

  /** Push edited calibration into Rapier materials (forces read it live). */
  refreshMaterials(): void {
    const b = this.cal.ball;
    this.ball.physics.collider.setRestitution(b.groundRestitution);
    this.ball.physics.collider.setFriction(b.groundFriction);
    this.pw.groundCollider?.setRestitution(b.groundRestitution);
    this.pw.groundCollider?.setFriction(b.groundFriction);
  }

  /** Advance by a rendered frame's duration; returns interpolation alpha. */
  advance(frameDt: number): StepResult {
    return this.clock.advance(frameDt, (dt) => this.step(dt));
  }

  dispose(): void {
    this.pw.dispose();
  }
}
