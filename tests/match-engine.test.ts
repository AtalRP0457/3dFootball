// The real match (rules, AI, restarts) running on the Gold Standard engine,
// staged as planned: 1 player + ball + goal, then 2, 5 and 22 players.
// Run: npx tsx tests/match-engine.test.ts
import { createMatch, stepMatch } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W } from '../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../src/game/engineBridge.ts';
import type { MatchState, TeamData } from '../src/types/game.ts';

// AI decisions use randomness; fix the stream so each CI runner exercises the
// same reduced-roster scenarios and does not occasionally miss all attacks.
let randomState = 0x3df00d;
Math.random = () => {
  let t = randomState += 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

await preparePhysics();
let failed = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const team = (id: string): TeamData => ({ ...buildTeam(id) });

interface Run { s: MatchState; counts: Record<string, number>; steps: number; maxStill: number; finite: boolean; inBounds: boolean; ms: number; minGap: number }

/** Build a match on the engine, keeping only the chosen players on the pitch. */
function run(opts: { home: string; away: string; keep?: (team: number, idx: number) => boolean; seconds: number; duration?: number }): Run {
  const s = createMatch({ home: team(opts.home), away: team(opts.away), controllers: ['ai', 'ai'], difficulty: 'hard', duration: opts.duration ?? 240 });
  if (opts.keep) for (const p of s.players) if (p.onPitch && !opts.keep(p.team, p.idx)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  s.engine = new MatchPhysics(s);
  // Reduced stages: a kick-off must be passed, but a lone striker has nobody to pass to.
  if (opts.keep) {
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
    s.ball.restartDoubleTouchBy = null;
  }
  const counts: Record<string, number> = {};
  let steps = 0, still = 0, maxStill = 0, finite = true, inBounds = true, minGap = Infinity;
  let last = { ...s.ball.pos };
  const t0 = performance.now();
  while (s.phase !== 'fulltime' && steps < opts.seconds * 60) {
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    s.events.length = 0;
    steps++;
    const moved = Math.hypot(s.ball.pos.x - last.x, s.ball.pos.z - last.z);
    if (s.phase === 'play' && moved < 1e-3 && !s.ball.owner) still++; else { maxStill = Math.max(maxStill, still); still = 0; }
    last = { ...s.ball.pos };
    if (![s.ball.pos.x, s.ball.pos.y, s.ball.pos.z, s.ball.vel.x].every(Number.isFinite)) finite = false;
    for (const p of s.players) if (p.onPitch && !p.sentOff && (Math.abs(p.pos.x) > HALF_L + 4 || Math.abs(p.pos.z) > HALF_W + 4)) inBounds = false;
    const on = s.players.filter((p) => p.onPitch && !p.sentOff);
    for (const a of on) for (const b of on) if (a.team !== b.team) minGap = Math.min(minGap, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z));
  }
  const ms = (performance.now() - t0) / Math.max(1, steps);
  s.engine.dispose();
  return { s, counts, steps, maxStill: maxStill / 60, finite, inBounds, ms, minGap };
}

// Stage 1: one striker, the ball, an empty goal.
{
  const r = run({ home: 'fcb', away: 'rma', keep: (t, i) => t === 0 && i === 4, seconds: 40 });
  const goals = r.s.teams[0].score;
  check('Stage 1 · 1 player: dribbles and scores on the engine', goals >= 1 && r.finite, `${goals} goal(s), ${r.counts.shot ?? 0} shot(s), ${r.counts.touch ?? 0} touches in 40 s`);
}
// Stage 2: striker against a centre-back.
{
  const r = run({ home: 'fcb', away: 'rma', keep: (t, i) => (t === 0 && i === 4) || (t === 1 && i === 1), seconds: 60 });
  const contests = (r.counts.tackle ?? 0) + (r.counts.steal ?? 0);
  // Bodies never overlap (capsules 0.26 m), and the two players meet at least once.
  check('Stage 2 · 2 players: they meet, bodies never overlap, nothing breaks', r.finite && r.inBounds && r.minGap < 2.5 && r.minGap > 0.45, `closest ${r.minGap.toFixed(2)} m apart, ${contests} tackles/steals, ${r.counts.shot ?? 0} shots, score ${r.s.teams[0].score}-${r.s.teams[1].score}`);
}
// Stage 3: three attackers against a keeper and a defender.
{
  const r = run({ home: 'fcb', away: 'rma', keep: (t, i) => (t === 0 && [4, 9, 10].includes(i)) || (t === 1 && [0, 1].includes(i)), seconds: 60 });
  // Attacks must reach goal: a shot, or a goal (a pass can also end in the net).
  check('Stage 3 · 5 players: passing, shooting, saves', r.finite && (r.counts.pass ?? 0) >= 3 && (r.counts.shot ?? 0) + (r.counts.goal ?? 0) >= 1, `${r.counts.pass ?? 0} passes, ${r.counts.shot ?? 0} shots, ${r.counts.save ?? 0} saves, score ${r.s.teams[0].score}-${r.s.teams[1].score}`);
}
// Stage 4: full 22-player matches.
let passes = 0, shots = 0, minShare = 1, worstStill = 0, allOk = true, ms = 0;
for (const [h, a] of [['fcb', 'rma'], ['liv', 'mci']] as const) {
  const r = run({ home: h, away: a, seconds: 340, duration: 240 });
  passes += r.counts.pass ?? 0;
  shots += r.counts.shot ?? 0;
  const pt = r.s.teams[0].possessionTime + r.s.teams[1].possessionTime;
  minShare = Math.min(minShare, Math.min(r.s.teams[0].possessionTime, r.s.teams[1].possessionTime) / Math.max(1, pt));
  worstStill = Math.max(worstStill, r.maxStill);
  allOk &&= r.finite && r.inBounds && r.s.phase === 'fulltime';
  ms = Math.max(ms, r.ms);
  console.log(`      ${h} v ${a}: ${r.s.teams[0].score}-${r.s.teams[1].score} · ${JSON.stringify(r.counts)}`);
}
check('Stage 4 · 22 players: full matches finish cleanly', allOk, 'kick-off to full time, no invalid values, everyone on the field');
check('Stage 4 · 22 players: the ball is played', passes >= 80 && shots >= 1, `${passes} passes, ${shots} shots over two 4-minute matches`);
check('Stage 4 · 22 players: both teams get the ball', minShare > 0.25, `smallest possession share ${(minShare * 100).toFixed(0)}%`);
check('Stage 4 · 22 players: the ball never sits dead in open play', worstStill < 3, `longest still loose ball ${worstStill.toFixed(1)} s`);
check('Stage 4 · 22 players: performance', ms < 4, `${ms.toFixed(2)} ms per fixed step (match + engine)`);

// Human control on the engine: pass to a teammate, shoot with a held button.
{
  const s = createMatch({ home: team('fcb'), away: team('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  const seen: string[] = [];
  const step = (n: number, frame: Record<string, unknown>) => {
    for (let i = 0; i < n; i++) {
      stepMatch(s, { p1: frame }, FIXED_DT);
      for (const e of s.events) if (['pass', 'shot', 'kick', 'control', 'goal', 'save'].includes(e.type)) seen.push(`${e.type}${e.human ? '(human)' : ''}`);
      s.events.length = 0;
    }
  };
  while (s.phase !== 'play') step(1, {});
  step(2, { passPressed: true });          // kick-off pass
  step(90, {});
  const passed = seen.includes('pass(human)');
  check('Human on the engine: pass button plays a pass', passed, passed ? 'kick-off pass struck at the contact frame and released' : `events: ${seen.join(' ')}`);
  // Give the controlled player the ball near goal and shoot.
  const me = s.teams[0].controlled;
  if (me) {
    me.pos.x = HALF_L - 20; me.pos.z = 0; me.face.x = 1; me.face.z = 0;
    s.ball.pos.x = me.pos.x + 0.6; s.ball.pos.z = 0; s.ball.pos.y = 0.11; s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
    s.ball.owner = me;
    seen.length = 0;
    step(30, { shootHeld: true, mx: 1, mz: 0 });
    step(90, { mx: 1, mz: 0 });
  }
  const shot = seen.includes('shot(human)');
  check('Human on the engine: shoot button strikes a shot', shot, shot ? `shot struck; then ${seen.filter((x) => x !== 'shot(human)').slice(0, 3).join(', ') || 'ball in flight'}` : `events: ${seen.join(' ')}`);
  s.engine.dispose();
}

// A human press is never silently dropped: the strike happens as soon as the
// player can make it.
{
  /** P1 on the ball in open play, `facing` ±1 along x; one teammate to pass to and the keeper. */
  const setup = (facing: number) => {
    const s = createMatch({ home: team('fcb'), away: team('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
    for (const p of s.players) if (p.onPitch && !(p.team === 0 && [4, 9].includes(p.idx)) && !(p.team === 1 && p.idx === 0)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
    s.engine = new MatchPhysics(s);
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    for (const p of s.players) { p.mustPass = false; p.mustPassTimer = 0; }
    s.ball.restartDoubleTouchBy = null;
    const me = s.players.find((p) => p.team === 0 && p.idx === 4)!;
    s.teams[0].controlled = me;
    me.pos.x = HALF_L - 24; me.pos.z = 0; me.face.x = facing; me.face.z = 0;
    s.ball.pos.x = me.pos.x + 0.55 * facing; s.ball.pos.z = 0.12; s.ball.pos.y = 0.11;
    s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
    s.ball.owner = me;
    for (let i = 0; i < 20; i++) stepMatch(s, { p1: {} }, FIXED_DT);
    return { s, me };
  };
  const press = (s: MatchState, kind: 'shot' | 'pass', stick: { mx: number; mz: number; sprint?: boolean }, frames: number) => {
    let done = false;
    for (let i = 0; i < frames; i++) {
      const f = kind === 'shot' ? { ...stick, shootPressed: i === 0, shootHeld: i < 12 } : { ...stick, passPressed: i === 0 };
      stepMatch(s, { p1: f }, FIXED_DT);
      for (const e of s.events) if (e.type === kind && e.human) done = true;
      s.events.length = 0;
    }
    return done;
  };
  const shoot = (s: MatchState, stick: { mx: number; mz: number }, frames: number) => press(s, 'shot', stick, frames);
  // 1) Shoot while stumbling, or while down after a fall: struck once he recovers.
  for (const clip of ['stumble', 'fall'] as const) {
    const { s, me } = setup(1);
    const c = s.engine!.controllerOf(me)!;
    c.sm.start(clip, { foot: 'R', force: true });
    const shot = s.ball.owner === me && shoot(s, { mx: 1, mz: 0 }, 200);
    check(`Human on the engine: shot pressed during a ${clip} still happens`, shot, shot ? `struck after the ${clip === 'fall' ? 'fall and get-up' : 'stumble'}` : `no shot (owner ${s.ball.owner?.name ?? 'none'})`);
    s.engine!.dispose();
  }
  // 2) Pass and shoot while dribbling in every direction, jogging and
  // sprinting: he settles or lines up the ball and strikes; a swing that
  // misses is retried. (Before this, about a third of these presses did nothing.)
  {
    let tried = 0, dropped = 0;
    const missed: string[] = [];
    for (const kind of ['shot', 'pass'] as const) for (let deg = 0; deg < 360; deg += 45) for (const sprint of [false, true]) {
      const a = (deg * Math.PI) / 180, fx = Math.cos(a), fz = Math.sin(a);
      const { s, me } = setup(1);
      me.face.x = fx; me.face.z = fz;
      for (let i = 0; i < 30; i++) stepMatch(s, { p1: { mx: fx, mz: fz, sprint } }, FIXED_DT);
      if (s.ball.owner === me) {
        tried++;
        if (!press(s, kind, { mx: fx, mz: fz, sprint }, 150)) { dropped++; missed.push(`${kind} ${deg}° ${sprint ? 'sprint' : 'jog'}`); }
      }
      s.engine!.dispose();
    }
    check('Human on the engine: every pass/shot press while dribbling is played', tried >= 24 && dropped === 0,
      dropped ? `${dropped}/${tried} presses did nothing: ${missed.join(', ')}` : `${tried}/${tried} presses struck (8 directions, jog and sprint)`);
  }
}

console.log(failed ? `\n${failed} match-engine check(s) failed` : '\nall match-engine checks passed');
process.exit(failed ? 1 : 0);
