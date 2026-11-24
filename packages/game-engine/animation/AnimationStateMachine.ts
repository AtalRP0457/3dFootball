// Animation state machine. Locomotion states are chosen from the physics
// (actual speed, direction relative to the body, braking, turning); actions
// are one-shot clips with markers. Transitions crossfade so nothing snaps.
import type { ActionKind, Foot, MovementState } from '../player/PlayerTypes.ts';
import { ACTION_CLIPS, type ActionClip } from './ActionClips.ts';
import { crossedMarkers, type AnimEvent } from './AnimationEvents.ts';

/** Seconds after a kick's contact before the follow-through can be cut short. */
export const RECOVERY_SETTLE = 0.07;

export interface ActiveAction {
  clip: ActionClip;
  /** Seconds since start. */
  time: number;
  /** Kicking/working foot. */
  foot: Foot;
  /** Free data for the action (aim, power, kick kind …). */
  power: number;
  aim: { x: number; z: number };
  /** Exit side for skills chosen at start (+1 left, −1 right). */
  side: number;
  /** Already resolved contact (kicks hit once). */
  resolved: boolean;
  /** Playback rate: a harder strike has a longer back-swing (< 1), a tap a quicker one. */
  rate?: number;
}

export interface LocomotionInput {
  speed: number;
  /** Velocity in the body frame: forward and leftward components. */
  forward: number;
  left: number;
  braking: boolean;
  turning: boolean;
  yawRate: number;
  jockey: boolean;
  dribbling: boolean;
  sprintSpeed: number;
  runSpeed: number;
}

export class AnimationStateMachine {
  locomotion: MovementState = 'idle';
  action: ActiveAction | null = null;
  /** Seconds in the current locomotion state. */
  stateTime = 0;
  /** Crossfade progress for the action layer (0..1). */
  actionWeight = 0;

  get current(): string {
    return this.action ? this.action.clip.name : this.locomotion;
  }
  get busy(): boolean {
    return this.action !== null && !this.action.clip.interruptible && this.recovery === 0;
  }

  /**
   * 0 while an action is committed; then 0..1 through a kick's follow-through
   * once the ball has left the foot (plus a short settle). During recovery a
   * new action may start and movement control returns progressively, so a
   * player is never locked in a canned follow-through.
   */
  get recovery(): number {
    const a = this.action;
    if (!a || !a.resolved || !a.clip.recoverable) return 0;
    const c = a.clip.markers.find((m) => m.kind === 'contact');
    if (!c) return 0;
    const free = c.t * a.clip.duration + RECOVERY_SETTLE;
    if (a.time < free) return 0;
    return Math.min(1, (a.time - free) / Math.max(0.05, a.clip.duration - free));
  }

  start(name: ActionKind, opts: { foot: Foot; power?: number; aim?: { x: number; z: number }; side?: number; force?: boolean; rate?: number }): boolean {
    if (this.busy && !opts.force) return false;
    this.action = {
      clip: ACTION_CLIPS[name], time: 0, foot: opts.foot, power: opts.power ?? 0.5, rate: opts.rate ?? 1,
      aim: opts.aim ?? { x: 0, z: 1 }, side: opts.side ?? 1, resolved: false,
    };
    return true;
  }

  /** Normalised action time 0..1. */
  get actionT(): number {
    return this.action ? Math.min(1, this.action.time / this.action.clip.duration) : 0;
  }

  /**
   * Advance one fixed step. Returns animation events crossed this step
   * (contact frames, plants, end) for gameplay to act on.
   */
  update(dt: number, loco: LocomotionInput, now: number): AnimEvent[] {
    const events: AnimEvent[] = [];
    const next = this.pickLocomotion(loco);
    if (next !== this.locomotion) { this.locomotion = next; this.stateTime = 0; } else this.stateTime += dt;

    const a = this.action;
    if (a) {
      const t0 = a.time / a.clip.duration;
      a.time += dt * (a.rate ?? 1);
      const t1 = a.time / a.clip.duration;
      for (const m of crossedMarkers(a.clip.markers, t0, t1)) events.push({ kind: m.kind, action: a.clip.name, time: now });
      const c = a.clip;
      const inW = Math.min(1, a.time / Math.max(1e-3, c.blendIn));
      const outW = Math.min(1, (c.duration - a.time) / Math.max(1e-3, c.blendOut));
      this.actionWeight = Math.max(0, Math.min(inW, c.next ? 1 : outW));
      if (t1 >= 1) {
        const chain = c.next;
        this.action = null;
        this.actionWeight = 0;
        if (chain) this.start(chain, { foot: a.foot, force: true });
      }
    }
    return events;
  }

  private pickLocomotion(l: LocomotionInput): MovementState {
    if (l.jockey) return l.speed > 0.3 && l.forward < -0.4 ? 'backpedal' : 'jockey';
    if (l.speed < 0.25) return Math.abs(l.yawRate) > 1.2 ? 'turn' : 'idle';
    if (l.braking && l.speed > 3) return 'brake';
    if (l.forward < -0.5 && l.forward < -Math.abs(l.left)) return 'backpedal';
    if (Math.abs(l.left) > 0.6 && Math.abs(l.left) > Math.abs(l.forward)) return 'strafe';
    if (l.dribbling) return 'dribble';
    if (l.speed > l.runSpeed + 0.4) return 'sprint';
    if (l.speed > 3.9) return 'run';
    if (l.speed > 2.1) return 'jog';
    return 'walk';
  }
}
