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
}
export interface LabStats {
  player: PlayerStats;
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
  tab: 'player' | 'ball';
  paused: boolean;
  slowmo: boolean;
  stats: LabStats | null;
  lastTest: string | null;
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
  set: (patch) => set(patch),
}));
