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
/** How the ball is met for a shot: on the ground, a volley, a header. */
export type ShotContact = 'ground' | 'volley' | 'header';
export type PassKind = 'ground' | 'lofted' | 'through' | 'chip';
export type Phase = 'kickoff' | 'play' | 'restart' | 'penalty' | 'goal' | 'halftime' | 'fulltime';
export type MatchFlow = 'PLAYING' | 'GOAL_SCORED' | 'SET_PIECE_SETUP' | 'KICKOFF' | 'CUT_TO_KICKOFF' | 'CUT';
/**
 * A camera cut (fade through black) that hides a large repositioning: the
 * kick-off shape after a goal or half-time, or the penalty line-up. The
 * renderer fades out and back in; positions change at the darkest point.
 */
export interface FlowTransition {
  state: 'CUT_TO_KICKOFF' | 'CUT';
  elapsed: number;
  duration: number;
  /** Kick-off team to set up at the midpoint of the cut. */
  pendingKickoff?: number;
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
  /** Close-range finishing, long shots, heading (0..1); fall back to shotAccuracy when missing. */
  finishing?: number; longShots?: number; heading?: number;
  passAccuracy: number; longPassing: number; distribution: number;
  /** Through-ball reading and lead (0..1). */
  vision: number;
  crossing: number;
  /** Weak-foot rating 1..5 as 0..1 (5 stars = 1). */
  weakFoot: number;
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
  /** Weak-foot rating 1..5. */
  weakFoot?: number;
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
  | { type: 'pass'; target: Player | null; kind?: PassKind; driven?: boolean; receive?: boolean; power?: number }
  | { type: 'shoot'; power: number; aim?: number; shotType?: ShotType; receive?: boolean; lowDriven?: boolean }
  | { type: 'tackle' };

export interface Intent { mx: number; mz: number; sprint: boolean; action: Action | null }

export interface KeepRun { until: number; spot: Vec2; running: boolean; sprint: boolean }

/**
 * A restart in progress: the taker fetches (or is thrown) the ball, carries
 * it to the spot and places it; everyone else walks to his set-piece
 * position; then it can be taken. Nobody is moved by the rules.
 */
export interface SetPieceState {
  type: string;
  team: number;
  spot: Vec2;
  taker: Player;
  stage: 'fetch' | 'carry' | 'ready';
  /** Seconds since the whistle. */
  t: number;
  readyAt?: number;
  /** The ball went far away: a ball boy throws a new one to the taker. */
  boyToss?: boolean;
  /** Defenders forming the wall (free kicks near goal). */
  wall: Player[];
  /** The referee has blown for it to be taken. */
  whistled?: boolean;
  /** The dead ball has come to rest (it is pinned until picked up). */
  settled?: boolean;
}

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
  /** Weak-foot rating 1..5 (3 when unknown). */
  weakFoot?: number;
  /** Carrying the dead ball to a restart spot (ball in his hands). */
  carrying?: boolean;
  /** Receiving a pass: keep the body facing this way (the incoming ball). */
  receiveFace?: Vec2 | null;
  /** Receiving a pass: the first-touch direction the user is asking for. */
  receiveTouch?: Vec2 | null;
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
  /** Low-driven modifier pressed while powering up this shot. */
  lowDriven?: boolean;
  /** The human's last shot, for the low-driven double tap during its wind-up. */
  lastShot?: { at: number; power: number; aim: number; type: ShotType; penalty: boolean; goalX: number; low: boolean } | null;
  dive: number;
  /** Side of the current dive (+1 his left, −1 his right), for the animation. */
  diveSide?: number;
  /** A keeper's attempt to stop the current shot (see mechanics/goalkeeping). */
  save?: KeeperSave | null;
  /** Human keeper in a shoot-out: the dive chosen with the stick before the kick (+1 left, −1 right, 0 stay). */
  penaltyDive?: number | null;
  aiTimer: number;
  /** AI: seconds on the ball in the current possession (raises pass urgency). */
  aiHold?: number;
  /** Human pass power being charged (0 = not charging) and the pass kind chosen on press. */
  passCharge?: number;
  passChargeKind?: { kind?: PassKind; driven: boolean } | null;
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

/** A keeper's attempt on one shot: reading it, then a committed dive (or set). */
export interface KeeperSave {
  shotId: number;
  /** Clock when he has read the shot and can move. */
  reactAt: number;
  committed: boolean;
  commitAt: number;
  /** Where the dive started and the ball direction it was read against. */
  from: Vec2;
  n: Vec2;
  /** +1 left, −1 right (facing the ball), 0 set. */
  dir: number;
  need: number;
  resolved: boolean;
  screened: boolean;
  /** Ball position last step (for the plane crossing). */
  prev: Vec3;
}

/** One kick of a penalty shoot-out (Law 10). */
export interface ShootoutKick { team: number; player: number; name: string; scored: boolean; how: 'goal' | 'saved' | 'missed' | 'post' }
/**
 * A penalty shoot-out (Law 10): both teams kick at one goal, alternately
 * (A B A B), five each unless one can no longer catch up, then sudden death
 * in pairs. Every eligible player kicks once before anyone kicks twice.
 */
export interface ShootoutState {
  goalX: number;
  /** Team that kicks first (coin toss). */
  first: number;
  /** Kicking order per team: player ids, keepers last. */
  order: [number[], number[]];
  taken: [number, number];
  scores: [number, number];
  kicks: ShootoutKick[];
  /** Team taking the current kick. */
  turn: number;
  stage: 'cut' | 'ready' | 'struck' | 'result' | 'done';
  /** Seconds in the current stage. */
  t: number;
  kicker: Player | null;
  keeper: Player | null;
  winner: number | null;
  /** The ball has been seen inside the goal (counted when the kick is over). */
  inGoal?: boolean;
  touchedPost?: boolean;
  /** Last result for the HUD. */
  last?: ShootoutKick | null;
  /** When the AI kicker strikes (seconds into the ready stage). */
  aiAt?: number;
  aiPlan?: null;
}

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
  /** A draw at full time goes to a penalty shoot-out. */
  penaltiesIfDraw?: boolean;
  extraTimeDuration: number;
  extraTimeStarted: boolean;
  practice: boolean;
  indoor: boolean;
  penalty: PenaltyState | null;
  /** A penalty shoot-out in progress (or finished: stage 'done'). */
  shootout?: ShootoutState | null;
  openingKickoff: number;
  phase: Phase;
  /** Explicit gameplay flow, separate from the legacy presentation phase. */
  flow: MatchFlow;
  transition: FlowTransition | null;
  phaseTimer: number;
  halftimeDone: boolean;
  restart: { type: string; team: number } | null;
  /** Advantage being played after a foul (play continues; may come back to the foul). */
  advantage?: { team: number; spot: Vec2; foulerId: number; until: number; card: 'yellow' | 'red' | null } | null;
  /** Cards for fouls played on with advantage, shown at the next stoppage (Law 12). */
  pendingCards?: Array<{ playerId: number; color: 'yellow' | 'red' }>;
  events: MatchEvent[];
  banner: { text: string; time: number } | null;
  lastGoal?: GoalInfo;
  kickoffNext?: number;
  /** A restart being set up or waiting to be taken (see stepSetPiece). */
  setPiece?: SetPieceState | null;
  /** Law 8: a kick-off is set but the ball has not been kicked yet (everyone holds his half). */
  kickoffPending?: boolean;
  /** Player id taking the pending kick-off. */
  kickoffTaker?: number;
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
  /** Decide a draw with a penalty shoot-out. */
  penalties?: boolean;
}

/** One human's input for a fixed step. */
export interface InputFrame {
  mx?: number; mz?: number; sprint?: boolean;
  passPressed?: boolean; loftPressed?: boolean; throughPressed?: boolean; drivenPressed?: boolean;
  /** Any pass button still held (hold to charge pass power; released = pass). */
  passHeld?: boolean;
  keeperSwitchPressed?: boolean;
  /** Keeper holding the ball: drop it to his feet. */
  dropPressed?: boolean;
  shootHeld?: boolean; shootPressed?: boolean; finesseHeld?: boolean; chipHeld?: boolean;
}
export type Inputs = Partial<Record<HumanId, InputFrame | null>>;
