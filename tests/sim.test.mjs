// Headless tests for the match engine. Run with: npm test
import { createMatch, stepMatch, teamPlayers, choosePassTarget, doPass } from '../src/game/match.js';
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
  check(seen['THROW-IN'] > 0 || seen['GOAL KICK'] > 0 || seen['CORNER'] > 0, 'no restarts happened');
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

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
