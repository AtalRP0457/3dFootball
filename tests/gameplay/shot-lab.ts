// Shot lab: every human shot type on the engine, through the real input path
// (hold shoot for the effort, stick across the goal for the aim, modifiers).
// Measures launch pace, spin, flight time, bend, where the ball crosses the
// goal line, and with a keeper whether it was scored or saved.
//   npx tsx tests/gameplay/shot-lab.ts [--keeper] [--n 20]
import { createMatch, stepMatch, setControlled } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W, GOAL, SHOT_CHARGE_TIME } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
import type { MatchState, Player } from '../../src/types/game.ts';
import { seedRandom } from '../support/seed.ts';

await preparePhysics();
type Frame = Record<string, unknown>;

function toPlay(s: MatchState) {
  for (let k = 0; k < 600 && s.phase !== 'play'; k++) stepMatch(s, {}, FIXED_DT);
  if (s.phase !== 'play') { s.phase = 'play'; s.restart = null; }
  s.kickoffPending = false;
}

export interface ShotCase {
  name: string;
  /** Shooter position (attacking +x). */
  at: [number, number];
  power: number;
  /** Stick across the goal −1..1 (world z). */
  aim: number;
  /** Modifier: finesse / chip key held, low-driven double tap, driven key. */
  mod?: 'finesse' | 'chip' | 'double' | 'driven';
  run?: number;
  keeper?: boolean;
  /** Team / shooter slot (default Barcelona #9). */
  team?: string; idx?: number;
  defender?: [number, number];
  seed?: number;
}
export interface ShotResult {
  name: string; released: boolean; kind: string; launch: number; spin: number; flight: number; bend: number;
  crossY: number; crossZ: number; onTarget: boolean; result: string; peak: number; releaseMs: number; lowDriven: boolean;
}

export function runShot(c: ShotCase): ShotResult {
  seedRandom(c.seed ?? 7);
  const s = createMatch({ home: buildTeam(c.team ?? 'fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  for (const p of s.players) {
    const mine = p.team === 0 && p.idx === (c.idx ?? 9);
    const opp = p.team === 1 && ((c.keeper && p.idx === 0) || (c.defender && p.idx === 4));
    if (p.onPitch && !mine && !opp) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  }
  s.engine = new MatchPhysics(s);
  toPlay(s);
  for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
  s.ball.restartDoubleTouchBy = null;
  const me = s.players.find((p) => p.team === 0 && p.idx === (c.idx ?? 9))!;
  setControlled(s, s.teams[0], me);
  const goalX = HALF_L * s.teams[0].dir;
  const sx = goalX > 0 ? c.at[0] : -c.at[0];
  me.pos.x = sx; me.pos.z = c.at[1];
  const toGoal = { x: goalX - me.pos.x, z: -me.pos.z }, tl = Math.hypot(toGoal.x, toGoal.z);
  s.engine.setFacing(me, { x: toGoal.x / tl, z: toGoal.z / tl });
  if (c.defender) { const d = s.players.find((p) => p.team === 1 && p.idx === 4)!; d.pos.x = goalX > 0 ? c.defender[0] : -c.defender[0]; d.pos.z = c.defender[1]; }
  const gk = s.players.find((p) => p.team === 1 && p.idx === 0);
  if (gk && c.keeper) {
    // Set on the bisector of the angle, ~1.5 m off his line (the AI keeps adjusting it).
    const bx = me.pos.x - goalX, bz = me.pos.z, bl = Math.hypot(bx, bz);
    gk.pos.x = goalX + (bx / bl) * 1.5; gk.pos.z = (bz / bl) * 1.5;
  }
  s.ball.pos.x = me.pos.x + me.face.x * 0.55; s.ball.pos.z = me.pos.z + me.face.z * 0.55; s.ball.pos.y = 0.11;
  s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
  s.ball.owner = me;
  const run = c.run ?? 0;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: run ? { mx: me.face.x, mz: me.face.z, sprint: run > 6 } : {} }, FIXED_DT);

  const hold = Math.max(1, Math.round((c.power * SHOT_CHARGE_TIME) / FIXED_DT));
  let release = -1, kind = '', launch = 0, spin = 0, peak = 0, crossY = NaN, crossZ = NaN, flight = NaN, bend = 0, result = 'none', lowDriven = false;
  let from: { x: number; z: number } | null = null, dirV: { x: number; z: number } | null = null;
  let prev = { ...s.ball.pos };
  const goalsBefore = s.teams[0].score;
  for (let i = 0; i < 600; i++) {
    const held = i < hold;
    const move = run ? { mx: me.face.x, mz: me.face.z, sprint: run > 6 } : {};
    const f: Frame = { ...move };
    if (held) {
      f.shootHeld = true; f.shootPressed = i === 0;
      if (c.mod === 'finesse') f.finesseHeld = true;
      if (c.mod === 'chip') f.chipHeld = true;
      if (c.mod === 'driven' && i === hold - 3) f.drivenPressed = true;
      f.mz = c.aim; f.mx = run ? me.face.x : 0;
    } else if (i === hold) { f.mz = c.aim; f.mx = 0; }
    if (c.mod === 'double' && i === hold + 3) { f.shootPressed = true; f.shootHeld = true; }
    stepMatch(s, { p1: f }, FIXED_DT);
    for (const e of s.events) {
      if (e.type === 'shot' && release < 0) { release = i; kind = String(e.shotType); }
      if (e.type === 'lowDriven') lowDriven = true;
      if (e.type === 'save' && result === 'none') result = e.parry ? 'parried' : 'caught';
      if (e.type === 'goal' && result === 'none') result = 'goal';
    }
    s.events.length = 0;
    const b = s.ball;
    if (release >= 0 && !from) {
      from = { x: b.pos.x, z: b.pos.z };
      launch = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
      spin = Math.hypot(b.spin?.x ?? 0, b.spin?.y ?? 0, b.spin?.z ?? 0);
      dirV = { x: b.vel.x / Math.hypot(b.vel.x, b.vel.z), z: b.vel.z / Math.hypot(b.vel.x, b.vel.z) };
    }
    if (from && dirV) {
      peak = Math.max(peak, b.pos.y);
      const rx = b.pos.x - from.x, rz = b.pos.z - from.z;
      if ((goalX - b.pos.x) * Math.sign(goalX) > 0.5) bend = Math.max(bend, Math.abs(rx * dirV.z - rz * dirV.x));
      if (Number.isNaN(crossY) && (prev.x - goalX) * Math.sign(goalX) < 0 && (b.pos.x - goalX) * Math.sign(goalX) >= 0) {
        const u = (goalX - prev.x) / (b.pos.x - prev.x);
        crossY = prev.y + (b.pos.y - prev.y) * u; crossZ = prev.z + (b.pos.z - prev.z) * u;
        flight = (i - release) * FIXED_DT;
      }
    }
    prev = { ...b.pos };
    if (s.phase !== 'play' && release >= 0) break;
    if (release >= 0 && i - release > 240) break;
  }
  if (result === 'none' && s.teams[0].score > goalsBefore) result = 'goal';
  if (result === 'none') result = Number.isNaN(crossY) ? 'short' : 'missed';
  const onTarget = !Number.isNaN(crossY) && Math.abs(crossZ) < GOAL.width / 2 - 0.11 && crossY < GOAL.height - 0.11;
  s.engine.dispose();
  return { name: c.name, released: release >= 0, kind, launch, spin, flight, bend, crossY, crossZ, onTarget, result, peak, releaseMs: release * FIXED_DT * 1000, lowDriven };
}

const isMain = process.argv[1]?.endsWith('shot-lab.ts');
if (isMain) {
  const keeper = process.argv.includes('--keeper');
  const n = Number(process.argv[process.argv.indexOf('--n') + 1]) || 12;
  const cases: Array<Omit<ShotCase, 'seed'>> = [
    { name: 'tap 12 m', at: [HALF_L - 12, 2], power: 0.25, aim: -0.6 },
    { name: 'laces 50% 16 m', at: [HALF_L - 16, 0], power: 0.5, aim: 0.7 },
    { name: 'laces 80% 20 m', at: [HALF_L - 20, -4], power: 0.8, aim: 0.7 },
    { name: 'laces full 22 m', at: [HALF_L - 22, 0], power: 1, aim: -0.7 },
    { name: 'power shot 25 m', at: [HALF_L - 25, 0], power: 1, aim: 0.6 },
    { name: 'finesse 18 m right', at: [HALF_L - 18, 8], power: 0.6, aim: -0.8, mod: 'finesse' },
    { name: 'finesse 20 m left', at: [HALF_L - 20, -7], power: 0.7, aim: 0.8, mod: 'finesse' },
    { name: 'low drive (double tap) 18 m', at: [HALF_L - 18, 0], power: 0.7, aim: 0.7, mod: 'double' },
    { name: 'low drive (E) 16 m', at: [HALF_L - 16, 3], power: 0.6, aim: -0.7, mod: 'driven' },
    { name: 'chip 16 m', at: [HALF_L - 16, 0], power: 0.5, aim: 0, mod: 'chip' },
    { name: 'laces 70% sprinting 18 m', at: [HALF_L - 18, 0], power: 0.7, aim: 0.7, run: 8 },
    { name: 'laces 70% under pressure', at: [HALF_L - 16, 0], power: 0.7, aim: 0.7, defender: [HALF_L - 16.3, 1.4] },
  ];
  const f = (v: number, d = 1) => (Number.isNaN(v) ? '  -  ' : v.toFixed(d));
  for (const c of cases) {
    const rs: ShotResult[] = [];
    for (let k = 0; k < n; k++) rs.push(runShot({ ...c, keeper, seed: 11 + k * 7 }));
    const ok = rs.filter((r) => r.released);
    const mean = (g: (r: ShotResult) => number) => { const v = ok.map(g).filter((x) => !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
    const sd = (g: (r: ShotResult) => number) => { const v = ok.map(g).filter((x) => !Number.isNaN(x)); const m = v.reduce((a, b) => a + b, 0) / (v.length || 1); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length || 1)); };
    const on = ok.filter((r) => r.onTarget).length;
    const tally = Object.entries(ok.reduce((m, r) => ({ ...m, [r.result]: (m[r.result] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(' ');
    console.log(`${c.name.padEnd(30)} released ${ok.length}/${rs.length} ${ok[0]?.kind ?? '-'}${ok.some((r) => r.lowDriven) ? '+low' : ''} | speed ${f(mean((r) => r.launch))} m/s spin ${f(mean((r) => r.spin), 0)} rad/s | flight ${f(mean((r) => r.flight), 2)} s peak ${f(mean((r) => r.peak), 2)} bend ${f(mean((r) => r.bend), 2)} | cross z ${f(mean((r) => r.crossZ), 2)}±${f(sd((r) => r.crossZ), 2)} y ${f(mean((r) => r.crossY), 2)}±${f(sd((r) => r.crossY), 2)} | on target ${on}/${ok.length}${keeper ? ` [${tally}]` : ''} | release ${f(mean((r) => r.releaseMs), 0)} ms`);
  }
}
