// Pass lab: measures every human pass type on the engine at several
// distances, to a standing and to a running receiver. Not a pass/fail test;
// prints one line per case (and a JSON summary with --json).
//   npx tsx tests/gameplay/pass-lab.ts
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_W } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
import type { MatchState, Player } from '../../src/types/game.ts';
import { seedRandom } from '../support/seed.ts';

seedRandom();
await preparePhysics();
type Frame = Record<string, unknown>;

function toPlay(s: MatchState) {
  for (let k = 0; k < 600 && s.phase !== 'play'; k++) stepMatch(s, {}, FIXED_DT);
  if (s.phase !== 'play') { s.phase = 'play'; s.restart = null; }
  s.kickoffPending = false; // a staged scenario, not a real kick-off
}
const ofIdx = (s: MatchState, idx: number) => s.players.find((p) => p.team === 0 && p.idx === idx)!;

export interface LabCase {
  name: string; key: string; dist: number; angle?: number; run?: number; runDir?: [number, number]; power?: number;
  opponents?: Array<[number, number]>;
  /** Receiver slot (default #9). */
  rcIdx?: number;
}
export interface LabResult {
  name: string; released: boolean; releaseMs: number; kind: string; launch: number; peak: number;
  flight: number; arrive: number; miss: number; received: string; firstTouch: number; to: string; moved: number; landOff: number; landT: number;
}

/** One pass: passer #4 at (-20, 0) facing +x, receiver #9 at dist/angle. */
export function runCase(c: LabCase): LabResult {
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  const keepOpp = new Set((c.opponents ?? []).map((_, i) => i + 2));
  for (const p of s.players) {
    const mine = p.team === 0 && (p.idx === 4 || p.idx === (c.rcIdx ?? 9));
    const opp = p.team === 1 && (p.idx === 0 || keepOpp.has(p.idx));
    if (p.onPitch && !mine && !opp) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  }
  s.engine = new MatchPhysics(s);
  toPlay(s);
  for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
  s.ball.restartDoubleTouchBy = null;
  const me = ofIdx(s, 4), rc = ofIdx(s, c.rcIdx ?? 9);
  s.teams[0].controlled = me;
  const at = { x: -20, z: 0 };
  me.pos.x = at.x; me.pos.z = at.z; me.face.x = 1; me.face.z = 0;
  const a = ((c.angle ?? 0) * Math.PI) / 180;
  rc.pos.x = at.x + Math.cos(a) * c.dist; rc.pos.z = at.z + Math.sin(a) * c.dist;
  (c.opponents ?? []).forEach(([x, z], i) => { const o = s.players.find((p) => p.team === 1 && p.idx === i + 2)!; o.pos.x = x; o.pos.z = z; });
  s.ball.pos.x = me.pos.x + 0.55; s.ball.pos.z = me.pos.z + 0.1; s.ball.pos.y = 0.11;
  s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
  s.ball.owner = me;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: {} }, FIXED_DT);

  // A running receiver: keep him on his run (his AI would re-plan otherwise).
  const run = c.run ?? 0;
  const rd = c.runDir ?? [1, 0];
  const steer = () => {
    if (!run || !forceRun || s.ball.owner === rc || rcTouched) return;
    rc.vel.x = rd[0] * run; rc.vel.z = rd[1] * run;
  };
  let rcTouched = false;
  const forceRun = !!process.env.FORCE_RUN;
  steer();

  const toR = { x: rc.pos.x - me.pos.x, z: rc.pos.z - me.pos.z };
  const l = Math.hypot(toR.x, toR.z);
  const stick = { mx: toR.x / l, mz: toR.z / l };
  // PASS_CHARGE_TIME 0.75 s: hold for power×0.75 s, then release.
  const hold = c.power != null ? Math.max(1, Math.round((c.power * 0.75) / FIXED_DT)) : 0;
  let release = -1, kind = '', launch = 0, peak = 0, arrive = 0, flight = 0, miss = Infinity, received = '-', ctrlAt = -1, to = '';
  let firstTouch = NaN, moved = NaN, landOff = NaN, landT = NaN;
  let land: { x: number; z: number } | null = null;
  let relPos: { x: number; z: number } | null = null;
  for (let i = 0; i < 480; i++) {
    const f: Frame = i <= hold + 2 ? { ...stick } : {};
    if (i === 0) f[c.key] = true;
    if (c.power != null && i <= hold) f.passHeld = true;
    steer();
    stepMatch(s, { p1: f }, FIXED_DT);
    steer();
    for (const e of s.events) {
      if (e.type === 'pass' && e.human && release < 0) { release = i; kind = String(e.kind); to = String(s.players.find((p) => p.id === e.to)?.idx); }
    }
    s.events.length = 0;
    if (release >= 0 && ctrlAt < 0) {
      const h = Math.hypot(s.ball.vel.x, s.ball.vel.z);
      if (i - release <= 3) launch = Math.max(launch, Math.hypot(h, s.ball.vel.y));
      peak = Math.max(peak, s.ball.pos.y);
      if (peak > 0.6 && land == null && s.ball.pos.y < 0.2 && s.ball.vel.y <= 0.05 && relPos) {
        land = { x: s.ball.pos.x, z: s.ball.pos.z };
        landOff = Math.hypot(land.x - relPos.x, land.z - relPos.z);
        landT = (i - release) * FIXED_DT;
      }
      const d = Math.hypot(s.ball.pos.x - rc.pos.x, s.ball.pos.z - rc.pos.z);
      if (relPos == null) relPos = { x: rc.pos.x, z: rc.pos.z };
      if (flight === 0 && d < 1.6 && h > 0.05) {
        // Arrival: speed as it reaches him and how far off his body line it runs.
        arrive = h; flight = (i - release) * FIXED_DT;
        const ux = s.ball.vel.x / h, uz = s.ball.vel.z / h;
        miss = Math.abs((rc.pos.x - s.ball.pos.x) * uz - (rc.pos.z - s.ball.pos.z) * ux);
        moved = Math.hypot(rc.pos.x - relPos.x, rc.pos.z - relPos.z);
      }
      if (s.ball.owner && s.ball.owner !== me) {
        ctrlAt = i; received = s.ball.owner === rc ? 'yes' : s.ball.owner.team === 0 ? 'mate' : 'OPP';
        rcTouched = true;
      }
      if (!s.ball.owner && (i - release) * FIXED_DT > 5) break;
    }
    if (process.env.DEBUG_AFTER && ctrlAt >= 0 && i <= ctrlAt + 18) console.log(`  +${i - ctrlAt} ball (${s.ball.pos.x.toFixed(2)},${s.ball.pos.z.toFixed(2)}) v ${Math.hypot(s.ball.vel.x, s.ball.vel.z).toFixed(2)} rc (${rc.pos.x.toFixed(2)},${rc.pos.z.toFixed(2)}) v ${Math.hypot(rc.vel.x, rc.vel.z).toFixed(2)} owner ${s.ball.owner?.idx ?? '-'}`);
    if (ctrlAt >= 0 && i === ctrlAt + 3) {
      // First touch: pace left on the ball relative to him just after it
      // (a clean touch kills it, a heavy one leaves it running).
      firstTouch = Math.hypot(s.ball.vel.x - rc.vel.x, s.ball.vel.z - rc.vel.z);
      break;
    }
  }
  s.engine!.dispose();
  return {
    name: c.name, released: release >= 0, releaseMs: release * FIXED_DT * 1000, kind, launch, peak,
    flight, arrive, miss, received, firstTouch, to, moved, landOff, landT,
  };
}

export const LAB_CASES: LabCase[] = [];
for (const d of [6, 12, 20, 30]) LAB_CASES.push({ name: `ground ${d}m`, key: 'passPressed', dist: d });
for (const d of [12, 25]) LAB_CASES.push({ name: `ground ${d}m runner`, key: 'passPressed', dist: d, angle: 25, run: 5, runDir: [1, 0] });
for (const d of [12, 25]) LAB_CASES.push({ name: `ground ${d}m 60deg`, key: 'passPressed', dist: d, angle: 60 });
for (const d of [12, 25]) LAB_CASES.push({ name: `driven ${d}m`, key: 'drivenPressed', dist: d });
for (const d of [15, 25]) LAB_CASES.push({ name: `through ${d}m runner`, key: 'throughPressed', dist: d, angle: 15, run: 6.5, runDir: [1, 0] });
for (const d of [20, 35, 50]) LAB_CASES.push({ name: `lofted ${d}m`, key: 'loftPressed', dist: d, angle: 30 });
LAB_CASES.push({ name: 'lofted 40m runner', key: 'loftPressed', dist: 40, angle: 20, run: 6, runDir: [1, 0] });
for (const pw of [0.15, 0.5, 1]) LAB_CASES.push({ name: `ground 15m power ${pw}`, key: 'passPressed', dist: 15, power: pw });
// First touch by rating: the same passes to a centre-back (#2) instead of the forward.
LAB_CASES.push({ name: 'ground 15m to CB', key: 'passPressed', dist: 15, rcIdx: 2 });
LAB_CASES.push({ name: 'driven 20m to CB', key: 'drivenPressed', dist: 20, rcIdx: 2 });
LAB_CASES.push({ name: 'ground 15m full to CB', key: 'passPressed', dist: 15, power: 1, rcIdx: 2 });
// Pressure: an opponent 1.5 m from the receiver.
LAB_CASES.push({ name: 'ground 15m pressed', key: 'passPressed', dist: 15, opponents: [[-3.2, 1.6]] });

const fmt = (r: LabResult) => `${r.name.padEnd(24)} ${r.released ? `rel ${r.releaseMs.toFixed(0).padStart(3)}ms` : 'NO RELEASE'} ${r.kind.padEnd(7)} to #${r.to.padEnd(2)} launch ${r.launch.toFixed(1).padStart(4)} peak ${r.peak.toFixed(2)} flight ${r.flight.toFixed(2)}s arrive ${r.arrive.toFixed(1).padStart(4)} off ${r.miss.toFixed(2)}m moved ${r.moved.toFixed(1)}m recv ${r.received.padEnd(4)} touch ${Number.isNaN(r.firstTouch) ? '  -' : r.firstTouch.toFixed(2)}m/s${Number.isNaN(r.landOff) ? '' : ` land ${r.landOff.toFixed(1)}m from him @${r.landT.toFixed(2)}s`}`;

if (process.argv[1]?.endsWith("pass-lab.ts")) {
  const out: LabResult[] = [];
  for (const c of LAB_CASES) { const r = runCase(c); out.push(r); console.log(fmt(r)); }
  if (process.argv.includes('--json')) console.log(JSON.stringify(out));
}
