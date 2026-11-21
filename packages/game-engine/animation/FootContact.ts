// Stride model shared by animation and physics. The gait phase advances by
// the ground distance actually travelled divided by the cycle length, so the
// stance foot moves backwards relative to the body at exactly body speed:
// feet cannot slide, at any speed, any frame rate.
//
// Phase 0 = left foot strikes the ground, 0.5 = right foot strikes.

export interface GaitParams {
  /** Ground distance of one full cycle (two steps), m. */
  cycle: number;
  /** Ground distance covered while one foot is planted, m. */
  stance: number;
  /** Fraction of the cycle each foot is on the ground. */
  duty: number;
  /** Swing-foot clearance, m. */
  lift: number;
  /** Hip lowering, m, and vertical bounce amplitude, m. */
  crouch: number;
  bob: number;
  /** Heel lift at toe-off, m. */
  heel: number;
  /** Upper body: forward lean (rad), arm swing (rad), elbow flex (rad), pelvis twist (rad). */
  lean: number;
  arms: number;
  elbow: number;
  pelvis: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sat = (x: number) => Math.max(0, Math.min(1, x));

/** Gait for a ground speed (m/s), scaled to leg length (1 = reference 1.80 m). */
export function gaitFor(speed: number, legScale = 1, style: 'normal' | 'dribble' | 'jockey' = 'normal'): GaitParams {
  const s = Math.max(0, speed);
  const run = sat((s - 2.0) / 1.2);           // walk → run transition
  const fast = sat((s - 5.5) / 3.0);          // run → sprint
  const stepLen = lerp(0.42 + 0.14 * s, 0.45 + 0.21 * s, run) * legScale * (style === 'dribble' ? 0.82 : style === 'jockey' ? 0.6 : 1);
  const cycle = Math.max(0.5, 2 * stepLen);
  const maxStance = (0.62 + 0.28 * sat(s / 8)) * legScale;
  const nominalDuty = lerp(0.62, lerp(0.36, 0.24, fast), run);
  const stance = Math.min(maxStance, nominalDuty * cycle);
  return {
    cycle,
    stance,
    duty: stance / cycle,
    lift: lerp(0.07, lerp(0.24, 0.44, fast), run) * legScale * (style === 'jockey' ? 0.5 : 1),
    crouch: lerp(0.02, lerp(0.05, 0.08, fast), run) + (style === 'dribble' ? 0.03 : style === 'jockey' ? 0.13 : 0),
    bob: lerp(0.012, lerp(0.03, 0.04, fast), run),
    heel: lerp(0.06, lerp(0.1, 0.15, fast), run),
    lean: lerp(0.04, lerp(0.14, 0.26, fast), run) + (style === 'dribble' ? 0.1 : style === 'jockey' ? 0.22 : 0),
    arms: lerp(0.3, lerp(0.6, 0.95, fast), run) * (style === 'jockey' ? 0.3 : 1),
    elbow: lerp(0.3, lerp(1.25, 1.55, fast), run),
    pelvis: lerp(0.1, lerp(0.14, 0.18, fast), run),
  };
}

export interface FootSample {
  /** Ankle relative to the hip joint in the gait plane (z forward, y up), metres. */
  z: number;
  y: number;
  planted: boolean;
  /** 0..1 progress through stance or swing. */
  progress: number;
  /** Extra foot pitch (toe-off, swing). */
  footPitch: number;
}

/**
 * Ankle path for one leg at leg phase u (0..1, 0 = strike).
 * `hipHeight` is the ankle-to-hip vertical distance when standing tall.
 */
export function footAt(u: number, g: GaitParams, hipHeight: number): FootSample {
  const F = g.stance * 0.42, B = g.stance * 0.58;
  const groundY = -(hipHeight - g.crouch);
  if (u < g.duty) {
    const p = u / g.duty;
    const z = F - (F + B) * p;
    // Heel rises over the last 35% of stance (rolling onto the toes).
    const toe = sat((p - 0.65) / 0.35);
    return { z, y: groundY + g.heel * toe * toe, planted: true, progress: p, footPitch: 0.9 * toe * toe };
  }
  const s = (u - g.duty) / (1 - g.duty);
  const e = s * s * (3 - 2 * s);
  const z = -B + (F + B) * e - g.lift * 0.35 * Math.sin(Math.PI * Math.min(1, s * 1.4));
  const y = groundY + g.heel * (1 - s) + g.lift * Math.sin(Math.PI * Math.min(1, s * 1.1)) ** 0.85;
  return { z, y, planted: false, progress: s, footPitch: 0.5 * (1 - e) - 0.15 * Math.sin(Math.PI * s) };
}

/** Tracks phase and emits foot-strike events. */
export class FootContact {
  phase = 0;
  /** Which foot struck in the last update (if any). */
  struck: 'L' | 'R' | null = null;

  /** Advance by signed ground distance along the gait direction. */
  advance(distance: number, g: GaitParams): void {
    const before = this.phase;
    this.phase = (((this.phase + distance / g.cycle) % 1) + 1) % 1;
    this.struck = null;
    if (distance > 0) {
      if (crossed(before, this.phase, 0)) this.struck = 'L';
      else if (crossed(before, this.phase, 0.5)) this.struck = 'R';
    } else if (distance < 0) {
      // Walking backwards: strikes happen at the front end of the stance.
      if (crossed(this.phase, before, g.duty)) this.struck = 'L';
      else if (crossed(this.phase, before, (0.5 + g.duty) % 1)) this.struck = 'R';
    }
  }
  legPhase(side: 'L' | 'R'): number {
    return side === 'L' ? this.phase : (this.phase + 0.5) % 1;
  }
  /** The foot currently planted (or the one closest to striking). */
  supportFoot(g: GaitParams): 'L' | 'R' {
    return this.legPhase('L') < g.duty ? 'L' : 'R';
  }
}

/** Did a forward move from a to b (wrapping at 1) pass mark m? */
function crossed(a: number, b: number, m: number): boolean {
  if (a === b) return false;
  if (a < b) return a < m && m <= b;
  return m > a || m <= b;
}
