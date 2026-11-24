// Central physical constants and calibration for the game engine.
// Units: metres, seconds, kilograms, radians. Every system reads from here so
// the ball, players and AI share one definition of the world.
//
// PHYSICS_DEFAULTS are the shipped values. Development tools (the Player &
// Ball Lab) edit a *copy* made with createCalibration(); normal game settings
// never touch these numbers.

export interface BallConfig {
  /** Size 5: circumference 68–70 cm, so r ≈ 0.11 m. */
  radius: number;
  /** Size 5 nominal mass (0.41–0.45 kg). */
  mass: number;
  /** Bounce restitution against turf. */
  groundRestitution: number;
  /** Coulomb friction ball/turf (drives slide → roll). */
  groundFriction: number;
  /** Rolling resistance coefficient on grass (decel = c·g). */
  rollingResistance: number;
  /** Drag coefficient above the drag crisis (a struck ball in flight, and the rolling ball). */
  dragCoefficient: number;
  /**
   * Drag coefficient below the drag crisis: a slow ball in flight has a
   * laminar boundary layer and ~1.7x the drag (soccer-ball wind tunnels:
   * ~0.4-0.45 subcritical, ~0.2-0.25 supercritical).
   */
  dragCoefficientSubcritical: number;
  /** Speed (m/s) at the middle of the drag crisis (~11-12 m/s for a panelled size-5 ball). */
  dragCrisisSpeed: number;
  /** Spin (rad/s) below which a fast ball knuckles: an unstable wake moves it about in flight. */
  knuckleSpin: number;
  /** Side-force coefficient amplitude of a non-spinning ball (wind tunnel: ~0.05-0.1). */
  knuckleStrength: number;
  /** Air density kg/m³. */
  airDensity: number;
  /** Scale on the Magnus lift (1 = textbook). */
  magnusScale: number;
  /** Spin decay time constant in the air (s). */
  spinDecayTime: number;
  /** Restitution / friction against goal frame. */
  postRestitution: number;
  /** Net absorbs most energy. */
  netRestitution: number;
  /** Fraction of speed kept per net contact step. */
  netDamping: number;
  /** Below this vertical speed (m/s) a bounce is treated as settled. */
  settleSpeed: number;
}

export interface PlayerConfig {
  heightM: number;
  massKg: number;
  /** Body capsule radius (m). */
  bodyRadius: number;
  /** Calibration ranges (m/s): attributes map into these. */
  walkSpeed: [number, number];
  jogSpeed: [number, number];
  runSpeed: [number, number];
  sprintSpeed: [number, number];
  /** Time to reach top speed from standing (s), best → worst acceleration. */
  timeToTopSpeed: [number, number];
  /** Free coast-down deceleration with no input (m/s²). */
  coastDecel: number;
  /** Active braking deceleration (m/s²). */
  brakeDecel: number;
  /** Max lateral (centripetal) acceleration, best → worst agility (m/s²). */
  lateralAccel: [number, number];
  /** Body yaw rate limits (rad/s): standing, at full sprint. */
  yawRate: [number, number];
  /** Foot reach for touches/kicks measured from the body centre (m). */
  footReach: number;
}

export interface WorldConfig {
  gravity: number;
  /** Fixed physics step (s). */
  fixedDt: number;
  /** Rapier substeps per fixed step (ball tunnelling / stability). */
  substeps: number;
  /** Max fixed steps per rendered frame before dropping time (spiral guard). */
  maxStepsPerFrame: number;
}

export interface PitchConfig {
  length: number;
  width: number;
  goalWidth: number;
  goalHeight: number;
  goalDepth: number;
  postRadius: number;
}

export interface PhysicsCalibration {
  ball: BallConfig;
  player: PlayerConfig;
  world: WorldConfig;
  pitch: PitchConfig;
}

const DEFAULTS: PhysicsCalibration = {
  ball: {
    radius: 0.11,
    mass: 0.43,
    groundRestitution: 0.62,
    groundFriction: 0.55,
    rollingResistance: 0.06,
    dragCoefficient: 0.25,
    dragCoefficientSubcritical: 0.42,
    dragCrisisSpeed: 11,
    knuckleSpin: 7,
    knuckleStrength: 0.075,
    airDensity: 1.225,
    magnusScale: 1,
    spinDecayTime: 6,
    postRestitution: 0.72,
    netRestitution: 0.05,
    netDamping: 0.55,
    settleSpeed: 0.35,
  },
  player: {
    heightM: 1.8,
    massKg: 75,
    bodyRadius: 0.3,
    walkSpeed: [1.2, 2.0],
    jogSpeed: [2.5, 3.8],
    // Normal (non-sprint) pace: brisk, since it is what you see most.
    runSpeed: [5.2, 6.8],
    sprintSpeed: [7.0, 9.0],
    // Game-tuned: quicker than a track sprint so the stick feels direct;
    // acceleration ratings still spread it by a second.
    timeToTopSpeed: [1.7, 2.7],
    coastDecel: 4.2,
    brakeDecel: 9.5,
    lateralAccel: [11.5, 7.0],
    yawRate: [9.0, 2.6],
    footReach: 0.85,
  },
  world: {
    gravity: 9.81,
    fixedDt: 1 / 60,
    substeps: 8,
    maxStepsPerFrame: 8,
  },
  pitch: {
    length: 105,
    width: 68,
    goalWidth: 7.32,
    goalHeight: 2.44,
    goalDepth: 2.0,
    postRadius: 0.06,
  },
};
export const PHYSICS_DEFAULTS: Readonly<PhysicsCalibration> = Object.freeze(DEFAULTS);

/** A mutable deep copy for development tools. */
export function createCalibration(over?: Partial<{ [K in keyof PhysicsCalibration]: Partial<PhysicsCalibration[K]> }>): PhysicsCalibration {
  return {
    ball: { ...PHYSICS_DEFAULTS.ball, ...over?.ball },
    player: { ...PHYSICS_DEFAULTS.player, ...over?.player },
    world: { ...PHYSICS_DEFAULTS.world, ...over?.world },
    pitch: { ...PHYSICS_DEFAULTS.pitch, ...over?.pitch },
  };
}

/** Derived ball quantities. */
export const ballArea = (b: BallConfig): number => Math.PI * b.radius * b.radius;
/** Solid-sphere-shell moment of inertia (thin shell ≈ 2/3 m r²). */
export const ballInertia = (b: BallConfig): number => (2 / 3) * b.mass * b.radius * b.radius;
