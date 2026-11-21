// Headless tests for the match engine. Run with: npm test
import { createMatch, stepMatch, teamPlayers, choosePassTarget, setControlled, isHolding, doPass, doShot } from '../src/game/match.js';
// Minimal browser stand-ins so the real Input class can be tested.
const winListeners = {};
globalThis.window = globalThis.window || { addEventListener: (t, f) => (winListeners[t] ||= []).push(f) };
if (!globalThis.navigator || !('getGamepads' in globalThis.navigator)) {
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
}
const { normalizeKey, Input } = await import('../src/game/input.js');
import { TEAMS } from '../src/data/teams.js';
import { FIXED_DT, HALF_L, HALF_W } from '../src/game/constants.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('  FAIL:', msg); }
}

function finite(state) {
  const b = state.ball;
  const vals = [b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z];
  for (const p of state.players) vals.push(p.pos.x, p.pos.z, p.vel.x, p.vel.z);
  return vals.every(Number.isFinite);
}

function run(cfg, inputFn = () => ({}), maxSteps = 60 * 60 * 10) {
  const s = createMatch(cfg);
  const counts = {};
  let steps = 0;
  while (s.phase !== 'fulltime' && steps < maxSteps) {
    stepMatch(s, inputFn(s, steps), FIXED_DT);
    for (const e of s.events) counts[e.type] = (counts[e.type] || 0) + 1;
    s.events.length = 0;
    steps++;
    if (steps % 30 === 0 && !finite(s)) { check(false, 'non-finite values'); break; }
    for (const p of s.players) {
      if (Math.abs(p.pos.x) > HALF_L + 4 || Math.abs(p.pos.z) > HALF_W + 4) {
        check(false, `player ${p.name} out of area`); return { s, counts };
      }
    }
  }
  check(s.phase === 'fulltime', `match did not finish (phase ${s.phase})`);
  return { s, counts };
}

// 1) AI vs AI across many team pairings
console.log('AI vs AI simulations');
let goals = 0, shots = 0, matches = 0;
for (let i = 0; i < TEAMS.length; i++) {
  for (const j of [(i + 3) % TEAMS.length, (i + 7) % TEAMS.length]) {
    const { s, counts } = run({
      home: TEAMS[i], away: TEAMS[j], controllers: ['ai', 'ai'],
      difficulty: 'normal', duration: 180,
    });
    goals += s.teams[0].score + s.teams[1].score;
    shots += s.teams[0].shots + s.teams[1].shots;
    matches++;
  }
}
console.log(`  ${matches} matches, avg goals ${(goals / matches).toFixed(2)}, avg shots ${(shots / matches).toFixed(1)}`);
check(goals > 0, 'no goals scored at all');
check(shots / matches > 2.5, 'too few shots');

// Restart types and possession sanity in one longer match
{
  const seen = {};
  let ownedSteps = 0, steps = 0;
  for (let m = 0; m < 4; m++) {
  const s = createMatch({ home: TEAMS[6 - m], away: TEAMS[8 - m], controllers: ['ai', 'ai'], difficulty: 'hard', duration: 300 });
  while (s.phase !== 'fulltime') {
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) if (e.type === 'banner') seen[e.text] = (seen[e.text] || 0) + 1;
    s.events.length = 0;
    if (s.phase === 'play') { steps++; if (s.ball.owner) ownedSteps++; }
  }
  }
  console.log('  restarts seen:', JSON.stringify(seen));
  console.log(`  ball owned ${(100 * ownedSteps / steps).toFixed(0)}% of play time`);
  // (Restarts are rare in AI-only games, so they're checked exactly below.)
}

// 1b) Out of play: the right restart every time
console.log('Restarts');
{
  const cases = [
    // [ball x, ball z, last touch team, expected restart, expected team]
    [10, HALF_W + 0.6, 1, 'throw-in', 0],
    [-10, -(HALF_W + 0.6), 0, 'throw-in', 1],
    [HALF_L + 0.6, 8, 0, 'goal kick', 1], // home attacks +x, shoots wide: away goal kick
    [HALF_L + 0.6, 8, 1, 'corner', 0], // away defender puts it behind: home corner
    [-(HALF_L + 0.6), -8, 1, 'goal kick', 0],
    [-(HALF_L + 0.6), -8, 0, 'corner', 1],
  ];
  for (const [x, z, lt, type, team] of cases) {
    const s = createMatch({ home: TEAMS[0], away: TEAMS[1], controllers: ['ai', 'ai'], duration: 120 });
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    s.ball.owner = null; s.ball.pos.x = x; s.ball.pos.z = z; s.ball.pos.y = 0.22;
    s.ball.vel.x = Math.sign(x) * 2; s.ball.vel.z = 0; s.ball.vel.y = 0;
    s.ball.lastTouch = s.players.find((p) => p.team === lt && p.role === 'MID');
    stepMatch(s, {}, FIXED_DT);
    check(s.phase === 'restart' && s.restart.type === type && s.restart.team === team,
      `ball out at (${x}, ${z}) last touched by team ${lt} -> ${type} for team ${team} (got ${s.restart && s.restart.type} for ${s.restart && s.restart.team})`);
  }
}

// 1c) No own goals from turning with the ball on your own goal line
{
  let own = 0;
  for (let i = 0; i < 200; i++) {
    const s = createMatch({ home: TEAMS[i % 10], away: TEAMS[(i + 1) % 10], controllers: ['ai', 'ai'], duration: 120 });
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    const d = s.players.find((p) => p.team === 0 && p.role === 'DEF');
    d.pos.x = -(HALF_L - 1.4); d.pos.z = 1; d.face.x = -1; d.face.z = 0; // facing his own net
    s.ball.owner = d; s.ball.pos.x = -(HALF_L - 2); s.ball.pos.z = 1;
    for (let k = 0; k < 30; k++) { stepMatch(s, {}, FIXED_DT); if (s.events.some((e) => e.type === 'goal')) { own++; break; } s.events.length = 0; }
  }
  check(own === 0, `no own goals from a defender turning on his goal line (${own}/200)`);
}

// 2) Pass hands control to the receiver; passer becomes AI
console.log('Auto-switch on pass');
{
  const s = createMatch({ home: TEAMS[0], away: TEAMS[1], controllers: ['p1', 'ai'], duration: 120 });
  const team = s.teams[0];
  // Let the kick-off countdown finish
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const passer = team.controlled;
  check(s.ball.owner === passer, 'human should own the ball at kick-off');
  check(passer.human === 'p1', 'passer marked as human');
  stepMatch(s, { p1: { mx: -1, mz: 0, passPressed: true } }, FIXED_DT);
  const receiver = s.ball.intended;
  check(receiver && receiver !== passer, 'pass has a receiver');
  check(team.controlled === receiver, 'control moved to receiver');
  check(receiver.human === 'p1', 'receiver flagged human');
  check(passer.human === null, 'passer is now AI');
  // Idle human: receiver should run onto the ball and collect it
  let got = false;
  for (let i = 0; i < 240 && !got; i++) {
    stepMatch(s, { p1: { mx: 0, mz: 0 } }, FIXED_DT);
    got = s.ball.owner === receiver;
  }
  check(got, 'idle receiver collects the pass');
}

// 2b) The yellow "next" player is exactly who the pass goes to
console.log('Next player highlight');
{
  for (const dir of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
    const s = createMatch({ home: TEAMS[3], away: TEAMS[7], controllers: ['p1', 'ai'], duration: 120 });
    const team = s.teams[0];
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    stepMatch(s, { p1: { mx: dir[0], mz: dir[1] } }, FIXED_DT);
    const shown = team.next;
    check(shown && shown !== team.controlled, 'next player shown');
    stepMatch(s, { p1: { mx: dir[0], mz: dir[1], passPressed: true } }, FIXED_DT);
    check(s.ball.intended === shown, `pass goes to the yellow player (dir ${dir})`);
  }
  // Without the ball, next = who a switch would pick
  const s = createMatch({ home: TEAMS[3], away: TEAMS[7], controllers: ['ai', 'p1'], duration: 120 });
  const team = s.teams[1];
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  stepMatch(s, { p1: {} }, FIXED_DT);
  const shown = team.next;
  stepMatch(s, { p1: { passPressed: true } }, FIXED_DT);
  check(team.controlled === shown, 'switch goes to the yellow player');
}

// 2d) A nearby teammate in the aimed direction wins over a much longer option,
// and the rolling pass speed is calibrated to that short distance.
console.log('Short pass targeting');
{
  const s = createMatch({ home: TEAMS[3], away: TEAMS[7], controllers: ['p1', 'ai'], duration: 120 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const passer = s.teams[0].controlled;
  const teammates = teamPlayers(s, 0).filter((p) => p !== passer && p.onPitch && p.role !== 'GK');
  const [near, far] = teammates;
  passer.pos.x = passer.pos.z = 0;
  near.pos.x = 4; near.pos.z = 0;
  far.pos.x = 18; far.pos.z = 0;
  s.ball.owner = passer; s.ball.pos.x = 0; s.ball.pos.z = 0;
  const target = choosePassTarget(s, passer, 1, 0);
  check(target === near, 'aimed pass prefers nearby teammate over a long option');
  doPass(s, passer, target);
  check(Math.hypot(s.ball.vel.x, s.ball.vel.z) < 6.1, 'short pass leaves at controlled speed');
}

// 2c) Throw-ins can't be shot
console.log('Throw-in rules');
{
  const s = createMatch({ home: TEAMS[1], away: TEAMS[2], controllers: ['p1', 'ai'], duration: 120 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  s.ball.owner = null;
  s.ball.lastTouch = s.players[18]; // away touch awards the human home side a throw-in
  s.ball.pos.x = 5; s.ball.pos.z = HALF_W + 0.5; s.ball.vel.x = 0; s.ball.vel.z = 1;
  stepMatch(s, {}, FIXED_DT);
  check(s.phase === 'restart' && s.restart.type === 'throw-in', 'throw-in awarded');
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const taker = s.ball.owner;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: { shootHeld: true } }, FIXED_DT);
  stepMatch(s, { p1: { shootHeld: false } }, FIXED_DT);
  check(s.ball.owner !== taker && s.teams[0].shots === 0 && s.ball.intended, 'shoot on a throw-in becomes a throw');
}

// 3) Pass button without the ball switches to the teammate nearest the ball
console.log('Manual switch');
{
  const s = createMatch({ home: TEAMS[2], away: TEAMS[5], controllers: ['ai', 'p1'], duration: 120 });
  const team = s.teams[1];
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const before = team.controlled;
  stepMatch(s, { p1: { passPressed: true } }, FIXED_DT);
  check(team.controlled && team.controlled !== before, 'switched player');
  check(team.controlled.role !== 'GK', 'never switch to keeper');
  check(teamPlayers(s, 1).filter((p) => p.human).length === 1, 'exactly one human player');
}

// 4) Shooting: hold and release
console.log('Shooting');
{
  const s = createMatch({ home: TEAMS[9], away: TEAMS[0], controllers: ['p1', 'ai'], duration: 120 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const p = s.teams[0].controlled;
  p.mustPass = false;
  for (let i = 0; i < 30; i++) stepMatch(s, { p1: { mx: 1, shootHeld: true } }, FIXED_DT);
  check(p.charge > 0.3, 'charge builds while holding shoot');
  stepMatch(s, { p1: { mx: 1, shootHeld: false } }, FIXED_DT);
  check(s.ball.owner === null && s.ball.shotLive, 'ball released as a shot');
  check(s.teams[0].shots === 1, 'shot counted');
}

// 5) Two humans mashing random inputs, all teams
console.log('2P random input fuzz');
for (let i = 0; i < TEAMS.length; i++) {
  const rnd = () => ({
    mx: Math.random() * 2 - 1, mz: Math.random() * 2 - 1,
    sprint: Math.random() < 0.5, passPressed: Math.random() < 0.03,
    shootHeld: Math.random() < 0.3, shootPressed: Math.random() < 0.03,
  });
  const { s } = run({ home: TEAMS[i], away: TEAMS[(i + 1) % 10], controllers: ['p1', 'p2'], duration: 90 },
    () => ({ p1: rnd(), p2: rnd() }));
  for (const t of s.teams) {
    check(teamPlayers(s, t.index).filter((p) => p.human).length <= 1, 'one human per team');
  }
}

// 6) Same team on both sides gets a different kit
{
  const s = createMatch({ home: TEAMS[4], away: TEAMS[4], controllers: ['ai', 'ai'], duration: 30 });
  check(s.teams[0].kit.shirt !== s.teams[1].kit.shirt, 'kit clash resolved');
}

// 7) Indoor matches are genuinely five-a-side and use rebound boards.
console.log('Indoor soccer');
{
  const s = createMatch({ home: TEAMS[0], away: TEAMS[1], controllers: ['ai', 'ai'], duration: 60, indoor: true });
  check(s.players.filter((p) => p.onPitch).length === 10, 'indoor match has ten active players');
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  s.ball.owner = null;
  s.ball.pos.x = 0; s.ball.pos.z = HALF_W + 0.5; s.ball.vel.x = 0; s.ball.vel.z = 4;
  stepMatch(s, {}, FIXED_DT);
  check(s.phase === 'play', 'indoor board keeps play live');
  check(s.ball.vel.z < 0, 'indoor board reflects the ball');
  const passer = s.players.find((p) => p.team === 0 && p.onPitch && p.role !== 'GK');
  const receiver = s.players.find((p) => p.team === 0 && p.onPitch && p !== passer && p.role !== 'GK');
  passer.pos.x = 0; passer.pos.z = 0;
  receiver.pos.x = 25; receiver.pos.z = 0;
  s.ball.owner = passer; s.ball.pos.x = 0; s.ball.pos.z = 0;
  doPass(s, passer, receiver);
  check(s.ball.offsidePlayers.length === 0, 'indoor passes do not create offside calls');
}

// 8) Knockout-style matches play extra time before the caller decides a tie.
console.log('Extra time');
{
  const s = createMatch({ home: TEAMS[0], away: TEAMS[1], controllers: ['ai', 'ai'], duration: 1, extraTime: true, extraTimeDuration: 1 });
  let extraTime = false;
  for (let i = 0; i < 600 && s.phase !== 'fulltime'; i++) {
    stepMatch(s, {}, FIXED_DT);
    extraTime ||= s.events.some((event) => event.type === 'extraTime');
    s.events.length = 0;
  }
  check(extraTime, 'tied knockout match starts extra time');
  check(s.phase === 'fulltime', 'match finishes after extra time');
}

// 7) Halftime: teams swap ends once
console.log('Halftime');
{
  const s = createMatch({ home: TEAMS[0], away: TEAMS[1], controllers: ['ai', 'ai'], duration: 60 });
  let sawHalf = false, dirAfter = null;
  while (s.phase !== 'fulltime') {
    stepMatch(s, {}, FIXED_DT);
    if (s.phase === 'halftime') sawHalf = true;
    if (sawHalf && s.phase === 'play' && dirAfter === null) dirAfter = s.teams[0].dir;
  }
  check(sawHalf, 'halftime happened');
  check(dirAfter === -1, 'home team attacks the other way after halftime');
}

// 8) Game speed: 50% speed moves things half as far, clock still real time
console.log('Game speed');
{
  const mk = (ts) => {
    const s = createMatch({ home: TEAMS[2], away: TEAMS[3], controllers: ['p1', 'ai'], duration: 120, timeScale: ts });
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT * ts);
    s.ball.owner = null; s.ball.pos.x = 0; s.ball.pos.z = 0; s.ball.vel.x = 10; s.ball.vel.z = 0; s.ball.vel.y = 0;
    for (const p of s.players) { p.pos.z = 15; p.kickCd = 5; }
    const c0 = s.clock;
    for (let i = 0; i < 30; i++) stepMatch(s, {}, FIXED_DT * ts);
    return { x: s.ball.pos.x, clock: s.clock - c0 };
  };
  const full = mk(1), half = mk(0.5);
  check(Math.abs(half.x - full.x / 2) < 0.3, `ball moves half as far at 50% (${half.x.toFixed(2)} vs ${full.x.toFixed(2)})`);
  check(Math.abs(half.clock - full.clock) < 1e-6, 'match clock follows real time');
}

// 9) Assist steers a loose-ball run; Off does not
console.log('Assist');
for (const [assist, expect] of [['assisted', true], ['off', false]]) {
  const s = createMatch({ home: TEAMS[5], away: TEAMS[6], controllers: ['p1', 'ai'], duration: 120, assist });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const p = s.teams[0].controlled;
  s.ball.owner = null; s.ball.intended = null;
  s.ball.pos.x = p.pos.x - 6; s.ball.pos.z = p.pos.z + 6; s.ball.vel.x = s.ball.vel.z = 0;
  stepMatch(s, { p1: { mx: 0, mz: 1 } }, FIXED_DT); // only "S" pressed
  check((p.intent.mx < -0.3) === expect, `${assist}: pressing only S ${expect ? 'curves' : 'does not curve'} towards the ball`);
}

// 10) Practice mode: only their keeper, no time limit, runs without errors
console.log('Practice mode');
{
  const s = createMatch({ home: TEAMS[9], away: TEAMS[0], controllers: ['p1', 'ai'], practice: true });
  const active = s.players.filter((p) => p.onPitch);
  check(active.length === 12 && active.filter((p) => p.team === 1).length === 1, 'your eleven against just their keeper');
  const rnd = () => ({ mx: Math.random() * 2 - 1, mz: Math.random() * 2 - 1, passPressed: Math.random() < 0.05, shootHeld: Math.random() < 0.3 });
  for (let i = 0; i < 60 * 300; i++) {
    stepMatch(s, { p1: rnd() }, FIXED_DT);
    s.events.length = 0;
    if (i % 60 === 0 && !finite(s)) { check(false, 'practice non-finite'); break; }
  }
  check(s.phase !== 'fulltime', 'practice has no full time');
}

// 10b) Human pass/shot events are flagged (the tutorial relies on this)
{
  const s = createMatch({ home: TEAMS[0], away: TEAMS[1], controllers: ['p1', 'ai'], duration: 120 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  s.events.length = 0;
  stepMatch(s, { p1: { mx: -1, passPressed: true } }, FIXED_DT);
  check(s.events.some((e) => e.type === 'pass' && e.human), 'human pass event flagged');
}

// 12) Tackling
console.log('Tackling');
function tackleSetup(role = 'DEF', gap = 1.2, assist = 'assisted') {
  const s = createMatch({ home: TEAMS[7], away: TEAMS[8], controllers: ['p1', 'ai'], duration: 120, assist });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const me = s.players.find((p) => p.team === 0 && p.role === role);
  const victim = s.players.find((p) => p.team === 1 && p.role === 'FWD');
  for (const p of s.players) p.mustPass = false;
  me.pos.x = 0; me.pos.z = 5; me.face.x = 1; me.face.z = 0;
  victim.pos.x = gap; victim.pos.z = 5; victim.face.x = -1; victim.face.z = 0;
  s.ball.owner = victim; s.ball.pos.x = gap - 0.75; s.ball.pos.z = 5;
  setControlled(s, s.teams[0], me);
  s.teams[0].seenOpponentOwner = victim;
  return { s, me, victim };
}
{
  // In range: the opponent's ring is highlighted
  const { s, victim } = tackleSetup();
  stepMatch(s, { p1: {} }, FIXED_DT);
  check(s.teams[0].tackleTarget === victim, 'opponent in range is highlighted for tackling');
}
{
  // Success rate from close range
  let won = 0, tries = 0, gotBall = 0;
  for (let i = 0; i < 300; i++) {
    const { s, me } = tackleSetup(i % 2 ? 'DEF' : 'FWD');
    s.events.length = 0;
    stepMatch(s, { p1: { shootPressed: true } }, FIXED_DT);
    const ev = s.events.find((e) => e.type === 'tackle');
    if (ev && ['won', 'missed', 'foul'].includes(ev.result)) tries++; // a foul is a lost challenge
    if (ev && ev.result === 'won') { won++; if (s.ball.owner === me) gotBall++; }
  }
  console.log(`  close-range tackles won ${won}/${tries} (${Math.round(100 * won / tries)}%)`);
  check(tries === 300, 'every close tackle press counts as an attempt');
  check(won / tries > 0.55, 'close-range tackles usually succeed');
  check(gotBall === won, 'with assist, a won tackle gives you the ball');
}
{
  // Too far: feedback, no freeze
  const { s, me } = tackleSetup('DEF', 6);
  s.events.length = 0;
  stepMatch(s, { p1: { shootPressed: true } }, FIXED_DT);
  const ev = s.events.find((e) => e.type === 'tackle');
  check(ev && ev.result === 'too far', 'tackling from too far reports "too far"');
  check(me.stun === 0, 'no freeze after a too-far tackle');
  check(s.teams[0].tackleTarget === null, 'no highlight when out of range');
}
{
  // Real keyboard path: pressing G produces a tackle
  const input = new Input();
  const { s } = tackleSetup();
  winListeners.keydown.forEach((f) => f({ code: 'KeyG', key: 'g', preventDefault() {} }));
  const inp = input.sample('p1', []);
  check(inp.shootPressed, 'G key registers as the tackle/shoot press for P1');
  s.events.length = 0;
  stepMatch(s, { p1: inp }, FIXED_DT);
  check(s.events.some((e) => e.type === 'tackle' && e.human), 'pressing G next to the attacker makes a tackle');
  input.endStep();
  winListeners.keyup.forEach((f) => f({ code: 'KeyG', key: 'g' }));
}

// 13) Keepers: hands = protected, feet = can be tackled
console.log('Keeper possession');
function keeperSetup({ holding }) {
  const s = createMatch({ home: TEAMS[1], away: TEAMS[4], controllers: ['p1', 'ai'], duration: 120 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  for (const p of s.players) p.mustPass = false;
  const gk = s.players.find((p) => p.team === 1 && p.role === 'GK'); // away keeper, goal at +x
  const me = s.players.find((p) => p.team === 0 && p.role === 'FWD');
  gk.pos.x = 29; gk.pos.z = 0; gk.face.x = -1; gk.face.z = 0;
  s.ball.owner = gk; s.ball.pos.x = 28.25; s.ball.pos.z = 0;
  gk.holding = holding; gk.mustPass = holding; gk.holdTimer = 5; gk.mustPassTimer = 0;
  me.pos.x = 28.6; me.pos.z = 0.3; me.face.x = 1; me.face.z = 0; // right on top of him
  setControlled(s, s.teams[0], me);
  s.teams[0].seenOpponentOwner = gk;
  return { s, gk, me };
}
{
  const { s, gk } = keeperSetup({ holding: true });
  const before = { x: gk.pos.x, z: gk.pos.z };
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: { mx: 1, mz: 0 } }, FIXED_DT); // run into him
  check(Math.hypot(gk.pos.x - before.x, gk.pos.z - before.z) < 1e-9, 'keeper holding the ball is not pushed');
  check(s.teams[0].tackleTarget === null, 'holding keeper is not highlighted for tackling');
  s.events.length = 0;
  stepMatch(s, { p1: { shootPressed: true } }, FIXED_DT);
  const ev = s.events.find((e) => e.type === 'tackle');
  check(ev && ev.result === 'keeper' && s.ball.owner === gk, 'tackling a keeper with the ball in his hands does nothing');
}
{
  let won = 0;
  for (let i = 0; i < 100; i++) {
    const { s, gk } = keeperSetup({ holding: false });
    stepMatch(s, { p1: {} }, FIXED_DT);
    if (i === 0) check(s.teams[0].tackleTarget === gk, 'keeper with the ball at his feet can be targeted');
    s.events.length = 0;
    stepMatch(s, { p1: { shootPressed: true } }, FIXED_DT);
    if (s.events.some((e) => e.type === 'tackle' && e.result === 'won')) won++;
  }
  console.log(`  tackles on a keeper with the ball at his feet: won ${won}/100`);
  check(won > 30, 'keeper with the ball at his feet can be tackled');
}
{
  // Back-pass from a teammate stays at the keeper's feet; a shot he stops is in his hands
  const s = createMatch({ home: TEAMS[3], away: TEAMS[6], controllers: ['ai', 'ai'], duration: 120 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const gk = s.players.find((p) => p.team === 0 && p.role === 'GK');
  const mate = s.players.find((p) => p.team === 0 && p.role === 'DEF');
  for (const p of s.players) { p.mustPass = false; if (p !== gk) { p.pos.x = 0; p.pos.z = 15 + p.id; } }
  s.ball.owner = null; s.ball.lastTouch = mate; s.ball.shotLive = false;
  s.ball.pos.x = gk.pos.x + 0.5; s.ball.pos.z = gk.pos.z; s.ball.vel.x = s.ball.vel.z = 0;
  stepMatch(s, {}, FIXED_DT);
  check(s.ball.owner === gk && !isHolding(s, gk), 'back-pass: keeper has it at his feet');
  const s2 = createMatch({ home: TEAMS[3], away: TEAMS[6], controllers: ['ai', 'ai'], duration: 120 });
  while (s2.phase !== 'play') stepMatch(s2, {}, FIXED_DT);
  const gk2 = s2.players.find((p) => p.team === 0 && p.role === 'GK');
  const opp = s2.players.find((p) => p.team === 1 && p.role === 'FWD');
  for (const p of s2.players) { p.mustPass = false; if (p !== gk2) { p.pos.x = 0; p.pos.z = 15 + p.id; } }
  s2.ball.owner = null; s2.ball.lastTouch = opp; s2.ball.shotLive = false;
  s2.ball.pos.x = gk2.pos.x + 0.5; s2.ball.pos.z = gk2.pos.z; s2.ball.vel.x = s2.ball.vel.z = 0;
  stepMatch(s2, {}, FIXED_DT);
  check(s2.ball.owner === gk2 && isHolding(s2, gk2), 'loose ball from an opponent: keeper picks it up in his hands');
}
{
  // Set pieces: the taker can't be tackled before the restart is taken
  const { s, me, victim } = tackleSetup();
  victim.mustPass = true;
  stepMatch(s, { p1: {} }, FIXED_DT);
  check(s.teams[0].tackleTarget === null, 'set-piece taker is not highlighted');
  s.events.length = 0;
  stepMatch(s, { p1: { shootPressed: true } }, FIXED_DT);
  check(s.events.some((e) => e.type === 'tackle' && e.result === 'set piece') && s.ball.owner === victim, 'set-piece taker cannot be tackled');
}

// 14) A player you pushed forward keeps his run for 5 seconds after you let go
console.log('Keep run after release');
{
  const s = createMatch({ home: TEAMS[6], away: TEAMS[2], controllers: ['p1', 'ai'], duration: 300 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  const team = s.teams[0];
  const gk = s.players.find((p) => p.team === 0 && p.role === 'GK');
  const mid = s.players.find((p) => p.team === 0 && p.role === 'MID');
  for (const p of s.players) p.mustPass = false;
  // Our keeper holds the ball (so nobody can take it) while we make a run.
  s.ball.owner = gk; gk.holding = true; gk.mustPass = true; gk.holdTimer = 99; gk.mustPassTimer = -99;
  setControlled(s, team, mid);
  // Run down an open channel: with real player contacts, sprinting straight
  // into an opponent standing on the halfway line stops the run.
  mid.pos.z = 15;
  for (let i = 0; i < 120; i++) stepMatch(s, { p1: { mx: 1, mz: 0, sprint: true } }, FIXED_DT);
  const releasedAx = mid.pos.x;
  stepMatch(s, { p1: { passPressed: true } }, FIXED_DT); // switch away
  check(team.controlled !== mid, 'control switched away from the runner');
  check(mid.keepRun && mid.keepRun.running, 'runner remembers his run');
  for (let i = 0; i < 150; i++) stepMatch(s, { p1: {} }, FIXED_DT); // 2.5 s
  check(mid.pos.x > releasedAx + 3, `runner kept going towards goal (${releasedAx.toFixed(1)} -> ${mid.pos.x.toFixed(1)})`);
  for (let i = 0; i < 200; i++) stepMatch(s, { p1: {} }, FIXED_DT); // past 5 s
  check(!mid.keepRun, 'after 5 seconds he goes back to normal AI');
}

// 15) Passing help: past the presser, receiver wins ties
console.log('Passing');
{
  let cutOut = 0, tie = 0;
  for (let i = 0; i < 100; i++) {
    const s = createMatch({ home: TEAMS[i % 10], away: TEAMS[(i + 5) % 10], controllers: ['p1', 'ai'], duration: 120 });
    while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
    for (const p of s.players) { p.mustPass = false; p.pos.z = -18 + p.id; p.pos.x = (p.team ? 20 : -20); }
    const me = s.players.find((p) => p.team === 0 && p.role === 'MID');
    const mate = s.players.find((p) => p.team === 0 && p.role === 'FWD');
    const presser = s.players.find((p) => p.team === 1 && p.role === 'MID');
    me.pos.x = 0; me.pos.z = 0; me.face.x = 1; me.face.z = 0;
    mate.pos.x = 12; mate.pos.z = 0;
    presser.pos.x = 1.3; presser.pos.z = 0.3; // right in front of you
    s.ball.owner = me; s.ball.pos.x = 0.75; s.ball.pos.z = 0;
    setControlled(s, s.teams[0], me);
    doPass(s, me, mate);
    for (let k = 0; k < 40 && !s.ball.owner; k++) stepMatch(s, { p1: {} }, FIXED_DT);
    if (s.ball.owner === presser) cutOut++;
    // Tie: receiver and a marker both in reach of the ball
    const s2 = createMatch({ home: TEAMS[i % 10], away: TEAMS[(i + 5) % 10], controllers: ['p1', 'ai'], duration: 120 });
    while (s2.phase !== 'play') stepMatch(s2, {}, FIXED_DT);
    for (const p of s2.players) { p.mustPass = false; p.pos.z = -18 + p.id; p.pos.x = (p.team ? 20 : -20); }
    const r = s2.players.find((p) => p.team === 0 && p.role === 'FWD');
    const mk = s2.players.find((p) => p.team === 1 && p.role === 'DEF');
    r.pos.x = 5.9; r.pos.z = 0; mk.pos.x = 5.5; mk.pos.z = 0.4;
    s2.ball.restartDoubleTouchBy = null; s2.ball.owner = null; s2.ball.intended = r; s2.ball.pos.x = 5.2; s2.ball.pos.z = 0.1; s2.ball.vel.x = 3; s2.ball.vel.z = 0;
    stepMatch(s2, { p1: {} }, FIXED_DT);
    if (s2.ball.owner === r) tie++;
  }
  check(cutOut < 10, `a pass is rarely cut out by the defender pressing you (${cutOut}/100)`);
  check(tie === 100, `the intended receiver wins a tie for his pass (${tie}/100)`);
}

// 16) Keepers: long central shots are mostly saved, close corner shots mostly aren't
console.log('Keeper saves');
{
  const trial = (fromX, aim) => {
    let goals = 0;
    for (let i = 0; i < 200; i++) {
      const s = createMatch({ home: TEAMS[i % 10], away: TEAMS[(i + 4) % 10], controllers: ['p1', 'ai'], duration: 300 });
      while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
      for (const p of s.players) { p.mustPass = false; if (p.role !== 'GK') { p.pos.x = -25; p.pos.z = -18 + p.id; } }
      const shooter = s.players.find((p) => p.team === 0 && p.role === 'FWD');
      shooter.pos.x = fromX; shooter.pos.z = 0; shooter.face.x = 1; shooter.face.z = 0;
      s.ball.owner = shooter; s.ball.pos.x = fromX + 0.75; s.ball.pos.z = 0;
      doShot(s, shooter, 0.5, aim);
      for (let k = 0; k < 120 && s.phase === 'play'; k++) stepMatch(s, { p1: {} }, FIXED_DT);
      if (s.events.some((e) => e.type === 'goal' && e.team === 0)) goals++;
    }
    return goals / 200;
  };
  const longCentral = trial(HALF_L - 22, 0.05), closeCorner = trial(HALF_L - 10, 1);
  console.log(`  goals: 22 m central ${Math.round(longCentral * 100)}%, 10 m into the corner ${Math.round(closeCorner * 100)}%`);
  check(longCentral < 0.25, 'long central shots are usually saved');
  check(closeCorner > longCentral + 0.15, 'close shots into the corner score much more often');
}

// 11) Keys are recognised even without event.code
console.log('Key normalisation');
check(normalizeKey({ code: 'KeyW', key: 'w' }) === 'KeyW', 'code');
check(normalizeKey({ code: '', key: 'W', keyCode: 87 }) === 'KeyW', 'fallback to key');
check(normalizeKey({ code: '', key: 'Process', keyCode: 87 }) === 'KeyW', 'fallback to keyCode');
check(normalizeKey({ code: 'ArrowUp', key: 'ArrowUp' }) === 'ArrowUp', 'arrows');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
