// Passing lanes: can an opponent get to a ground pass on its way?
// Used by the human target choice and by the AI's pass selection, so both
// read a lane the same way (by timing, not by who stands near the line).
import type { MatchState, Vec2 } from '../../types/game.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Seconds from the decision to the ball leaving the foot (strike wind-up). */
const WINDUP = 0.2;

/**
 * How likely a ground pass from `from` to `to` is cut out: for each opponent,
 * the time the ball needs to pass the point of the lane nearest to him versus
 * the time he needs to react and get a foot there (reach ~0.9-1.2 m by his
 * interceptions rating). 0 = clear; each defender who gets there first adds
 * up to 1.
 */
export function laneRisk(state: MatchState, from: Vec2, to: Vec2, team: number): number {
  const vx = to.x - from.x, vz = to.z - from.z;
  const d = Math.hypot(vx, vz);
  if (d < 0.5) return 0;
  const total = state.engine ? state.engine.groundPassTime(d, 'ground') : d / 11;
  let risk = 0;
  for (const o of state.players) {
    if (o.team === team || !o.onPitch || o.sentOff) continue;
    // Where he will be when the ball leaves the foot (~0.2 s of wind-up):
    // a defender already stepping across the lane is in it.
    const ox = o.pos.x + o.vel.x * WINDUP, oz = o.pos.z + o.vel.z * WINDUP;
    const s = clamp(((ox - from.x) * vx + (oz - from.z) * vz) / (d * d), 0, 1);
    if (s <= 0 && Math.hypot(ox - from.x, oz - from.z) > 0.6) continue; // behind the passer
    const px = from.x + vx * s, pz = from.z + vz * s;
    const perp = Math.hypot(ox - px, oz - pz);
    if (perp > 6) continue;
    // The ball is quicker early on: it reaches fraction s of the lane a little before s of the time.
    const tBall = total * Math.pow(s, 1.15);
    const reach = 0.9 + (o.phys?.interceptions ?? 0.6) * 0.3;
    const tOpp = 0.25 + Math.max(0, perp - reach) / Math.max(4.5, (o.phys?.runSpeed ?? 6.5) * 0.85);
    // Standing in the path: the ball is struck into him (blocked), whatever the timing.
    if (perp < reach * 0.55) { risk += 1; continue; }
    if (tOpp < tBall) risk += clamp((tBall - tOpp) / 0.45, 0, 1);
  }
  return risk;
}
