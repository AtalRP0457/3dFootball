// Aerodynamic forces on the ball: quadratic drag and a calibrated Magnus
// lift. Pure functions so the Rapier step and the trajectory predictor use
// exactly the same model.
import type { BallConfig } from '../physics/PhysicsConfig.ts';
import { ballArea } from '../physics/PhysicsConfig.ts';
import { cross3, len3, scale3, type Vec3 } from '../physics/Vec3.ts';

/** F = -½ ρ Cd A |v| v */
export function dragForce(v: Vec3, cfg: BallConfig): Vec3 {
  const speed = len3(v);
  if (speed < 1e-6) return { x: 0, y: 0, z: 0 };
  const k = -0.5 * cfg.airDensity * cfg.dragCoefficient * ballArea(cfg) * speed;
  return scale3(v, k);
}

/**
 * Lift coefficient from spin parameter S = rω/|v|. Saturating fit to
 * wind-tunnel data for soccer balls (≈0.15 at S 0.2, levels near 0.35).
 */
export function liftCoefficient(S: number): number {
  if (S <= 0) return 0;
  return Math.min(0.35, 1 / (2.02 + 0.98 / S));
}

/** F = ½ ρ A Cl |v|² · unit(ω × v) */
export function magnusForce(v: Vec3, w: Vec3, cfg: BallConfig): Vec3 {
  const speed = len3(v);
  const spin = len3(w);
  if (speed < 0.5 || spin < 0.5) return { x: 0, y: 0, z: 0 };
  const c = cross3(w, v);
  const cl = len3(c);
  if (cl < 1e-6) return { x: 0, y: 0, z: 0 };
  const S = (cfg.radius * spin) / speed;
  const mag = 0.5 * cfg.airDensity * ballArea(cfg) * liftCoefficient(S) * speed * speed * cfg.magnusScale;
  return scale3(c, mag / cl);
}

/** Total aerodynamic force (N). */
export function aeroForce(v: Vec3, w: Vec3, cfg: BallConfig): Vec3 {
  const d = dragForce(v, cfg), m = magnusForce(v, w, cfg);
  return { x: d.x + m.x, y: d.y + m.y, z: d.z + m.z };
}
