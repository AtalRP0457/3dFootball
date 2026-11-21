// Attribute → physics mapping. This is the only place ratings turn into
// numbers, so every player (human, AI, any team) shares one model:
//
//   pace, sprintSpeed  → top running and sprint speed
//   acceleration       → initial acceleration (time to top speed)
//   agility            → lateral grip (turning radius) and yaw rate
//   balance            → resistance to stumbling, recovery speed
//   strength           → collision impulses, shielding
//   stamina            → drain/recovery rate (fatigue lowers speed, accel)
//   ballControl        → first touch, touch accuracy
//   dribbling          → touch length/frequency at speed, skill move speed
//   passing            → pass accuracy, contact quality
//   shooting, finishing→ shot power and accuracy
//   defensiveAwareness, tackling, interceptions → tackle reach/timing, interception reach
//   jumping, heading   → jump height, header power/accuracy
import { PHYSICS_DEFAULTS, type PlayerConfig } from '../physics/PhysicsConfig.ts';
import type { PlayerAttributes, PlayerTuning } from './PlayerTypes.ts';

const u = (r: number): number => Math.max(0, Math.min(1, (r - 40) / 59)); // 40 → 0, 99 → 1
const mix = (range: [number, number], t: number): number => range[0] + (range[1] - range[0]) * t;

/** The reference footballer: an elite, balanced attacking midfielder. */
export const REFERENCE_ATTRIBUTES: Readonly<PlayerAttributes> = Object.freeze({
  overall: 88, pace: 87, acceleration: 89, sprintSpeed: 86, agility: 90, balance: 88, strength: 72, stamina: 84,
  ballControl: 92, dribbling: 91, passing: 88, shooting: 87, finishing: 86, defensiveAwareness: 62, tackling: 64,
  interceptions: 60, jumping: 74, heading: 70,
});

export function deriveTuning(a: PlayerAttributes, cfg: PlayerConfig = PHYSICS_DEFAULTS.player, body = { massKg: cfg.massKg, heightM: cfg.heightM }): PlayerTuning {
  const pace = u((a.pace + a.sprintSpeed) / 2);
  const tt = mix([cfg.timeToTopSpeed[1], cfg.timeToTopSpeed[0]], u(a.acceleration));
  const sprint = mix(cfg.sprintSpeed, pace);
  // Acceleration fades as a = a0·(1 − (v/V)²), i.e. v = V·tanh(a0·t/V);
  // 95% of V is reached at t = 1.83·V/a0, so a0 = 1.83·V/tt.
  const accel0 = (1.83 * sprint) / tt;
  return {
    walkSpeed: mix(cfg.walkSpeed, 0.6),
    jogSpeed: mix(cfg.jogSpeed, pace * 0.5 + 0.3),
    runSpeed: mix(cfg.runSpeed, pace),
    sprintSpeed: sprint,
    jockeySpeed: 2.6 + 1.0 * u(a.agility),
    accel0,
    brakeDecel: cfg.brakeDecel * (0.8 + 0.3 * u(a.agility)),
    coastDecel: cfg.coastDecel,
    lateralAccel: mix([cfg.lateralAccel[1], cfg.lateralAccel[0]], u(a.agility)),
    yawRateStand: cfg.yawRate[0] * (0.8 + 0.25 * u(a.agility)),
    yawRateSprint: cfg.yawRate[1] * (0.8 + 0.35 * u(a.agility)),
    balance: u(a.balance),
    strength: u(a.strength),
    staminaDrain: 0.035 * (1.25 - 0.6 * u(a.stamina)),
    staminaRecover: 0.05 * (0.7 + 0.6 * u(a.stamina)),
    touchControl: u(a.ballControl),
    dribbleSkill: u(a.dribbling),
    passSkill: u(a.passing),
    shotSkill: u(a.shooting),
    finishing: u(a.finishing),
    tackleReach: 0.95 + 0.3 * u(a.tackling),
    tackleSkill: u((a.tackling + a.defensiveAwareness) / 2),
    interceptReach: 0.8 + 0.4 * u((a.interceptions + a.defensiveAwareness) / 2),
    jumpHeight: 0.35 + 0.3 * u(a.jumping),
    heading: u(a.heading),
    massKg: body.massKg,
    heightM: body.heightM,
  };
}

/** Fatigue multiplier on speed/acceleration for stamina 0..1. */
export const fatigueFactor = (stamina: number): number => 0.82 + 0.18 * Math.min(1, stamina / 0.6);
