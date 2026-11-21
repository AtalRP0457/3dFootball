// Accumulator-based fixed timestep. Simulation advances in identical steps of
// `dt` no matter how often frames are rendered; rendering interpolates
// between the previous and current physics state with `alpha`.

export interface StepResult {
  /** Fixed steps run this frame. */
  steps: number;
  /** Interpolation factor 0..1 between previous and current state. */
  alpha: number;
  /** Time dropped because the frame was too long (spiral-of-death guard). */
  dropped: number;
}

export class FixedTimestep {
  private acc = 0;
  /** Total simulated time (s). */
  simTime = 0;
  /** Total fixed steps run. */
  stepCount = 0;

  constructor(public dt: number, public maxSteps = 8) {}

  /**
   * Advance by a real frame time. `step` is called once per fixed step with
   * the fixed dt; it must not depend on the frame time.
   */
  advance(frameDt: number, step: (dt: number) => void): StepResult {
    const clamped = Math.max(0, frameDt);
    this.acc += clamped;
    let steps = 0;
    while (this.acc >= this.dt - 1e-9 && steps < this.maxSteps) {
      step(this.dt);
      this.acc -= this.dt;
      this.simTime += this.dt;
      this.stepCount += 1;
      steps += 1;
    }
    let dropped = 0;
    if (steps >= this.maxSteps && this.acc > this.dt) {
      dropped = this.acc - this.dt;
      this.acc = this.dt * 0.999;
    }
    if (this.acc < 0) this.acc = 0;
    return { steps, alpha: Math.min(1, this.acc / this.dt), dropped };
  }

  reset(): void {
    this.acc = 0;
    this.simTime = 0;
    this.stepCount = 0;
  }
}
