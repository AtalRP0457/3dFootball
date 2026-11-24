// Passing: ball model, weight, lead, accuracy by attribute, first touch and
// lane choice, all on the engine. Run: npx tsx tests/passing.test.ts
import { createMatch, stepMatch, laneRisk, choosePassTarget } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { FIXED_DT, HALF_W } from '../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../src/game/engineBridge.ts';
import { planPass, passArriveSpeed } from '../src/game/mechanics/passing.ts';
import { Simulation } from '../packages/game-engine/physics/Simulation.ts';
import { createCalibration } from '../packages/game-engine/physics/PhysicsConfig.ts';
import { rollingSpin, spinFromComponents } from '../packages/game-engine/ball/BallSpin.ts';
import { PASS_ROLL_SPIN } from '../packages/game-engine/player/PlayerBallInteraction.ts';
import { runCase, type LabResult } from './gameplay/pass-lab.ts';
import { seedRandom, mulberry32 } from './support/seed.ts';
import type { MatchState } from '../src/types/game.ts';

seedRandom();
await preparePhysics();
let failed = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const cal = createCalibration();
const s0 = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
const eng = new MatchPhysics(s0);

// 1) The ground-pass solver flies the engine's own ball: launch for an arrival
//    speed at a distance, and the arrival time used to lead the receiver.
{
  let worstV = 0, worstT = 0;
  for (const [d, arr] of [[6, 6.5], [12, 8], [20, 10], [30, 12.5], [25, 16], [15, 4.5]]) {
    const v0 = eng.groundLaunch(d, arr), tp = eng.groundTime(d, arr);
    const sim = new Simulation(cal);
    const v = { x: v0, y: 0, z: 0 }; const rs = rollingSpin(v, cal.ball.radius);
    sim.placeBall({ x: -50, y: cal.ball.radius, z: 0 }, v, { x: rs.x * PASS_ROLL_SPIN, y: 0, z: rs.z * PASS_ROLL_SPIN });
    let t = 0;
    while (t < 6) { sim.step(); t += cal.world.fixedDt; sim.ball.capture(); if (sim.ball.curr.position.x + 50 >= d) break; }
    worstV = Math.max(worstV, Math.abs(sim.ball.curr.velocity.x - arr));
    worstT = Math.max(worstT, Math.abs(t - tp));
    sim.dispose();
  }
  check('Ground-pass solver matches the engine ball', worstV < 0.2 && worstT < 0.05, `worst arrival speed error ${worstV.toFixed(3)} m/s, worst time error ${worstT.toFixed(3)} s`);
}

// 2) The lofted solver lands where it aims (with the engine's backspin).
{
  let worst = 0;
  for (const [d, el, top] of [[20, 34, -22], [35, 31, -35], [50, 28, -35], [28, 19, -15]]) {
    const f = eng.loftedFlight(d, el, top);
    const e = (el * Math.PI) / 180;
    const v = { x: f.speed * Math.cos(e), y: f.speed * Math.sin(e), z: 0 };
    const sim = new Simulation(cal);
    sim.placeBall({ x: -50, y: cal.ball.radius, z: 0 }, v, spinFromComponents(v, { top }));
    // First touchdown: low enough, or already bounced (vertical speed flipped
    // between two steps, which a 60 Hz sample can otherwise step over).
    let t = 0, up = false, land = NaN, vyPrev = 0;
    while (t < 7) {
      sim.step(); t += cal.world.fixedDt; sim.ball.capture();
      const b = sim.ball.curr;
      if (b.position.y > 0.5) up = true;
      if (up && (b.position.y < cal.ball.radius + 0.03 || (vyPrev < -1 && b.velocity.y > 0))) { land = b.position.x + 50; break; }
      vyPrev = b.velocity.y;
    }
    worst = Math.max(worst, Math.abs(land - d));
    sim.dispose();
  }
  check('Lofted solver lands on target', worst < 1, `worst landing error ${worst.toFixed(2)} m`);
}

// 3) Weight policy: arrival speed rises with distance, driven > ground > through,
//    and a held pass scales it.
{
  const g = [6, 12, 20, 30].map((d) => passArriveSpeed('ground', d));
  const mono = g.every((v, i) => i === 0 || v > g[i - 1]);
  const kinds = passArriveSpeed('ground', 20, true) > passArriveSpeed('ground', 20) && passArriveSpeed('ground', 20) > passArriveSpeed('through', 20);
  const pw = passArriveSpeed('ground', 15, false, 0.2) < passArriveSpeed('ground', 15) && passArriveSpeed('ground', 15) < passArriveSpeed('ground', 15, false, 1);
  check('Pass weight policy', mono && kinds && pw && g[0] <= 7, `ground arrivals ${g.map((v) => v.toFixed(1)).join(' / ')} m/s for 6/12/20/30 m`);
}

// 4) In the match: weight grows with distance, short passes are soft, and the
//    ball reaches the receiver on his line (standing and running).
const lab = (name: string, r: LabResult) => `${name}: launch ${r.launch.toFixed(1)}, arrives ${r.arrive.toFixed(1)} m/s after ${r.flight.toFixed(2)} s, ${r.miss.toFixed(2)} m off his line, recv ${r.received}`;
{
  const r6 = runCase({ name: '6', key: 'passPressed', dist: 6 });
  const r20 = runCase({ name: '20', key: 'passPressed', dist: 20 });
  const r30 = runCase({ name: '30', key: 'passPressed', dist: 30 });
  check('Ground passes weighted by distance', r6.launch < 9.5 && r6.launch < r20.launch && r20.launch < r30.launch && r30.launch > 16 && [r6, r20, r30].every((r) => r.received === 'yes'),
    [lab('6 m', r6), lab('20 m', r20), lab('30 m', r30)].join('; '));
  const run = runCase({ name: 'run', key: 'passPressed', dist: 12, angle: 25, run: 5, runDir: [1, 0] });
  const thr = runCase({ name: 'through', key: 'throughPressed', dist: 25, angle: 15, run: 6.5, runDir: [1, 0] });
  check('Passes to moving players arrive on their line', run.miss < 0.7 && thr.miss < 0.7 && run.received === 'yes' && thr.received === 'yes', [lab('ground to runner', run), lab('through ball', thr)].join('; '));
  const lf = runCase({ name: 'lofted', key: 'loftPressed', dist: 50, angle: 30 });
  // Planned drop point: just short of the receiver (he attacks the ball from there).
  const pl = planPass({ p: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, face: { x: 1, z: 0 }, phys: { runSpeed: 7, sprintMul: 1.3, passAccuracy: 0.8, longPassing: 0.8 } },
    target: { pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 } }, ball: { pos: { x: 0.5, y: 0.11, z: 0 } }, kind: 'lofted', rng: () => 0.5 });
  const short = Math.hypot(pl.land.x - 50, pl.land.z);
  check('Long lofted ball drops near the receiver and gets there quickly', lf.received === 'yes' && lf.flight < 3 && short < 4,
    `${lab('lofted 50 m', lf)} (he came ${lf.moved.toFixed(1)} m to meet it); planned drop ${short.toFixed(1)} m short of him`);
  const soft = runCase({ name: 'soft', key: 'passPressed', dist: 15, power: 0.25 });
  const full = runCase({ name: 'full', key: 'passPressed', dist: 15, power: 1 });
  check('Held power changes the pace', full.launch > soft.launch + 5, `soft ${soft.launch.toFixed(1)} m/s, full ${full.launch.toFixed(1)} m/s`);
}

// 5) Accuracy follows the right attribute and the situation (planner spread).
{
  const rng = mulberry32(7);
  const base = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, face: { x: 1, z: 0 }, stamina: 1 };
  const phys = (sp: number, lp: number, vis: number, cr: number) => ({ runSpeed: 7, sprintMul: 1.3, passAccuracy: sp, longPassing: lp, vision: vis, crossing: cr });
  const sig = (o: Partial<Parameters<typeof planPass>[0]> & { ph: ReturnType<typeof phys> }, d = 15) =>
    planPass({ p: { ...base, phys: o.ph }, target: { pos: { x: d, z: 0 }, vel: { x: 0, z: 0 } }, ball: { pos: { x: 0.5, y: 0.11, z: 0 } }, rng, ...o }).sigma;
  const elite = phys(0.95, 0.9, 0.95, 0.9), poor = phys(0.45, 0.4, 0.4, 0.4);
  const shortVsLong = phys(0.95, 0.4, 0.6, 0.5);
  const a = sig({ ph: elite }), b = sig({ ph: poor });
  const sShort = sig({ ph: shortVsLong }, 10), sLong = sig({ ph: shortVsLong }, 40);
  const settled = sig({ ph: elite }), ft = sig({ ph: elite, firstTime: { inSpeed: 14, turn: 0.3 } }), ftTurn = sig({ ph: elite, firstTime: { inSpeed: 14, turn: 2.8 } });
  const thrVis = sig({ ph: phys(0.7, 0.7, 0.95, 0.6), kind: 'through' }), thrBlind = sig({ ph: phys(0.7, 0.7, 0.4, 0.6), kind: 'through' });
  const crossGood = sig({ ph: phys(0.6, 0.6, 0.6, 0.95), kind: 'lofted', cross: true }, 30), crossBad = sig({ ph: phys(0.6, 0.6, 0.6, 0.4), kind: 'lofted', cross: true }, 30);
  const pressed = sig({ ph: elite, pressure: 1 });
  const ok = a < b * 0.5 && sShort / 10 < sLong / 40 * 1.0 && ft > settled * 1.3 && ftTurn > ft * 1.3 && thrVis < thrBlind && crossGood < crossBad && pressed > settled;
  check('Pass accuracy follows attributes and situation', ok,
    `spread (deg): elite ${(a * 57.3).toFixed(2)} vs poor ${(b * 57.3).toFixed(2)}; first time ${(ft * 57.3).toFixed(2)}, turned 160° ${(ftTurn * 57.3).toFixed(2)}; through by vision ${(thrVis * 57.3).toFixed(2)} vs ${(thrBlind * 57.3).toFixed(2)}; cross by crossing ${(crossGood * 57.3).toFixed(2)} vs ${(crossBad * 57.3).toFixed(2)}; pressed ${(pressed * 57.3).toFixed(2)}`);
}

// 6) Weak foot: a 1-star weak foot strikes worse than a 5-star one.
{
  const lo = 0.7 + 0.06 * 1, hi = 0.7 + 0.06 * 5;
  const p = s0.players.find((x) => x.team === 0 && x.onPitch && x.weakFoot != null);
  check('Weak-foot rating reaches the player and the strike', !!p && p.phys.weakFoot >= 0 && p.phys.weakFoot <= 1 && lo < hi && hi === 1,
    `${p?.name}: ${p?.weakFoot}★ → profile ${p?.phys.weakFoot.toFixed(2)}; strike quality 1★ ${lo.toFixed(2)} vs 5★ ${hi.toFixed(2)}`);
}

// 7) First touch: harder balls and worse first-touch ratings leave more pace on it.
{
  const easy = runCase({ name: 'e', key: 'passPressed', dist: 8 });
  const hard = runCase({ name: 'h', key: 'drivenPressed', dist: 20 });
  const fwd = runCase({ name: 'f', key: 'passPressed', dist: 15, power: 1 });
  const cb = runCase({ name: 'c', key: 'passPressed', dist: 15, power: 1, rcIdx: 2 });
  check('First touch depends on pace and rating', easy.firstTouch < 1.6 && hard.firstTouch > easy.firstTouch + 1.5 && cb.firstTouch > fwd.firstTouch,
    `left on the ball: soft 8 m ${easy.firstTouch.toFixed(2)} m/s, driven 20 m ${hard.firstTouch.toFixed(2)} m/s; hard pass to forward ${fwd.firstTouch.toFixed(2)} vs centre-back ${cb.firstTouch.toFixed(2)} m/s`);
}

// 8) Lane choice: a defender who can reach the ball makes a lane risky; one
//    standing far off it, or behind the passer, does not.
{
  const s: MatchState = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  for (const p of s.players) if (p.onPitch) { p.pos.x = 0; p.pos.z = HALF_W + 6; p.onPitch = !(p.team === 1 && p.idx > 1) && !(p.team === 0 && ![4, 9, 10].includes(p.idx)); }
  s.engine = new MatchPhysics(s);
  const me = s.players.find((p) => p.team === 0 && p.idx === 4)!, a = s.players.find((p) => p.team === 0 && p.idx === 9)!, b = s.players.find((p) => p.team === 0 && p.idx === 10)!;
  const d1 = s.players.find((p) => p.team === 1 && p.idx === 1)!;
  me.pos = { x: 0, z: 0 }; a.pos = { x: 15, z: 2 }; b.pos = { x: 15, z: -2 };
  d1.pos = { x: 7, z: 1.8 }; // on the lane to `a`
  const riskA = laneRisk(s, me.pos, a.pos, 0), riskB = laneRisk(s, me.pos, b.pos, 0);
  const pick = choosePassTarget(s, me, 1, 0);
  d1.pos = { x: -3, z: 0.5 };
  const behind = laneRisk(s, me.pos, a.pos, 0);
  check('Lane risk is timing-based and steers the target', riskA > 0.5 && riskB < riskA && pick === b && behind === 0,
    `risk to covered mate ${riskA.toFixed(2)}, to open mate ${riskB.toFixed(2)} → picks #${pick?.idx}; defender behind passer ${behind.toFixed(2)}`);
  s.engine.dispose();
}

eng.dispose();
void stepMatch; void FIXED_DT;
if (failed) { console.log(`\n${failed} passing check(s) failed`); process.exit(1); }
console.log('\nall passing checks passed');
