// Shot outcomes by power, from 18 m central and 22 m angled, against a keeper.
import { createMatch, stepMatch, setControlled } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
await preparePhysics();
function trial(power: number, at: [number, number], aim: number) {
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  for (const p of s.players) if (p.onPitch && !(p.team === 0 && p.idx === 9) && !(p.team === 1 && p.role === 'GK')) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  s.engine = new MatchPhysics(s);
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  for (const p of s.players) p.mustPass = false;
  const me = s.players.find((p) => p.team === 0 && p.idx === 9)!;
  const dir = s.teams[0].dir;
  s.ball.owner = null;
  setControlled(s, s.teams[0], me);
  me.pos.x = (HALF_L - at[0]) * dir; me.pos.z = at[1]; me.face.x = dir; me.face.z = 0;
  s.ball.pos.x = me.pos.x + 0.55 * dir; s.ball.pos.z = at[1] + 0.1; s.ball.pos.y = 0.11; s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0; s.ball.owner = me;
  s.ball.directThrowInGoalBlockedBy = null; s.ball.directRestartOwnGoalBlockedBy = null; s.ball.freeKickGoalRestrictedBy = null; s.ball.restartDoubleTouchBy = null;
  const gk0 = s.players.find((p) => p.team === 1 && p.role === 'GK')!;
  gk0.pos.x = (HALF_L - 1) * dir; gk0.pos.z = 0; gk0.face.x = -dir; gk0.face.z = 0; gk0.holding = false; gk0.mustPass = false;
  for (let i = 0; i < 30; i++) stepMatch(s, { p1: {} }, FIXED_DT);
  if (process.env.TRACE) { const gk = s.players.find((p) => p.team === 1 && p.role === 'GK')!; console.log('GK', gk.name, 'onPitch', gk.onPitch, 'pos', gk.pos.x.toFixed(1), gk.pos.z.toFixed(1), 'dir1', s.teams[1].dir); }
  const hold = Math.round(power * 0.9 * 60); // SHOT_CHARGE_TIME ~0.9 s
  let out = 'miss', speed = 0;
  for (let i = 0; i < 300 && out === 'miss'; i++) {
    stepMatch(s, { p1: i < hold ? { shootHeld: true, shootPressed: i === 0, mx: dir, mz: aim } : { mx: dir, mz: aim } }, FIXED_DT);
    speed = Math.max(speed, Math.hypot(s.ball.vel.x, s.ball.vel.z));
    if (process.env.TRACE) for (const e of s.events) if (!['banner'].includes(e.type)) console.log('  event', JSON.stringify(e).slice(0, 160));
    for (const e of s.events) { if (e.type === 'goal') out = 'goal'; else if (e.type === 'save') out = 'save'; }
    s.events.length = 0;
    if (process.env.TRACE && Math.abs(s.ball.pos.x) > HALF_L - 1.5 && Math.abs(s.ball.pos.x) < HALF_L + 2) console.log('  ball', s.ball.pos.x.toFixed(2), s.ball.pos.y.toFixed(2), s.ball.pos.z.toFixed(2), 'v', s.ball.vel.x.toFixed(1), s.ball.vel.y.toFixed(1), s.ball.vel.z.toFixed(1), 'keeper', s.players.find((p) => p.team === 1 && p.role === 'GK')!.pos.z.toFixed(2));
    if (s.phase !== 'play' && out === 'miss') { out = s.restart?.type ?? s.phase; }
  }
  s.engine!.dispose();
  return { out, speed };
}
if (process.env.TRACE) { console.log(trial(0.6, [18, 0], 0.8)); process.exit(0); }
for (const [label, at, aim] of [['18 m central, aim corner', [18, 0], 0.8], ['22 m angled, aim far', [22, 14], -0.8]] as const) {
  for (const power of [0.3, 0.6, 0.85, 1]) {
    const res: Record<string, number> = {}; let sp = 0; const N = 12;
    for (let k = 0; k < N; k++) { const r = trial(power, at as [number, number], aim); res[r.out] = (res[r.out] ?? 0) + 1; sp += r.speed; }
    console.log(`${label.padEnd(26)} power ${power.toFixed(2)}  avg ${(sp / N).toFixed(1)} m/s  ${JSON.stringify(res)}`);
  }
}
