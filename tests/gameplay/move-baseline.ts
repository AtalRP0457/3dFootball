// Baseline: how a human-controlled player responds to the stick (no ball).
import { createMatch, stepMatch, setControlled } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_W } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
await preparePhysics();
function setup() {
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  for (const p of s.players) if (p.onPitch && !(p.team === 0 && p.idx === 9)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  s.engine = new MatchPhysics(s);
  for (let k = 0; k < 600 && s.phase !== 'play'; k++) stepMatch(s, {}, FIXED_DT);
  if (s.phase !== 'play') { s.phase = 'play'; s.restart = null; console.log('(forced play: no kick-off taker)'); }
  for (const p of s.players) { p.mustPass = false; }
  const me = s.players.find((p) => p.team === 0 && p.idx === 9)!;
  s.ball.owner = null; s.ball.intended = null;
  setControlled(s, s.teams[0], me); me.pos.x = -20; me.pos.z = 0;
  s.ball.pos.x = 40; s.ball.pos.z = 30; s.ball.vel.x = s.ball.vel.z = 0;
  for (let i = 0; i < 30; i++) stepMatch(s, { p1: {} }, FIXED_DT);
  return { s, me };
}
const sp = (p: { vel: { x: number; z: number } }) => Math.hypot(p.vel.x, p.vel.z);
for (const sprint of [false, true]) {
  const { s, me } = setup();
  let t90 = -1, top = 0;
  const trace: number[] = [];
  for (let i = 0; i < 180; i++) { stepMatch(s, { p1: { mx: 1, mz: 0, sprint } }, FIXED_DT); trace.push(sp(me)); }
  top = Math.max(...trace);
  t90 = trace.findIndex((v) => v >= top * 0.9);
  const t50 = trace.findIndex((v) => v >= top * 0.5);
  // Stop
  const x0 = me.pos.x; let tStop = -1;
  for (let i = 0; i < 180; i++) { stepMatch(s, { p1: { mx: 0, mz: 0 } }, FIXED_DT); if (tStop < 0 && sp(me) < 0.3) tStop = i; }
  const stopDist = Math.abs(me.pos.x - x0);
  // Reverse from top speed
  for (let i = 0; i < 120; i++) stepMatch(s, { p1: { mx: 1, mz: 0, sprint } }, FIXED_DT);
  let tRev = -1;
  for (let i = 0; i < 180; i++) { stepMatch(s, { p1: { mx: -1, mz: 0, sprint } }, FIXED_DT); if (tRev < 0 && me.vel.x < -top * 0.5) tRev = i; }
  // 90° cut
  for (let i = 0; i < 120; i++) stepMatch(s, { p1: { mx: 1, mz: 0, sprint } }, FIXED_DT);
  let t45 = -1;
  const v0 = `${me.vel.x.toFixed(1)},${me.vel.z.toFixed(1)} at x=${me.pos.x.toFixed(1)}`;
  for (let i = 0; i < 120; i++) { stepMatch(s, { p1: { mx: 0, mz: 1, sprint } }, FIXED_DT); const ang = Math.atan2(me.vel.z, me.vel.x); if (t45 < 0 && ang > Math.PI / 4) t45 = i; }
  if (t45 < 0) console.log('cut start vel', v0, 'end vel', me.vel.x.toFixed(1), me.vel.z.toFixed(1), 'pos', me.pos.x.toFixed(1), me.pos.z.toFixed(1));
  const ms = (n: number) => (n < 0 ? 'never' : `${Math.round(n * FIXED_DT * 1000)} ms`);
  console.log(`${sprint ? 'sprint' : 'run   '}  top ${top.toFixed(2)} m/s  50% ${ms(t50)}  90% ${ms(t90)}  stop ${ms(tStop)} over ${stopDist.toFixed(2)} m  reverse(50%) ${ms(tRev)}  90° cut heading>45° ${ms(t45)}`);
  s.engine!.dispose();
}
