// Unit tests for the physics modules. Run with: npm test
import {
  integrateBall, rollDistance, speedForRollDistance, setRollingSpin, setKickSpin,
  collideBallWithBody, solveLoftedKick, substepsFor, predictGroundBall,
} from '../src/game/physics/ballPhysics.js';
import { stepLocomotion, resolvePlayerContacts } from '../src/game/physics/playerPhysics.js';
import { physicalProfile } from '../src/game/physics/attributes.js';
import { BALL_R } from '../src/game/constants.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('  FAIL:', msg); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function ball(vx = 0, vy = 0, vz = 0, y = BALL_R) {
  return { pos: { x: 0, y, z: 0 }, vel: { x: vx, y: vy, z: vz }, spin: { x: 0, y: 0, z: 0 } };
}
function simulate(b, dt, seconds, until = () => false) {
  let t = 0;
  while (t < seconds - 1e-9) {
    const n = substepsFor(b, dt);
    for (let i = 0; i < n; i++) integrateBall(b, dt / n);
    t += dt;
    if (until(b, t)) break;
  }
  return t;
}

console.log('Ball: rolling');
{
  // Closed-form roll distance matches the integrator, at several frame rates.
  for (const v0 of [4, 9, 16]) {
    const expected = rollDistance(v0);
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const b = ball(v0); setRollingSpin(b);
      simulate(b, dt, 20);
      check(near(b.pos.x, expected, expected * 0.02 + 0.02),
        `roll ${v0} m/s @${Math.round(1 / dt)}Hz: ${b.pos.x.toFixed(2)} vs ${expected.toFixed(2)}`);
      check(Math.hypot(b.vel.x, b.vel.z) < 1e-6, 'rolling ball comes to rest');
    }
  }
  // Pass weighting inverts the model.
  for (const d of [5, 12, 22]) {
    check(near(rollDistance(speedForRollDistance(d)), d, 0.01), `speedForRollDistance(${d})`);
  }
  // Prediction used by AI agrees with the simulation after 1 s.
  const b = ball(10); setRollingSpin(b);
  const q = predictGroundBall(b, 1);
  simulate(b, 1 / 60, 1);
  check(near(q.x, b.pos.x, 0.05), `AI prediction ${q.x.toFixed(2)} vs physics ${b.pos.x.toFixed(2)}`);
  // Rolling ball keeps spin consistent with speed.
  const r = ball(6); setRollingSpin(r);
  simulate(r, 1 / 60, 0.5);
  check(near(r.spin.z, -r.vel.x / BALL_R, 1e-6), 'rolling spin matches velocity');
}

console.log('Ball: skid to roll');
{
  // A ball struck flat with no spin skids, friction turns it into a roll and
  // a thin-walled ball keeps 1 / (1 + 2/3) = 60% of its speed.
  const b = ball(10);
  simulate(b, 1 / 120, 2, (bb) => Math.abs(bb.vel.x + BALL_R * bb.spin.z) < 0.01);
  const slip = b.vel.x + BALL_R * b.spin.z;
  check(Math.abs(slip) < 0.06, `slip removed (${slip.toFixed(3)})`);
  // at least 40% lost to friction while skidding, plus rolling resistance
  check(b.vel.x > 3.5 && b.vel.x < 6.05, `skid->roll speed ${b.vel.x.toFixed(2)}`);
}

console.log('Ball: bounce');
{
  const b = ball(0, 0, 0, 3);
  const peaks = [];
  let rising = false, last = b.pos.y;
  simulate(b, 1 / 120, 6, (bb) => {
    if (bb.vel.y > 0) rising = true;
    if (rising && bb.vel.y <= 0) { peaks.push(bb.pos.y); rising = false; }
    last = bb.pos.y;
    return false;
  });
  check(peaks.length >= 2, `ball bounces several times (${peaks.length})`);
  for (let i = 1; i < peaks.length; i++) check(peaks[i] < peaks[i - 1], 'each bounce is lower');
  check(peaks[0] < 3 * 0.5 && peaks[0] > 0.6, `first rebound height ${peaks[0]?.toFixed(2)}`);
  check(b.pos.y === BALL_R && b.vel.y === 0, 'ball settles on the grass');
  check(last >= BALL_R, 'never below the ground');
}

console.log('Ball: spin');
{
  const land = (top, side) => {
    const b = ball(22, 6, 0, BALL_R + 0.01);
    setKickSpin(b, top, side);
    simulate(b, 1 / 120, 5, (bb, t) => t > 0.05 && bb.pos.y <= BALL_R + 1e-9);
    return b;
  };
  const flat = land(0, 0), top = land(30, 0), back = land(-30, 0), curl = land(0, 40);
  check(top.pos.x < flat.pos.x - 1, `topspin dips (${top.pos.x.toFixed(1)} < ${flat.pos.x.toFixed(1)})`);
  check(back.pos.x > flat.pos.x + 1, `backspin floats (${back.pos.x.toFixed(1)} > ${flat.pos.x.toFixed(1)})`);
  check(curl.pos.z < -1, `sidespin curls the ball (${curl.pos.z.toFixed(2)} m)`);
  check(Math.abs(flat.pos.z) < 1e-6, 'no spin, no curl');
  // Drag: a hard shot loses pace over 25 m.
  const s = ball(30, 5, 0, BALL_R + 0.01); // stays airborne past 25 m
  simulate(s, 1 / 60, 3, (bb) => bb.pos.x >= 25);
  const v = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  check(v < 26 && v > 21 && s.pos.y > BALL_R, `30 m/s shot arrives at 25 m with ${v.toFixed(1)} m/s`);
}

console.log('Ball: lofted kick solver');
for (const [d, T] of [[20, 1.2], [35, 1.8], [12, 0.9]]) {
  const k = solveLoftedKick(d, T, -6);
  const b = ball(k.h, k.vy, 0, BALL_R + 0.01);
  setKickSpin(b, -6, 0);
  const t = simulate(b, 1 / 60, 6, (bb, tt) => tt > 0.05 && bb.pos.y <= BALL_R + 1e-9);
  check(near(b.pos.x, d, d * 0.04), `lofted ${d} m lands at ${b.pos.x.toFixed(2)}`);
  check(near(t, T, 0.12), `lofted ${d} m flight ${t.toFixed(2)} s vs ${T}`);
}

console.log('Ball: frame-rate independence in flight');
{
  const run = (dt) => {
    const b = ball(18, 7, 0, BALL_R + 0.01); setKickSpin(b, -8, 20);
    simulate(b, dt, 4);
    return b.pos;
  };
  const a = run(1 / 30), c = run(1 / 60), e = run(1 / 240);
  check(near(a.x, e.x, 0.6) && near(c.x, e.x, 0.3), `x at 4 s: ${a.x.toFixed(2)} / ${c.x.toFixed(2)} / ${e.x.toFixed(2)}`);
  check(near(a.z, e.z, 0.4) && near(c.z, e.z, 0.2), `z at 4 s: ${a.z.toFixed(2)} / ${c.z.toFixed(2)} / ${e.z.toFixed(2)}`);
}

console.log('Ball vs body');
{
  const body = { x: 5, z: 0, vx: 0, vz: 0, radius: 0.3, height: 1.85 };
  for (const speed of [8, 25, 40]) {
    const b = ball(speed, 0, 0, 1.4);
    b.vel.y = 0.01;
    let inside = false, hit = false;
    for (let s = 0; s < 120; s++) {
      const n = substepsFor(b, 1 / 60);
      for (let i = 0; i < n; i++) {
        integrateBall(b, 1 / 60 / n);
        if (collideBallWithBody(b, body)) hit = true;
        if (Math.hypot(b.pos.x - body.x, b.pos.z - body.z) < body.radius + BALL_R - 1e-6
          && b.pos.y - BALL_R < body.height) inside = true;
      }
    }
    check(hit, `ball at ${speed} m/s hits the body`);
    check(!inside, `ball at ${speed} m/s never passes into the body`);
    check(b.pos.x < body.x, `ball at ${speed} m/s rebounds (x ${b.pos.x.toFixed(2)})`);
  }
  // Over the head: no contact.
  const high = ball(20, 0, 0, 2.6); high.vel.y = 0.01;
  check(!collideBallWithBody({ ...high, pos: { x: 5, y: 2.6, z: 0 } }, body), 'ball over the head passes');
}

console.log('Players: locomotion');
const avg = physicalProfile({ spd: 75, dri: 70, tac: 60 });
function player() {
  return { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, face: { x: 1, z: 0 }, acc: { x: 0, z: 0 } };
}
function drive(p, prof, cmdFn, seconds, dt) {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepLocomotion(p, prof, cmdFn(p, t), dt);
}
{
  const top = avg.runSpeed * avg.sprintMul;
  // Acceleration curve: not instant, reaches ~top speed in a couple of seconds.
  const p = player();
  drive(p, avg, () => ({ dx: 1, dz: 0, top }), 0.25, 1 / 60);
  check(p.vel.x < top * 0.5, `no instant top speed (${p.vel.x.toFixed(2)} after 0.25 s)`);
  drive(p, avg, () => ({ dx: 1, dz: 0, top }), 2.5, 1 / 60);
  check(near(p.vel.x, top, 0.05), `reaches top speed ${top.toFixed(2)} (${p.vel.x.toFixed(2)})`);

  // Frame-rate independence of position after a run with a turn.
  const path = (dt) => {
    const q = player();
    drive(q, avg, (_, t) => (t < 1.5 ? { dx: 1, dz: 0, top } : { dx: 0, dz: 1, top }), 3, dt);
    return q.pos;
  };
  const a = path(1 / 30), b = path(1 / 60), c = path(1 / 240);
  // Within ~2.5% (60 Hz) / ~4% (30 Hz) of the ~15 m path length.
  const pathLen = Math.hypot(c.x, c.z);
  check(Math.hypot(a.x - c.x, a.z - c.z) < pathLen * 0.04 && Math.hypot(b.x - c.x, b.z - c.z) < pathLen * 0.025,
    `run path independent of step: (${a.x.toFixed(2)},${a.z.toFixed(2)}) (${b.x.toFixed(2)},${b.z.toFixed(2)}) (${c.x.toFixed(2)},${c.z.toFixed(2)})`);

  // A 180-degree reversal at sprint is a plant-and-turn: the player has to
  // shed most of his speed and it takes noticeably longer than at a jog.
  const reverse = (startSpeed) => {
    const q = player();
    q.vel.x = startSpeed;
    let minSpeed = Infinity, t = 0;
    while (t < 4) {
      stepLocomotion(q, avg, { dx: -1, dz: 0, top }, 1 / 60);
      t += 1 / 60;
      minSpeed = Math.min(minSpeed, Math.hypot(q.vel.x, q.vel.z));
      if (q.vel.x < -2) break;
    }
    return { t, minSpeed };
  };
  const sprintRev = reverse(top), jogRev = reverse(3);
  check(sprintRev.minSpeed < 2, `sprint reversal sheds speed (min ${sprintRev.minSpeed.toFixed(2)})`);
  check(sprintRev.t > jogRev.t + 0.25, `reversing from a sprint takes longer (${sprintRev.t.toFixed(2)} s vs ${jogRev.t.toFixed(2)} s)`);
  check(sprintRev.t > 0.6, 'no instant 180-degree turn at full speed');

  // Turning radius grows with speed and shrinks with agility.
  const quarterTurn = (prof, speed) => {
    const q = player();
    q.vel.x = speed;
    let t = 0;
    while (t < 3 && q.vel.z < speed * 0.7) {
      stepLocomotion(q, prof, { dx: 0, dz: 1, top: speed }, 1 / 60);
      t += 1 / 60;
    }
    return q.pos.x; // distance carried forward before the turn completes
  };
  check(quarterTurn(avg, 8.5) > quarterTurn(avg, 4) + 0.5, 'wider turns at higher speed');
  const agile = physicalProfile({ spd: 75 }, { agility: 95, acceleration: 75, pace: 75, sprintSpeed: 75 });
  const stiff = physicalProfile({ spd: 75 }, { agility: 40, acceleration: 75, pace: 75, sprintSpeed: 75 });
  check(quarterTurn(agile, 8) < quarterTurn(stiff, 8) - 0.3,
    `agility tightens turns (${quarterTurn(agile, 8).toFixed(2)} vs ${quarterTurn(stiff, 8).toFixed(2)})`);

  // Acceleration attribute matters.
  const quick = physicalProfile({}, { acceleration: 95, pace: 75, sprintSpeed: 75, agility: 70 });
  const slow = physicalProfile({}, { acceleration: 45, pace: 75, sprintSpeed: 75, agility: 70 });
  const t5 = (prof) => { const q = player(); let t = 0; while (q.vel.x < 5 && t < 5) { stepLocomotion(q, prof, { dx: 1, dz: 0, top: 9 }, 1 / 60); t += 1 / 60; } return t; };
  check(t5(quick) < t5(slow) - 0.1, `acceleration attribute: ${t5(quick).toFixed(2)} s vs ${t5(slow).toFixed(2)} s to 5 m/s`);

  // Releasing the stick coasts to a stop rather than stopping dead.
  const q = player(); q.vel.x = 7;
  stepLocomotion(q, avg, { dx: 0, dz: 0, top: 9 }, 1 / 60);
  check(q.vel.x > 6.5, 'no dead stop on release');
  drive(q, avg, () => ({ dx: 0, dz: 0, top: 9 }), 2, 1 / 60);
  check(Math.hypot(q.vel.x, q.vel.z) < 0.05, 'player coasts to a stop');

  // Body yaw is rate-limited.
  const r = player();
  stepLocomotion(r, avg, { dx: -1, dz: 0, top: 3 }, 1 / 60);
  check(r.face.x > 0.9, 'body does not flip 180 degrees in one step');
}

console.log('Players: contacts');
{
  const mk = (x, vx, attrs) => ({
    onPitch: true, sentOff: false, pos: { x, z: 0 }, vel: { x: vx, z: 0 },
    phys: physicalProfile({}, attrs), stagger: 0,
  });
  const strong = mk(-0.4, 8, { strength: 92, agility: 70 });
  const light = mk(0.4, -8, { strength: 45, agility: 60 });
  const heavy = resolvePlayerContacts([strong, light], 0.45, () => false);
  check(heavy === 1, 'head-on sprint collision is a heavy contact');
  check(Math.abs(strong.pos.x - light.pos.x) >= 0.9 - 1e-9, 'bodies are separated');
  check(strong.vel.x - light.vel.x <= 1e-9, 'closing velocity removed');
  check(light.stagger > 0 && strong.stagger === 0, 'the weaker player is knocked off balance');
  check(Math.abs(strong.vel.x - 8) < Math.abs(light.vel.x + 8), 'heavier player is knocked back less');
}

console.log(failures ? `\n${failures} physics check(s) failed` : '\nall physics checks passed');
process.exitCode = failures ? 1 : 0;
