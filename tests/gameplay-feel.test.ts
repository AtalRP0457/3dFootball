// Gameplay feel on the engine: distinct pass types, first-time (buffered)
// actions that fire exactly once, buffers cleared at restarts, and no long
// follow-through lockout. Run: npx tsx tests/gameplay-feel.test.ts
import { createMatch, stepMatch, setControlled } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W } from '../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../src/game/engineBridge.ts';
import type { MatchState, Player } from '../src/types/game.ts';

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

// 1) Pass types have clearly different speed, height and range.
{
  const res: Record<string, { speed: number; maxY: number }> = {};
  const cases: Array<[string, Frame, Array<[number, number, number]>, [number, number]?]> = [
    ['ground', { passPressed: true, mx: 1, mz: 0 }, [[9, 2, 0]]],
    ['driven', { drivenPressed: true, mx: 1, mz: 0 }, [[9, 2, 0]]],
    ['through', { throughPressed: true, mx: 1, mz: 0 }, [[9, 2, 0]]],
    ['lofted', { loftPressed: true, mx: 1, mz: 0 }, [[9, 22, 0]]],
    ['cross', { loftPressed: true, mx: 0.5, mz: -1 }, [[9, HALF_L - 12, 4]], [HALF_L - 22, 26]],
  ];
  for (const [name, f, mates, at] of cases) {
    const { s } = setup(mates, at);
    // Launch speed (first frames after release) and peak of the first flight only.
    let rel = -1, speed = 0, maxY = 0, landed = false;
    play(s, 150, (i) => (i === 0 ? f : {}), (i) => {
      if (rel < 0 && s.ball.owner === null) rel = i;
      if (rel < 0 || landed) return;
      if (i - rel <= 3) speed = Math.max(speed, Math.hypot(s.ball.vel.x, s.ball.vel.z));
      maxY = Math.max(maxY, s.ball.pos.y);
      if (s.ball.owner || (maxY > 0.5 && s.ball.pos.y < 0.2)) landed = true;
    });
    res[name] = { speed, maxY };
    s.engine!.dispose();
  }
  const r = res;
  const ok = r.driven.speed > r.ground.speed + 2.5 && r.ground.speed > 9 && r.ground.maxY < 0.3 && r.driven.maxY < 0.3
    && r.through.maxY < 0.3 && r.lofted.maxY > 1.5 && r.cross.maxY > 1.5 && r.cross.speed > r.lofted.speed;
  check('Pass types are distinct', ok, Object.entries(r).map(([k, v]) => `${k} ${v.speed.toFixed(1)} m/s peak ${v.maxY.toFixed(2)} m`).join(', '));
}

// 2) A pass pressed while the ball is still on its way is played first
//    time, exactly once (no player switch, no second pass). Several runs at
//    different press distances: contact quality varies, the press must not.
{
  let ok = 0, dupes = 0, switched = 0, tries = 0;
  const notes: string[] = [];
  for (const [mx, pressAt] of [[4, 5], [6, 4], [8, 6], [5, 3], [7, 5], [9, 7]] as const) {
    const { s } = setup([[9, mx, 0], [10, mx + 6, -14]]);
    play(s, 2, (i) => (i === 0 ? { passPressed: true, mx: 1, mz: 0 } : {}));
    const recv = ofIdx(s, 9);
    let pressedAt = -1, controlled = true;
    const ev = play(s, 150, (i) => {
      if (pressedAt < 0 && !s.ball.owner && s.teams[0].controlled === recv && Math.hypot(s.ball.pos.x - recv.pos.x, s.ball.pos.z - recv.pos.z) < pressAt) { pressedAt = i; return { passPressed: true, mx: 0.3, mz: -1 }; }
      return {};
    }, (i) => { if (i === pressedAt && s.teams[0].controlled !== recv) controlled = false; });
    if (pressedAt < 0) { notes.push(`no press (${mx})`); s.engine!.dispose(); continue; }
    tries++;
    const passes = ev.filter((e) => e.type === 'pass' && e.from === String(recv.id)).length;
    if (passes === 1) ok++;
    if (passes > 1) dupes++;
    if (!controlled) switched++;
    s.engine!.dispose();
  }
  check('First-time pass: pressed before arrival, played exactly once', tries >= 5 && ok >= tries - 1 && dupes === 0 && switched === 0,
    `${ok}/${tries} first-time passes, ${dupes} doubled, ${switched} turned into a player switch${notes.length ? ', ' + notes.join(', ') : ''}`);
}

// 3) A shot pressed while a pass is on its way is struck first time, once.
{
  const { s } = setup([[9, HALF_L - 14, -2]], [HALF_L - 30, 4], [0]);
  play(s, 2, (i) => (i === 0 ? { passPressed: true, mx: 1, mz: -0.3 } : {}));
  const recv = ofIdx(s, 9);
  let startAt = -1;
  const ev = play(s, 180, (i) => {
    const d = Math.hypot(s.ball.pos.x - recv.pos.x, s.ball.pos.z - recv.pos.z);
    if (startAt < 0 && !s.ball.owner && s.teams[0].controlled === recv && d < 6) startAt = i;
    if (startAt >= 0 && i - startAt < 8) return { shootHeld: true, shootPressed: i === startAt, mx: 1, mz: 0 };
    return {};
  });
  const shots = ev.filter((e) => e.type === 'shot');
  check('First-time shot: pressed before arrival, struck exactly once', startAt >= 0 && shots.length === 1, `shots: ${shots.length} (${shots.map((e) => e.kind ?? '').join(',')})`);
  s.engine!.dispose();
}

// 4) A press buffered before a stoppage never fires into the restart.
{
  const { s } = setup([[9, 16, 0]]);
  const recv = ofIdx(s, 9);
  // Pass long to #9, then press pass again for him while the ball is still
  // on its way: that press is buffered (first-time pass) …
  play(s, 1, () => ({ passPressed: true, mx: 1, mz: 0 }));
  let hadQueue = false;
  for (let i = 0; i < 60 && !hadQueue; i++) {
    const inFlight = !s.ball.owner && s.teams[0].controlled === recv && Math.hypot(s.ball.pos.x - recv.pos.x, s.ball.pos.z - recv.pos.z) > 4;
    play(s, 1, () => (inFlight ? { passPressed: true, mx: 0, mz: 1 } : {}));
    hadQueue = inFlight && (!!recv.queuedAction || s.engine!.isKicking(recv));
  }
  // … then the whistle: the ball goes out for a throw-in.
  s.ball.owner = null; s.ball.pos.z = HALF_W + 1; s.ball.pos.x = 0; s.ball.vel.x = s.ball.vel.z = 0;
  const ev = play(s, 30, () => ({}));
  const stray = ev.filter((e) => e.type === 'pass' && e.from === String(recv.id));
  check('Buffered presses are dropped at a restart', hadQueue && s.phase !== 'play' && stray.length === 0 && !recv.queuedAction && !s.engine!.isKicking(recv), `phase ${s.phase}, queue cleared: ${!recv.queuedAction}, stray passes: ${stray.length} (had a buffered press: ${hadQueue})`);
  s.engine!.dispose();
}

// 5) No long follow-through lock: soon after the ball leaves, the passer can move freely.
{
  const { s, me } = setup([[9, 6, 0]]);
  const c = s.engine!.controllerOf(me as Player)!;
  let rel = -1, free = -1;
  play(s, 90, (i) => (i === 0 ? { passPressed: true, mx: 1, mz: 0 } : { mx: 0, mz: 1 }), (i) => {
    if (rel < 0 && !s.ball.owner) rel = i;
    if (rel >= 0 && free < 0 && !c.sm.busy) free = i;
  });
  const lock = (free - rel) * FIXED_DT;
  check('Pass follow-through is not a lockout', rel >= 0 && free >= 0 && lock <= 0.12, `free to act ${(lock * 1000).toFixed(0)} ms after the ball left (press to release ${(rel * FIXED_DT * 1000).toFixed(0)} ms)`);
  s.engine!.dispose();
}

// 6) Movement: quick to speed, stops when the stick is released, and the
//    stick (not assist) decides the direction even with a loose ball nearby.
{
  const mk = () => {
    const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
    for (const p of s.players) if (p.onPitch && !(p.team === 0 && p.idx === 9)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
    s.engine = new MatchPhysics(s);
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    for (const p of s.players) p.mustPass = false;
    const me = ofIdx(s, 9);
    s.ball.owner = null; s.ball.intended = null;
    setControlled(s, s.teams[0], me); me.pos.x = -20; me.pos.z = 0;
    s.ball.pos.x = 20; s.ball.pos.z = 14; s.ball.vel.x = s.ball.vel.z = 0;
    for (let i = 0; i < 30; i++) stepMatch(s, { p1: {} }, FIXED_DT);
    return { s, me };
  };
  const sp = (p: Player) => Math.hypot(p.vel.x, p.vel.z);
  const res: Record<string, number> = {};
  for (const sprint of [false, true]) {
    const { s, me } = mk();
    const tr: number[] = [];
    for (let i = 0; i < 150; i++) { stepMatch(s, { p1: { mx: 1, mz: 0, sprint } }, FIXED_DT); tr.push(sp(me)); }
    const top = Math.max(...tr);
    res[sprint ? 'sprintTop' : 'runTop'] = top;
    res[sprint ? 'sprint90' : 'run90'] = tr.findIndex((v) => v >= top * 0.9) * FIXED_DT;
    let stop = -1;
    for (let i = 0; i < 120; i++) { stepMatch(s, { p1: {} }, FIXED_DT); if (stop < 0 && sp(me) < 0.3) stop = i * FIXED_DT; }
    res[sprint ? 'sprintStop' : 'runStop'] = stop;
    // Ball ~40° off the stick: the run must follow the stick.
    for (let i = 0; i < 60; i++) stepMatch(s, { p1: { mx: 1, mz: 0, sprint } }, FIXED_DT);
    for (let i = 0; i < 90; i++) stepMatch(s, { p1: { mx: 0, mz: 1, sprint } }, FIXED_DT);
    res[sprint ? 'sprintHeading' : 'runHeading'] = (Math.atan2(me.vel.z, me.vel.x) * 180) / Math.PI;
    s.engine!.dispose();
  }
  const r = res;
  check('Movement responds: quick to speed, real stop, sprint faster', r.runStop > 0 && r.runStop <= 0.8 && r.sprintStop > 0 && r.sprintStop <= 1.2
    && r.run90 <= 0.8 && r.sprintTop > r.runTop * 1.3,
    `run ${r.runTop.toFixed(1)} m/s (90% in ${r.run90.toFixed(2)} s, stops in ${r.runStop.toFixed(2)} s); sprint ${r.sprintTop.toFixed(1)} m/s (90% in ${r.sprint90.toFixed(2)} s, stops in ${r.sprintStop.toFixed(2)} s)`);
  check('The stick decides direction, not assist', Math.abs(r.runHeading - 90) < 12 && Math.abs(r.sprintHeading - 90) < 12,
    `after 1.5 s holding "down": run heading ${r.runHeading.toFixed(0)}°, sprint ${r.sprintHeading.toFixed(0)}° (90° = straight down)`);
}

console.log(failed ? `\n${failed} gameplay-feel check(s) failed` : '\nall gameplay-feel checks passed');
process.exit(failed ? 1 : 0);
