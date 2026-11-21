// Pose generation: locomotion from the stride model + leg IK, upper-body
// dynamics from the real acceleration and turn rate, idle behaviours, and
// the active action clip layered on top. Runs once per fixed step, so the
// pose and the physics share time and coordinates.
import { emptyPose, applyPartial, sampleKeys, mirrorPartial } from '../animation/AnimationBlending.ts';
import { footAt, type FootContact, type GaitParams } from '../animation/FootContact.ts';
import { solveLeg } from '../animation/InverseKinematics.ts';
import type { AnimationStateMachine } from '../animation/AnimationStateMachine.ts';
import type { MovementState, PoseData } from './PlayerTypes.ts';
import type { RigDims } from './PlayerRig.ts';

export interface PoseContext {
  sm: AnimationStateMachine;
  gait: GaitParams;
  contact: FootContact;
  dims: RigDims;
  movement: MovementState;
  speed: number;
  /** Gait plane yaw relative to the body (strafing), rad. */
  gaitYaw: number;
  /** Acceleration in the body frame (m/s²). */
  accelForward: number;
  accelLeft: number;
  yawRate: number;
  time: number;
  /** 0..1: ball coming, get ready. */
  readiness: number;
  /** Where to look, relative to body yaw (rad), or null to look around. */
  lookYaw: number | null;
  lookDown: number;
  /** Defensive stance (jockey / shield). */
  defending: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function computePose(c: PoseContext): PoseData {
  const p = emptyPose();
  const g = c.gait;
  const B = p.bones;
  const moving = smooth(0.12, 0.7, c.speed);
  const stepping = c.movement === 'turn' ? 1 : moving;
  const jockey = c.defending;
  const idleCrouch = 0.02 + 0.06 * c.readiness;

  // ---- legs (IK on the stride path) ----
  const hipH = c.dims.hipAboveAnkle;
  for (const side of ['L', 'R'] as const) {
    const u = c.contact.legPhase(side);
    const f = footAt(u, g, hipH);
    // Standing pose: feet under the hips, slight weight shift.
    const shift = side === 'L' ? 0.012 : -0.012;
    const standZ = (side === 'L' ? 0.03 : -0.02) + shift * Math.sin(c.time * 0.9);
    const standY = -(hipH - idleCrouch);
    const z = standZ + (f.z - standZ) * stepping;
    const y = standY + (f.y - standY) * stepping;
    const ik = solveLeg(z, y, c.dims.thigh, c.dims.shin);
    const sx = side === 'L' ? 1 : -1;
    B[`thigh.${side}`] = [ik.thigh, c.gaitYaw * 0.85 * stepping, sx * (0.03 + (jockey ? 0.12 : 0))];
    B[`shin.${side}`] = [ik.shin, 0, 0];
    B[`foot.${side}`] = [-(ik.thigh + ik.shin) + f.footPitch * stepping, 0, 0];
    B[`toe.${side}`] = [-0.5 * f.footPitch * stepping, 0, 0];
  }

  // ---- hips and torso ----
  const phase = c.contact.phase;
  const bobWave = Math.cos(2 * Math.PI * 2 * (phase - g.duty * 0.5));
  p.hipDrop = (g.crouch * moving) + idleCrouch * (1 - moving) + g.bob * 0.5 * (1 + bobWave) * moving;
  const twist = g.pelvis * Math.sin(2 * Math.PI * phase) * moving;
  B.hips = [0.04 * moving, -twist, 0];
  const accelLean = clamp(c.accelForward * 0.025, -0.22, 0.18);
  const lean = g.lean * moving + accelLean + (c.movement === 'brake' ? -0.18 : 0);
  B.spine = [lean * 0.6, twist * 0.5, 0];
  B.chest = [lean * 0.4 + 0.02 * Math.sin(c.time * 1.75) * (1 - moving), twist * 0.9, 0];
  // Lean into turns: centripetal acceleration tips the whole body.
  p.roll = clamp(-c.accelLeft * 0.03, -0.38, 0.38) * moving;
  // Idle weight shift.
  p.roll += 0.02 * Math.sin(c.time * 0.7) * (1 - moving);

  // ---- arms ----
  const legFwd = (side: 'L' | 'R') => {
    const f = footAt(c.contact.legPhase(side), g, hipH);
    const F = Math.max(0.05, g.stance * 0.5);
    return clamp(f.z / F, -1.2, 1.2);
  };
  const armsOut = jockey ? 0.4 : 0.1 + 0.25 * c.readiness;
  for (const side of ['L', 'R'] as const) {
    const other = side === 'L' ? 'R' : 'L';
    const sx = side === 'L' ? 1 : -1;
    const swing = -g.arms * 0.55 * legFwd(other) * moving;
    B[`upperArm.${side}`] = [swing + 0.05, 0, sx * (armsOut + 0.04 * moving)];
    B[`lowerArm.${side}`] = [-(0.25 + (g.elbow - 0.25) * moving), 0, 0];
    B[`hand.${side}`] = [0, 0, 0];
    B[`shoulder.${side}`] = [0, 0, 0];
  }

  // ---- head ----
  let look = c.lookYaw;
  if (look === null) look = (0.45 * Math.sin(c.time * 0.31) + 0.25 * Math.sin(c.time * 0.83)) * (1 - moving);
  look = clamp(look, -1.1, 1.1);
  B.neck = [0.1 * c.lookDown, look * 0.4, 0];
  B.head = [0.25 * c.lookDown - lean * 0.5, look * 0.6, 0];

  // ---- action layer ----
  const a = c.sm.action;
  if (a) {
    const t = Math.min(1, a.time / a.clip.duration);
    let keys = sampleKeys(a.clip.keys, t);
    if (a.foot === 'L') keys = mirrorPartial(keys);
    applyPartial(p, keys, c.sm.actionWeight);
  }
  return p;
}
