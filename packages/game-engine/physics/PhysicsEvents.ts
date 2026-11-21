// Typed physics and gameplay event stream. Systems push events during a
// fixed step; the debug panels, tests and gameplay read them afterwards.
// Every ball action can be traced: command requested → accepted → foot
// contact detected → impulse applied → ball released.

export type SurfaceKind = 'ground' | 'post' | 'crossbar' | 'net' | 'player' | 'wall';
export type FootSide = 'L' | 'R';

export type PossessionState =
  | 'FreeBall' | 'PossessionAcquired' | 'ControlledDribbling' | 'SprintDribbling' | 'TurningWithBall'
  | 'Passing' | 'Shooting' | 'BallReleased' | 'PossessionLost';

export type CommandPhase = 'requested' | 'accepted' | 'buffered' | 'rejected' | 'expired';
export type ImpulseSource = 'pass' | 'shot' | 'dribble' | 'stop' | 'control' | 'block' | 'skill' | 'tackle' | 'header';
export type TouchSurface = 'inside' | 'outside' | 'sole' | 'laces';
export type TouchKind = 'slow' | 'normal' | 'sprint' | 'directional' | 'stop';

export type PhysicsEvent =
  /** The ball hit a surface (turf, frame, net, a body). */
  | { type: 'SurfaceContact'; surface: SurfaceKind; speed: number; time: number; playerId?: string }
  /** Possession state machine transition. */
  | { type: 'BallPossession'; owner: string | null; state: PossessionState; prev: PossessionState; reason: string; time: number }
  /** A pass command moved through the pipeline. */
  | { type: 'PassCommand'; playerId: string; phase: CommandPhase; kind: string; power: number; reason?: string; time: number }
  /** A shot command moved through the pipeline. */
  | { type: 'ShotCommand'; playerId: string; phase: CommandPhase; kind: string; power: number; reason?: string; time: number }
  /** The kicking foot (or head) reached / missed the ball at the animation contact frame. */
  | { type: 'BallContact'; playerId: string; action: string; foot: FootSide; hit: boolean; gap: number; quality: number; time: number }
  /** An impulse was applied to the ball (the only way the ball's velocity changes besides physics). */
  | { type: 'BallImpulse'; playerId: string; source: ImpulseSource; kind: string; foot: FootSide; speed: number; impulse: number; footSpeed: number; quality: number; time: number }
  /** Possession ended because the ball was played. */
  | { type: 'BallRelease'; playerId: string; kind: string; time: number }
  /** A dribble touch (also emits BallImpulse). */
  | { type: 'DribbleTouch'; playerId: string; foot: FootSide; surface: TouchSurface; kind: TouchKind; speed: number; time: number }
  /** Tackle contact outcome. */
  | { type: 'TackleContact'; playerId: string; kind: 'standing' | 'sliding'; won: boolean; fouled: boolean; time: number }
  | { type: 'playerCollision'; a: string; b: string; impulse: number; time: number }
  | { type: 'balanceLost'; playerId: string; severity: number; time: number }
  | { type: 'footPlant'; playerId: string; foot: FootSide; time: number };

export class PhysicsEvents {
  private list: PhysicsEvent[] = [];
  /** Rolling history for debug display. */
  readonly history: PhysicsEvent[] = [];
  private listeners = new Set<(e: PhysicsEvent) => void>();

  emit(e: PhysicsEvent): void {
    this.list.push(e);
    this.history.push(e);
    if (this.history.length > 120) this.history.splice(0, this.history.length - 120);
    for (const l of this.listeners) l(e);
  }
  /** Events since the last drain. */
  drain(): PhysicsEvent[] {
    const out = this.list;
    this.list = [];
    return out;
  }
  on(fn: (e: PhysicsEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  clear(): void {
    this.list = [];
    this.history.length = 0;
  }
}
