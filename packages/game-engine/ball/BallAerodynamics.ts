// Aerodynamic forces on the ball: quadratic drag (with the drag crisis and
// spin-dependent drag), a calibrated Magnus lift, and the knuckling side
// force of a fast ball struck with almost no spin. Pure functions so the
// Rapier step and the trajectory predictor use exactly the same model (the
// knuckle force is the one exception: it is unpredictable by nature, so the
// predictor, and therefore the keeper, does not see it).
import type { BallConfig } from '../physics/PhysicsConfig.ts';
import { ballArea } from '../physics/PhysicsConfig.ts';
import { cross3, len3, scale3, type Vec3 } from '../physics/Vec3.ts';

/**
 * Drag coefficient. In flight a ball below the drag crisis (~11 m/s) has a
 * laminar boundary layer that separates early: ~1.7x the drag of a ball
 * struck hard (Goff, Physics Today 2010; Asai/Hong wind-tunnel data). Spin
 * thickens the wake a little: Cd grows with the spin parameter S = rω/|v|.
 * On the ground the rolling model was calibrated with the supercritical
 * value, so the crisis is applied only in the air.
 */
export function dragCoefficientAt(speed: number, spin: number, cfg: BallConfig, airborne = true): number {
  const hi = cfg.dragCoefficient;
  if (!airborne) return hi;
  const lo = cfg.dragCoefficientSubcritical ?? hi;
  const vc = cfg.dragCrisisSpeed ?? 11;
  // Smooth step over ~±2.5 m/s around the crisis speed.
  const x = Math.max(0, Math.min(1, (speed - (vc - 2.5)) / 5));
  const smooth = x * x * (3 - 2 * x);
  const S = speed > 1e-3 ? Math.min(0.5, (cfg.radius * spin) / speed) : 0;
  return lo + (hi - lo) * smooth + 0.1 * S;
}

/** F = -½ ρ Cd A |v| v */
export function dragForce(v: Vec3, cfg: BallConfig, spin = 0, airborne = false): Vec3 {
  const speed = len3(v);
  if (speed < 1e-6) return { x: 0, y: 0, z: 0 };
  const k = -0.5 * cfg.airDensity * dragCoefficientAt(speed, spin, cfg, airborne) * ballArea(cfg) * speed;
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

/** Total aerodynamic force (N). `airborne` switches on the drag crisis. */
export function aeroForce(v: Vec3, w: Vec3, cfg: BallConfig, airborne = false): Vec3 {
  const d = dragForce(v, cfg, len3(w), airborne), m = magnusForce(v, w, cfg);
  return { x: d.x + m.x, y: d.y + m.y, z: d.z + m.z };
}

/**
 * Knuckling: a ball with almost no spin at shooting pace sheds an unstable,
 * asymmetric wake and is pushed about irregularly (Hong & Asai: side-force
 * coefficient swings of ~±0.05-0.1, wavelengths of a few metres, strongest
 * near the drag crisis and fading with spin). `s` is the distance flown since
 * the strike, `phase` the random phases chosen at the strike.
 * Returns the force (N) perpendicular to the flight.
 */
export function knuckleForce(v: Vec3, w: Vec3, cfg: BallConfig, s: number, phase: [number, number, number]): Vec3 {
  const speed = len3(v);
  const spin = len3(w);
  const limit = cfg.knuckleSpin ?? 0;
  if (!limit || speed < 14 || spin >= limit) return { x: 0, y: 0, z: 0 };
  // Strength: fades in from 14 m/s, full by 20, and with spin.
  const pace = Math.min(1, (speed - 14) / 6);
  const amp = (cfg.knuckleStrength ?? 0.075) * pace * (1 - spin / limit);
  // Two irregular components across the flight: sideways and up/down.
  const TAU = Math.PI * 2;
  const cs = amp * (Math.sin((TAU * s) / 5.5 + phase[0]) * 0.7 + Math.sin((TAU * s) / 2.9 + phase[1]) * 0.3);
  const cl = amp * 0.6 * Math.sin((TAU * s) / 4.3 + phase[2]);
  const q = 0.5 * cfg.airDensity * ballArea(cfg) * speed * speed;
  // Unit vectors perpendicular to v: horizontal side and "up" in the flight frame.
  const h = Math.hypot(v.x, v.z);
  if (h < 1e-3) return { x: 0, y: 0, z: 0 };
  const side = { x: -v.z / h, y: 0, z: v.x / h };
  const up = cross3(scale3(v, 1 / speed), side); // perpendicular to both
  return { x: q * (side.x * cs + up.x * cl), y: q * (side.y * cs + up.y * cl), z: q * (side.z * cs + up.z * cl) };
}
