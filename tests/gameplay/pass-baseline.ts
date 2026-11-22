// Baseline measurement of human passes on the engine (not a pass/fail test).
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';

await preparePhysics();
type Frame = Record<string, unknown>;
function setup(mates: Array<[number, number, number]>, at: [number, number] = [-10, 0]) {
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  const keep = new Set(mates.map((m) => m[0]));
  for (const p of s.players) if (p.onPitch && !(p.team === 0 && (p.idx === 4 || keep.has(p.idx))) && !(p.team === 1 && p.idx === 0)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  s.engine = new MatchPhysics(s);
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
  s.ball.restartDoubleTouchBy = null;
  const me = s.players.find((p) => p.team === 0 && p.idx === 4)!;
  s.teams[0].controlled = me;
  me.pos.x = at[0]; me.pos.z = at[1]; me.face.x = 1; me.face.z = 0;
  for (const [idx, x, z] of mates) { const m = s.players.find((p) => p.team === 0 && p.idx === idx)!; m.pos.x = x; m.pos.z = z; }
  s.ball.pos.x = me.pos.x + 0.55; s.ball.pos.z = me.pos.z + 0.1; s.ball.pos.y = 0.11; s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
  s.ball.owner = me;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: {} }, FIXED_DT);
  return { s, me };
}
const mates: Array<[number, number, number]> = [[9, 2, 0], [10, 25, -12]];
const cases: Array<[string, Frame, Array<[number, number, number]>?, [number, number]?]> = [
  ['F short (stick to near mate)', { passPressed: true, mx: 1, mz: 0 }],
  ['F + sprint', { passPressed: true, mx: 1, mz: 0, sprint: true }],
  ['E driven', { drivenPressed: true, mx: 1, mz: 0 }],
  ['F aimed at far mate', { passPressed: true, mx: 0.9, mz: -0.45 }],
  ['R through', { throughPressed: true, mx: 1, mz: 0 }],
  ['V lofted (near)', { loftPressed: true, mx: 1, mz: 0 }],
  ['V lofted (far)', { loftPressed: true, mx: 0.9, mz: -0.45 }],
  ['V cross from the wing', { loftPressed: true, mx: 0.5, mz: -1 }, [[9, HALF_L - 12, 4], [10, HALF_L - 30, 20]], [HALF_L - 22, 26]],
];
for (const [name, f, m, at] of cases) {
  const { s, me } = setup(m ?? mates, at);
  let release = -1, speed = 0, maxY = 0, kind = '', to = '', ctrlBy = '', ctrlAt = -1;
  const p0 = { ...s.ball.pos };
  for (let i = 0; i < 360; i++) {
    const frame: Frame = i === 0 ? f : { mx: f.mx, mz: f.mz, sprint: f.sprint };
    stepMatch(s, { p1: i < 3 ? frame : {} }, FIXED_DT);
    for (const e of s.events) {
      if (e.type === 'pass' && e.human && release < 0) { release = i; kind = String(e.kind); to = s.players.find((p) => p.id === e.to)?.idx + ''; }
      if (release >= 0 && (e.type === 'control' || e.type === 'touch') && ctrlAt < 0 && s.ball.owner && s.ball.owner !== me) { ctrlAt = i; ctrlBy = `${s.ball.owner.team}:${s.ball.owner.idx}`; }
    }
    s.events.length = 0;
    if (release >= 0) { speed = Math.max(speed, Math.hypot(s.ball.vel.x, s.ball.vel.z)); maxY = Math.max(maxY, s.ball.pos.y); }
    if (ctrlAt >= 0) break;
  }
  const travel = Math.hypot(s.ball.pos.x - p0.x, s.ball.pos.z - p0.z);
  console.log(`${name.padEnd(30)} release ${release < 0 ? 'NONE' : (release * FIXED_DT * 1000).toFixed(0) + 'ms'}  kind ${kind.padEnd(7)} to #${to}  speed ${speed.toFixed(1)} m/s  maxY ${maxY.toFixed(2)} m  travel ${travel.toFixed(1)} m  received ${ctrlBy || '-'} after ${ctrlAt < 0 ? '-' : ((ctrlAt - release) * FIXED_DT).toFixed(2) + 's'}`);
  s.engine!.dispose();
}
