// Shooting on the engine: ball aerodynamics, the shot solver, effort,
// accuracy, every shot type through the real input path, and the keeper's
// physical saves. See docs/SHOOTING.md.
//   npx tsx tests/shooting.test.ts
import { dragCoefficientAt, knuckleForce } from '../packages/game-engine/ball/BallAerodynamics.ts';
import { createCalibration } from '../packages/game-engine/physics/PhysicsConfig.ts';
import { planEngineShot, goalLineCrossing, spinVector } from '../src/game/mechanics/shooting.ts';
import { reactionTime, reachAt, resolveSave, timeToReach } from '../src/game/mechanics/goalkeeping.ts';
import { createMatch } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { HALF_L, GOAL } from '../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../src/game/engineBridge.ts';
import { runShot, type ShotCase, type ShotResult } from './gameplay/shot-lab.ts';
import type { KeeperProfile } from '../src/types/game.ts';

await preparePhysics();
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const sd = (v0: number[]) => { const v = v0.filter((x) => !Number.isNaN(x)); const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const many = (c: Omit<ShotCase, 'seed'>, n: number): ShotResult[] => Array.from({ length: n }, (_, k) => runShot({ ...c, seed: 101 + k * 13 })).filter((r) => r.released);
const f2 = (v: number) => v.toFixed(2);

console.log('Ball in flight');
{
  const cal = createCalibration();
  const b = cal.ball;
  const slow = dragCoefficientAt(7, 0, b), fast = dragCoefficientAt(20, 0, b), ground = dragCoefficientAt(7, 0, b, false);
  check('Drag crisis: a slow ball in the air has ~1.7x the drag of a struck one', slow > 0.38 && fast < 0.28 && slow / fast > 1.5, `Cd ${f2(slow)} at 7 m/s, ${f2(fast)} at 20 m/s`);
  check('Rolling ball keeps the calibrated drag (pass weights unchanged)', ground === b.dragCoefficient);
  check('Spin adds drag', dragCoefficientAt(20, 60, b) > fast + 0.02);
  const v = { x: 26, y: 2, z: 0 };
  const kn = Math.max(...Array.from({ length: 60 }, (_, i) => Math.hypot(...Object.values(knuckleForce(v, { x: 0, y: 0, z: -2 }, b, i * 0.2, [0.4, 1.3, 2.2])))));
  const spun = Math.hypot(...Object.values(knuckleForce(v, { x: 0, y: 0, z: -20 }, b, 3, [0.4, 1.3, 2.2])));
  check('Knuckling: a fast ball with almost no spin is pushed about; a spinning one is not', kn > 0.5 && spun === 0, `peak ${kn.toFixed(2)} N (${(kn / b.mass).toFixed(1)} m/s²) at 2 rad/s, ${spun} N at 20 rad/s`);
}

console.log('Solver');
{
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  const eng = new MatchPhysics(s);
  const p = s.players.find((q) => q.team === 0 && q.idx === 9)!;
  process.env.NO_SHOT_ERR = '1';
  const worst: number[] = [];
  for (const [type, x, z, aimZ, power, low] of [
    ['normal', HALF_L - 18, 0, 2.2, 0.6, false], ['normal', HALF_L - 22, -6, -2.4, 0.9, false], ['power', HALF_L - 25, 4, 2, 1, false],
    ['finesse', HALF_L - 18, 8, -2.6, 0.6, false], ['finesse', HALF_L - 20, -9, 2.6, 0.8, false], ['normal', HALF_L - 16, 2, -2, 0.7, true],
    ['chip', HALF_L - 15, 0, 0.5, 0.5, false],
  ] as const) {
    p.pos.x = x - 0.5; p.pos.z = z; p.vel.x = p.vel.z = 0; p.face.x = 1; p.face.z = 0;
    const pos = { x, y: 0.11, z };
    const plan = planEngineShot({ p, ball: { pos }, goalX: HALF_L, aimZ, power, type, lowDriven: low, fly: (a, v, w, h) => eng.flight(a, v, w, h) });
    const path = eng.flight(pos, plan.vel, spinVector(plan.vel.x, plan.vel.z, plan.top, plan.side), 5);
    const c = goalLineCrossing(path, HALF_L);
    worst.push(c ? Math.hypot(c.z - plan.target.z, c.y - plan.target.y) : 99);
  }
  delete process.env.NO_SHOT_ERR;
  check('Every shot type flies (drag, curl, dip) to the target it was solved for', Math.max(...worst) < 0.1, worst.map(f2).join(' '));
  eng.dispose();
}

console.log('Effort and shot types (real input path, no keeper)');
const at = (d: number, z = 0): [number, number] => [HALF_L - d, z];
const tap = many({ name: 'tap', at: at(16), power: 0.25, aim: 0.6 }, 6);
const half = many({ name: 'half', at: at(16), power: 0.55, aim: 0.6 }, 6);
const full = many({ name: 'full', at: at(16), power: 0.85, aim: 0.6 }, 6);
const power = many({ name: 'power', at: at(24), power: 1, aim: 0.6 }, 6);
const sp = (r: ShotResult[]) => mean(r.map((x) => x.launch));
check('Effort sets the pace: tap < half < hard < power shot', sp(tap) + 3 < sp(half) && sp(half) + 3 < sp(full) && sp(full) < sp(power) && sp(power) > 32,
  `${sp(tap).toFixed(1)} < ${sp(half).toFixed(1)} < ${sp(full).toFixed(1)} < ${sp(power).toFixed(1)} m/s`);
check('A harder strike has a longer back-swing', mean(full.map((r) => r.releaseMs)) - 0.85 * 900 > mean(tap.map((r) => r.releaseMs)) - 0.25 * 900 + 15,
  `release → contact: tap ${(mean(tap.map((r) => r.releaseMs)) - 225).toFixed(0)} ms, hard ${(mean(full.map((r) => r.releaseMs)) - 765).toFixed(0)} ms`);
check('More effort aims higher', mean(tap.map((r) => r.crossY)) < mean(half.map((r) => r.crossY)) && mean(half.map((r) => r.crossY)) < mean(full.map((r) => r.crossY)),
  `${f2(mean(tap.map((r) => r.crossY)))} < ${f2(mean(half.map((r) => r.crossY)))} < ${f2(mean(full.map((r) => r.crossY)))} m`);
const fin = many({ name: 'finesse', at: at(18, 8), power: 0.6, aim: -0.8, mod: 'finesse' }, 6);
check('Finesse: side-foot curler with 6-10 rev/s, bends back inside the far post',
  mean(fin.map((r) => r.spin)) > 38 && mean(fin.map((r) => r.bend)) > 1.2 && Math.abs(mean(fin.map((r) => r.crossZ)) + 2.6) < 0.8,
  `spin ${mean(fin.map((r) => r.spin)).toFixed(0)} rad/s, bend ${f2(mean(fin.map((r) => r.bend)))} m, crosses at z ${f2(mean(fin.map((r) => r.crossZ)))}`);
const low = many({ name: 'low', at: at(18), power: 0.7, aim: 0.7, mod: 'double' }, 6);
const laces = many({ name: 'laces', at: at(18), power: 0.7, aim: 0.7 }, 6);
check('Low driven (double tap): stays under ~1.3 m, crosses low', low.every((r) => r.lowDriven) && mean(low.map((r) => r.peak)) < 1.3 && mean(low.map((r) => r.crossY)) < 0.75,
  `peak ${f2(mean(low.map((r) => r.peak)))} m (laces ${f2(mean(laces.map((r) => r.peak)))}), crosses at ${f2(mean(low.map((r) => r.crossY)))} m`);
const chip = many({ name: 'chip', at: at(16), power: 0.5, aim: 0, mod: 'chip' }, 6);
check('Chip: up over 3 m with backspin, drops under the bar', mean(chip.map((r) => r.peak)) > 3 && chip.filter((r) => r.onTarget).length >= 4,
  `peak ${f2(mean(chip.map((r) => r.peak)))} m, ${chip.filter((r) => r.onTarget).length}/${chip.length} under the bar`);

console.log('Accuracy');
{
  const good = many({ name: 'good', at: at(20, -3), power: 0.7, aim: 0.6, idx: 9 }, 10);
  const poor = many({ name: 'poor', at: at(20, -3), power: 0.7, aim: 0.6, idx: 3 }, 10);
  // Spread at the goal line, and shots that never got there count as wild.
  const spread = (r: ShotResult[]) => sd(r.map((x) => x.crossZ)) + sd(r.map((x) => x.crossY)) + r.filter((x) => Number.isNaN(x.crossZ)).length * 0.5;
  check('A better finisher has a tighter spread', spread(good) < spread(poor), `${f2(spread(good))} m vs ${f2(spread(poor))} m (striker vs centre-back)`);
  const run = many({ name: 'run', at: at(22), power: 0.7, aim: 0.6, run: 8 }, 10);
  const still = many({ name: 'still', at: at(18), power: 0.7, aim: 0.6 }, 10);
  check('Shooting at a sprint is less accurate', spread(run) > spread(still), `${f2(spread(run))} m vs ${f2(spread(still))} m`);
}

console.log('Keeper');
{
  const elite: KeeperProfile = { reflexes: 0.9, diving: 0.9, handling: 0.85, positioning: 0.9, reach: 2.3 };
  const poorK: KeeperProfile = { reflexes: 0.45, diving: 0.45, handling: 0.45, positioning: 0.45, reach: 2.2 };
  check('Reaction: elite ~0.13 s, poor ~0.2 s, a screen adds ~0.12 s',
    reactionTime(elite, false) < 0.15 && reactionTime(poorK, false) > 0.18 && reactionTime(elite, true) > reactionTime(elite, false) + 0.1,
    `${f2(reactionTime(elite, false))} / ${f2(reactionTime(poorK, false))} / screened ${f2(reactionTime(elite, true))} s`);
  check('Dive reach grows over ~0.6-0.8 s to ~2.5-3 m', reachAt(elite, 190, 0.1) < 1.2 && reachAt(elite, 190, 0.8) > 2.6 && reachAt(elite, 190, 0.8) < 3.2 && reachAt(poorK, 185, 0.8) < reachAt(elite, 190, 0.8) - 0.2,
    `elite ${f2(reachAt(elite, 190, 0.1))} → ${f2(reachAt(elite, 190, 0.4))} → ${f2(reachAt(elite, 190, 0.8))} m, poor ${f2(reachAt(poorK, 185, 0.8))} m`);
  check('The corner needs more time than he has from 11 m', timeToReach(elite, 190, 3.2) > 0.45);
  const rng = () => 0.5;
  const base = { k: elite, heightCm: 190, vel: { x: 24, y: 0, z: 0 }, ball: { x: HALF_L, y: 0.5, z: 2 }, goalX: HALF_L, out: -1, rng };
  check('Diving the wrong way loses it', resolveSave({ ...base, need: 2, y: 0.5, tau: 0.4, diveDir: -1 }).result === 'beaten');
  check('A ball hit at him is saved', resolveSave({ ...base, need: 0.3, y: 1, tau: 0.3, diveDir: 0 }).result !== 'beaten');
  check('Out of reach is a goal', resolveSave({ ...base, need: 3.4, y: 0.5, tau: 0.35, diveDir: 1 }).result === 'beaten');
  const tip = resolveSave({ ...base, need: 2.6, y: 0.6, tau: 0.9, diveDir: 1, rng: () => 0.99 });
  check('At full stretch it is parried or tipped, not held', tip.result === 'tip' || tip.result === 'parry', tip.result);

  // Physical saves in the engine: a shot straight at him vs a hard one into the corner.
  const atHim = many({ name: 'at him', at: at(18), power: 0.6, aim: 0, keeper: true }, 8);
  const corner = many({ name: 'corner', at: at(16), power: 0.9, aim: 0.95, keeper: true }, 8);
  const goals = (r: ShotResult[]) => r.filter((x) => x.result === 'goal').length;
  check('Engine: a shot at the keeper is stopped; a hard one into the corner often beats him', goals(atHim) <= 1 && goals(corner) >= 3,
    `at him ${goals(atHim)}/${atHim.length} goals (${atHim.map((r) => r.result[0]).join('')}), corner ${goals(corner)}/${corner.length} (${corner.map((r) => r.result[0]).join('')})`);
}

console.log(failed ? `\n${failed} shooting check(s) failed` : '\nall shooting checks passed');
process.exit(failed ? 1 : 0);
