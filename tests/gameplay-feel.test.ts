// Gameplay feel on the engine: distinct pass types, first-time (buffered)
// actions that fire exactly once, buffers cleared at restarts, and no long
// follow-through lockout. Run: npx tsx tests/gameplay-feel.test.ts
import { createMatch, stepMatch, setControlled, foulSeverity } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { FIXED_DT, HALF_L, HALF_W } from '../src/game/constants.ts';
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
type Frame = Record<string, unknown>;
/** Run the kick-off until play is live (capped: a staged roster may have no taker). */
function toPlay(s: MatchState) {
  for (let k = 0; k < 600 && s.phase !== 'play'; k++) stepMatch(s, {}, FIXED_DT);
  if (s.phase !== 'play') { s.phase = 'play'; s.restart = null; }
}
const ofIdx = (s: MatchState, idx: number) => s.players.find((p) => p.team === 0 && p.idx === idx)!;

/** P1's striker (#4) on the ball at `at`, teammates `mates` = [idx, x, z], away keeper only. */
function setup(mates: Array<[number, number, number]>, at: [number, number] = [-10, 0], opponents: number[] = [0]) {
  const s = createMatch({ home: buildTeam('fcb'), away: buildTeam('rma'), controllers: ['p1', 'ai'], difficulty: 'normal', duration: 240 });
  const keep = new Set(mates.map((m) => m[0]));
  for (const p of s.players) if (p.onPitch && !(p.team === 0 && (p.idx === 4 || keep.has(p.idx))) && !(p.team === 1 && opponents.includes(p.idx))) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
  s.engine = new MatchPhysics(s);
  toPlay(s);
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
    // Control moving on to the next receiver as the first-time pass starts is
    // correct; a press that only switched player (no pass) is the failure.
    if (!controlled && passes === 0) switched++;
    s.engine!.dispose();
  }
  check('First-time pass: pressed before arrival, played exactly once', tries >= 5 && ok >= tries - 1 && dupes === 0 && switched === 0,
    `${ok}/${tries} first-time passes, ${dupes} doubled, ${switched} turned into a player switch${notes.length ? ', ' + notes.join(', ') : ''}`);
}

// 3) A shot pressed while a pass is on its way is struck first time, once
//    (several runs: a mistimed strike can miss, a press must never double).
{
  let ok = 0, dupes = 0, tries = 0;
  for (const [mx, mz, pressAt] of [[14, -2, 6], [12, 2, 5], [16, -1, 7], [13, 1, 4]] as const) {
    const { s } = setup([[9, HALF_L - mx, mz]], [HALF_L - 30, 4], [0]);
    play(s, 2, (i) => (i === 0 ? { passPressed: true, mx: 1, mz: -0.3 } : {}));
    const recv = ofIdx(s, 9);
    let startAt = -1;
    const ev = play(s, 180, (i) => {
      const d = Math.hypot(s.ball.pos.x - recv.pos.x, s.ball.pos.z - recv.pos.z);
      if (startAt < 0 && !s.ball.owner && s.teams[0].controlled === recv && d < pressAt) startAt = i;
      if (startAt >= 0 && i - startAt < 8) return { shootHeld: true, shootPressed: i === startAt, mx: 1, mz: 0 };
      return {};
    });
    if (startAt >= 0) {
      tries++;
      const shots = ev.filter((e) => e.type === 'shot').length;
      if (shots === 1) ok++;
      if (shots > 1) dupes++;
    }
    s.engine!.dispose();
  }
  check('First-time shot: pressed before arrival, struck exactly once', tries >= 3 && ok >= tries - 1 && dupes === 0, `${ok}/${tries} first-time shots, ${dupes} doubled`);
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
    s.engine = new MatchPhysics(s);
    // A normal kick-off with full teams first, then clear the pitch (a staged
    // roster without the kick-off taker would never get the ball into play).
    toPlay(s);
    for (const p of s.players) if (p.onPitch && !(p.team === 0 && p.idx === 9)) { p.onPitch = false; p.pos.x = 0; p.pos.z = HALF_W + 6; }
    for (const p of s.players) p.mustPass = false;
    s.restart = null; s.phase = 'play';
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

// 7) Receiving a pass: no stick -> he comes to the ball at a jog (no charge
//    into it) and the first touch settles it at his feet; stick sideways ->
//    one directional touch that way and he runs on with it.
{
  const receive = (stick: { mx: number; mz: number } | null) => {
    const { s } = setup([[9, 6, 6]]);
    const recv = ofIdx(s, 9);
    play(s, 1, () => ({ passPressed: true, mx: 1, mz: 0.4 }));
    let touchAt = -1, speedAtTouch = 0, ballAfter = 0, recvAfter = 0, gapAfter = 0, touches = 0;
    play(s, 150, () => (stick && s.teams[0].controlled === recv ? stick : {}), (i) => {
      if (touchAt < 0 && s.ball.owner === recv) { touchAt = i; speedAtTouch = Math.hypot(recv.vel.x, recv.vel.z); }
      if (touchAt >= 0 && i === touchAt + 6) ballAfter = Math.hypot(s.ball.vel.x, s.ball.vel.z);
      if (touchAt >= 0 && i === touchAt + 30) { recvAfter = Math.hypot(recv.vel.x, recv.vel.z); gapAfter = Math.hypot(s.ball.pos.x - recv.pos.x, s.ball.pos.z - recv.pos.z); }
    });
    s.engine!.dispose();
    return { touchAt, speedAtTouch, ballAfter, recvAfter, gapAfter, touches };
  };
  const still = receive(null), side = receive({ mx: 0, mz: -1 });
  check('Receiving with no stick: comes to the ball and settles it', still.touchAt > 0 && still.speedAtTouch < 4.8 && still.ballAfter <= still.speedAtTouch + 0.3 && still.gapAfter > 0.3 && still.gapAfter < 1.3,
    `receiver at ${still.speedAtTouch.toFixed(1)} m/s on the touch, ball ${still.ballAfter.toFixed(1)} m/s just after, ${still.gapAfter.toFixed(2)} m from him half a second later`);
  check('Receiving with the stick: directional first touch, keeps moving', side.touchAt > 0 && side.ballAfter > 2.5 && side.recvAfter > 3,
    `ball ${side.ballAfter.toFixed(1)} m/s after the touch, receiver ${side.recvAfter.toFixed(1)} m/s half a second later`);
}

// 8) A whole AI match: players stay on their feet and teammates don't keep
//    running into each other (before the fix: ~36 falls, ~99 teammate
//    collisions in 4 minutes).
{
  const s = createMatch({ home: buildTeam('rma'), away: buildTeam('mci'), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  const sim = (s.engine as unknown as { sim: { pw: { events: { on(fn: (e: { type: string; a?: string; b?: string; playerId?: string }) => void): void } } } }).sim;
  const ctl = (s.engine as unknown as { ctrl: Map<Player, { id: string; team: number; sm: { action: { clip: { name: string } } | null } }> }).ctrl;
  const team = new Map<string, number>(); for (const c of ctl.values()) team.set(c.id, c.team);
  let falls = 0, mates = 0, stepFalls = 0, fouls = 0, foulFalls = 0, foulNoStop = 0, foulDup = 0, advantages = 0;
  let optSamples = 0, optSum = 0, optNone = 0, optFwd = 0;
  const segD = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };
  sim.pw.events.on((e) => {
    if (e.type === 'playerCollision' && team.get(e.a!) === team.get(e.b!)) mates++;
    if (e.type === 'balanceLost') { const c = [...ctl.values()].find((x) => x.id === e.playerId); if (c?.sm.action?.clip.name === 'fall') stepFalls++; }
  });
  let steps = 0;
  while (s.phase !== 'fulltime' && steps < 340 * 60) {
    stepFalls = 0;
    stepMatch(s, {}, FIXED_DT);
    const f = s.events.filter((e) => e.type === 'foul').length;
    for (const e of s.events) {
      if (e.type !== 'foul') continue;
      if (e.advantage) advantages++;
      else if (s.phase === 'play') foulNoStop++; // a foul must stop play on its own step
    }
    if (f > 1) foulDup++;
    // Passing options for the AI ball carrier (sampled 4x a second).
    const c = s.ball.owner;
    if (steps % 15 === 0 && s.phase === 'play' && c && c.role !== 'GK') {
      let open = 0, fwd = 0;
      for (const t of s.players) {
        if (t === c || t.team !== c.team || !t.onPitch || t.sentOff || t.role === 'GK') continue;
        const d = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
        if (d < 6 || d > 25) continue;
        const blocked = s.players.some((o) => o.team !== c.team && o.onPitch && !o.sentOff && Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) > 2
          && segD(o.pos.x, o.pos.z, c.pos.x, c.pos.z, t.pos.x, t.pos.z) < 1.6);
        if (blocked) continue;
        open++;
        if ((t.pos.x - c.pos.x) * s.teams[c.team].dir > 3) fwd++;
      }
      optSamples++; optSum += open; if (!open) optNone++; if (fwd) optFwd++;
    }
    fouls += f;
    // A fall from a tackle that is whistled as a foul in the same step is the
    // foul (correct); only falls nobody is penalised for count against us.
    const explained = Math.min(stepFalls, f);
    foulFalls += explained;
    falls += stepFalls - explained;
    s.events.length = 0; steps++;
  }
  s.engine.dispose();
  check('Players stay on their feet; teammates keep their distance', falls <= 6 && mates <= 30,
    `${falls} unpenalised falls (+${foulFalls} from fouls, ${fouls} fouls), ${mates} teammate collisions in a 4-minute match`);
  check('Each foul is one synchronised stoppage (or advantage)', fouls > 0 && foulNoStop === 0 && foulDup === 0,
    `${fouls} fouls: ${fouls - advantages} stopped play on the same step, ${advantages} played as advantage; ${foulNoStop} left play running, ${foulDup} steps with two fouls`);
  check('The ball carrier has passing options', optSamples > 100 && optSum / optSamples >= 2.2 && optNone / optSamples <= 0.12 && optFwd / optSamples >= 0.4,
    `${(optSum / optSamples).toFixed(2)} open options on average (6-25 m, clear lane); none ${(100 * optNone / optSamples).toFixed(0)}% of the time; a forward option ${(100 * optFwd / optSamples).toFixed(0)}% of the time`);
  const sv = [foulSeverity('standing', 3, false), foulSeverity('standing', 7, true), foulSeverity('sliding', 9, true)];
  check('Foul severity follows Law 12 (careless / reckless / excessive)', sv[0].card === null && sv[1].card === 'yellow' && sv[2].card === 'red',
    sv.map((x) => `${x.level}:${x.card ?? 'no card'}`).join(', '));
}

// 9) Power means something: a tap, a half hold and a full hold give clearly
//    different pass and shot speeds.
{
  const launch = (frames: number, kind: 'pass' | 'shot') => {
    const { s } = kind === 'pass' ? setup([[9, 14, 0]]) : setup([[9, 2, 12]], [HALF_L - 24, 0]);
    let speed = 0, rel = -1;
    play(s, 120, (i) => {
      if (kind === 'pass') return i < frames ? { passPressed: i === 0, passHeld: true, mx: 1, mz: 0 } : { mx: 1, mz: 0 };
      return i < frames ? { shootPressed: i === 0, shootHeld: true, mx: 1, mz: 0 } : { mx: 1, mz: 0 };
    }, (i) => {
      if (rel < 0 && !s.ball.owner && i >= frames) rel = i;
      if (rel >= 0 && i - rel <= 3) speed = Math.max(speed, Math.hypot(s.ball.vel.x, s.ball.vel.z));
    });
    s.engine!.dispose();
    delays.push(rel >= 0 ? (rel - frames) * FIXED_DT : Infinity);
    return speed;
  };
  const delays: number[] = [];
  // Pass: a short hold (soft), a tap (automatic weight) and a full hold.
  const pass = [12, 1, 46].map((n) => launch(n, 'pass'));
  const shot = [4, 30, 56].map((n) => launch(n, 'shot'));
  check('Pass power: soft hold < tap (auto weight) < full hold', pass[1] > pass[0] + 1.5 && pass[2] > pass[1] + 1.5, pass.map((v) => `${v.toFixed(1)} m/s`).join(' < '));
  check('Shot power: tap < medium < full', shot[1] > shot[0] + 3 && shot[2] > shot[1] + 4, shot.map((v) => `${v.toFixed(1)} m/s`).join(' < '));
  const shotDelays = delays.slice(3);
  check('Strike follows the button release quickly', Math.max(...shotDelays) <= 0.42 && Math.max(...delays.slice(0, 3)) <= 0.35,
    `release -> ball away: passes ${delays.slice(0, 3).map((d) => `${Math.round(d * 1000)}`).join('/')} ms, shots ${shotDelays.map((d) => `${Math.round(d * 1000)}`).join('/')} ms`);
}

console.log(failed ? `\n${failed} gameplay-feel check(s) failed` : '\nall gameplay-feel checks passed');
process.exit(failed ? 1 : 0);
