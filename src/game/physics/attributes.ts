// Physical and technical profile of a player: the numbers the match engine
// actually uses. Built once per player from the same attribute set and
// identity (height/weight) that the player cards and the 3D preview show,
// so there is one attribute system across the game. Falls back to the six
// legacy engine stats (spd, pas, sho, tac, dri, gk) for old team data.
//
// Where each attribute is used:
//   pace, sprintSpeed      top run / sprint speed          playerPhysics, AI
//   acceleration           speed build-up                   playerPhysics
//   agility                turn rate, grip, body yaw        playerPhysics
//   strength, weight       body mass in contacts, tackles   playerPhysics, match (tackles)
//   balance                staggering in contacts           playerPhysics
//   stamina                sprint drain / recovery          match (movePlayer)
//   firstTouch, ballCtrl   first-touch failures, reach      match (first touch), dribbling
//   dribbling              touch length, U-turns, tackles   dribbling, match (tackles)
//   shortPassing           ground pass accuracy             passing
//   longPassing            lofted / through / keeper kicks  passing
//   shotPower              shot pace                        shooting
//   finishing (+shooting)  shot accuracy                    shooting
//   curve                  finesse curl and its accuracy    shooting
//   tackling               tackle success                   match (tackles)
//   interceptions          reach on opponents' passes       match (possession)
//   marking, positioning,
//   defensiveAwareness     AI defensive reaction time       ai
//   gk reflexes/diving/
//   handling/positioning   saves, parries, angle play       match (keeperSave), ai
//   gkKicking (distrib.)   keeper passing accuracy          passing
//   height                 keeper reach, stride length      match, animation

import type { PhysicalProfile, EngineStats, Attributes } from '../../types/game.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const n = (v: number | undefined, fallback: number): number => (Number.isFinite(v) ? (v as number) : fallback);
const u = (v: number) => clamp(v / 100, 0.2, 1);

/**
 * @param stats    legacy six stats (may be partial)
 * @param attrs    full attribute set (0-99), optional
 * @param identity { heightCm, weightKg } from players/identity.js, optional
 */
export function physicalProfile(
  stats: Partial<EngineStats> | null | undefined,
  attrs?: Attributes | null,
  identity?: { heightCm?: number; weightKg?: number } | null,
  weakFootStars?: number,
): PhysicalProfile {
  const s = stats || {};
  const a = attrs || {};
  const pace = n(a.pace, n(s.spd, 70));
  const acceleration = n(a.acceleration, n(s.spd, 70));
  const sprintSpeed = n(a.sprintSpeed, n(s.spd, 70));
  const agility = n(a.agility, n(s.dri, 65));
  const strength = n(a.strength, 55 + (n(s.tac, 55) - 50) * 0.4);
  const stamina = n(a.stamina, 75);
  const control = n(a.ballControl, n(s.dri, 65));
  const firstTouch = n(a.firstTouch, control);
  const dribbling = n(a.dribbling, n(s.dri, 65));
  const finishing = n(a.finishing, n(s.sho, 65));
  const shooting = n(a.shooting, n(s.sho, 65));
  const longShots = n(a.longShots, n(s.sho, 65));
  const shotPower = n(a.shotPower, shooting * 0.55 + strength * 0.25 + longShots * 0.2);
  const curve = n(a.curve, n(a.crossing, n(s.pas, 60)));
  const passing = n(a.passing, n(s.pas, 65));
  const shortPassing = n(a.shortPassing, passing);
  const vision = n(a.vision, n(s.pas, 65));
  const crossing = n(a.crossing, n(s.pas, 60));
  const longPassing = n(a.longPassing, passing * 0.5 + crossing * 0.3 + vision * 0.2);
  const balanceAttr = n(a.balance, strength * 0.45 + agility * 0.55);
  const tackling = n(a.tackling, n(s.tac, 60));
  const interceptions = n(a.interceptions, n(s.tac, 60));
  const marking = n(a.marking, n(s.tac, 60));
  const positioning = n(a.positioning, n(s.tac, 60));
  const awareness = n(a.defensiveAwareness, n(s.tac, 60));
  const gk = n(s.gk, 20);
  const reflexes = n(a.gkReflexes, gk);
  const diving = n(a.gkDiving, gk);
  const handling = n(a.gkHandling, gk);
  const gkPositioning = n(a.gkPositioning, gk);
  const distribution = n(a.gkKicking, gk);

  const heightCm = identity?.heightCm ?? 180;
  const weightKg = identity?.weightKg ?? 66 + u(strength) * 22;
  const ag = u(agility);
  const st = u(strength);
  // Heavier, taller players turn a little slower; light ones a little quicker.
  const sizeTurn = clamp(1 - (weightKg - 75) * 0.004, 0.9, 1.08);

  // Jogging/running top speed. Kept on the same scale as the original engine
  // (4.6 + spd * 0.026) so match balance and AI timings stay comparable.
  const runSpeed = 4.6 + (pace / 100) * 2.6;
  const sprintMul = 1.22 + (sprintSpeed / 100) * 0.1; // 80 -> 1.30

  return {
    runSpeed,
    sprintMul,
    // Peak acceleration from standing (m/s^2); it fades towards top speed.
    accel: (7 + (acceleration / 100) * 7) * clamp(1 - (weightKg - 75) * 0.003, 0.92, 1.05),
    // Braking when the stick points away from the run, and coasting when
    // the stick is released.
    brake: 12 + ag * 6,
    coast: 6.5 + ag * 2,
    // Turn rate of the running line at zero speed (rad/s) and how fast that
    // falls off with speed: agile players carve tighter at pace.
    turnBase: (7 + ag * 6) * sizeTurn,
    turnFalloff: 0.36 - ag * 0.13,
    // Lateral grip: the most sideways acceleration a player can produce
    // before the turn has to cost speed.
    grip: (9 + ag * 5) * sizeTurn,
    // How fast the body (hips/shoulders) can rotate, rad/s.
    yawRate: (10 + ag * 8) * sizeTurn,
    agility: ag,
    balance: u(balanceAttr),
    strength: st,
    mass: weightKg,
    heightCm,
    // Stamina: drain while sprinting and recovery while not.
    staminaDrain: 0.11 * (1.35 - (stamina / 100) * 0.6),
    staminaRecover: 0.05 * (0.7 + (stamina / 100) * 0.6),
    control: u(control * 0.4 + firstTouch * 0.6),
    firstTouch: u(firstTouch),
    dribbling: u(dribbling * 0.6 + control * 0.4),
    shotAccuracy: u(finishing * 0.7 + shooting * 0.3),
    shotPower: u(shotPower),
    curve: u(curve),
    passAccuracy: u(shortPassing * 0.8 + vision * 0.2),
    longPassing: u(longPassing),
    vision: u(vision),
    crossing: u(crossing),
    weakFoot: clamp(((Number.isFinite(weakFootStars) ? (weakFootStars as number) : 3) - 1) / 4, 0, 1),
    distribution: u(distribution),
    tackling: u(tackling),
    interceptions: u(interceptions),
    // How quickly a defender reads play (AI reaction time).
    defending: u(marking * 0.35 + positioning * 0.3 + awareness * 0.35),
    keeper: {
      reflexes: u(reflexes), diving: u(diving), handling: u(handling), positioning: u(gkPositioning),
      // Standing reach (m) for claiming high balls: height plus arm span.
      reach: 2.15 + (heightCm - 185) * 0.012,
    },
  };
}
