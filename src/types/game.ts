// Shared types for the match engine, renderer and UI.
// Distances are metres, times seconds, speeds m/s. x runs along the pitch
// (goals at -x / +x), z across it, y up.

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Position =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB' | 'CDM' | 'CM' | 'CAM'
  | 'LM' | 'RM' | 'LW' | 'RW' | 'CF' | 'ST';
export type HumanId = 'p1' | 'p2';
export type Controller = HumanId | 'ai';
export type Difficulty = 'beginner' | 'easy' | 'normal' | 'hard';
export type AssistLevel = 'off' | 'assisted' | 'full';
export type DribbleStyle = 'sticky' | 'touch';
export type ShotType = 'normal' | 'power' | 'low' | 'finesse' | 'chip';
export type PassKind = 'ground' | 'lofted' | 'through' | 'chip';
export type Phase = 'kickoff' | 'play' | 'restart' | 'penalty' | 'goal' | 'halftime' | 'fulltime';
export type MatchFlow = 'PLAYING' | 'GOAL_SCORED' | 'OUT_OF_BOUNDS_TRANSITION' | 'SET_PIECE_SETUP' | 'KICKOFF';
export interface FlowTransition {
  state: 'OUT_OF_BOUNDS_TRANSITION' | 'SET_PIECE_SETUP';
  elapsed: number;
  duration: number;
  fromPlayers: Record<number, Vec2>;
  fromBall: Vec3;
  pendingRestart?: { type: string; team: number; spot: Vec2 };
}

/** Six legacy engine stats (0-99). */
export interface EngineStats { spd: number; pas: number; sho: number; tac: number; dri: number; gk: number }

/** Full attribute set (0-99). */
export type Attributes = Record<string, number>;

export interface BodyBuild {
  label: string; shoulder: number; chest: number; waist: number; hip: number; limb: number; leg: number;
}
export interface BootStyle { id: string; name: string; upper: string; accent: string; sole: string }

export interface Identity {
  id: string;
  name: string;
  number: number;
  position: string;
  group: string;
  heightCm: number;
  weightKg: number;
  age: number;
  bodyType: string;
  build: BodyBuild;
  skinTone: string;
  hair: { style: string; color: string; hex: string };
  facialHair: string;
  eyes: string;
  /** Optional face-proportion overrides (see render/character/head.ts FaceShape), 1 = average. */
  face?: Record<string, number>;
  boots: BootStyle;
  accessories: string[];
  foot: string;
  captain: boolean;
  keeper: boolean;
}

export interface KeeperProfile { reflexes: number; diving: number; handling: number; positioning: number; reach: number }

/** What the engine actually uses, derived from attributes + identity. */
export interface PhysicalProfile {
  runSpeed: number; sprintMul: number; accel: number; brake: number; coast: number;
  turnBase: number; turnFalloff: number; grip: number; yawRate: number;
  agility: number; balance: number; strength: number; mass: number; heightCm: number;
  staminaDrain: number; staminaRecover: number;
  control: number; firstTouch: number; dribbling: number;
  shotAccuracy: number; shotPower: number; curve: number;
  passAccuracy: number; longPassing: number; distribution: number;
  tackling: number; interceptions: number; defending: number;
  keeper: KeeperProfile;
}

export interface Kit {
  shirt: string; shorts: string; socks: string; gk: string;
  secondary?: string; accent?: string; sleeves?: string; design?: string; type?: string;
}

/** A player as the team data hands him to the engine. */
export interface PlayerData {
  name: string;
  number: number;
  stats: EngineStats;
  attributes?: Attributes;
  playerId?: string;
  position?: string;
  overall?: number;
  identity?: Identity;
  nationality?: string;
  foot?: string;
  role?: Role;
  captain?: boolean;
  appearance?: Partial<Identity>;
}

export interface TeamData {
  id?: string;
  name: string;
  short?: string;
  code?: string;
  crest?: string;
  kit: Kit;
  players: PlayerData[];
  bench?: PlayerData[];
  [key: string]: unknown;
}

export type Action =
  | { type: 'pass'; target: Player | null; kind?: PassKind; driven?: boolean; receive?: boolean }
  | { type: 'shoot'; power: number; aim?: number; shotType?: ShotType; receive?: boolean }
  | { type: 'tackle' };

export interface Intent { mx: number; mz: number; sprint: boolean; action: Action | null }

export interface KeepRun { until: number; spot: Vec2; running: boolean; sprint: boolean }

export interface Player {
  id: number;
  team: number;
  idx: number;
  role: Role;
  benchRole: Role;
  benchIndex: number;
  onPitch: boolean;
  name: string;
  number: number;
  stats: EngineStats;
  attributes: Attributes | null;
  overall: number | null;
  captain: boolean;
  identity: Identity;
  phys: PhysicalProfile;
  yellowCards: number;
  sentOff: boolean;
  subbedOff: boolean;
  injured: boolean;
  pos: Vec2;
  vel: Vec2;
  acc: Vec2;
  face: Vec2;
  prevPos: Vec2 | null;
  stagger: number;
  stamina: number;
  intent: Intent;
  human: HumanId | null;
  kickCd: number;
  tackleCd: number;
  stun: number;
  mustPass: boolean;
  mustPassTimer: number;
  holdTimer: number;
  holding: boolean;
  charge: number;
  chargeType?: ShotType | null;
  dive: number;
  aiTimer: number;
  /** AI: seconds on the ball in the current possession (raises pass urgency). */
  aiHold?: number;
  /** Match clock when aiHold was last advanced. */
  aiHoldAt?: number;
  lastShotChecked: number;
  kickAnim: number;
  kickType?: string;
  touchAnim?: number;
  touchCd?: number;
  dribbleLead?: number;
  dribblePhase?: number;
  queuedAction?: { action: Action; ttl: number } | null;
  throwIn?: boolean;
  keepRun?: KeepRun | null;
  assisting?: string | null;
  /** This step's movement comes only from assistance (no stick input). */
  assistOnly?: boolean;
  aiState?: string;
  drillPassive?: boolean;
  drillNoPass?: boolean;
}

export interface DifficultyProfile { reaction: number; speed: number; error: number; tackle: number; keeper: number }

export interface Team {
  index: number;
  data: TeamData;
  kit: Kit;
  dir: 1 | -1;
  human: HumanId | null;
  controlled: Player | null;
  manualKeeperControl?: boolean;
  next: Player | null;
  lastInput: { mx: number; mz: number };
  seenOpponentOwner: Player | null;
  tackleTarget: Player | null;
  tackles: { tries: number; won: number; last: string | null };
  score: number;
  shots: number;
  onTarget: number;
  possessionTime: number;
  yellowCards: number;
  redCards: number;
  injuries: number;
  substitutions: number;
  pendingSubstitution: { outgoing: number; incoming: number } | null;
  tactic: 'balanced' | 'attacking' | 'defensive';
  formation: string;
  diff: DifficultyProfile;
}

export interface BallPathPoint { t: number; x: number; y: number; z: number }

export interface Ball {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
  prevPos: Vec3 | null;
  owner: Player | null;
  lastTouch: Player | null;
  intended: Player | null;
  offsidePlayers: Player[];
  restartNoOffsideBy: Player | null;
  restartDoubleTouchBy: Player | null;
  directThrowInGoalBlockedBy: Player | null;
  directRestartOwnGoalBlockedBy: Player | null;
  freeKickGoalRestrictedBy: { player: Player; indirect: boolean } | null;
  shotId: number;
  shotTeam: number;
  shotLive: boolean;
  shooter?: Player | null;
  shotClock?: number;
  shotDist?: number;
  shotType?: ShotType;
  passGrace?: number;
  passByHuman?: boolean;
  passFrom?: Vec2;
  passKind?: PassKind;
  passAim?: Vec2;
  path?: BallPathPoint[] | null;
  /** Receiver and aim announced during the passer's contact-frame wind-up. */
  pendingPass?: { passer: Player; target: Player; aim: Vec2; kind: PassKind; expiresAt: number } | null;
}

export interface MatchEvent { type: string; [key: string]: unknown }

export interface GoalInfo {
  team: number; scorer: string; scorerId: number | null; ownGoal: boolean; clock: number;
  runTo: Vec2 | null;
}

export interface PenaltyState { attacker: number; shooter: Player; active: boolean; pending: boolean; elapsed: number }

export interface MatchState {
  teams: Team[];
  players: Player[];
  timeScale: number;
  dribbleStyle: DribbleStyle;
  assistName: AssistLevel;
  assist: { steerCos: number; tackleRange: number; controlBonus: number; auto: boolean };
  ball: Ball;
  clock: number;
  duration: number;
  regulationDuration: number;
  extraTimeAllowed: boolean;
  extraTimeDuration: number;
  extraTimeStarted: boolean;
  practice: boolean;
  indoor: boolean;
  penalty: PenaltyState | null;
  openingKickoff: number;
  phase: Phase;
  /** Explicit gameplay flow, separate from the legacy presentation phase. */
  flow: MatchFlow;
  transition: FlowTransition | null;
  phaseTimer: number;
  halftimeDone: boolean;
  restart: { type: string; team: number } | null;
  events: MatchEvent[];
  banner: { text: string; time: number } | null;
  lastGoal?: GoalInfo;
  kickoffNext?: number;
}

export interface MatchConfig {
  home: TeamData;
  away: TeamData;
  controllers: [Controller, Controller];
  difficulty?: Difficulty;
  duration?: number;
  timeScale?: number;
  assist?: AssistLevel;
  dribbleStyle?: DribbleStyle;
  practice?: boolean;
  indoor?: boolean;
  extraTime?: boolean;
  extraTimeDuration?: number;
}

/** One human's input for a fixed step. */
export interface InputFrame {
  mx?: number; mz?: number; sprint?: boolean;
  passPressed?: boolean; loftPressed?: boolean; throughPressed?: boolean; drivenPressed?: boolean;
  keeperSwitchPressed?: boolean;
  shootHeld?: boolean; shootPressed?: boolean; finesseHeld?: boolean; chipHeld?: boolean;
}
export type Inputs = Partial<Record<HumanId, InputFrame | null>>;
