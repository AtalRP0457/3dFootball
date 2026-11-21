// Gameplay acceptance tests A–D (dribbling, passing, shooting, possession).
// Each test is a script of real PlayerInput frames fed to the reference
// player through the normal controller, plus checks over the typed event
// log. The same scripts run headlessly (tests/engine.test.ts) and live in the
// Player & Ball Lab, where you can watch them.
import type { PhysicsEvent, PossessionState } from '../physics/PhysicsEvents.ts';
import type { Simulation } from '../physics/Simulation.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import { ballLocal } from '../player/PlayerBallInteraction.ts';
import { emptyInput, type PlayerInput } from '../player/PlayerTypes.ts';

export interface ScriptStep {
  label: string;
  seconds: number;
  input: Partial<PlayerInput>;
  opponent?: Partial<PlayerInput>;
  /** Called once when the step starts (e.g. put the ball back at the player's feet). */
  prepare?: (sim: Simulation, p: PlayerController) => void;
}
export interface CheckOutcome { name: string; pass: boolean; detail: string }

/** What a run records each fixed step. */
export interface RunLog {
  events: PhysicsEvent[];
  samples: Array<{ t: number; label: string; owner: string | null; state: PossessionState; dist: number; fwd: number; speed: number; ballY: number }>;
  stepStart: Record<string, number>;
}

export interface GameplayTest {
  id: 'A' | 'B' | 'C' | 'D';
  name: string;
  /** Place the player/ball (and an opponent) before the script. */
  setup(sim: Simulation, p: PlayerController): void;
  steps: ScriptStep[];
  checks(log: RunLog, sim: Simulation, p: PlayerController): CheckOutcome[];
}

const f = (n: number, d = 2) => n.toFixed(d);
const OPP = 'test-opponent';
const W = { x: 0, z: 1 }, LEFT = { x: 1, z: 0 }, RIGHT = { x: -1, z: 0 }, DIAG = { x: 0.7, z: 0.7 };

function between(log: RunLog, from: string, to?: string): RunLog['samples'] {
  const a = log.stepStart[from] ?? 0, b = to ? log.stepStart[to] ?? Infinity : Infinity;
  return log.samples.filter((s) => s.t >= a && s.t < b);
}
const impulses = (log: RunLog, from: number, to = Infinity) =>
  log.events.filter((e): e is Extract<PhysicsEvent, { type: 'BallImpulse' }> => e.type === 'BallImpulse' && e.time >= from && e.time < to);

function kickRun(label: string, input: Partial<PlayerInput>, holdSeconds: number, after = 1.4, at = { x: 0, z: -30 }): ScriptStep[] {
  return [
    { label: `${label}: reset`, seconds: 0.25, input: {}, prepare: (sim, p) => { p.teleport(at, 0); sim.giveBall(p, 0.6); } },
    { label: `${label}: hold`, seconds: holdSeconds, input: { ...input } },
    { label: `${label}: release`, seconds: after, input: {} },
  ];
}

/** Checks that a kick happened in a window: command accepted, contact detected, impulse, release. */
function kickChain(log: RunLog, from: number, to: number, source: 'pass' | 'shot'): { ok: boolean; speed: number; kind: string; detail: string; contactT: number; impulseT: number } {
  const ev = log.events.filter((e) => e.time >= from && e.time < to);
  const accepted = ev.find((e) => (e.type === 'PassCommand' || e.type === 'ShotCommand') && e.phase === 'accepted');
  const contact = ev.find((e) => e.type === 'BallContact' && e.hit);
  const imp = ev.find((e): e is Extract<PhysicsEvent, { type: 'BallImpulse' }> => e.type === 'BallImpulse' && e.source === source);
  const rel = ev.find((e) => e.type === 'BallRelease');
  const ok = !!(accepted && contact && imp && rel);
  const chain = [accepted ? 'accepted' : 'NOT accepted', contact ? 'contact' : 'NO contact', imp ? `impulse ${f(imp.speed, 1)} m/s` : 'NO impulse', rel ? 'released' : 'NOT released'].join(' → ');
  return { ok, speed: imp?.speed ?? 0, kind: imp?.kind ?? '-', detail: chain, contactT: contact?.time ?? -1, impulseT: imp?.time ?? -1 };
}

export const GAMEPLAY_TESTS: GameplayTest[] = [
  {
    id: 'A', name: 'Dribbling',
    setup: (sim, p) => { p.teleport({ x: 0, z: -20 }, 0); sim.giveBall(p, 0.6); },
    steps: [
      { label: 'forward', seconds: 1.5, input: { move: W } },
      { label: 'turn left', seconds: 1.6, input: { move: LEFT } },
      { label: 'turn right', seconds: 1.8, input: { move: RIGHT } },
      { label: 'diagonal', seconds: 1.5, input: { move: DIAG } },
      { label: 'sprint', seconds: 2.0, input: { move: W, sprint: true } },
      { label: 'stop', seconds: 2.4, input: {} },
      { label: 'start again', seconds: 1.5, input: { move: W } },
    ],
    checks: (log) => {
      const s = log.samples;
      const lost = s.filter((x) => x.owner !== 'reference').length;
      const maxD = Math.max(...s.map((x) => x.dist));
      const behind = s.filter((x) => x.fwd < -0.4).length / 60;
      const touches = log.events.filter((e): e is Extract<PhysicsEvent, { type: 'DribbleTouch' }> => e.type === 'DribbleTouch');
      const feet = touches.map((t) => t.foot).join('');
      const alt = feet.length > 1 ? [...feet].slice(1).filter((c, i) => c !== feet[i]).length / (feet.length - 1) : 0;
      const turnTouches = touches.filter((t) => t.kind === 'directional').length;
      const sprintTouches = touches.filter((t) => t.kind === 'sprint').length;
      const stopS = between(log, 'stop', 'start again');
      const stopped = stopS.length ? stopS[stopS.length - 1] : null;
      return [
        { name: 'Ball stays in possession through every turn', pass: lost === 0, detail: lost ? `possession missing for ${f(lost / 60)} s` : 'never lost' },
        { name: 'Ball stays within reach', pass: maxD < 2.6, detail: `furthest ${f(maxD)} m from the player` },
        { name: 'Ball never stuck behind the player', pass: behind < 0.3, detail: `${f(behind)} s behind the hips` },
        { name: 'Directional touches on turns', pass: turnTouches >= 2, detail: `${turnTouches} directional touches` },
        { name: 'Alternating-foot touches', pass: alt > 0.55, detail: `${feet} (${f(alt * 100, 0)}% alternate)` },
        { name: 'Sprint dribbling', pass: sprintTouches >= 1, detail: `${sprintTouches} sprint touches` },
        { name: 'Stop and start again with the ball', pass: !!stopped && stopped.speed < 1 && stopped.dist < 1.6, detail: stopped ? `stopped at ${f(stopped.speed)} m/s with the ball ${f(stopped.dist)} m away` : 'no sample' },
      ];
    },
  },
  {
    id: 'B', name: 'Passing',
    setup: (sim, p) => { p.teleport({ x: 0, z: -30 }, 0); sim.giveBall(p, 0.6); },
    steps: [
      ...kickRun('short pass', { pass: true }, 0.05),
      ...kickRun('stronger pass', { pass: true }, 0.65),
      ...kickRun('through ball', { through: true, move: DIAG }, 0.35),
      ...kickRun('lob pass', { lob: true }, 0.4, 2.2),
    ],
    checks: (log) => {
      const win = (k: string) => [log.stepStart[`${k}: reset`] ?? 0, log.stepStart[`${k}: release`] + 1.3] as const;
      const out: CheckOutcome[] = [];
      const res: Record<string, ReturnType<typeof kickChain>> = {};
      for (const k of ['short pass', 'stronger pass', 'through ball', 'lob pass']) {
        const [a, b] = win(k);
        res[k] = kickChain(log, a, b, 'pass');
        out.push({ name: `${k[0].toUpperCase()}${k.slice(1)} releases the ball`, pass: res[k].ok, detail: `${res[k].kind}: ${res[k].detail}` });
      }
      out.push({ name: 'Pass power responds to hold time', pass: res['stronger pass'].speed > res['short pass'].speed + 3, detail: `tap ${f(res['short pass'].speed, 1)} m/s → 0.65 s hold ${f(res['stronger pass'].speed, 1)} m/s` });
      const lobS = between(log, 'lob pass: release');
      const apex = Math.max(0, ...lobS.map((x) => x.ballY));
      out.push({ name: 'Lob pass goes up', pass: apex > 2.5, detail: `apex ${f(apex)} m` });
      return out;
    },
  },
  {
    id: 'C', name: 'Shooting',
    setup: (sim, p) => { p.teleport({ x: 0, z: 24 }, 0); sim.giveBall(p, 0.6); },
    steps: [
      ...kickRun('tap shot', { shoot: true }, 0.05, 1.4, { x: 0, z: 24 }),
      ...kickRun('held shot', { shoot: true }, 0.9, 1.4, { x: 0, z: 24 }),
      ...kickRun('power shot', { shoot: true, powerMod: true }, 0.7, 1.4, { x: 0, z: 24 }),
      ...kickRun('finesse shot', { shoot: true, finesse: true }, 0.5, 1.4, { x: 0, z: 24 }),
      ...kickRun('chip shot', { shoot: true, chip: true }, 0.5, 2, { x: 0, z: 24 }),
    ],
    checks: (log) => {
      const out: CheckOutcome[] = [];
      const res: Record<string, ReturnType<typeof kickChain>> = {};
      for (const k of ['tap shot', 'held shot', 'power shot', 'finesse shot', 'chip shot']) {
        res[k] = kickChain(log, log.stepStart[`${k}: reset`] ?? 0, (log.stepStart[`${k}: release`] ?? 0) + 1.3, 'shot');
        out.push({ name: `${k[0].toUpperCase()}${k.slice(1)} is struck`, pass: res[k].ok, detail: `${res[k].kind}: ${res[k].detail}` });
      }
      out.push({ name: 'Shot power responds to hold time', pass: res['held shot'].speed > res['tap shot'].speed + 8, detail: `tap ${f(res['tap shot'].speed, 1)} m/s → full hold ${f(res['held shot'].speed, 1)} m/s` });
      out.push({ name: 'Shot types are honoured', pass: res['power shot'].kind === 'powerShot' && res['finesse shot'].kind === 'finesseShot' && res['chip shot'].kind === 'chipShot', detail: `${res['power shot'].kind} / ${res['finesse shot'].kind} / ${res['chip shot'].kind}` });
      const fin = impulses(log, log.stepStart['finesse shot: reset'] ?? 0).find((e) => e.kind === 'finesseShot');
      out.push({ name: 'Finesse shot has sidespin', pass: !!fin, detail: fin ? 'struck with the inside of the foot (curl)' : 'no finesse impulse' });
      const chip = between(log, 'chip shot: release');
      out.push({ name: 'Chip shot rises', pass: Math.max(0, ...chip.map((x) => x.ballY)) > 2.5, detail: `apex ${f(Math.max(0, ...chip.map((x) => x.ballY)))} m` });
      const sync = Object.values(res).every((r) => r.ok && Math.abs(r.impulseT - r.contactT) < 1e-6);
      out.push({ name: 'Impulse happens at the animation contact frame', pass: sync, detail: sync ? 'every shot: contact and impulse in the same fixed step' : 'contact and impulse out of step' });
      return out;
    },
  },
  {
    id: 'D', name: 'Possession',
    setup: (sim, p) => {
      p.teleport({ x: 0, z: -10 }, 0);
      sim.placeBall({ x: 0, y: sim.cal.ball.radius, z: -6 });
      if (!sim.players.some((x) => x.id === OPP)) sim.addPlayer({ id: OPP, name: 'Test Opponent', number: 5, start: { x: 6, z: 14 }, yaw: Math.PI, seed: 5 });
    },
    steps: [
      { label: 'acquire', seconds: 1.6, input: { move: W, jog: true } },
      { label: 'dribble', seconds: 1.2, input: { move: W } },
      { label: 'stop', seconds: 1.4, input: {} },
      { label: 'turn', seconds: 1.4, input: { move: RIGHT } },
      { label: 'pass', seconds: 0.1, input: { pass: true, move: LEFT } },
      { label: 'pass released', seconds: 1.0, input: {} },
      { label: 'regain', seconds: 6, input: {}, opponent: {} },
      { label: 'shoot', seconds: 0.4, input: { shoot: true, move: W } },
      { label: 'shot released', seconds: 1.0, input: {} },
      { label: 'set up loss', seconds: 0.2, input: {}, prepare: (sim, p) => {
        p.teleport({ x: 0, z: -10 }, 0);
        sim.giveBall(p, 0.6);
        sim.players.find((x) => x.id === OPP)?.teleport({ x: 0.2, z: -3 }, Math.PI);
      } },
      { label: 'lose', seconds: 2.5, input: { move: W, jog: true }, opponent: { defend: true } },
      { label: 'win back', seconds: 3.0, input: {} },
    ],
    checks: (log) => {
      const states = log.events.filter((e): e is Extract<PhysicsEvent, { type: 'BallPossession' }> => e.type === 'BallPossession');
      const seen = (st: PossessionState, owner?: string | null, from = 0) => states.some((e) => e.state === st && e.time >= from && (owner === undefined || e.owner === owner));
      const t = (k: string) => log.stepStart[k] ?? 0;
      return [
        { name: 'Acquire the ball', pass: seen('PossessionAcquired', 'reference'), detail: 'FreeBall → PossessionAcquired' },
        { name: 'Dribble', pass: seen('ControlledDribbling', 'reference', t('dribble')), detail: 'ControlledDribbling' },
        { name: 'Stop the ball', pass: between(log, 'stop', 'turn').slice(-1)[0]?.speed < 0.6 && (between(log, 'stop', 'turn').slice(-1)[0]?.dist ?? 9) < 1.6, detail: 'stood still with the ball at his feet' },
        { name: 'Turn with the ball', pass: seen('TurningWithBall', 'reference', t('turn')), detail: 'TurningWithBall' },
        { name: 'Pass releases possession', pass: seen('Passing', 'reference', t('pass')) && seen('BallReleased', null, t('pass')), detail: 'Passing → BallReleased' },
        { name: 'Regain possession', pass: seen('PossessionAcquired', 'reference', t('regain')), detail: 'ran onto the loose ball' },
        { name: 'Shoot releases possession', pass: seen('Shooting', 'reference', t('shoot')) && seen('BallReleased', null, t('shoot')), detail: 'Shooting → BallReleased' },
        { name: 'Lose possession to a tackle', pass: seen('PossessionLost', null, t('lose')), detail: 'PossessionLost' },
        { name: 'Win the ball back', pass: seen('PossessionAcquired', 'reference', t('win back')) || seen('PossessionAcquired', 'reference', t('lose') + 0.5), detail: 'PossessionAcquired again' },
      ];
    },
  },
];

/** Scripted inputs for the opponent in test D (same controller as everyone). */
function opponentInput(opp: PlayerController, sim: Simulation, step: ScriptStep, now: number, startedAt: number): PlayerInput {
  const inp = emptyInput();
  const b = sim.ball.curr.position;
  if (step.label === 'lose') {
    const dx = b.x - opp.pos.x, dz = b.z - opp.pos.z, d = Math.hypot(dx, dz) || 1;
    inp.defend = true;
    inp.move = { x: dx / d, z: dz / d };
    inp.standTackle = d < 1.4 && now - startedAt > 0.3 && Math.floor((now - startedAt) * 2) % 2 === 0;
    return inp;
  }
  // Otherwise stay out of the way.
  const dx = 10 - opp.pos.x, dz = sim.players[0].pos.z + 12 - opp.pos.z, d = Math.hypot(dx, dz);
  if (d > 1) inp.move = { x: dx / d, z: dz / d };
  inp.jog = true;
  return inp;
}

/** Runs a test step by step. Drive it with sim.step() (headless) or let the Lab's loop step it. */
export class GameplayRunner {
  readonly log: RunLog = { events: [], samples: [], stepStart: {} };
  private i = 0;
  private stepT = 0;
  private off: () => void;
  done = false;
  results: CheckOutcome[] = [];
  /** Name of the step running now (for the Lab banner). */
  current = '';

  constructor(private readonly sim: Simulation, private readonly p: PlayerController, readonly test: GameplayTest) {
    test.setup(sim, p);
    this.off = sim.pw.events.on((e) => { this.log.events.push(e); });
  }

  /** Inputs for this fixed step (call from sim.beforeStep). */
  feed(dt: number): void {
    if (this.done) return;
    const step = this.test.steps[this.i];
    if (!step) { this.finish(); return; }
    if (this.stepT === 0) { this.log.stepStart[step.label] = this.sim.time; step.prepare?.(this.sim, this.p); }
    this.current = step.label;
    // Pass/shoot buttons: hold for the step's duration, then the next step releases them.
    this.p.input = { ...emptyInput(), ...step.input };
    const opp = this.sim.players.find((x) => x.id === OPP);
    if (opp) opp.input = opponentInput(opp, this.sim, step, this.sim.time, this.log.stepStart[step.label]);
    if (step.label === 'regain' && this.stepT === 0) this.p.input.move = { x: 0, z: 0 };
    if (step.label === 'regain') {
      // Run onto the loose ball.
      const b = this.sim.ball.curr.position, dx = b.x - this.p.pos.x, dz = b.z - this.p.pos.z, d = Math.hypot(dx, dz) || 1;
      this.p.input.move = { x: dx / d, z: dz / d };
      this.p.input.sprint = d > 4;
    }
    if (step.label === 'win back') {
      const b = this.sim.ball.curr.position, dx = b.x - this.p.pos.x, dz = b.z - this.p.pos.z, d = Math.hypot(dx, dz) || 1;
      this.p.input.move = { x: dx / d, z: dz / d };
      this.p.input.sprint = d > 4;
    }
    const L = ballLocal(this.p, this.sim.ball.curr.position);
    this.log.samples.push({ t: this.sim.time, label: step.label, owner: this.sim.interaction.owner, state: this.sim.interaction.state, dist: L.dist, fwd: L.fwd, speed: this.p.speed, ballY: this.sim.ball.curr.position.y });
    this.stepT += dt;
    if (this.stepT >= step.seconds - 1e-9) { this.i++; this.stepT = 0; }
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    this.off();
    this.results = this.test.checks(this.log, this.sim, this.p);
    const opp = this.sim.players.find((x) => x.id === OPP);
    if (opp) this.sim.removePlayer(OPP);
  }

  /** Headless: run to completion. */
  runAll(): CheckOutcome[] {
    const prev = this.sim.beforeStep;
    this.sim.beforeStep = (dt) => this.feed(dt);
    let guard = 0;
    while (!this.done && guard++ < 60 * 120) this.sim.step();
    this.sim.beforeStep = prev;
    this.finish();
    return this.results;
  }
}
