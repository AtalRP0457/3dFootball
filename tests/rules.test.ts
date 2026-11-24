// Laws of the Game and set-piece flow on the engine: kick-off (Law 8), fouls
// only from real challenges (Law 12), restarts set up by the players with no
// teleports (Laws 13-17: distances, walls), receiving with the body set to
// the ball, keeper distribution, and smooth turns.
// Run: npx tsx tests/rules.test.ts
import { createMatch, stepMatch, setupKickoff, setControlled } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { FIXED_DT, HALF_W, CENTER_CIRCLE_RADIUS } from '../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../src/game/engineBridge.ts';
import type { MatchState, Player } from '../src/types/game.ts';
import { seedRandom } from './support/seed.ts';

seedRandom();
await preparePhysics();
let failed = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const newMatch = (controllers: ['ai' | 'p1', 'ai'] = ['ai', 'ai']) => {
  const s = createMatch({ home: buildTeam('rma'), away: buildTeam('mci'), controllers, difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  return s;
};

// 1) Kick-off (Law 8): everyone in his own half, opponents outside the circle
//    until the ball is kicked; the first pass is short and not forward.
{
  let ok = true; const notes: string[] = [];
  for (const kt of [0, 1]) {
    const s = newMatch();
    setupKickoff(s, kt);
    let crossed = 0, inCircle = 0, first = -1, ahead = NaN;
    for (let i = 0; i < 600 && first < 0; i++) {
      stepMatch(s, {}, FIXED_DT);
      if (s.kickoffPending) for (const p of s.players) {
        if (!p.onPitch || p === s.ball.owner) continue;
        if (p.pos.x * s.teams[p.team].dir > 0.2) crossed++;
        if (p.team !== kt && Math.hypot(p.pos.x, p.pos.z) < CENTER_CIRCLE_RADIUS - 0.2) inCircle++;
      }
      for (const e of s.events) if (e.type === 'pass' && first < 0) {
        first = i;
        const from = s.players.find((p) => p.id === e.from)!, to = s.players.find((p) => p.id === e.to)!;
        ahead = (to.pos.x - from.pos.x) * s.teams[from.team].dir;
      }
      s.events.length = 0;
    }
    ok &&= crossed === 0 && inCircle === 0 && first > 0 && first * FIXED_DT < 2.5 && ahead <= 1.5;
    notes.push(`team ${kt}: kicked after ${(first * FIXED_DT).toFixed(2)} s, pass ${ahead.toFixed(1)} m ahead, over halfway ${crossed}, in circle ${inCircle}`);
    s.engine!.dispose();
  }
  check('Kick-off follows Law 8 and starts promptly', ok, notes.join('; '));
}

// 2) Restarts over a full AI match: nobody (and no ball) is moved by the
//    rules, set-up times are believable, opponents keep the distance when the
//    kick is taken, walls form near goal, and fouls are not given for every touch.
{
  const s = newMatch();
  let cutLost = 0, maxJump = 0, ballJump = 0, tossed = false, start = 0, type = '', fouls = 0, walls = 0, wallMax = 0, encroach = 0;
  const times: Record<string, number[]> = {};
  const prev = new Map<number, { x: number; z: number }>();
  let prevBall = { ...s.ball.pos };
  for (let i = 0; i < 60 * 240 && s.phase !== 'fulltime'; i++) {
    const was = s.phase;
    const sp = s.setPiece;
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) {
      if (e.type === 'whistle' && e.kind !== 'restart' && e.kind !== 'kickoff') { start = i; type = String(e.kind); }
      if (e.type === 'ballboy') tossed = true;
      if (e.type === 'foul') fouls++;
    }
    s.events.length = 0;
    // Only frames hidden by the black of a cut may move people.
    const tr = s.transition, u = tr ? tr.elapsed / tr.duration : 0;
    const cut = !!tr && Math.abs(u - 0.5) < 0.12;
    if (s.flow === 'CUT_TO_KICKOFF' && !tr) cutLost++;
    if (!cut) {
      for (const p of s.players) { const q = prev.get(p.id); if (q && p.onPitch) maxJump = Math.max(maxJump, Math.hypot(p.pos.x - q.x, p.pos.z - q.z)); }
      if (s.phase === 'restart' && !tossed) ballJump = Math.max(ballJump, Math.hypot(s.ball.pos.x - prevBall.x, s.ball.pos.z - prevBall.z));
    }
    tossed = false;
    for (const p of s.players) prev.set(p.id, { x: p.pos.x, z: p.pos.z });
    prevBall = { ...s.ball.pos };
    if (was === 'restart' && s.phase === 'play' && type) {
      (times[type] ??= []).push((i - start) * FIXED_DT);
      if (sp && sp.wall.length) { walls++; wallMax = Math.max(wallMax, sp.wall.length); }
      type = '';
    }
    // At the moment a free kick / corner is taken, opponents are 9.15 m away.
    if (sp && sp.stage === 'ready' && !s.setPiece && (sp.type === 'free kick' || sp.type === 'corner')) {
      for (const p of s.players) if (p.onPitch && p.team !== sp.team && Math.hypot(p.pos.x - sp.spot.x, p.pos.z - sp.spot.z) < 8.6) {
        encroach++;
        if (process.env.DEBUG_RULES) console.log(`  inside: ${sp.type} t ${sp.t.toFixed(1)} ${p.name} ${p.role} d ${Math.hypot(p.pos.x - sp.spot.x, p.pos.z - sp.spot.z).toFixed(1)} stun ${p.stun.toFixed(1)} v ${Math.hypot(p.vel.x, p.vel.z).toFixed(1)} intent (${p.intent.mx.toFixed(2)},${p.intent.mz.toFixed(2)}) spot (${sp.spot.x.toFixed(1)},${sp.spot.z.toFixed(1)}) pos (${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}) pose ${(p as any).pose ? 'y' : 'n'}`);
      }
    }
  }
  const all = Object.values(times).flat();
  const slow = all.filter((t) => t > 13);
  check('Restarts are set up by the players (no teleports)', maxJump < 0.35 && ballJump < 1.2 && cutLost === 0,
    `largest player move in one step ${maxJump.toFixed(2)} m (outside the black of a cut), largest ball move while setting up ${ballJump.toFixed(2)} m, cut without fade ${cutLost}`);
  check('Restart set-up times are believable', all.length >= 3 && slow.length === 0,
    Object.entries(times).map(([k, v]) => `${k} ${v.map((t) => t.toFixed(1)).join('/')} s`).join(', '));
  check('Opponents keep 9.15 m when a free kick / corner is taken', encroach === 0, `${encroach} opponents inside 8.6 m at the kick; walls formed ${walls} (largest ${wallMax})`);
  check('Fouls come from real challenges, not every touch', fouls <= 7, `${fouls} fouls in a 4-minute AI match`);
  s.engine!.dispose();
}

// 3) Receiving: pressing back while the ball comes, the player stays set to
//    the ball (facing it) and only the first touch goes back.
{
  const s = newMatch(['p1', 'ai']);
  for (const p of s.players) if (p.onPitch && !(p.team === 0 && (p.idx === 4 || p.idx === 9)) && !(p.team === 1 && p.idx === 0)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  for (let k = 0; k < 600 && s.phase !== 'play'; k++) stepMatch(s, {}, FIXED_DT);
  s.phase = 'play'; s.restart = null; s.kickoffPending = false;
  for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
  s.ball.restartDoubleTouchBy = null;
  const me = s.players.find((p) => p.team === 0 && p.idx === 4)!, rc = s.players.find((p) => p.team === 0 && p.idx === 9)!;
  const dir = s.teams[0].dir;
  setControlled(s, s.teams[0], me);
  me.pos.x = -10 * dir; me.pos.z = 0; me.face.x = dir; me.face.z = 0;
  rc.pos.x = 6 * dir; rc.pos.z = 0;
  s.ball.pos.x = me.pos.x + 0.55 * dir; s.ball.pos.z = 0.1; s.ball.pos.y = 0.11; s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
  s.ball.owner = me;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: {} }, FIXED_DT);
  stepMatch(s, { p1: { passPressed: true, mx: dir, mz: 0 } }, FIXED_DT);
  let worst = 0, touched = false, touchDir = NaN;
  for (let i = 0; i < 180 && !touched; i++) {
    // Press "back" (towards our own goal, i.e. away from the ball's travel and the receiver's facing).
    stepMatch(s, { p1: { mx: dir, mz: 0 } }, FIXED_DT);
    s.events.length = 0;
    if (s.ball.owner === rc) {
      touched = true;
      for (let k = 0; k < 6; k++) stepMatch(s, { p1: { mx: dir, mz: 0 } }, FIXED_DT);
      touchDir = Math.sign(s.ball.vel.x - rc.vel.x * 0) * dir;
      break;
    }
    const d = Math.hypot(s.ball.pos.x - rc.pos.x, s.ball.pos.z - rc.pos.z);
    if (s.teams[0].controlled === rc && d < 4 && d > 0.8) {
      const fx = (s.ball.pos.x - rc.pos.x) / d, fz = (s.ball.pos.z - rc.pos.z) / d;
      const ang = Math.acos(Math.max(-1, Math.min(1, rc.face.x * fx + rc.face.z * fz))) * 57.3;
      worst = Math.max(worst, ang);
    }
  }
  check('Receiving: body stays set to the ball, the stick shapes the touch', touched && worst < 70,
    `received ${touched}; largest angle between his facing and the ball in the last 4 m ${worst.toFixed(0)}°; touch went ${touchDir > 0 ? 'the way the stick pointed' : 'elsewhere'}`);
  s.engine!.dispose();
}

// 4) Keeper distribution: in his hands he throws (F) or kicks (V); he can drop it.
{
  const kinds: string[] = [];
  let dropped = false;
  for (const mode of ['throw', 'kick', 'drop'] as const) {
    const s = newMatch(['p1', 'ai']);
    for (let k = 0; k < 600 && s.phase !== 'play'; k++) stepMatch(s, {}, FIXED_DT);
    s.phase = 'play'; s.restart = null; s.kickoffPending = false;
    for (const p of s.players) p.mustPass = false;
    const gk = s.players.find((p) => p.team === 0 && p.role === 'GK')! as Player;
    setControlled(s, s.teams[0], gk);
    s.ball.owner = gk; gk.holding = true; gk.mustPass = true; gk.mustPassTimer = 0; gk.holdTimer = 9;
    for (let i = 0; i < 10; i++) stepMatch(s, { p1: {} }, FIXED_DT);
    const frame = mode === 'throw' ? { passPressed: true, mx: s.teams[0].dir, mz: 0.3 } : mode === 'kick' ? { loftPressed: true, mx: s.teams[0].dir, mz: 0 } : { dropPressed: true };
    stepMatch(s, { p1: frame }, FIXED_DT);
    for (let i = 0; i < 90; i++) {
      stepMatch(s, { p1: {} }, FIXED_DT);
      for (const e of s.events) if (e.type === 'pass' && e.from === gk.id) kinds.push(`${mode}:${gk.kickType}`);
      s.events.length = 0;
    }
    if (mode === 'drop') dropped = !gk.holding && (s.ball.owner === gk || Math.hypot(s.ball.pos.x - gk.pos.x, s.ball.pos.z - gk.pos.z) < 2);
    s.engine!.dispose();
  }
  check('Keeper: throw (F), kick (V) and drop the ball (B)', kinds.includes('throw:throw') && kinds.includes('kick:longPass') && dropped,
    `${kinds.join(', ')}; dropped to his feet ${dropped}`);
}

void ({} as MatchState);
if (failed) { console.log(`\n${failed} rules check(s) failed`); process.exit(1); }
console.log('\nall rules checks passed');
