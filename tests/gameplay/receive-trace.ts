// Gameplay feel on the engine: distinct pass types, first-time (buffered)
// actions that fire exactly once, buffers cleared at restarts, and no long
// follow-through lockout. Run: npx tsx tests/gameplay-feel.test.ts
import { createMatch, stepMatch, setControlled } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
import type { MatchState, Player } from '../../src/types/game.ts';

await preparePhysics();
let failed = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
type Frame = Record<string, unknown>;
const ofIdx = (s: MatchState, idx: number) => s.players.find((p) => p.team === 0 && p.idx === idx)!;

/** P1's striker (#4) on the ball at `at`, teammates `mates` = [idx, x, z], away keeper only. */
function setup(mates: Array<[number, number, number]>, at: [number, number] = [-10, 0], opponents: number[] = [0]) {
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  const keep = new Set(mates.map((m) => m[0]));
  for (const p of s.players) if (p.onPitch && !(p.team === 0 && (p.idx === 4 || keep.has(p.idx))) && !(p.team === 1 && opponents.includes(p.idx))) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  s.engine = new MatchPhysics(s);
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
  s.ball.restartDoubleTouchBy = null;
  const me = ofIdx(s, 4);
  s.teams[0].controlled = me;
  me.pos.x = at[0]; me.pos.z = at[1]; me.face.x = 1; me.face.z = 0;
  for (const [idx, x, z] of mates) { const m = ofIdx(s, idx); m.pos.x = x; m.pos.z = z; }
  s.ball.pos.x = me.pos.x + 0.55; s.ball.pos.z = me.pos.z + 0.1; s.ball.pos.y = 0.11;
  s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
  s.ball.owner = me;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: {} }, FIXED_DT);
  return { s, me };
}
/** Step with per-frame input; collect human events. */
function play(s: MatchState, frames: number, input: (i: number) => Frame, on?: (i: number) => void) {
  const ev: Array<{ i: number; type: string; from?: string; kind?: string; by?: string }> = [];
  for (let i = 0; i < frames; i++) {
    stepMatch(s, { p1: input(i) }, FIXED_DT);
    for (const e of s.events) if (['pass', 'shot', 'control', 'kick'].includes(e.type)) ev.push({ i, type: e.type, from: e.from != null ? String(e.from) : undefined, kind: e.kind != null ? String(e.kind) : undefined, by: e.by != null ? String(e.by) : undefined });
    s.events.length = 0;
    on?.(i);
  }
  return ev;
}

// Trace a ground pass being received: ball vs receiver, frame by frame.
const runIn = process.env.RUN === '1';
const { s } = setup([[9, 6, 6]]);
const recv = ofIdx(s, 9);
const c = s.engine!.controllerOf(recv)!;
play(s, 1, () => ({ passPressed: true, mx: 1, mz: 0.4 }));
let rel = -1;
for (let i = 0; i < 130; i++) {
  const input = runIn && s.teams[0].controlled === recv ? { mx: Number(process.env.MX ?? 1), mz: Number(process.env.MZ ?? 0) } : {};
  const ev = play(s, 1, () => input);
  if (rel < 0 && !s.ball.owner) rel = i;
  if (rel < 0) continue;
  const b = s.ball;
  const d = Math.hypot(b.pos.x - recv.pos.x, b.pos.z - recv.pos.z);
  const bs = Math.hypot(b.vel.x, b.vel.z), ps = Math.hypot(recv.vel.x, recv.vel.z);
  const st = (s.engine as any).sim.interaction.state;
  if (i % 2 === 0 || ev.length) console.log(`${String(i).padStart(3)} d ${d.toFixed(2)} ball ${bs.toFixed(1)} m/s  recv ${ps.toFixed(1)} m/s  act ${c.sm.current.padEnd(10)} owner ${b.owner?.idx ?? '-'} ${st} ${ev.map((e) => e.type).join(',')}`);
}
