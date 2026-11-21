// Keyboard and gamepad input. Produces one input object per human player
// each fixed step: { mx, mz, sprint, passPressed, loftPressed, throughPressed,
// shootHeld, shootPressed, finesseHeld, chipHeld }.
// Finesse and chip keys are shoot buttons of their own: hold to charge,
// release to shoot that kind of shot.
// mx: -1 left .. +1 right on screen. mz: -1 up (far touchline) .. +1 down.
//
// P1 always uses W A S D, P2 always uses the arrow keys.

export const BINDINGS = {
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    pass: ['KeyF', 'Space'], shoot: ['KeyG'], sprint: ['ShiftLeft'],
    loft: ['KeyV'], through: ['KeyR'], finesse: ['KeyH'], chip: ['KeyT'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    pass: ['Period', 'Numpad1'], shoot: ['Slash', 'Numpad2'], sprint: ['ShiftRight', 'Numpad0'],
    loft: ['Comma', 'Numpad4'], through: ['Semicolon', 'Numpad5'], finesse: ['Quote', 'Numpad3'], chip: ['BracketRight', 'Numpad6'],
  },
};

const GAME_KEYS = new Set(Object.values(BINDINGS).flatMap((b) => Object.values(b).flat()));

// Fallbacks for keyboards / input sources where event.code is missing or
// unusual: map by the printed key or the legacy keyCode instead.
const BY_KEY = {
  w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', f: 'KeyF', g: 'KeyG',
  v: 'KeyV', r: 'KeyR', h: 'KeyH', t: 'KeyT',
  ' ': 'Space', '.': 'Period', '/': 'Slash', ',': 'Comma', ';': 'Semicolon', "'": 'Quote', ']': 'BracketRight',
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
};
const BY_KEYCODE = {
  87: 'KeyW', 65: 'KeyA', 83: 'KeyS', 68: 'KeyD', 70: 'KeyF', 71: 'KeyG',
  86: 'KeyV', 82: 'KeyR', 72: 'KeyH', 84: 'KeyT', 188: 'Comma', 186: 'Semicolon', 222: 'Quote', 221: 'BracketRight',
  32: 'Space', 190: 'Period', 191: 'Slash', 38: 'ArrowUp', 40: 'ArrowDown', 37: 'ArrowLeft', 39: 'ArrowRight',
};

/** Work out which physical key was pressed, as robustly as possible. */
export function normalizeKey(e) {
  if (e.code && GAME_KEYS.has(e.code)) return e.code;
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (BY_KEY[k]) return BY_KEY[k];
  if (BY_KEYCODE[e.keyCode]) return BY_KEYCODE[e.keyCode];
  if (k === 'shift') return e.location === 2 ? 'ShiftRight' : 'ShiftLeft';
  return e.code || k;
}

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.padPrev = {};
    this.padPressed = {};
    this.enabled = false;
    this.touch = { mx: 0, mz: 0, sprint: false, passPressed: false, shootHeld: false, shootPressed: false };
    this.lastRaw = null; // for the debug overlay
    this.onKeyDown = (e) => {
      const code = normalizeKey(e);
      this.lastRaw = { code: e.code, key: e.key, keyCode: e.keyCode, mapped: code };
      if (this.enabled && GAME_KEYS.has(code)) e.preventDefault();
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    };
    this.onKeyUp = (e) => {
      this.down.delete(normalizeKey(e));
      // Shift can release without a matching code on some systems.
      if (e.shiftKey === false) { this.down.delete('ShiftLeft'); this.down.delete('ShiftRight'); }
    };
    this.onBlur = () => {
      this.down.clear();
      this.setTouch({ mx: 0, mz: 0, sprint: false, shootHeld: false });
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  anyDown(codes) { return codes.some((c) => this.down.has(c)); }
  anyPressed(codes) { return codes.some((c) => this.pressed.has(c)); }

  setTouch(input) {
    Object.assign(this.touch, input);
  }

  pollPads() {
    const pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    this.pads = [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const i = this.pads.length;
      const btn = pad.buttons.map((b) => b.pressed);
      const prev = this.padPrev[i] || [];
      // Keep presses until a game step consumes them (endStep).
      const kept = this.padPressed[i] || [];
      this.padPressed[i] = btn.map((v, k) => (v && !prev[k]) || !!kept[k]);
      this.padPrev[i] = btn;
      this.pads.push(pad);
    }
  }

  /** Read one player: key set id ('p1' / 'p2') and which gamepads count. */
  sample(id, padIndexes) {
    let mx = 0, mz = 0;
    const b = BINDINGS[id];
    mx += (this.anyDown(b.right) ? 1 : 0) - (this.anyDown(b.left) ? 1 : 0);
    mz += (this.anyDown(b.down) ? 1 : 0) - (this.anyDown(b.up) ? 1 : 0);
    let sprint = this.anyDown(b.sprint);
    let passPressed = this.anyPressed(b.pass);
    let loftPressed = this.anyPressed(b.loft);
    let throughPressed = this.anyPressed(b.through);
    let finesseHeld = this.anyDown(b.finesse);
    let chipHeld = this.anyDown(b.chip);
    let shootHeld = this.anyDown(b.shoot) || finesseHeld || chipHeld;
    let shootPressed = this.anyPressed(b.shoot) || this.anyPressed(b.finesse) || this.anyPressed(b.chip);
    for (const i of padIndexes) {
      const pad = this.pads && this.pads[i];
      if (!pad) continue;
      const ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
      if (Math.hypot(ax, az) > 0.2) { mx += ax; mz += az; }
      const btn = (k) => pad.buttons[k] && pad.buttons[k].pressed;
      if (btn(12)) mz -= 1;
      if (btn(13)) mz += 1;
      if (btn(14)) mx -= 1;
      if (btn(15)) mx += 1;
      const pr = this.padPressed[i] || [];
      passPressed = passPressed || !!pr[0];
      throughPressed = throughPressed || !!pr[2];
      loftPressed = loftPressed || !!pr[3];
      // LB / LT held while shooting: finesse / chip.
      finesseHeld = finesseHeld || (btn(1) && btn(4));
      chipHeld = chipHeld || (btn(1) && btn(6));
      shootHeld = shootHeld || btn(1);
      shootPressed = shootPressed || !!pr[1];
      sprint = sprint || btn(7) || btn(5);
    }
    if (id === 'p1') {
      mx += this.touch.mx;
      mz += this.touch.mz;
      sprint = sprint || this.touch.sprint;
      passPressed = passPressed || this.touch.passPressed;
      shootHeld = shootHeld || this.touch.shootHeld;
      shootPressed = shootPressed || this.touch.shootPressed;
    }
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    return { mx, mz, sprint, passPressed, loftPressed, throughPressed, shootHeld, shootPressed, finesseHeld, chipHeld };
  }

  /** Gamepad Start/Options button, used for pause. */
  padStartPressed() {
    return Object.values(this.padPressed).some((b) => b && b[9]);
  }

  endStep() {
    this.pressed.clear();
    for (const k of Object.keys(this.padPressed)) this.padPressed[k] = [];
    this.touch.passPressed = false;
    this.touch.shootPressed = false;
  }
}
