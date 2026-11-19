// All measurements are in metres and seconds.
// Coordinate system: x runs along the pitch length (goals at -x and +x),
// z runs across the width, y is up. The camera sits on the +z side.

export const PITCH = { length: 64, width: 40 };
export const HALF_L = PITCH.length / 2;
export const HALF_W = PITCH.width / 2;

export const GOAL = { width: 6, height: 2.3, depth: 1.8 };
export const BOX = { depth: 10, width: 22 }; // penalty area

export const BALL_R = 0.22;
export const GRAVITY = 9.81;
export const ROLL_DECEL = 3.4; // rolling deceleration on grass
export const AIR_DRAG = 0.08;
export const BOUNCE = 0.5;

export const CONTROL_RADIUS = 0.95; // how close a player must be to take the ball
export const DRIBBLE_OFFSET = 0.75; // ball distance in front of the dribbler
export const PLAYER_RADIUS = 0.45;

export const FIXED_DT = 1 / 60;
export const SHOT_CHARGE_TIME = 0.9; // seconds to reach full shot power
export const MUST_PASS_TIMEOUT = 5; // throw-ins/kick-offs auto-pass after this

export const DIFFICULTY = {
  easy: { reaction: 0.45, speed: 0.9, error: 1.5, tackle: 0.75, keeper: -0.12 },
  normal: { reaction: 0.28, speed: 1.0, error: 1.0, tackle: 1.0, keeper: 0 },
  hard: { reaction: 0.14, speed: 1.05, error: 0.7, tackle: 1.25, keeper: 0.08 },
};

// Formation for a team attacking towards +x. Values are fractions of the
// half length (x) and half width (z). Mirrored for the other team.
export const FORMATION = [
  { role: 'GK', x: -0.94, z: 0 },
  { role: 'DEF', x: -0.6, z: -0.42 },
  { role: 'DEF', x: -0.6, z: 0.42 },
  { role: 'MID', x: -0.2, z: 0 },
  { role: 'FWD', x: 0.25, z: 0.05 },
];

export const KICKOFF_ATTACK = [
  { x: -0.94, z: 0 },
  { x: -0.55, z: -0.42 },
  { x: -0.55, z: 0.42 },
  { x: -0.12, z: -0.25 },
  { x: -0.02, z: 0 }, // takes the kick-off
];

export const KICKOFF_DEFEND = [
  { x: -0.94, z: 0 },
  { x: -0.6, z: -0.42 },
  { x: -0.6, z: 0.42 },
  { x: -0.35, z: 0 },
  { x: -0.24, z: 0.1 },
];
