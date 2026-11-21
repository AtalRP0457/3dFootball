// Typed physics event stream. Systems push events during a fixed step; the
// debug panels and gameplay logic read them afterwards.

export type SurfaceKind = 'ground' | 'post' | 'crossbar' | 'net' | 'player' | 'wall';

export type PhysicsEvent =
  | { type: 'ballContact'; surface: SurfaceKind; speed: number; time: number; playerId?: string }
  | { type: 'ballKick'; playerId: string; kind: string; speed: number; foot: 'L' | 'R'; quality: number; time: number }
  | { type: 'ballTouch'; playerId: string; foot: 'L' | 'R'; speed: number; time: number }
  | { type: 'playerCollision'; a: string; b: string; impulse: number; time: number }
  | { type: 'balanceLost'; playerId: string; severity: number; time: number }
  | { type: 'tackle'; playerId: string; kind: 'standing' | 'sliding'; won: boolean; time: number }
  | { type: 'footPlant'; playerId: string; foot: 'L' | 'R'; time: number };

export class PhysicsEvents {
  private list: PhysicsEvent[] = [];
  /** Rolling history for debug display. */
  readonly history: PhysicsEvent[] = [];
  private listeners = new Set<(e: PhysicsEvent) => void>();

  emit(e: PhysicsEvent): void {
    this.list.push(e);
    this.history.push(e);
    if (this.history.length > 80) this.history.splice(0, this.history.length - 80);
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
