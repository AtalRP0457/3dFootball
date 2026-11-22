// Automated acceptance checks for the reference player and ball. Each check
// runs the real engine (Rapier included) headlessly and measures behaviour
// against the targets in the brief. Used by tests/engine.test.ts and
// summarised in docs/ACCEPTANCE_REPORT.md.
import { Simulation } from '../physics/Simulation.ts';
import { FixedTimestep } from '../physics/FixedTimestep.ts';
import { createCalibration } from '../physics/PhysicsConfig.ts';
import { slipSpeed } from '../ball/BallSpin.ts';
import { emptyInput, type PlayerInput } from '../player/PlayerTypes.ts';
import type { PlayerController } from '../player/PlayerController.ts';
import { footWorld } from '../player/PlayerRig.ts';
import { BALL_TESTS } from './BallTestPresets.ts';

export interface CheckResult { id: number; name: string; pass: boolean; detail: string }
type Check = { id: number; name: string; run: () => Promise<{ pass: boolean; detail: string }> };

const f = (n: number, d = 2) => n.toFixed(d);

async function world(): Promise<Simulation> { return Simulation.create(createCalibration()); }
function hold(sim: Simulation, p: PlayerController, secs: number, inp: Partial<PlayerInput>, each?: () => void): void {
  for (let i = 0; i < Math.round(secs * 60); i++) { p.input = { ...emptyInput(), ...inp }; sim.step(); each?.(); }
}
async function withBall(start = { x: 0, z: 0 }): Promise<{ sim: Simulation; p: PlayerController }> {
  const sim = await world();
  const p = sim.addPlayer({ id: 'ref', name: 'Reference', number: 10, start });
  sim.giveBall(p, 0.5);
  return { sim, p };
}
async function noBall(start = { x: 0, z: -30 }): Promise<{ sim: Simulation; p: PlayerController }> {
  const sim = await world();
  const p = sim.addPlayer({ id: 'ref', name: 'Reference', number: 10, start });
  sim.placeBall({ x: 30, y: sim.cal.ball.radius, z: 40 });
  return { sim, p };
}

/** Max distance a planted foot moves over its stance (foot sliding). */
function measureSliding(sim: Simulation, p: PlayerController, secs: number, inp: Partial<PlayerInput>): number {
  let worst = 0;
  const anchor: Record<'L' | 'R', { x: number; z: number } | null> = { L: null, R: null };
  hold(sim, p, secs, inp, () => {
    for (const side of ['L', 'R'] as const) {
      const u = p.contact.legPhase(side);
      const planted = u < p.gait.duty * 0.62 && p.speed > 1; // heel-strike → mid-stance (before toe-off roll)
      const fw = footWorld(p.pose, side, { x: p.pos.x, y: 0, z: p.pos.z }, p.yaw, p.dims);
      if (!planted) { anchor[side] = null; continue; }
      const a = anchor[side];
      if (!a) anchor[side] = { x: fw.x, z: fw.z };
      else worst = Math.max(worst, Math.hypot(fw.x - a.x, fw.z - a.z));
    }
  });
  return worst;
}

export const CHECKS: Check[] = [
  { id: 1, name: 'Player stands naturally (idle, no drift)', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 3, {});
    const drift = Math.hypot(p.pos.x, p.pos.z + 30);
    return { pass: p.movement === 'idle' && drift < 0.01, detail: `state ${p.movement}, drift ${f(drift, 3)} m` };
  } },
  { id: 2, name: 'Walking speed and stride match', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 3, { move: { x: 0, z: 1 }, walk: true });
    const slide = measureSliding(sim, p, 2, { move: { x: 0, z: 1 }, walk: true });
    return { pass: p.speed >= 1.2 && p.speed <= 2.0 && slide < 0.08, detail: `${f(p.speed)} m/s, anim ${p.sm.current}, planted-foot drift ${f(slide * 100, 1)} cm` };
  } },
  { id: 3, name: 'Running speed and stride match', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 3, { move: { x: 0, z: 1 } });
    const slide = measureSliding(sim, p, 2, { move: { x: 0, z: 1 } });
    return { pass: p.speed >= 5.2 && p.speed <= 6.8 && slide < 0.1, detail: `${f(p.speed)} m/s, anim ${p.sm.current}, planted-foot drift ${f(slide * 100, 1)} cm` };
  } },
  { id: 4, name: 'Sprinting reaches 7–9 m/s', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 5, { move: { x: 0, z: 1 }, sprint: true });
    const slide = measureSliding(sim, p, 1.5, { move: { x: 0, z: 1 }, sprint: true });
    return { pass: p.speed >= 7 && p.speed <= 9 && slide < 0.12, detail: `${f(p.speed)} m/s, anim ${p.sm.current}, planted-foot drift ${f(slide * 100, 1)} cm` };
  } },
  { id: 5, name: 'Acceleration is gradual', run: async () => {
    const { sim, p } = await noBall();
    let t95 = -1, v05 = 0;
    for (let i = 0; i < 360; i++) { p.input = { ...emptyInput(), move: { x: 0, z: 1 }, sprint: true }; sim.step(); if (i === 29) v05 = p.speed; if (t95 < 0 && p.speed > 0.95 * p.tuning.sprintSpeed) t95 = sim.time; }
    // Game-tuned (quicker than a track sprint) but still gradual: no instant top speed.
    return { pass: t95 > 1.3 && t95 < 3 && v05 < 5, detail: `${f(v05)} m/s after 0.5 s, 95% of top speed after ${f(t95)} s` };
  } },
  { id: 6, name: 'Deceleration preserves momentum', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 5, { move: { x: 0, z: 1 }, sprint: true });
    const z0 = p.pos.z; let t = 0;
    while (p.speed > 0.05 && t < 6) { p.input = emptyInput(); sim.step(); t += 1 / 60; }
    const d = p.pos.z - z0;
    // Releasing the stick stops the player with a few braking steps, but
    // momentum still carries him on: never an instant stop.
    return { pass: d > 3 && d < 6 && t > 0.8 && t < 1.5, detail: `released at sprint: stopped after ${f(t)} s and ${f(d)} m` };
  } },
  { id: 7, name: 'Turning has inertia (180° at sprint)', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 4.5, { move: { x: 0, z: 1 }, sprint: true });
    const z0 = p.pos.z; let maxZ = z0, tRev = -1;
    for (let i = 0; i < 240; i++) { p.input = { ...emptyInput(), move: { x: 0, z: -1 }, sprint: true }; sim.step(); maxZ = Math.max(maxZ, p.pos.z); if (tRev < 0 && p.vel.z < -3) tRev = i / 60; }
    return { pass: maxZ - z0 > 2 && tRev > 0.8, detail: `overshoot ${f(maxZ - z0)} m, ${f(tRev)} s until running back at 3 m/s` };
  } },
  { id: 8, name: 'Sprint turns have a realistic radius', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 4.5, { move: { x: 0, z: 1 }, sprint: true });
    const x0 = p.pos.x, z0 = p.pos.z;
    let r = 0;
    for (let i = 0; i < 240; i++) { p.input = { ...emptyInput(), move: { x: 1, z: 0 }, sprint: true }; sim.step(); if (Math.abs(p.vel.z) < 0.4) { r = Math.max(Math.abs(p.pos.x - x0), Math.abs(p.pos.z - z0)); break; } }
    return { pass: r > 5 && r < 16, detail: `90° turn at full sprint swings through ≈${f(r)} m` };
  } },
  { id: 9, name: 'Player does not float', run: async () => {
    const { sim, p } = await noBall();
    let lifted = 0;
    hold(sim, p, 4, { move: { x: 0, z: 1 }, sprint: true }, () => { if (p.pose.lift > 0.01) lifted++; });
    return { pass: lifted === 0 && Math.abs(p.physics.body.translation().y - p.physics.centerY) < 1e-4, detail: `airborne frames while running: ${lifted}` };
  } },
  { id: 10, name: 'Player does not slide (stance foot fixed)', run: async () => {
    const { sim, p } = await noBall();
    hold(sim, p, 1, { move: { x: 0, z: 1 }, jog: true });
    const a = measureSliding(sim, p, 2, { move: { x: 0, z: 1 }, jog: true });
    hold(sim, p, 1, { move: { x: 1, z: 0 } });
    const b = measureSliding(sim, p, 2, { move: { x: 1, z: 0 } });
    return { pass: a < 0.1 && b < 0.12, detail: `planted-foot drift: jog ${f(a * 100, 1)} cm, while turning ${f(b * 100, 1)} cm` };
  } },
  { id: 11, name: 'Player collisions are stable (no overlap)', run: async () => {
    const sim = await world();
    const a = sim.addPlayer({ id: 'a', name: 'A', number: 1, start: { x: 0, z: -6 } });
    const b = sim.addPlayer({ id: 'b', name: 'B', number: 2, start: { x: 0.05, z: 6 }, yaw: Math.PI });
    sim.placeBall({ x: 30, y: 0.11, z: 30 });
    let minD = 99;
    for (let i = 0; i < 240; i++) { a.input = { ...emptyInput(), move: { x: 0, z: 1 } }; b.input = { ...emptyInput(), move: { x: 0, z: -1 } }; sim.step(); minD = Math.min(minD, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)); }
    const ok = minD > a.physics.radius + b.physics.radius - 0.06 && Number.isFinite(a.pos.x);
    return { pass: ok, detail: `closest centres ${f(minD, 3)} m (bodies ${f(a.physics.radius * 2)} m wide)` };
  } },
  { id: 12, name: 'Player can lose balance', run: async () => {
    const sim = await world();
    const a = sim.addPlayer({ id: 'a', name: 'A', number: 1, start: { x: 0, z: -14 } });
    const b = sim.addPlayer({ id: 'b', name: 'B', number: 2, start: { x: 0, z: 2 }, yaw: Math.PI });
    sim.placeBall({ x: 30, y: 0.11, z: 30 });
    let lost = '';
    sim.pw.events.on((e) => { if (e.type === 'balanceLost' && !lost) lost = e.playerId; });
    for (let i = 0; i < 300; i++) { a.input = { ...emptyInput(), move: { x: 0, z: 1 }, sprint: true }; b.input = { ...emptyInput(), move: { x: 0, z: -1 }, sprint: true }; sim.step(); }
    return { pass: lost !== '', detail: lost ? `head-on sprint collision: ${lost} lost balance` : 'nobody lost balance' };
  } },
  { id: 13, name: 'Player recovers naturally', run: async () => {
    const { sim, p } = await noBall();
    p.knock(0.95);
    const first = p.sm.current;
    hold(sim, p, 3, {});
    return { pass: first === 'fall' && p.sm.current === 'idle' && p.balance > 0.9, detail: `${first} → getUp → ${p.sm.current}, balance ${f(p.balance)}` };
  } },
  { id: 14, name: 'Ball: size-5 dimensions and mass', run: async () => {
    const sim = await world();
    const b = sim.cal.ball;
    const circ = 2 * Math.PI * b.radius;
    const m = sim.ball.physics.body.mass();
    return { pass: circ >= 0.68 && circ <= 0.70 && Math.abs(m - 0.43) < 0.005, detail: `circumference ${f(circ * 100, 1)} cm, mass ${f(m, 3)} kg` };
  } },
  { id: 15, name: 'Ball rolls (not slides)', run: async () => {
    const sim = await world();
    sim.placeBall({ x: 0, y: 0.11, z: -30 }, { x: 0, y: 0, z: 8 });
    for (let i = 0; i < 90; i++) sim.step();
    const s = sim.ball.curr;
    const slip = slipSpeed(s.velocity, s.angularVelocity, sim.cal.ball.radius);
    const v1 = s.velocity.z;
    for (let i = 0; i < 120; i++) sim.step();
    const decel = (v1 - sim.ball.curr.velocity.z) / 2;
    return { pass: slip < 0.1 && decel > 0.3 && decel < 1.2, detail: `contact slip ${f(slip, 3)} m/s after 1.5 s, rolling decel ${f(decel)} m/s²` };
  } },
  { id: 16, name: 'Ball bounces naturally', run: async () => {
    const sim = await world();
    sim.placeBall({ x: 0, y: 2, z: 0 });
    const peaks: number[] = []; let up = false, prev = 2;
    for (let i = 0; i < 360; i++) { sim.step(); const y = sim.ball.curr.position.y; if (y > prev) up = true; else if (up) { peaks.push(prev); up = false; } prev = y; }
    const dec = peaks.every((p, i) => i === 0 || p <= peaks[i - 1] + 1e-3);
    const ratio = (peaks[0] - 0.11) / (2 - 0.11);
    return { pass: dec && ratio > 0.25 && ratio < 0.55, detail: `bounce peaks ${peaks.slice(0, 4).map((p) => f(p)).join(', ')} m (first rebound ${f(ratio * 100, 0)}% of drop)` };
  } },
  { id: 17, name: 'Correct ground friction (skid → roll)', run: async () => {
    const sim = await world();
    sim.placeBall({ x: 0, y: 0.11, z: -30 }, { x: 0, y: 0, z: 10 });
    let tRoll = -1;
    for (let i = 0; i < 120; i++) { sim.step(); const s = sim.ball.curr; if (tRoll < 0 && slipSpeed(s.velocity, s.angularVelocity, 0.11) < 0.15) tRoll = sim.time; }
    const v = sim.ball.curr.velocity.z;
    // Thin shell: pure rolling at 3/5 of the skid speed, minus grass resistance.
    return { pass: tRoll > 0 && tRoll < 1.0 && v > 3.8 && v < 6.5, detail: `skid becomes roll after ${f(tRoll)} s; rolling at ${f(v)} m/s from 10 m/s` };
  } },
  { id: 18, name: 'Stable air trajectories (drag)', run: async () => {
    const sim = await world();
    const v0 = 24, e = (30 * Math.PI) / 180;
    sim.placeBall({ x: 0, y: 0.11, z: -50 }, { x: 0, y: Math.sin(e) * v0, z: Math.cos(e) * v0 });
    let land = 0;
    for (let i = 0; i < 400; i++) { sim.step(); const s = sim.ball.curr; if (i > 10 && s.position.y < 0.2 && s.velocity.y < 0) { land = s.position.z + 50; break; } }
    const vac = (v0 * v0 * Math.sin(2 * e)) / 9.81;
    // Football drag at 20–30 m/s typically costs 25–35% of the vacuum range.
    return { pass: land > vac * 0.6 && land < vac * 0.9, detail: `carry ${f(land, 1)} m vs ${f(vac, 1)} m in vacuum (${f((land / vac) * 100, 0)}%)` };
  } },
  { id: 19, name: 'Believable spin (topspin dips, backspin floats)', run: async () => {
    const carry = async (top: number) => {
      const sim = await world();
      const t = BALL_TESTS[0]; void t;
      const v = { x: 0, y: 7, z: 20 };
      const { spinFromComponents } = await import('../ball/BallSpin.ts');
      sim.placeBall({ x: 0, y: 0.11, z: -50 }, v, spinFromComponents(v, { top }));
      for (let i = 0; i < 400; i++) { sim.step(); const s = sim.ball.curr; if (i > 10 && s.position.y < 0.2 && s.velocity.y < 0) return s.position.z + 50; }
      return 0;
    };
    const top = await carry(40), none = await carry(0), back = await carry(-40);
    return { pass: top < none && none < back, detail: `carry: topspin ${f(top, 1)} m < no spin ${f(none, 1)} m < backspin ${f(back, 1)} m` };
  } },
  { id: 20, name: 'Realistic curved shots', run: async () => {
    const sim = await world();
    BALL_TESTS.find((t) => t.id === 'curl')?.run(sim);
    const start = sim.ball.curr.position, v0 = sim.ball.curr.velocity;
    let maxDev = 0;
    for (let i = 0; i < 70; i++) {
      sim.step();
      const p = sim.ball.curr.position;
      const along = ((p.x - start.x) * v0.x + (p.z - start.z) * v0.z) / Math.hypot(v0.x, v0.z);
      const straight = { x: start.x + (v0.x / Math.hypot(v0.x, v0.z)) * along, z: start.z + (v0.z / Math.hypot(v0.x, v0.z)) * along };
      maxDev = Math.max(maxDev, Math.hypot(p.x - straight.x, p.z - straight.z));
    }
    return { pass: maxDev > 1 && maxDev < 5, detail: `8 rev/s sidespin bends ${f(maxDev)} m off the straight line over ~25 m` };
  } },
  { id: 21, name: 'Goalpost collisions', run: async () => {
    const sim = await world();
    BALL_TESTS.find((t) => t.id === 'post')?.run(sim);
    let hit = false, after = 0;
    sim.pw.events.on((e) => { if (e.type === 'SurfaceContact' && e.surface === 'post') hit = true; });
    for (let i = 0; i < 60; i++) { sim.step(); if (hit && !after) after = sim.ball.curr.velocity.z; }
    return { pass: hit && after < -8, detail: hit ? `hit the post, rebounded at ${f(after)} m/s` : 'missed the post' };
  } },
  { id: 22, name: 'Net collisions absorb the ball', run: async () => {
    const sim = await world();
    BALL_TESTS.find((t) => t.id === 'net')?.run(sim);
    let net = false;
    sim.pw.events.on((e) => { if (e.type === 'SurfaceContact' && e.surface === 'net') net = true; });
    for (let i = 0; i < 180; i++) sim.step();
    const p = sim.ball.curr.position, s = Math.hypot(sim.ball.curr.velocity.x, sim.ball.curr.velocity.z);
    const inGoal = p.z > 52.5 && p.z < 52.5 + 2.2 && Math.abs(p.x) < 3.7;
    return { pass: net && inGoal && s < 2, detail: `net contact ${net}, ball rests in the goal at z ${f(p.z)} (speed ${f(s)} m/s)` };
  } },
  { id: 23, name: 'No ground penetration', run: async () => {
    const sim = await world();
    let minY = 9;
    for (const t of BALL_TESTS) { t.run(sim); for (let i = 0; i < 240; i++) { sim.step(); minY = Math.min(minY, sim.ball.curr.position.y); } }
    return { pass: minY > 0.11 - 0.01, detail: `lowest ball centre across all 10 tests ${f(minY, 4)} m (radius 0.11)` };
  } },
  { id: 24, name: 'No endless jitter', run: async () => {
    const sim = await world();
    sim.placeBall({ x: 0, y: 1.5, z: 0 }, { x: 2, y: 0, z: 1 });
    for (let i = 0; i < 60 * 12; i++) sim.step();
    const v = sim.ball.curr.velocity, w = sim.ball.curr.angularVelocity;
    const rest = Math.hypot(v.x, v.y, v.z) < 0.01 && Math.hypot(w.x, w.y, w.z) < 0.05;
    return { pass: rest, detail: `after 12 s: |v| ${f(Math.hypot(v.x, v.y, v.z), 4)} m/s, |ω| ${f(Math.hypot(w.x, w.y, w.z), 4)} rad/s` };
  } },
  { id: 25, name: 'Natural close-control dribbling', run: async () => {
    const { sim, p } = await withBall();
    let touches = 0, maxGap = 0;
    sim.pw.events.on((e) => { if (e.type === 'DribbleTouch') touches++; });
    hold(sim, p, 6, { move: { x: 0, z: 1 }, jog: true }, () => { maxGap = Math.max(maxGap, Math.hypot(sim.ball.curr.position.x - p.pos.x, sim.ball.curr.position.z - p.pos.z)); });
    return { pass: p.hasBall && touches >= 8 && maxGap < 1.6, detail: `jogging 6 s: ${touches} touches, ball never more than ${f(maxGap)} m away` };
  } },
  { id: 26, name: 'Alternating-foot touches', run: async () => {
    const { sim, p } = await withBall();
    const feet: string[] = [];
    sim.pw.events.on((e) => { if (e.type === 'DribbleTouch') feet.push(e.foot); });
    hold(sim, p, 6, { move: { x: 0, z: 1 } });
    const alt = feet.slice(1).filter((x, i) => x !== feet[i]).length;
    return { pass: feet.length > 6 && alt / (feet.length - 1) > 0.7, detail: `${feet.join('')} (${alt}/${feet.length - 1} alternate)` };
  } },
  { id: 27, name: 'Short passing', run: async () => {
    const { sim, p } = await withBall();
    let kick = '';
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) kick = `${e.kind} ${f(e.speed, 1)} m/s q${f(e.quality)}`; });
    hold(sim, p, 0.3, { move: { x: 0, z: 1 }, jog: true, pass: true });
    hold(sim, p, 6, {});
    const d = Math.hypot(sim.ball.curr.position.x, sim.ball.curr.position.z);
    // Half power (0.3 s hold) ≈ 11 m/s along the turf.
    return { pass: kick.startsWith('shortPass') && d > 15 && d < 60, detail: `${kick}; ball rolled ${f(d, 1)} m` };
  } },
  { id: 28, name: 'Driven passing', run: async () => {
    const { sim, p } = await withBall();
    let kick = '';
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) kick = `${e.kind} ${f(e.speed, 1)} m/s`; });
    hold(sim, p, 0.85, { move: { x: 0, z: 1 }, jog: true, pass: true });
    hold(sim, p, 2, {});
    return { pass: kick.startsWith('drivenPass'), detail: kick || 'no kick' };
  } },
  { id: 29, name: 'Through balls', run: async () => {
    const { sim, p } = await withBall();
    let kick = '';
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) kick = `${e.kind} ${f(e.speed, 1)} m/s`; });
    hold(sim, p, 0.4, { move: { x: 0, z: 1 }, through: true });
    hold(sim, p, 5, {});
    return { pass: kick.startsWith('throughBall'), detail: `${kick}; ball at z ${f(sim.ball.curr.position.z, 1)} m` };
  } },
  { id: 30, name: 'Powerful shooting', run: async () => {
    const { sim, p } = await withBall({ x: 0, z: 30 });
    let kick = ''; let speed = 0; let goal = false;
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) { kick = e.kind; speed = e.speed; } if (e.type === 'SurfaceContact' && e.surface === 'net') goal = true; });
    hold(sim, p, 0.1, { move: { x: 0, z: 1 }, jog: true });
    hold(sim, p, 0.9, { move: { x: 0, z: 1 }, jog: true, shoot: true, powerMod: true });
    hold(sim, p, 2, {});
    return { pass: kick === 'powerShot' && speed > 25 && speed < 36, detail: `${kick} at ${f(speed, 1)} m/s${goal ? ', into the net' : ''}` };
  } },
  { id: 31, name: 'Finesse shooting curls', run: async () => {
    const { sim, p } = await withBall({ x: 0, z: 28 });
    let kick = '';
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) kick = e.kind; });
    hold(sim, p, 0.1, { move: { x: 0, z: 1 }, jog: true });
    hold(sim, p, 0.5, { move: { x: 0, z: 1 }, jog: true, shoot: true, finesse: true });
    let side = 0;
    hold(sim, p, 0.6, {}, () => { side = Math.max(side, Math.abs(sim.ball.curr.angularVelocity.y)); });
    return { pass: kick === 'finesseShot' && side > 20, detail: `${kick} with ${f(side / (2 * Math.PI), 1)} rev/s sidespin` };
  } },
  { id: 32, name: 'Lobbed / chipped shots', run: async () => {
    const { sim, p } = await withBall({ x: 0, z: 30 });
    let kick = ''; let apex = 0;
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) kick = e.kind; });
    hold(sim, p, 0.1, { move: { x: 0, z: 1 }, jog: true });
    hold(sim, p, 0.5, { move: { x: 0, z: 1 }, jog: true, shoot: true, chip: true });
    hold(sim, p, 2.5, {}, () => { apex = Math.max(apex, sim.ball.curr.position.y); });
    return { pass: kick === 'chipShot' && apex > 2.5, detail: `${kick}, apex ${f(apex)} m` };
  } },
  { id: 33, name: 'Standing tackles win the ball', run: async () => {
    const sim = await world();
    const atk = sim.addPlayer({ id: 'atk', name: 'A', number: 7, start: { x: 0, z: 0 } });
    const def = sim.addPlayer({ id: 'def', name: 'D', number: 4, start: { x: 0, z: 6 }, yaw: Math.PI });
    sim.giveBall(atk, 0.5);
    let won = false, pressed = false;
    sim.pw.events.on((e) => { if (e.type === 'TackleContact' && e.playerId === 'def' && e.won) won = true; });
    for (let i = 0; i < 240; i++) {
      atk.input = { ...emptyInput(), move: { x: 0, z: 1 }, jog: true };
      const d = Math.hypot(sim.ball.curr.position.x - def.pos.x, sim.ball.curr.position.z - def.pos.z);
      def.input = { ...emptyInput(), defend: true, standTackle: !pressed && d < 1.4 };
      if (d < 1.4) pressed = true;
      sim.step();
    }
    return { pass: won, detail: won ? 'defender poked the ball away from the dribbler' : 'tackle missed' };
  } },
  { id: 34, name: 'Sliding tackles', run: async () => {
    const sim = await world();
    const atk = sim.addPlayer({ id: 'atk', name: 'A', number: 7, start: { x: 0, z: 0 } });
    const def = sim.addPlayer({ id: 'def', name: 'D', number: 4, start: { x: 0.3, z: 12 }, yaw: Math.PI });
    sim.giveBall(atk, 0.5);
    let won = false, slid = false, minFoot = 9;
    sim.pw.events.on((e) => { if (e.type === 'TackleContact' && e.kind === 'sliding' && e.won) won = true; });
    for (let i = 0; i < 300; i++) {
      atk.input = { ...emptyInput(), move: { x: 0, z: 1 }, jog: true };
      const b = sim.ball.curr.position;
      const dx = b.x - def.pos.x, dz = b.z - def.pos.z, d = Math.hypot(dx, dz);
      def.input = { ...emptyInput(), move: { x: dx / d, z: dz / d }, slideTackle: !slid && d < 3.0 };
      if (d < 3.0) slid = true;
      sim.step();
      const a = def.sm.action;
      if (a?.clip.name === 'slidingTackle' && a.time / a.clip.duration > 0.2) minFoot = Math.min(minFoot, footWorld(def.pose, a.foot, { x: def.pos.x, y: 0, z: def.pos.z }, def.yaw, def.dims).y);
    }
    return { pass: won && minFoot < 0.25, detail: `${won ? 'slide swept the ball away' : 'slide missed'}; tackling foot ${f(minFoot)} m above the turf` };
  } },
  { id: 35, name: 'Interceptions / first touch', run: async () => {
    const sim = await world();
    const p = sim.addPlayer({ id: 'rx', name: 'Receiver', number: 8, start: { x: 0, z: 10 }, yaw: Math.PI });
    sim.placeBall({ x: 0.3, y: 0.11, z: -5 }, { x: 0, y: 0, z: 9 }, { x: 9 / 0.11, y: 0, z: 0 });
    hold(sim, p, 3, {});
    const d = Math.hypot(sim.ball.curr.position.x - p.pos.x, sim.ball.curr.position.z - p.pos.z);
    return { pass: sim.ball.lastTouchBy === 'rx' && d < 2.5, detail: `pass at 9 m/s controlled; ball ${f(d)} m from receiver afterwards` };
  } },
  { id: 36, name: 'Animation and ball contact are synchronised', run: async () => {
    const { sim, p } = await withBall({ x: 0, z: 30 });
    let kickT = -1, contactT = -1;
    sim.pw.events.on((e) => { if (e.type === 'BallImpulse' && (e.source === 'pass' || e.source === 'shot' || e.source === 'header')) kickT = e.time; });
    hold(sim, p, 0.1, { move: { x: 0, z: 1 }, jog: true });
    for (let i = 0; i < 120; i++) {
      p.input = { ...emptyInput(), move: { x: 0, z: 1 }, jog: true, shoot: i < 24 };
      sim.step();
      const a = p.sm.action;
      if (a && a.clip.name.toLowerCase().includes('shot') && contactT < 0) {
        const c = a.clip.markers.find((m) => m.kind === 'contact');
        if (c && a.time >= c.t * a.clip.duration) contactT = sim.time - 1 / 60;
      }
    }
    return { pass: kickT > 0 && Math.abs(kickT - contactT) < 0.02, detail: `ball struck at ${f(kickT, 3)} s; animation contact frame at ${f(contactT, 3)} s` };
  } },
  { id: 37, name: 'Stable fixed timestep', run: async () => {
    const ft = new FixedTimestep(1 / 60, 8);
    let steps = 0, dropped = 0;
    for (const dt of [0.001, 0.016, 0.017, 0.05, 0.3, 0.008]) dropped += ft.advance(dt, () => { steps++; }).dropped;
    // 0.084 s → 5 steps; the 0.3 s spike is capped at 8 steps (rest dropped); 0.008 s → ≤1.
    let even = 0;
    const ft2 = new FixedTimestep(1 / 60, 8);
    for (let i = 0; i < 600; i++) ft2.advance(1 / 144, () => { even++; });
    return { pass: steps >= 13 && steps <= 15 && dropped > 0.1 && Math.abs(even - 250) <= 1, detail: `spike frame capped (${steps} steps, ${dropped.toFixed(2)} s dropped); 600 frames at 144 fps → ${even} steps (expected 250)` };
  } },
  { id: 38, name: 'Same result at 30 / 60 / 120 / 144 fps', run: async () => {
    const run = async (fps: number) => {
      const { sim, p } = await withBall();
      let t = 0;
      const total = 4;
      let frame = 0;
      while (t < total - 1e-9) {
        const dt = 1 / fps;
        sim.beforeStep = () => { p.input = { ...emptyInput(), move: { x: 0.3, z: 1 }, sprint: sim.time > 1, shoot: sim.time > 2.5 && sim.time < 3 }; };
        sim.advance(dt); t += dt; frame++;
      }
      return { x: p.pos.x, z: p.pos.z, bx: sim.ball.curr.position.x, bz: sim.ball.curr.position.z, steps: sim.clock.stepCount };
    };
    const r = await Promise.all([30, 60, 120, 144].map(run));
    const ref = r[1];
    const dev = Math.max(...r.map((x) => Math.hypot(x.x - ref.x, x.z - ref.z) + Math.hypot(x.bx - ref.bx, x.bz - ref.bz)));
    return { pass: dev < 1e-6 && r.every((x) => Math.abs(x.steps - ref.steps) <= 1), detail: `max difference ${dev.toExponential(1)} m; steps ${r.map((x) => x.steps).join('/')}` };
  } },
  { id: 39, name: 'Twenty-two player instances', run: async () => {
    const sim = await world();
    const ps: PlayerController[] = [];
    for (let i = 0; i < 22; i++) ps.push(sim.addPlayer({ id: `p${i}`, name: `P${i}`, number: i + 1, start: { x: (i % 11) * 5 - 25, z: i < 11 ? -10 : 10 }, seed: i + 1 }));
    sim.placeBall({ x: 0, y: 0.11, z: 0 });
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      for (const p of ps) { const b = sim.ball.curr.position; const dx = b.x - p.pos.x, dz = b.z - p.pos.z, d = Math.hypot(dx, dz) || 1; p.input = { ...emptyInput(), move: { x: dx / d, z: dz / d } }; }
      sim.step();
    }
    const ms = (performance.now() - t0) / 300;
    const finite = ps.every((p) => Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z));
    return { pass: finite && ms < 8, detail: `${f(ms)} ms per fixed step with 22 players chasing one ball` };
  } },
  { id: 40, name: 'No major memory growth', run: async () => {
    const g = globalThis as { gc?: () => void };
    const { sim, p } = await withBall();
    hold(sim, p, 2, { move: { x: 0, z: 1 } });
    g.gc?.();
    const before = process.memoryUsage().heapUsed;
    hold(sim, p, 20, { move: { x: Math.sin(sim.time), z: 1 } });
    g.gc?.();
    const grow = (process.memoryUsage().heapUsed - before) / 1e6;
    return { pass: grow < 25, detail: `heap change over 20 s of simulation: ${f(grow, 1)} MB` };
  } },
  { id: 41, name: 'No collision instability (pile-up)', run: async () => {
    const sim = await world();
    const ps: PlayerController[] = [];
    for (let i = 0; i < 6; i++) ps.push(sim.addPlayer({ id: `p${i}`, name: `P${i}`, number: i, start: { x: Math.cos(i) * 6, z: Math.sin(i) * 6 }, seed: i + 3 }));
    sim.placeBall({ x: 0, y: 0.11, z: 0 });
    let maxV = 0;
    for (let i = 0; i < 360; i++) {
      for (const p of ps) { const dx = -p.pos.x, dz = -p.pos.z, d = Math.hypot(dx, dz) || 1; p.input = { ...emptyInput(), move: { x: dx / d, z: dz / d } }; }
      sim.step();
      for (const p of ps) maxV = Math.max(maxV, p.speed);
    }
    return { pass: maxV < 9.5 && ps.every((p) => Number.isFinite(p.pos.x)), detail: `six players crowding one spot: top speed seen ${f(maxV)} m/s (no explosions)` };
  } },
];

export async function runChecks(filter?: (c: Check) => boolean): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of CHECKS) {
    if (filter && !filter(c)) continue;
    try { const r = await c.run(); out.push({ id: c.id, name: c.name, ...r }); }
    catch (err) { out.push({ id: c.id, name: c.name, pass: false, detail: `threw: ${err instanceof Error ? err.message : String(err)}` }); }
  }
  return out;
}
