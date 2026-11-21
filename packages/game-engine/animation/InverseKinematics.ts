// Two-bone IK for legs (and arms). Works in the leg's sagittal plane: the
// thigh pitches forward with negative x rotation, the knee flexes with
// positive x rotation (bind pose: limbs hang straight down, facing +z).

export interface LegAngles { thigh: number; shin: number; reach: number; clamped: boolean }

/**
 * Ankle target (z forward, y up) relative to the hip joint → thigh pitch and
 * knee flex. Targets out of reach are clamped to a fully extended leg.
 */
export function solveLeg(z: number, y: number, thighLen: number, shinLen: number): LegAngles {
  let d = Math.hypot(z, y);
  const max = thighLen + shinLen - 1e-4;
  let clamped = false;
  if (d > max) { z *= max / d; y *= max / d; d = max; clamped = true; }
  const min = Math.abs(thighLen - shinLen) + 1e-3;
  if (d < min) { z *= min / d; y *= min / d; d = min; }
  const cosKnee = (thighLen * thighLen + shinLen * shinLen - d * d) / (2 * thighLen * shinLen);
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosKnee)));
  const alpha = Math.atan2(z, -y);
  const cosB = (thighLen * thighLen + d * d - shinLen * shinLen) / (2 * thighLen * d);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosB)));
  return { thigh: -(alpha + beta), shin: knee, reach: d, clamped };
}

/** Forward kinematics in the same plane: ankle (z, y) from thigh/shin angles. */
export function legFK(thigh: number, shin: number, thighLen: number, shinLen: number): { z: number; y: number } {
  // Thigh direction after pitch: (0, −cos, −sin) rotated by −thigh … keep sign conventions explicit.
  const a1 = -thigh;                // forward angle of the thigh from vertical
  const kz = Math.sin(a1) * thighLen, ky = -Math.cos(a1) * thighLen;
  const a2 = a1 - shin;             // shin angle from vertical
  return { z: kz + Math.sin(a2) * shinLen, y: ky - Math.cos(a2) * shinLen };
}
