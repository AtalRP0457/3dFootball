// Animation controller: one THREE.AnimationMixer per character.
//
// Locomotion: idle / walk / jog / run / sprint (and dribble) are blended by
// the player's real speed. All cycles share one gait phase, which advances
// at speed / (blended cycle distance × leg scale): the legs cover exactly
// the ground the physics moves the player, so feet don't slide and a sprint
// cycle only plays at sprint speed.
//
// Actions are triggered by what happened in the match state (rising edges
// of kickAnim, touchAnim, stun, stagger, dive, holding, ...), so live play
// and replays (which are state snapshots) animate identically.

import * as THREE from 'three';
import { clipLibrary, LEG_LENGTH } from './clips.js';

const LOCO = ['idle', 'walk', 'jog', 'run', 'sprint'];
// Speed (m/s, for a 1.80 m player) at which each cycle is at full weight.
const ANCHOR = { idle: 0, walk: 1.5, jog: 3.6, run: 6.0, sprint: 8.4 };
const ONE_SHOT = {
  pass: { fadeIn: 0.05, fadeOut: 0.14 },
  longPass: { fadeIn: 0.05, fadeOut: 0.16 },
  shoot: { fadeIn: 0.05, fadeOut: 0.18 },
  passLeft: { fadeIn: 0.05, fadeOut: 0.14 },
  longPassLeft: { fadeIn: 0.05, fadeOut: 0.16 },
  shootLeft: { fadeIn: 0.05, fadeOut: 0.18 },
  tackle: { fadeIn: 0.06, fadeOut: 0.2 },
  poke: { fadeIn: 0.05, fadeOut: 0.12 },
  fall: { fadeIn: 0.08, fadeOut: 0.1, hold: true },
  getUp: { fadeIn: 0.06, fadeOut: 0.2 },
  stumble: { fadeIn: 0.05, fadeOut: 0.15 },
  jump: { fadeIn: 0.05, fadeOut: 0.15 },
  gkDiveL: { fadeIn: 0.04, fadeOut: 0.25, hold: true },
  gkDiveR: { fadeIn: 0.04, fadeOut: 0.25, hold: true },
  gkCatch: { fadeIn: 0.05, fadeOut: 0.1 },
  throwIn: { fadeIn: 0.04, fadeOut: 0.18 },
};
// Looping full-body states (weight fades in/out with their condition).
const STATES = ['gkReady', 'gkHold', 'throwHold', 'celebrate', 'kneeSlide', 'embrace', 'dejected', 'turnLeft', 'turnRight'];

function hashId(n) { return ((n * 2654435761) >>> 0) % 1000 / 1000; }

export class AnimationController {
  /**
   * @param root   object whose descendants hold the bones (SkinnedMesh parent)
   * @param opts   { legScale: world leg length / reference leg length, leftFooted }
   */
  constructor(root, opts = {}) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = opts.clips || clipLibrary();
    this.legScale = opts.legScale || 1;
    this.leftFooted = !!opts.leftFooted;
    this.actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      if (LOCO.includes(name) || name === 'dribble' || name === 'celebrateRun') {
        a.timeScale = 0; // time is driven by the shared gait phase
        a.play();
      } else if (STATES.includes(name)) {
        a.play();
      } else {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[name] = a;
    }
    this.phase = 0;
    this.idleT = Math.random() * 3;
    this.stateW = Object.fromEntries(STATES.map((s) => [s, 0]));
    this.oneShot = null; // { name, t, dur, fadeIn, fadeOut, hold }
    this.overlay = null; // dribble touch on the kicking leg
    this.queue = [];
    this.prev = { kickAnim: 0, touchAnim: 0, stun: 0, stagger: 0, dive: 0, holding: false };
    this.locoWeights = {};
    this.debug = { gait: 'idle', speed: 0 };
  }

  play(name, opts = {}) {
    const a = this.actions[name];
    if (!a) return;
    const cfg = { ...(ONE_SHOT[name] || { fadeIn: 0.06, fadeOut: 0.15 }), ...opts };
    if (this.oneShot && this.oneShot.name !== name) this.actions[this.oneShot.name].setEffectiveWeight(0);
    a.reset();
    a.timeScale = cfg.speed || 1;
    a.play();
    this.oneShot = { name, t: 0, dur: a.getClip().duration / a.timeScale, ...cfg };
  }

  /** Light dribble touch with the kicking foot, layered over the run. */
  touch() {
    const name = this.leftFooted ? 'touchLeft' : 'touch';
    const a = this.actions[name];
    if (!a) return;
    a.reset(); a.play();
    this.overlay = { name, t: 0, dur: a.getClip().duration };
  }

  kickName(base) { return this.leftFooted ? `${base}Left` : base; }

  /**
   * Advance by dt (seconds of game time).
   * p:   player state { vel, face, kickAnim, kickType, touchAnim, stun, stagger, dive, holding, role, throwIn, mustPass }
   * ctx: { owner: bool (has the ball), keeperAlert, celebration: null|'scorer'|'team'|'beaten', id, yawRate }
   */
  update(dt, p, ctx = {}) {
    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.triggers(p, ctx);

    // ----- looping states -----
    const want = {};
    for (const s of STATES) want[s] = 0;
    const cel = ctx.celebration;
    if (cel === 'scorer') want[speed > 1.2 ? 'celebrate' : hashId(ctx.id) < 0.5 ? 'kneeSlide' : 'celebrate'] = speed > 1.2 ? 0 : 1;
    else if (cel === 'team') want[speed > 1.2 ? 'celebrate' : (hashId(ctx.id) < 0.45 ? 'embrace' : 'celebrate')] = speed > 1.2 ? 0 : 1;
    else if (cel === 'beaten') want.dejected = speed < 1 ? 1 : 0;
    if (ctx.forceState && ctx.forceState in want) want[ctx.forceState] = 1;
    else if (!cel) {
      if (p.holding && ctx.owner) want.gkHold = 1;
      else if (p.throwIn && ctx.owner && p.mustPass) want.throwHold = 1;
      else if (p.role === 'GK' && ctx.keeperAlert && speed < 2.5) want.gkReady = 1 - speed / 2.5;
      if (speed < 0.5 && Math.abs(ctx.yawRate || 0) > 1.2 && !want.gkHold && !want.throwHold) {
        want[(ctx.yawRate > 0) ? 'turnLeft' : 'turnRight'] = Math.min(1, (Math.abs(ctx.yawRate) - 1.2) / 2);
      }
    }
    let stateTotal = 0;
    for (const s of STATES) {
      const target = want[s];
      const rate = target > this.stateW[s] ? 8 : 5;
      this.stateW[s] += (target - this.stateW[s]) * Math.min(1, dt * rate);
      if (this.stateW[s] < 1e-3) this.stateW[s] = 0;
      stateTotal += this.stateW[s];
    }
    stateTotal = Math.min(1, stateTotal);

    // ----- one-shot -----
    let shotW = 0;
    if (this.oneShot) {
      const o = this.oneShot;
      o.t += dt;
      if (o.t >= o.dur && !o.hold && this.queue.length) {
        // Chain straight into the next clip (fall -> get up) with no blend
        // back through the standing pose.
        this.actions[o.name].setEffectiveWeight(0);
        this.oneShot = null;
        const n = this.queue.shift();
        this.play(n.name, { ...n.opts, fadeIn: 0.001 });
        shotW = 1;
        this.actions[this.oneShot.name].setEffectiveWeight(1);
      } else if (o.t >= o.dur && !o.hold) {
        const out = Math.max(0, 1 - (o.t - o.dur) / o.fadeOut);
        shotW = out;
        if (out <= 0) { this.actions[o.name].setEffectiveWeight(0); this.oneShot = null; this.next(); }
      } else {
        shotW = Math.min(1, o.t / o.fadeIn);
      }
      if (this.oneShot && this.oneShot.t > 0) this.actions[this.oneShot.name].setEffectiveWeight(shotW);
    }

    // ----- locomotion -----
    const s = speed / Math.max(0.6, this.legScale);
    const dribbling = !!ctx.owner && !p.mustPass && s < 6.3;
    const w = {};
    for (const name of LOCO) w[name] = 0;
    for (let i = 0; i < LOCO.length - 1; i++) {
      const a = LOCO[i], b = LOCO[i + 1];
      if (s <= ANCHOR[b] || i === LOCO.length - 2) {
        const k = Math.min(1, Math.max(0, (s - ANCHOR[a]) / (ANCHOR[b] - ANCHOR[a])));
        w[a] = 1 - k; w[b] = k;
        break;
      }
    }
    if (dribbling) { w.dribble = w.jog + w.run * 0.6; w.jog = 0; w.run *= 0.4; } else w.dribble = 0;
    if (cel === 'scorer' && speed > 1.2) { w.celebrateRun = w.run + w.sprint + w.jog; w.run = w.sprint = w.jog = 0; } else w.celebrateRun = 0;
    // Gait phase: ground distance per cycle, blended by weight.
    let cycle = 0, wsum = 0;
    for (const [name, weight] of Object.entries(w)) {
      const d = this.clips[name]?.userData?.cycleDistance;
      if (d && weight > 0) { cycle += d * weight; wsum += weight; }
    }
    if (wsum > 0) {
      cycle = (cycle / wsum) * this.legScale;
      this.phase = (this.phase + (speed / cycle) * dt) % 1;
    }
    const turning = this.stateW.turnLeft + this.stateW.turnRight;
    if (turning > 0) this.phase = (this.phase + dt / 0.9) % 1;
    const locoScale = Math.max(0, 1 - stateTotal) * (1 - shotW);
    this.idleT += dt;
    for (const [name, weight] of Object.entries(w)) {
      const a = this.actions[name];
      if (!a) continue;
      const dur = a.getClip().duration;
      a.time = name === 'idle' ? this.idleT % dur : this.phase * dur;
      a.setEffectiveWeight(weight * locoScale);
    }
    for (const st of STATES) {
      const a = this.actions[st];
      if (!a) continue;
      if (st === 'turnLeft' || st === 'turnRight') a.time = this.phase * a.getClip().duration;
      a.setEffectiveWeight(this.stateW[st] * (1 - shotW));
    }

    // ----- overlay (dribble touch) -----
    if (this.overlay) {
      const o = this.overlay;
      o.t += dt;
      const k = o.t < o.dur ? Math.sin(Math.PI * Math.min(1, o.t / o.dur)) : 0;
      this.actions[o.name].setEffectiveWeight(3 * k * (1 - shotW));
      if (o.t >= o.dur) { this.actions[o.name].setEffectiveWeight(0); this.overlay = null; }
    }

    this.debug = { speed, gait: Object.entries(w).sort((a, b) => b[1] - a[1])[0][0], oneShot: this.oneShot?.name || null, phase: this.phase };
    this.mixer.update(dt);
  }

  next() {
    const n = this.queue.shift();
    if (n) this.play(n.name, n.opts);
  }

  triggers(p, ctx) {
    const pr = this.prev;
    // Kicks: a fresh kickAnim means the player just struck the ball (or lunged).
    if ((p.kickAnim || 0) > pr.kickAnim + 0.02) {
      const k = p.kickType;
      if (k === 'tackle') this.play(Math.hypot(p.vel.x, p.vel.z) > 4 ? 'tackle' : 'poke');
      else if (pr.throwIn || p.throwIn) this.play('throwIn');
      else if (k === 'shot') this.play(this.kickName('shoot'));
      else if (k === 'longPass' || k === 'lofted' || k === 'chip' || k === 'through') this.play(this.kickName('longPass'));
      else this.play(this.kickName('pass'));
    }
    if ((p.touchAnim || 0) > pr.touchAnim + 0.02 && !this.oneShot) this.touch();
    // Knocked over (won tackle / foul) -> fall, then get up.
    if ((p.stun || 0) > 0.45 && pr.stun <= 0.45 && p.role !== 'GK') {
      this.play('fall');
      this.oneShot.hold = false;
      this.oneShot.dur = Math.max(0.6, p.stun * 0.9);
      this.queue = [{ name: 'getUp' }];
    } else if ((p.stagger || 0) > pr.stagger + 0.05 && !this.oneShot) {
      this.play('stumble');
    }
    // Goalkeeper dive, to the side he is moving.
    if ((p.dive || 0) > 0 && pr.dive <= 0) {
      const left = p.vel.x * p.face.z - p.vel.z * p.face.x;
      this.play(left >= 0 ? 'gkDiveL' : 'gkDiveR');
      this.oneShot.hold = false;
      this.oneShot.dur = 0.85;
      this.queue = [{ name: 'getUp', opts: { speed: 1.4 } }];
    }
    if (p.holding && ctx.owner && !pr.holding && !(this.oneShot?.name || '').startsWith('gkDive')) this.play('gkCatch');
    if (ctx.jump && !this.oneShot) this.play('jump');
    pr.kickAnim = p.kickAnim || 0;
    pr.touchAnim = p.touchAnim || 0;
    pr.stun = p.stun || 0;
    pr.stagger = p.stagger || 0;
    pr.dive = p.dive || 0;
    pr.holding = !!(p.holding && ctx.owner);
    pr.throwIn = !!p.throwIn;
  }

  /** Snap to a state without blending (after teleports / new match). */
  reset() {
    this.oneShot = null; this.overlay = null; this.queue = [];
    for (const a of Object.values(this.actions)) a.setEffectiveWeight(0);
    for (const s of STATES) this.stateW[s] = 0;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}

export { LEG_LENGTH };
