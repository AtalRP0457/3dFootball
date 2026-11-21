// Tests for dribbling, passing and shooting mechanics. Run with: npm test
import { planShot } from '../src/game/mechanics/shooting.js';
import { planPass } from '../src/game/mechanics/passing.js';
import { touchLead } from '../src/game/mechanics/dribbling.js';
import { physicalProfile } from '../src/game/physics/attributes.js';
import { integrateBall, substepsFor, setKickSpin, setRollingSpin } from '../src/game/physics/ballPhysics.js';
import { createMatch, stepMatch, setControlled } from '../src/game/match.js';
import { TEAMS } from '../src/data/teams.js';
import { FIXED_DT, HALF_L, BALL_R, GOAL } from '../src/game/constants.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('  FAIL:', msg); }
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

const skilled = physicalProfile({}, { finishing: 92, shooting: 90, longShots: 88, passing: 92, vision: 90, crossing: 85, strength: 75, pace: 80, sprintSpeed: 80, acceleration: 80, agility: 85, dribbling: 92, ballControl: 92 });
const poor = physicalProfile({}, { finishing: 45, shooting: 45, longShots: 40, passing: 45, vision: 45, crossing: 40, strength: 60, pace: 70, sprintSpeed: 70, acceleration: 70, agility: 55, dribbling: 45, ballControl: 45 });

function shooter(prof, { speed = 0, face = [1, 0] } = {}) {
  return { pos: { x: HALF_L - 20, z: 0 }, vel: { x: speed, z: 0 }, face: { x: face[0], z: face[1] }, phys: prof, stamina: 1, injured: false };
}
/** Fly a planned shot to the goal line; returns crossing point, speed and path stats. */
function flyShot(plan, from) {
  const b = { pos: { x: from.x, y: BALL_R + 0.01, z: from.z }, vel: { ...plan.vel }, spin: { x: 0, y: 0, z: 0 } };
  setKickSpin(b, plan.top, plan.side);
  let maxY = 0, maxDev = 0, t = 0;
  const ux = plan.vel.x, uz = plan.vel.z, ul = Math.hypot(ux, uz);
  while (b.pos.x < HALF_L && t < 5) {
    const n = substepsFor(b, 1 / 120);
    for (let i = 0; i < n; i++) integrateBall(b, 1 / 120 / n);
    t += 1 / 120;
    maxY = Math.max(maxY, b.pos.y);
    const rx = b.pos.x - from.x, rz = b.pos.z - from.z;
    maxDev = Math.max(maxDev, Math.abs((rx * uz - rz * ux) / ul));
    if (Math.hypot(b.vel.x, b.vel.z) < 0.3) break;
  }
  return {
    z: b.pos.z, y: b.pos.y, reached: b.pos.x >= HALF_L, speed: Math.hypot(b.vel.x, b.vel.y, b.vel.z), maxY, maxDev,
    onTarget: b.pos.x >= HALF_L && Math.abs(b.pos.z) < GOAL.width / 2 && b.pos.y < GOAL.height,
  };
}
function shots(prof, opts, type, power, aimZ, n = 300) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = shooter(prof, opts);
    const ball = { pos: { x: p.pos.x + 0.7, y: BALL_R, z: 0 } };
    const plan = planShot({ p, ball, goalX: HALF_L, aimZ, power, type });
    out.push({ ...flyShot(plan, ball.pos), plan });
  }
  return out;
}

console.log('Shooting');
{
  const good = shots(skilled, {}, 'normal', 0.6, 2.4);
  const bad = shots(poor, {}, 'normal', 0.6, 2.4);
  const rate = (a) => a.filter((r) => r.onTarget).length / a.length;
  console.log(`  on target from 20 m: skilled ${(rate(good) * 100).toFixed(0)}%, poor ${(rate(bad) * 100).toFixed(0)}%`);
  check(rate(good) > rate(bad) + 0.15, 'shooting accuracy attribute matters');
  check(sd(good.map((r) => r.z)) < sd(bad.map((r) => r.z)), 'skilled finisher has a tighter spread');

  const normal = shots(skilled, {}, 'normal', 0.7, 0);
  const power = shots(skilled, {}, 'power', 1, 0);
  check(mean(power.map((r) => r.speed)) > mean(normal.map((r) => r.speed)) + 4, 'power shot is clearly faster');
  check(sd(power.map((r) => r.z)) > sd(normal.map((r) => r.z)) * 1.3, 'power shot is less accurate');

  const standing = shots(skilled, {}, 'normal', 0.6, 0);
  const sprinting = shots(skilled, { speed: 9 }, 'normal', 0.6, 0);
  check(sd(sprinting.map((r) => r.z)) > sd(standing.map((r) => r.z)) * 1.25, 'shooting at full sprint is less accurate');
  const side = shots(skilled, { face: [0, 1] }, 'normal', 0.6, 0);
  check(sd(side.map((r) => r.z)) > sd(standing.map((r) => r.z)) * 1.4, 'shooting across the body is less accurate');

  const finesse = shots(skilled, {}, 'finesse', 0.6, 2.4);
  check(mean(finesse.map((r) => r.maxDev)) > 0.5, `finesse shot curls (${mean(finesse.map((r) => r.maxDev)).toFixed(2)} m bend)`);
  const farPost = GOAL.width / 2 - 0.55;
  check(Math.abs(mean(finesse.map((r) => Math.abs(r.z))) - farPost) < 0.7, `finesse ends near the far post (${mean(finesse.map((r) => r.z)).toFixed(2)})`);
  check(mean(normal.map((r) => r.maxDev)) < mean(finesse.map((r) => r.maxDev)) * 0.5, 'normal shot bends much less');

  const low = shots(skilled, {}, 'low', 0.25, 1);
  check(mean(low.map((r) => r.maxY)) < 1.0, `low driven shot stays low (${mean(low.map((r) => r.maxY)).toFixed(2)} m)`);
  const chip = shots(skilled, {}, 'chip', 0.5, 0);
  check(mean(chip.map((r) => r.maxY)) > 3, `chip goes up over the keeper (${mean(chip.map((r) => r.maxY)).toFixed(2)} m)`);
  check(chip.filter((r) => r.onTarget).length / chip.length > 0.4, 'a skilled chip often drops under the bar');
}

console.log('Passing');
{
  const passer = (prof, speed = 0) => ({ pos: { x: 0, z: 0 }, vel: { x: speed, z: 0 }, face: { x: 1, z: 0 }, phys: prof, stamina: 1 });
  const recv = (x, z, vx = 0, vz = 0) => ({ pos: { x, z }, vel: { x: vx, z: vz }, phys: skilled });
  const roll = (plan) => {
    const b = { pos: { x: 0.7, y: BALL_R + (plan.vel.y > 0 ? 0.01 : 0), z: 0 }, vel: { ...plan.vel }, spin: { x: 0, y: 0, z: 0 } };
    if (plan.top === null) setRollingSpin(b); else setKickSpin(b, plan.top, 0);
    let landX = null;
    for (let t = 0; t < 12; t += 1 / 60) {
      const wasAir = b.pos.y > BALL_R + 1e-4 || b.vel.y > 0;
      integrateBall(b, 1 / 60);
      if (wasAir && landX === null && b.pos.y <= BALL_R + 1e-4 && t > 0.05) landX = Math.hypot(b.pos.x, b.pos.z);
      if (Math.hypot(b.vel.x, b.vel.z) < 0.01 && b.vel.y === 0 && b.pos.y <= BALL_R + 1e-4) break;
    }
    return { x: b.pos.x, z: b.pos.z, landX };
  };
  const ball = { pos: { x: 0.7, y: BALL_R, z: 0 } };
  // Ground pass to a standing receiver 15 m away dies just past him.
  const stops = [], latG = [], latP = [];
  for (let i = 0; i < 200; i++) {
    const g = roll(planPass({ p: passer(skilled), target: recv(15.7, 0), ball, kind: 'ground' }));
    stops.push(g.x - 15.7); latG.push(g.z);
    latP.push(roll(planPass({ p: passer(poor), target: recv(15.7, 0), ball, kind: 'ground' })).z);
  }
  check(mean(stops) > 0 && mean(stops) < 4, `ground pass runs ${mean(stops).toFixed(2)} m past the receiver`);
  check(sd(latP) > sd(latG) * 1.4, 'poor passer is less accurate');
  // Passing while sprinting is less accurate.
  const latRun = [];
  for (let i = 0; i < 200; i++) latRun.push(roll(planPass({ p: passer(skilled, 9), target: recv(15.7, 0), ball, kind: 'ground' })).z);
  check(sd(latRun) > sd(latG) * 1.2, 'passing at full speed is less accurate');
  // Lead a receiver running across.
  const lead = planPass({ p: passer(skilled), target: recv(15.7, 0, 0, 6), ball, kind: 'ground' });
  check(lead.aim.z > 3, `pass leads a running receiver (aim z ${lead.aim.z.toFixed(2)})`);
  // Lofted pass lands short and runs on.
  const lofts = [];
  for (let i = 0; i < 50; i++) lofts.push(roll(planPass({ p: passer(skilled), target: recv(30.7, 0), ball, kind: 'lofted' })).landX);
  check(mean(lofts) > 21 && mean(lofts) < 28.5, `lofted pass drops short of the receiver (${mean(lofts).toFixed(1)} m of 30)`);
  // Through ball goes into space ahead of the runner.
  const tb = planPass({ p: passer(skilled), target: recv(15, 8, 7, 0), ball, kind: 'through', attackDir: 1 });
  check(tb.aim.x > 20, `through ball played into space (aim x ${tb.aim.x.toFixed(1)})`);
}

console.log('Dribbling');
function dribbleRun(mx, mz, sprint, steps, team = TEAMS[0], setup) {
  const s = createMatch({ home: team, away: TEAMS[1], controllers: ['p1', 'ai'], duration: 600 });
  while (s.phase !== 'play') stepMatch(s, {}, FIXED_DT);
  for (const p of s.players) { p.mustPass = false; p.pos.x = p.team ? 45 : -45; p.pos.z = -30 + p.id * 2; p.vel.x = p.vel.z = 0; }
  const me = s.players.find((p) => p.team === 0 && p.role === 'MID');
  me.pos.x = -20; me.pos.z = 0; me.face.x = 1; me.face.z = 0;
  s.ball.owner = me; s.ball.pos.x = -19.3; s.ball.pos.z = 0; s.ball.pos.y = BALL_R;
  s.ball.vel.x = s.ball.vel.y = s.ball.vel.z = 0;
  setControlled(s, s.teams[0], me);
  s.teams[0].seenOpponentOwner = null;
  if (setup) setup(me);
  const dists = [];
  let touches = 0, lost = false;
  for (let i = 0; i < steps; i++) {
    const inp = typeof mx === 'function' ? mx(i) : { mx, mz, sprint };
    stepMatch(s, { p1: inp }, FIXED_DT);
    for (const e of s.events) { if (e.type === 'touch') touches++; if (e.type === 'lostBall') lost = true; }
    s.events.length = 0;
    if (s.ball.owner !== me) { lost = true; break; }
    dists.push(Math.hypot(s.ball.pos.x - me.pos.x, s.ball.pos.z - me.pos.z));
  }
  return { me, dists, touches, lost, s };
}
{
  const walk = dribbleRun(0.3, 0, false, 180);
  const sprint = dribbleRun(1, 0, true, 180);
  check(!walk.lost && !sprint.lost, 'keeps the ball on a straight run');
  check(mean(sprint.dists.slice(90)) > mean(walk.dists.slice(90)) + 0.4,
    `longer touches at sprint (${mean(sprint.dists.slice(90)).toFixed(2)} m vs ${mean(walk.dists.slice(90)).toFixed(2)} m)`);
  check(sprint.touches >= 3, `discrete touches while running (${sprint.touches})`);
  check(sd(sprint.dists.slice(60)) > 0.12, 'ball distance varies between touches (not glued)');
  check(Math.max(...sprint.dists) < touchLead(sprint.me, 10) + 1.7, 'ball stays within playing distance');

  // Sharp reversal at full sprint: poor dribblers lose it far more often.
  const reverse = (prof) => {
    let lost = 0;
    for (let i = 0; i < 40; i++) {
      const r = dribbleRun((k) => (k < 120 ? { mx: 1, mz: 0, sprint: true } : { mx: -1, mz: 0.15, sprint: true }), 0, 0, 200, TEAMS[0],
        (me) => { me.phys = { ...me.phys, ...prof }; });
      if (r.lost) lost++;
    }
    return lost / 40;
  };
  const lostPoor = reverse({ dribbling: 0.35, control: 0.35 });
  const lostGood = reverse({ dribbling: 0.95, control: 0.95 });
  console.log(`  sprint U-turn losses: poor dribbler ${(lostPoor * 100).toFixed(0)}%, elite ${(lostGood * 100).toFixed(0)}%`);
  check(lostPoor > lostGood + 0.2, 'dribbling skill helps keep the ball through sharp turns');
}

console.log('Reach and queued actions');
{
  // Release shoot with the ball two metres ahead: no shot from thin air; the
  // player runs onto it and shoots within the queue window.
  const r = dribbleRun(0, 0, false, 1);
  const { s, me } = r;
  me.vel.x = me.vel.z = 0;
  s.ball.pos.x = me.pos.x + 2.3; s.ball.pos.z = me.pos.z; s.ball.vel.x = s.ball.vel.z = 0;
  for (let i = 0; i < 20; i++) stepMatch(s, { p1: { mx: 0, mz: 0, shootHeld: true } }, FIXED_DT);
  check(Math.hypot(s.ball.pos.x - me.pos.x, s.ball.pos.z - me.pos.z) > 2, 'close control does not pull a distant ball in');
  stepMatch(s, { p1: { mx: 1, mz: 0 } }, FIXED_DT);
  const gap = Math.hypot(s.ball.pos.x - me.pos.x, s.ball.pos.z - me.pos.z);
  check(s.teams[0].shots === 0 && s.ball.owner === me, `no shot while the ball is out of reach (shots ${s.teams[0].shots}, owned ${s.ball.owner === me}, gap ${gap.toFixed(2)})`);
  let shotAt = -1;
  for (let i = 0; i < 40 && shotAt < 0; i++) {
    stepMatch(s, { p1: { mx: 1, mz: 0 } }, FIXED_DT);
    if (s.teams[0].shots === 1) shotAt = i;
  }
  check(shotAt >= 0, 'queued shot is taken once the ball is in reach');
  check(me.charge === 0, 'charge is consumed by the release');
}

console.log(failures ? `\n${failures} mechanics check(s) failed` : '\nall mechanics checks passed');
process.exitCode = failures ? 1 : 0;
