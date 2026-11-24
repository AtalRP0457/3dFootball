// Engine ground-roll calibration: a ball launched along the ground with the
// pass spin (85 % of rolling) vs the analytic drag + rolling-resistance model.
import { Simulation } from '../../packages/game-engine/physics/Simulation.ts';
import { createCalibration } from '../../packages/game-engine/physics/PhysicsConfig.ts';
import { RAPIER } from '../../packages/game-engine/physics/PhysicsWorld.ts';
import { rollingSpin } from '../../packages/game-engine/ball/BallSpin.ts';
await RAPIER.init();
const cal = createCalibration();
const b = cal.ball, g = cal.world.gravity;
const k = (0.5 * b.airDensity * b.dragCoefficient * Math.PI * b.radius * b.radius) / b.mass;
const a = b.rollingResistance * g;
console.log(`k ${k.toFixed(5)} /m, a ${a.toFixed(3)} m/s2`);
for (const v0 of [6, 10, 14, 18, 22]) {
  const sim = new Simulation(cal);
  const v = { x: v0, y: 0, z: 0 };
  const rs = rollingSpin(v, b.radius);
  sim.placeBall({ x: -50, y: b.radius, z: 0 }, v, { x: rs.x * 0.85, y: 0, z: rs.z * 0.85 });
  const marks = [5, 10, 20, 30, 40];
  const out: string[] = [];
  let t = 0, mi = 0;
  while (t < 8 && mi < marks.length) {
    sim.step(); t += cal.world.fixedDt;
    sim.ball.capture(); const s = sim.ball.curr;
    const d = s.position.x + 50;
    if (d >= marks[mi]) {
      const sp = Math.hypot(s.velocity.x, s.velocity.z);
      // analytic: speed and time at d from v0
      const c = Math.sqrt(a / k), p0 = Math.atan(v0 / c), cosP = Math.cos(p0) * Math.exp(k * marks[mi]);
      const ana = cosP < 1 ? c * Math.tan(Math.acos(cosP)) : 0;
      const tA = cosP < 1 ? (p0 - Math.acos(cosP)) / Math.sqrt(a * k) : Infinity;
      out.push(`${marks[mi]}m: ${sp.toFixed(2)}@${t.toFixed(2)}s (ana ${ana.toFixed(2)}@${tA.toFixed(2)}s)`);
      mi++;
    }
  }
  console.log(`v0 ${v0}: ${out.join('  ')}`);
  sim.dispose();
}
