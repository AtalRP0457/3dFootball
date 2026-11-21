// Keyboard → PlayerInput for the lab. Movement is relative to the camera
// (W = away from the camera), as on a pad with a broadcast view.
import { emptyInput, type PlayerInput, type SkillKind } from '../player/PlayerTypes.ts';

export const SKILL_KEYS: ReadonlyArray<[string, SkillKind, string]> = [
  ['Digit1', 'stepOver', 'Step-over'],
  ['Digit2', 'doubleStepOver', 'Double step-over'],
  ['Digit3', 'bodyFeint', 'Body feint'],
  ['Digit4', 'dragBack', 'Drag-back'],
  ['Digit5', 'ballRoll', 'Ball roll'],
  ['Digit6', 'roulette', 'Roulette'],
  ['Digit7', 'heelToHeel', 'Heel-to-heel'],
  ['Digit8', 'fakeShot', 'Fake shot'],
];

const CAPTURE = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft', 'AltRight', 'Tab']);

export class LabInput {
  private down = new Set<string>();
  /** Edge-triggered UI keys (camera, pause …) for the lab shell. */
  onKey: ((code: string) => void) | null = null;

  private readonly kd = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (CAPTURE.has(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.onKey?.(e.code);
    this.down.add(e.code);
  };
  private readonly ku = (e: KeyboardEvent) => { this.down.delete(e.code); };
  private readonly blur = () => { this.down.clear(); };

  attach(): void {
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.blur);
  }
  detach(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.blur);
  }
  held(code: string): boolean { return this.down.has(code); }

  /** Build the player's input for this step; cameraYaw is the view heading (0 = +z). */
  read(cameraYaw: number): PlayerInput {
    const k = (c: string) => this.down.has(c);
    let fx = 0, fz = 0;
    if (k('KeyW') || k('ArrowUp')) fz += 1;
    if (k('KeyS') || k('ArrowDown')) fz -= 1;
    if (k('KeyA') || k('ArrowLeft')) fx += 1;
    if (k('KeyD') || k('ArrowRight')) fx -= 1;
    const l = Math.hypot(fx, fz);
    if (l > 0) { fx /= l; fz /= l; }
    // Rotate camera-relative stick into world space (left of the view = +x when looking +z).
    const s = Math.sin(cameraYaw), c = Math.cos(cameraYaw);
    const move = { x: fz * s + fx * c, z: fz * c - fx * s };
    const inp = emptyInput();
    inp.move = move;
    inp.sprint = k('ShiftLeft') || k('ShiftRight');
    inp.jog = k('KeyQ');
    inp.walk = k('AltLeft') || k('AltRight');
    inp.defend = k('KeyC');
    inp.skill = k('Space');
    inp.pass = k('KeyJ');
    inp.through = k('KeyK');
    inp.shoot = k('KeyL');
    inp.lob = k('KeyI');
    inp.standTackle = k('KeyX');
    inp.slideTackle = k('KeyZ');
    inp.jump = k('KeyB');
    inp.celebrate = k('KeyG');
    inp.finesse = k('KeyE');
    inp.lowDriven = k('KeyR');
    inp.chip = k('KeyT');
    inp.powerMod = k('KeyF');
    inp.skillMove = null;
    if (inp.skill) for (const [code, kind] of SKILL_KEYS) if (k(code)) inp.skillMove = kind;
    return inp;
  }
}
