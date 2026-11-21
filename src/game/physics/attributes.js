// Physical profile of a player: the numbers the locomotion and collision
// code actually uses. Built once per player from the full database
// attributes when they are available (src/db), otherwise derived from the six
// legacy engine stats (spd, pas, sho, tac, dri, gk) so old team data and the
// headless tests keep working.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const n = (v, fallback) => (Number.isFinite(v) ? v : fallback);

/**
 * @param {{spd:number,dri:number,tac:number}} stats
 * @param {object|undefined} attrs full attribute set (pace, acceleration,
 *   sprintSpeed, agility, strength, stamina, ...), 0-99
 */
export function physicalProfile(stats, attrs) {
  const s = stats || {};
  const a = attrs || {};
  const pace = n(a.pace, n(s.spd, 70));
  const acceleration = n(a.acceleration, n(s.spd, 70));
  const sprintSpeed = n(a.sprintSpeed, n(s.spd, 70));
  const agility = n(a.agility, n(s.dri, 65));
  const strength = n(a.strength, 55 + (n(s.tac, 55) - 50) * 0.4);
  const stamina = n(a.stamina, 75);
  const control = n(a.ballControl, n(s.dri, 65));
  const dribbling = n(a.dribbling, n(s.dri, 65));
  const finishing = n(a.finishing, n(s.sho, 65));
  const shooting = n(a.shooting, n(s.sho, 65));
  const longShots = n(a.longShots, n(s.sho, 65));
  const passing = n(a.passing, n(s.pas, 65));
  const vision = n(a.vision, n(s.pas, 65));
  const crossing = n(a.crossing, n(s.pas, 60));

  const ag = clamp(agility / 100, 0.2, 1);
  const st = clamp(strength / 100, 0.2, 1);
  const balance = clamp((strength * 0.45 + agility * 0.55) / 100, 0.2, 1);

  // Jogging/running top speed. Kept on the same scale as the original engine
  // (4.6 + spd * 0.026) so match balance and AI timings stay comparable.
  const runSpeed = 4.6 + (pace / 100) * 2.6;
  const sprintMul = 1.22 + (sprintSpeed / 100) * 0.1; // 80 -> 1.30

  return {
    runSpeed,
    sprintMul,
    // Peak acceleration from standing (m/s^2); it fades towards top speed.
    accel: 7 + (acceleration / 100) * 7,
    // Braking when the stick points away from the run, and coasting when
    // the stick is released.
    brake: 12 + ag * 6,
    coast: 6.5 + ag * 2,
    // Turn rate of the running line at zero speed (rad/s) and how fast that
    // falls off with speed: agile players carve tighter at pace.
    turnBase: 7 + ag * 6,
    turnFalloff: 0.36 - ag * 0.13,
    // Lateral grip: the most sideways acceleration a player can produce
    // before the turn has to cost speed.
    grip: 9 + ag * 5,
    // How fast the body (hips/shoulders) can rotate, rad/s.
    yawRate: 10 + ag * 8,
    agility: ag,
    balance,
    strength: st,
    mass: 66 + st * 22,
    // Stamina: drain while sprinting and recovery while not.
    staminaDrain: 0.11 * (1.35 - (stamina / 100) * 0.6),
    staminaRecover: 0.05 * (0.7 + (stamina / 100) * 0.6),
    control: clamp(control / 100, 0.2, 1),
    dribbling: clamp((dribbling * 0.6 + control * 0.4) / 100, 0.2, 1),
    shotAccuracy: clamp((finishing * 0.7 + shooting * 0.3) / 100, 0.2, 1),
    shotPower: clamp((shooting * 0.5 + longShots * 0.3 + strength * 0.2) / 100, 0.2, 1),
    passAccuracy: clamp((passing * 0.75 + vision * 0.25) / 100, 0.2, 1),
    longPassing: clamp((passing * 0.5 + crossing * 0.3 + vision * 0.2) / 100, 0.2, 1),
  };
}
