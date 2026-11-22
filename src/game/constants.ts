import type { Role, Difficulty, DifficultyProfile, AssistLevel, MatchState } from '../types/game.ts';

// All measurements are in metres and seconds.
// Coordinate system: x runs along the pitch length (goals at -x and +x),
// z runs across the width, y is up. The camera sits on the +z side.

export const PITCH = { length: 105, width: 68 };
export const HALF_L = PITCH.length / 2;
export const HALF_W = PITCH.width / 2;

export const GOAL = { width: 7.32, height: 2.44, depth: 2.0 };
export const BOX = { depth: 16.5, width: 40.32 }; // penalty area
export const GOAL_AREA = { depth: 5.5, width: 18.32 };
export const PENALTY_SPOT = 11;
export const PENALTY_ARC_RADIUS = 9.15;

export const BALL_R = 0.11; // a real size-5 ball (22 cm across)
export const GRAVITY = 9.81;
export const ROLL_DECEL = 3.4; // rolling deceleration on grass
export const AIR_DRAG = 0.08;
export const BOUNCE = 0.5;

export const CONTROL_RADIUS = 0.95; // how close a player must be to take the ball
export const DRIBBLE_OFFSET = 0.5; // ball distance in front of the dribbler
export const PLAYER_RADIUS = 0.45;

export const FIXED_DT = 1 / 60;
export const SHOT_CHARGE_TIME = 0.9; // seconds to reach full shot power
export const MUST_PASS_TIMEOUT = 5; // throw-ins/kick-offs auto-pass after this

export interface FormationSlot { role: Role; x: number; z: number }

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  beginner: { reaction: 0.7, speed: 0.8, error: 2.0, tackle: 0.35, keeper: -0.2 },
  easy: { reaction: 0.45, speed: 0.9, error: 1.5, tackle: 0.75, keeper: -0.12 },
  normal: { reaction: 0.28, speed: 1.0, error: 1.0, tackle: 1.0, keeper: 0 },
  hard: { reaction: 0.14, speed: 1.05, error: 0.7, tackle: 1.25, keeper: 0.08 },
};

// 4-3-3 formation for a team attacking towards +x. Values are fractions of
// the half length (x) and half width (z). Mirrored for the other team.
export const FORMATION: FormationSlot[] = [
  { role: 'GK', x: -0.94, z: 0 },
  { role: 'DEF', x: -0.62, z: -0.24 },
  { role: 'DEF', x: -0.62, z: 0.24 },
  { role: 'MID', x: -0.12, z: 0 },
  { role: 'FWD', x: 0.2, z: 0 },
  { role: 'DEF', x: -0.5, z: -0.72 },
  { role: 'DEF', x: -0.5, z: 0.72 },
  { role: 'MID', x: -0.16, z: -0.46 },
  { role: 'MID', x: -0.16, z: 0.46 },
  { role: 'FWD', x: 0.32, z: -0.4 },
  { role: 'FWD', x: 0.32, z: 0.4 },
];

export const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-3-3': FORMATION,
  '4-4-2': [
    { role: 'GK', x: -0.94, z: 0 },
    { role: 'DEF', x: -0.62, z: -0.25 },
    { role: 'DEF', x: -0.62, z: 0.25 },
    { role: 'MID', x: -0.12, z: 0 },
    { role: 'FWD', x: 0.2, z: -0.18 },
    { role: 'DEF', x: -0.5, z: -0.72 },
    { role: 'DEF', x: -0.5, z: 0.72 },
    { role: 'MID', x: -0.08, z: -0.56 },
    { role: 'MID', x: -0.08, z: 0.56 },
    { role: 'FWD', x: 0.2, z: 0.18 },
    { role: 'MID', x: -0.12, z: 0.22 },
  ],
  '3-5-2': [
    { role: 'GK', x: -0.94, z: 0 },
    { role: 'DEF', x: -0.58, z: -0.34 },
    { role: 'DEF', x: -0.58, z: 0.34 },
    { role: 'MID', x: -0.1, z: 0 },
    { role: 'FWD', x: 0.24, z: -0.18 },
    { role: 'DEF', x: -0.68, z: 0 },
    { role: 'MID', x: -0.08, z: -0.72 },
    { role: 'MID', x: 0.02, z: -0.32 },
    { role: 'MID', x: 0.02, z: 0.32 },
    { role: 'FWD', x: 0.24, z: 0.18 },
    { role: 'MID', x: -0.08, z: 0.72 },
  ],
};

// Five-a-side shape used by the indoor mode. It intentionally has its own
// compact roles instead of pretending a full 11-a-side formation is indoor.
export const INDOOR_FORMATION: FormationSlot[] = [
  { role: 'GK', x: -0.88, z: 0 },
  { role: 'DEF', x: -0.36, z: 0 },
  { role: 'MID', x: 0.04, z: -0.38 },
  { role: 'MID', x: 0.04, z: 0.38 },
  { role: 'FWD', x: 0.42, z: 0 },
];

export const KICKOFF_ATTACK: Array<{ x: number; z: number }> = [
  { x: -0.94, z: 0 },
  { x: -0.62, z: -0.24 },
  { x: -0.62, z: 0.24 },
  { x: -0.12, z: 0 },
  { x: -0.02, z: 0 }, // takes the kick-off
  { x: -0.5, z: -0.72 },
  { x: -0.5, z: 0.72 },
  { x: -0.16, z: -0.46 },
  { x: -0.16, z: 0.46 },
  { x: -0.3, z: -0.4 },
  { x: -0.3, z: 0.4 },
];

export const KICKOFF_DEFEND: Array<{ x: number; z: number }> = [
  { x: -0.94, z: 0 },
  { x: -0.62, z: -0.24 },
  { x: -0.62, z: 0.24 },
  { x: -0.35, z: 0 },
  { x: -0.24, z: 0.1 },
  { x: -0.5, z: -0.72 },
  { x: -0.5, z: 0.72 },
  { x: -0.16, z: -0.46 },
  { x: -0.16, z: 0.46 },
  { x: -0.3, z: -0.4 },
  { x: -0.3, z: 0.4 },
];

// Assist settings for human players.
//   off      : pure manual
//   assisted : steer towards a loose ball / the opponent with the ball when
//              you press roughly in that direction, bigger tackle and
//              control range
//   full     : as assisted, and your player chases a loose ball even when
//              you press nothing
export const ASSIST: Record<AssistLevel, MatchState['assist']> = {
  off: { steerCos: 2, tackleRange: 1.7, controlBonus: 0, auto: false },
  // steerCos 0.8: only when the stick already points within ~37° of the
  // ball does assist finish the line; otherwise the stick wins.
  assisted: { steerCos: 0.8, tackleRange: 2.2, controlBonus: 0.3, auto: false },
  full: { steerCos: 0.8, tackleRange: 2.2, controlBonus: 0.3, auto: true },
};

// After you hand a player back to the AI (pass or switch), he keeps the
// position you took him to for this many seconds instead of jogging back.
export const KEEP_RUN_TIME = 5;
