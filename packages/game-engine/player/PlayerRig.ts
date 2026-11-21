// The shared humanoid skeleton: dimensions and forward kinematics.
// Matches the skinned character in src/render/character/rig.js (22 bones,
// identity bind pose facing +z, left side towards +x). Physics uses the FK
// here to know where each foot actually is at a contact frame, so the ball is
// struck where the rendered foot is.
import * as THREE from 'three';
import type { PoseData } from './PlayerTypes.ts';
import type { Vec3 } from '../physics/Vec3.ts';

/** Reference proportions of the 1.80 m skeleton (bone-space metres). */
export const RIG_REF = Object.freeze({
  ankle: 0.08, shin: 0.42, thigh: 0.43, legX: 0.093, hip: 0.93, crown: 1.795, toe: 0.11,
});

export interface RigDims {
  /** Bone-space → world scale. */
  scale: number;
  thigh: number;
  shin: number;
  ankle: number;
  legX: number;
  /** Standing hip height (world m). */
  hip: number;
  /** Ankle-to-hip height (world m) – what leg IK works with. */
  hipAboveAnkle: number;
}

export function rigDims(heightM: number): RigDims {
  const s = heightM / RIG_REF.crown;
  return {
    scale: s,
    thigh: RIG_REF.thigh * s,
    shin: RIG_REF.shin * s,
    ankle: RIG_REF.ankle * s,
    legX: RIG_REF.legX * s,
    hip: RIG_REF.hip * s,
    hipAboveAnkle: (RIG_REF.hip - RIG_REF.ankle) * s,
  };
}

const M = new THREE.Matrix4(), T = new THREE.Matrix4(), E = new THREE.Euler();
const P = new THREE.Vector3();

function bone(name: string, pose: PoseData): THREE.Matrix4 {
  const r = pose.bones[name] ?? [0, 0, 0];
  return T.makeRotationFromEuler(E.set(r[0], r[1], r[2], 'YXZ'));
}

/**
 * World position of a foot's striking surface (instep) for a pose, a body
 * position on the ground and a body yaw.
 */
export function footWorld(pose: PoseData, side: 'L' | 'R', root: Vec3, yaw: number, dims: RigDims): Vec3 {
  const s = dims.scale, sx = side === 'L' ? 1 : -1;
  M.makeTranslation(root.x, root.y + pose.lift, root.z);
  M.multiply(T.makeRotationFromEuler(E.set(pose.pitch, yaw + pose.yawOffset, pose.roll, 'YXZ')));
  M.multiply(T.makeScale(s, s, s));
  M.multiply(T.makeTranslation(0, RIG_REF.hip - pose.hipDrop / s, 0));
  M.multiply(bone('hips', pose));
  M.multiply(T.makeTranslation(sx * RIG_REF.legX, 0, 0));
  M.multiply(bone(`thigh.${side}`, pose));
  M.multiply(T.makeTranslation(0, -RIG_REF.thigh, 0));
  M.multiply(bone(`shin.${side}`, pose));
  M.multiply(T.makeTranslation(0, -RIG_REF.shin, 0));
  M.multiply(bone(`foot.${side}`, pose));
  P.set(0, -0.03, 0.07).applyMatrix4(M);
  return { x: P.x, y: P.y, z: P.z };
}

/** World position of the head centre (headers). */
export function headWorld(pose: PoseData, root: Vec3, yaw: number, dims: RigDims): Vec3 {
  const s = dims.scale;
  M.makeTranslation(root.x, root.y + pose.lift, root.z);
  M.multiply(T.makeRotationFromEuler(E.set(pose.pitch, yaw + pose.yawOffset, pose.roll, 'YXZ')));
  M.multiply(T.makeScale(s, s, s));
  M.multiply(T.makeTranslation(0, RIG_REF.hip - pose.hipDrop / s, 0));
  M.multiply(bone('hips', pose));
  M.multiply(T.makeTranslation(0, 0.1, 0)); M.multiply(bone('spine', pose));
  M.multiply(T.makeTranslation(0, 0.2, 0)); M.multiply(bone('chest', pose));
  M.multiply(T.makeTranslation(0, 0.245, 0)); M.multiply(bone('neck', pose));
  M.multiply(T.makeTranslation(0, 0.075, 0)); M.multiply(bone('head', pose));
  P.set(0, 0.12, 0.02).applyMatrix4(M);
  return { x: P.x, y: P.y, z: P.z };
}
