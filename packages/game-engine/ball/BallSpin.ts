// Spin helpers: build world-space spin vectors from intuitive components
// relative to the direction of travel, and decompose them back for display.
import { cross3, dot3, len3, norm3, type Vec3 } from '../physics/Vec3.ts';
import type { SpinComponents } from './BallTypes.ts';

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Axis about which forward-rolling (topspin) happens for a travel direction. */
function topAxis(dir: Vec3): Vec3 {
  const h = norm3({ x: dir.x, y: 0, z: dir.z });
  // Rolling forward along h: ω = up × h (right-hand rule gives forward roll).
  return cross3(UP, h);
}

/**
 * World spin from components (rad/s).
 * top > 0: topspin (dips), < 0: backspin (floats).
 * side > 0: curls to the right of travel (as seen from behind).
 */
export function spinFromComponents(dir: Vec3, c: Partial<SpinComponents>): Vec3 {
  const ta = topAxis(dir);
  const top = c.top ?? 0, side = c.side ?? 0, gyro = c.gyro ?? 0;
  const h = norm3({ x: dir.x, y: 0, z: dir.z });
  // Magnus force ∝ ω × v. For a curl to the right, ω must point down (−y)
  // when v points forward: (−y) × forward = right.
  return {
    x: ta.x * top + h.x * gyro,
    y: -side,
    z: ta.z * top + h.z * gyro,
  };
}

export function decomposeSpin(dir: Vec3, w: Vec3): SpinComponents {
  if (len3(dir) < 1e-6) return { top: 0, side: -w.y, gyro: 0 };
  const ta = topAxis(dir);
  const h = norm3({ x: dir.x, y: 0, z: dir.z });
  return { top: dot3(w, ta), side: -w.y, gyro: dot3(w, h) };
}

/** Angular velocity for pure rolling at horizontal velocity v (no slip). */
export function rollingSpin(v: Vec3, radius: number): Vec3 {
  // ω = (up × v) / r
  const c = cross3(UP, { x: v.x, y: 0, z: v.z });
  return { x: c.x / radius, y: 0, z: c.z / radius };
}

/** How far the contact patch slips: 0 = pure rolling. */
export function slipSpeed(v: Vec3, w: Vec3, radius: number): number {
  // Contact point velocity = v + ω × (−r·up)
  const c = cross3(w, { x: 0, y: -radius, z: 0 });
  return Math.hypot(v.x + c.x, v.z + c.z);
}
