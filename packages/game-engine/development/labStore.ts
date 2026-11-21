// Lab UI state (Zustand). Simulation state lives in the engine; the store
// only holds UI choices and a throttled debug snapshot for the panels.
import { create } from 'zustand';
import type { MovementState } from '../player/PlayerTypes.ts';
import type { SpinComponents } from '../ball/BallTypes.ts';

export type CameraMode = 'follow' | 'side' | 'broadcast' | 'free';
export type SparringMode = 'off' | 'defender' | 'dribbler' | 'passer';
export type FpsCap = 0 | 30 | 60 | 120 | 144;

export interface PlayerStats {
  speed: number;
  accel: number;
  heading: number;
  animation: string;
  movement: MovementState;
  stamina: number;
  balance: number;
  grounded: boolean;
  colliding: boolean;
  hasBall: boolean;
  supportFoot: string;
  gaitPhase: number;
  charge: { pass: number; through: number; lob: number; shoot: number };
  pending: string | null;
  velocity: [number, number];
  stick: [number, number];
  possession: string;
  selectedFoot: string;
  action: string;
}
export interface InputStats {
  held: { J: boolean; K: boolean; I: boolean; L: boolean };
  /** Seconds the current kick button has been held. */
  hold: number;
  /** Power the current hold would give (0.25–1), 0 when nothing is held. */
  power: number;
  last: string;
}
export interface BallStats {
  speed: number;
  position: [number, number, number];
  velocity: [number, number, number];
  angular: [number, number, number];
  spin: SpinComponents;
  height: number;
  grounded: boolean;
  lastSurface: string;
  lastTouchBy: string;
  owner: string;
  possessionState: string;
  lastContact: string;
  lastImpulse: string;
  physicsState: string;
}
export interface LabStats {
  player: PlayerStats;
  input: InputStats;
  ball: BallStats;
  events: string[];
  fps: number;
  physicsHz: number;
  simTime: number;
}

interface LabState {
  camera: CameraMode;
  showPanels: boolean;
  showOverlays: boolean;
  showGuide: boolean;
  fpsCap: FpsCap;
  sparring: SparringMode;
  tab: 'player' | 'ball' | 'tests';
  paused: boolean;
  slowmo: boolean;
  stats: LabStats | null;
  lastTest: string | null;
  /** Gameplay tests A–D: queue, the one running, its current step, results. */
  gtQueue: string[];
  gtRunning: string | null;
  gtStep: string;
  gtResults: Record<string, Array<{ name: string; pass: boolean; detail: string }>>;
  set: (patch: Partial<Omit<LabState, 'set'>>) => void;
}

export const useLabStore = create<LabState>((set) => ({
  camera: 'follow',
  showPanels: true,
  showOverlays: true,
  showGuide: true,
  fpsCap: 0,
  sparring: 'off',
  tab: 'player',
  paused: false,
  slowmo: false,
  stats: null,
  lastTest: null,
  gtQueue: [],
  gtRunning: null,
  gtStep: '',
  gtResults: {},
  set: (patch) => set(patch),
}));
