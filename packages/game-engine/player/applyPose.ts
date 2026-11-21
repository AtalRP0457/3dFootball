// Writes an engine pose onto the shared skinned character (22-bone rig),
// interpolated between two fixed steps. Used by the Lab (PlayerModel) and by
// the match renderer, so a player is animated the same way everywhere.
import type * as THREE from 'three';
import { POSE_BONES } from '../animation/AnimationBlending.ts';
import type { PoseData } from './PlayerTypes.ts';

export interface PosedRig {
  bones: Record<string, THREE.Bone>;
  /** Bone-space → world scale of the character. */
  scale: number;
}

export interface RootMotion { pitch: number; roll: number; lift: number; yawOffset: number }

/** Apply pose a→b at t (0..1) to the bones; returns the whole-body root motion. */
export function applyEnginePose(rig: PosedRig, a: PoseData, b: PoseData, t: number, hipsBindY: number): RootMotion {
  for (const name of POSE_BONES) {
    const bone = rig.bones[name];
    if (!bone) continue;
    const x = a.bones[name], y = b.bones[name];
    if (!x || !y) continue;
    bone.rotation.set(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, 'YXZ');
  }
  const hips = rig.bones.hips;
  if (hips) hips.position.y = hipsBindY - (a.hipDrop + (b.hipDrop - a.hipDrop) * t) / rig.scale;
  return {
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    roll: a.roll + (b.roll - a.roll) * t,
    lift: a.lift + (b.lift - a.lift) * t,
    yawOffset: a.yawOffset + (b.yawOffset - a.yawOffset) * t,
  };
}
