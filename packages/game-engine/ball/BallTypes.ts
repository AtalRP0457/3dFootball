import type { Vec3 } from '../physics/Vec3.ts';
import type { SurfaceKind } from '../physics/PhysicsEvents.ts';

/** Snapshot of the ball after a fixed step (also used for interpolation). */
export interface BallState {
  position: Vec3;
  velocity: Vec3;
  /** Angular velocity (rad/s), world frame. */
  angularVelocity: Vec3;
  /** Orientation quaternion. */
  rotation: { x: number; y: number; z: number; w: number };
  /** Touching the turf this step. */
  grounded: boolean;
  /** Surface touched most recently and when (sim time). */
  lastContact: { surface: SurfaceKind; time: number } | null;
  /** Player who last touched it. */
  lastTouchBy: string | null;
}

/** Decomposed spin for display / kicks (rad/s). */
export interface SpinComponents {
  /** + topspin (forward rotation about the travel axis' left). */
  top: number;
  /** + spin that curves the ball to the right of travel. */
  side: number;
  /** Rotation about the travel axis (gyro). */
  gyro: number;
}

export interface KickRequest {
  /** Launch velocity (m/s). */
  velocity: Vec3;
  /** Spin to impart (rad/s, world frame). */
  spin: Vec3;
  playerId: string;
}

export interface TrajectoryPoint { t: number; p: Vec3; v: Vec3 }
