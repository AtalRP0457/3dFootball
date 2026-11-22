// Type declarations for the shared skinned footballer (character.js), so
// TypeScript code (the game engine and the Player & Ball Lab) can use it
// without casts.
import type * as THREE from 'three';
import type { Identity } from '../../types/game.ts';

export interface CharacterKit {
  shirt: string;
  shorts: string;
  socks: string;
  gk: string;
  design?: string;
  secondary?: string;
}

export interface CharacterOptions {
  identity: Identity;
  kit: CharacterKit;
  keeper?: boolean;
  crestUrl?: string;
  teamKey?: string;
  shadows?: boolean;
}

export interface Character {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  /** Bones by rig name: hips, spine, chest, neck, head, upperArm.L, thigh.R, … */
  bones: Record<string, THREE.Bone>;
  identity: Identity;
  /** Bone-space → world scale (player height / reference crown height). */
  scale: number;
  headHeight: number;
  /** Fine facial detail (eyes, lids, brows) hidden for distant players. */
  detail: THREE.Object3D[];
  update(dt: number, p: unknown, ctx?: unknown): void;
  setCaptain(on: boolean): void;
  dispose(): void;
}

export function createCharacter(o: CharacterOptions): Character;
