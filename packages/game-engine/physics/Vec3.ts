// Small allocation-light vector helpers shared by the engine. Rapier's
// vectors are plain {x, y, z} objects, so these interoperate directly.

export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const copy3 = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const lenH = (a: Vec3 | Vec2): number => Math.hypot(a.x, a.z);
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export function norm3(a: Vec3): Vec3 {
  const l = len3(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
}
export function normH(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.z);
  return l > 1e-9 ? { x: a.x / l, z: a.z / l } : { x: 0, z: 0 };
}
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** Signed shortest angle from a to b (rad). */
export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Heading (yaw) of a horizontal direction; 0 = +z, π/2 = +x. */
export const headingOf = (x: number, z: number): number => Math.atan2(x, z);
export const dirOf = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
