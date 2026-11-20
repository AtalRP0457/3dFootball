// Footballer skeleton. Reference proportions are for a 1.80 m man; body
// types change widths and leg length, and the whole character is scaled to
// the player's real height. All bones have identity rotation in the bind
// pose (the character stands facing +z, his left side towards +x), so
// animation clips can be shared by every body type.
//
// Bone names follow a simple convention (hips, spine, chest, neck, head,
// upperArm.L, lowerArm.L, hand.L, thigh.L, shin.L, foot.L, toe.L, ...). The
// GLB pipeline (assets.js) maps Mixamo / common rig names onto these.

import * as THREE from 'three';
import { BODY_TYPES } from '../../game/players/identity.js';

export const BONE_NAMES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder.L', 'upperArm.L', 'lowerArm.L', 'hand.L',
  'shoulder.R', 'upperArm.R', 'lowerArm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'toe.L',
  'thigh.R', 'shin.R', 'foot.R', 'toe.R',
];
const PARENT = {
  hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  'shoulder.L': 'chest', 'upperArm.L': 'shoulder.L', 'lowerArm.L': 'upperArm.L', 'hand.L': 'lowerArm.L',
  'shoulder.R': 'chest', 'upperArm.R': 'shoulder.R', 'lowerArm.R': 'upperArm.R', 'hand.R': 'lowerArm.R',
  'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L', 'toe.L': 'foot.L',
  'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R', 'toe.R': 'foot.R',
};

/** Leg segment lengths of the reference skeleton (metres). */
export const REF = { ankle: 0.08, shin: 0.42, thigh: 0.43, upperArm: 0.29, forearm: 0.265, hand: 0.18, toe: 0.11 };

/**
 * Bind-pose layout (world positions, metres) for a body type.
 * Returns { bones: {name: Vector3}, dims } where dims holds the measurements
 * the mesh builder needs.
 */
export function layout(bodyType = 'athletic') {
  const b = BODY_TYPES[bodyType] || BODY_TYPES.athletic;
  const thigh = REF.thigh * b.leg, shin = REF.shin * b.leg;
  const H = REF.ankle + shin + thigh; // hip joint height
  const shoulderY = H + 0.465;
  const armX = 0.19 * b.shoulder;
  const legX = 0.093 * b.hip;
  const P = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  const bones = {
    root: P(0, 0),
    hips: P(0, H),
    spine: P(0, H + 0.1),
    chest: P(0, H + 0.3),
    neck: P(0, H + 0.545),
    head: P(0, H + 0.62),
  };
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    bones[`shoulder.${s}`] = P(sx * 0.07, shoulderY - 0.01);
    bones[`upperArm.${s}`] = P(sx * armX, shoulderY);
    bones[`lowerArm.${s}`] = P(sx * armX, shoulderY - REF.upperArm);
    bones[`hand.${s}`] = P(sx * armX, shoulderY - REF.upperArm - REF.forearm);
    bones[`thigh.${s}`] = P(sx * legX, H);
    bones[`shin.${s}`] = P(sx * legX, H - thigh);
    bones[`foot.${s}`] = P(sx * legX, REF.ankle);
    bones[`toe.${s}`] = P(sx * legX, 0.03, REF.toe);
  }
  const crown = bones.head.y + 0.245;
  return {
    bones,
    dims: { H, thigh, shin, shoulderY, armX, legX, crown, build: b },
  };
}

/** Create THREE.Bone objects for a layout; returns { root, bones (by name), list }. */
export function createSkeletonBones(lay) {
  const bones = {};
  const list = [];
  for (const name of BONE_NAMES) {
    const bone = new THREE.Bone();
    bone.name = nodeName(name);
    bones[name] = bone;
    list.push(bone);
  }
  for (const name of BONE_NAMES) {
    if (name === 'root') { bones.root.position.copy(lay.bones.root); continue; }
    const parent = PARENT[name];
    bones[parent].add(bones[name]);
    bones[name].position.copy(lay.bones[name]).sub(lay.bones[parent]);
  }
  return { root: bones.root, bones, list };
}

export const boneIndex = (name) => BONE_NAMES.indexOf(name);
/**
 * Scene-graph name of a bone. Animation track paths use '.' as a separator,
 * so 'upperArm.L' is stored as 'upperArm_L'.
 */
export const nodeName = (name) => name.replace('.', '_');
