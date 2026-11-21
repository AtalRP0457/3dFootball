// Pose maths: create, blend and keyframe poses. A pose is a set of bone
// Euler angles (YXZ order, radians) plus whole-body root offsets.
import type { PoseData } from '../player/PlayerTypes.ts';

export const POSE_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder.L', 'upperArm.L', 'lowerArm.L', 'hand.L',
  'shoulder.R', 'upperArm.R', 'lowerArm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'toe.L',
  'thigh.R', 'shin.R', 'foot.R', 'toe.R',
] as const;
export type PoseBone = (typeof POSE_BONES)[number];

export type Euler3 = [number, number, number];
export type PartialPose = Partial<Record<PoseBone, Partial<{ x: number; y: number; z: number }>>> & {
  hipDrop?: number; lift?: number; pitch?: number; roll?: number; yawOffset?: number;
};

export function emptyPose(): PoseData {
  const bones: Record<string, [number, number, number]> = {};
  for (const b of POSE_BONES) bones[b] = [0, 0, 0];
  return { bones, hipDrop: 0, lift: 0, pitch: 0, roll: 0, yawOffset: 0 };
}

export function clonePose(p: PoseData): PoseData {
  const bones: Record<string, [number, number, number]> = {};
  for (const k of Object.keys(p.bones)) { const v = p.bones[k]; bones[k] = [v[0], v[1], v[2]]; }
  return { bones, hipDrop: p.hipDrop, lift: p.lift, pitch: p.pitch, roll: p.roll, yawOffset: p.yawOffset };
}

/** Blend b over a by weight w (0 = a, 1 = b), written into `out`. */
export function blendPose(a: PoseData, b: PoseData, w: number, out: PoseData = emptyPose()): PoseData {
  const k = Math.max(0, Math.min(1, w));
  for (const name of POSE_BONES) {
    const x = a.bones[name], y = b.bones[name], o = out.bones[name];
    o[0] = x[0] + (y[0] - x[0]) * k; o[1] = x[1] + (y[1] - x[1]) * k; o[2] = x[2] + (y[2] - x[2]) * k;
  }
  out.hipDrop = a.hipDrop + (b.hipDrop - a.hipDrop) * k;
  out.lift = a.lift + (b.lift - a.lift) * k;
  out.pitch = a.pitch + (b.pitch - a.pitch) * k;
  out.roll = a.roll + (b.roll - a.roll) * k;
  out.yawOffset = a.yawOffset + (b.yawOffset - a.yawOffset) * k;
  return out;
}

/** Write the channels a partial pose defines into `p`, mixed by weight w. */
export function applyPartial(p: PoseData, part: PartialPose, w = 1): void {
  for (const name of POSE_BONES) {
    const e = part[name];
    if (!e) continue;
    const o = p.bones[name];
    if (e.x !== undefined) o[0] += (e.x - o[0]) * w;
    if (e.y !== undefined) o[1] += (e.y - o[1]) * w;
    if (e.z !== undefined) o[2] += (e.z - o[2]) * w;
  }
  if (part.hipDrop !== undefined) p.hipDrop += (part.hipDrop - p.hipDrop) * w;
  if (part.lift !== undefined) p.lift += (part.lift - p.lift) * w;
  if (part.pitch !== undefined) p.pitch += (part.pitch - p.pitch) * w;
  if (part.roll !== undefined) p.roll += (part.roll - p.roll) * w;
  if (part.yawOffset !== undefined) p.yawOffset += (part.yawOffset - p.yawOffset) * w;
}

export interface Keyframe { t: number; pose: PartialPose }

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Evaluate keyframes (sorted by t, 0..1) at normalised time t with smoothstep easing per segment. */
export function sampleKeys(keys: readonly Keyframe[], t: number): PartialPose {
  if (keys.length === 0) return {};
  if (t <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const k = smooth((t - a.t) / Math.max(1e-6, b.t - a.t));
      return mixPartial(a.pose, b.pose, k);
    }
  }
  return keys[keys.length - 1].pose;
}

function mixPartial(a: PartialPose, b: PartialPose, k: number): PartialPose {
  const out: PartialPose = {};
  for (const name of POSE_BONES) {
    const ea = a[name], eb = b[name];
    if (!ea && !eb) continue;
    const r: { x?: number; y?: number; z?: number } = {};
    for (const c of ['x', 'y', 'z'] as const) {
      const va = ea?.[c], vb = eb?.[c];
      if (va === undefined && vb === undefined) continue;
      r[c] = (va ?? 0) + ((vb ?? 0) - (va ?? 0)) * k;
    }
    out[name] = r;
  }
  for (const c of ['hipDrop', 'lift', 'pitch', 'roll', 'yawOffset'] as const) {
    const va = a[c], vb = b[c];
    if (va === undefined && vb === undefined) continue;
    out[c] = (va ?? 0) + ((vb ?? 0) - (va ?? 0)) * k;
  }
  return out;
}

/** Mirror a partial pose left ↔ right (for kicks with the other foot). */
export function mirrorPartial(p: PartialPose): PartialPose {
  const out: PartialPose = {};
  for (const name of POSE_BONES) {
    const e = p[name];
    if (!e) continue;
    const other = (name.endsWith('.L') ? name.replace('.L', '.R') : name.endsWith('.R') ? name.replace('.R', '.L') : name) as PoseBone;
    out[other] = { x: e.x, y: e.y === undefined ? undefined : -e.y, z: e.z === undefined ? undefined : -e.z };
  }
  if (p.hipDrop !== undefined) out.hipDrop = p.hipDrop;
  if (p.lift !== undefined) out.lift = p.lift;
  if (p.pitch !== undefined) out.pitch = p.pitch;
  if (p.roll !== undefined) out.roll = -p.roll;
  if (p.yawOffset !== undefined) out.yawOffset = -p.yawOffset;
  return out;
}
