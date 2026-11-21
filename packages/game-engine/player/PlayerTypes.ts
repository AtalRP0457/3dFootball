import type { Vec2, Vec3 } from '../physics/Vec3.ts';

/** 0–99 ratings. Every field drives at least one calculation (see PlayerAttributes.ts). */
export interface PlayerAttributes {
  overall: number;
  pace: number;
  acceleration: number;
  sprintSpeed: number;
  agility: number;
  balance: number;
  strength: number;
  stamina: number;
  ballControl: number;
  dribbling: number;
  passing: number;
  shooting: number;
  finishing: number;
  defensiveAwareness: number;
  tackling: number;
  interceptions: number;
  jumping: number;
  heading: number;
}

/** Physical tuning derived from attributes (SI units). */
export interface PlayerTuning {
  walkSpeed: number;
  jogSpeed: number;
  runSpeed: number;
  sprintSpeed: number;
  jockeySpeed: number;
  /** Initial acceleration from standing (m/s²). */
  accel0: number;
  brakeDecel: number;
  coastDecel: number;
  lateralAccel: number;
  yawRateStand: number;
  yawRateSprint: number;
  /** 0..1 */
  balance: number;
  strength: number;
  staminaDrain: number;
  staminaRecover: number;
  touchControl: number;
  dribbleSkill: number;
  passSkill: number;
  shotSkill: number;
  finishing: number;
  tackleReach: number;
  tackleSkill: number;
  interceptReach: number;
  jumpHeight: number;
  heading: number;
  massKg: number;
  heightM: number;
}

export type Foot = 'L' | 'R';

export type KickKind =
  | 'shortPass' | 'drivenPass' | 'throughBall' | 'lobPass' | 'longPass' | 'cross' | 'firstTimePass'
  | 'shot' | 'powerShot' | 'finesseShot' | 'placedShot' | 'lowDrivenShot' | 'chipShot' | 'volley' | 'halfVolley' | 'header';

export type SkillKind = 'stepOver' | 'doubleStepOver' | 'bodyFeint' | 'dragBack' | 'ballRoll' | 'roulette' | 'heelToHeel' | 'fakeShot';

export type ActionKind = KickKind | SkillKind | 'standingTackle' | 'slidingTackle' | 'jump' | 'celebrate' | 'stumble' | 'fall' | 'getUp' | 'trap';

/** Locomotion / posture state the animation system shows. */
export type MovementState =
  | 'idle' | 'walk' | 'jog' | 'run' | 'sprint' | 'dribble' | 'backpedal' | 'strafe' | 'jockey'
  | 'turn' | 'brake' | 'action' | 'slide' | 'stumble' | 'fallen' | 'getUp';

/** One frame of control intent, from a human or the AI (same type for both). */
export interface PlayerInput {
  /** Desired movement direction in world space, magnitude 0..1. */
  move: Vec2;
  sprint: boolean;
  /** Slow modifiers. */
  jog: boolean;
  walk: boolean;
  /** Defensive stance / jockey / shield (C). */
  defend: boolean;
  /** Skill modifier (Space). */
  skill: boolean;
  /** Held buttons; the controller reads press/release edges for power. */
  pass: boolean;
  through: boolean;
  lob: boolean;
  shoot: boolean;
  standTackle: boolean;
  slideTackle: boolean;
  jump: boolean;
  celebrate: boolean;
  /** Shot modifiers held with shoot. */
  finesse: boolean;
  lowDriven: boolean;
  chip: boolean;
  powerMod: boolean;
  /** Skill move selected with the skill modifier (1–8). */
  skillMove: SkillKind | null;
  /** Optional aim direction (defaults to move/facing). */
  aim?: Vec2;
  /** Multiplier on the target speed (difficulty, injury, stun); default 1. */
  speedScale?: number;
  /** Match rules: this player may not play the ball this step (cooldown, stunned). */
  noBall?: boolean;
}

export const emptyInput = (): PlayerInput => ({
  move: { x: 0, z: 0 }, sprint: false, jog: false, walk: false, defend: false, skill: false,
  pass: false, through: false, lob: false, shoot: false, standTackle: false, slideTackle: false,
  jump: false, celebrate: false, finesse: false, lowDriven: false, chip: false, powerMod: false, skillMove: null,
});

/** Simulation snapshot of a player after a fixed step. */
export interface PlayerSnapshot {
  id: string;
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
  yaw: number;
  yawRate: number;
  speed: number;
  stamina: number;
  balance: number;
  grounded: boolean;
  colliding: boolean;
  movement: MovementState;
  animation: string;
  /** Pose for rendering (bone → [x, y, z] Euler, YXZ order) + root offsets. */
  pose: PoseData;
}

export interface PoseData {
  bones: Record<string, [number, number, number]>;
  /** Hip height offset (m, negative = crouch) and extra root height (jumps). */
  hipDrop: number;
  lift: number;
  /** Whole-body lean (rad): pitch forward, roll sideways. */
  pitch: number;
  roll: number;
  /** Extra yaw on top of the physics body yaw (spins during skills). */
  yawOffset: number;
}
