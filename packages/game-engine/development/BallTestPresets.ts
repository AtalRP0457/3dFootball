// The ten Ball Physics Lab scenarios. Each sets an initial ball state on the
// real Rapier ball (no scripted motion afterwards) towards the +z goal.
import { spinFromComponents } from '../ball/BallSpin.ts';
import type { Simulation } from '../physics/Simulation.ts';
import type { Vec3 } from '../physics/Vec3.ts';

export interface BallTest { id: string; label: string; detail: string; run(sim: Simulation): void }

const D2R = Math.PI / 180;
function launch(sim: Simulation, p: Vec3, speed: number, elevDeg: number, headingDeg: number, spin: { top?: number; side?: number } = {}): void {
  const h = headingDeg * D2R, e = elevDeg * D2R;
  const v = { x: Math.sin(h) * Math.cos(e) * speed, y: Math.sin(e) * speed, z: Math.cos(h) * Math.cos(e) * speed };
  sim.placeBall(p, v, spinFromComponents(v, spin));
}
const groundY = (sim: Simulation) => sim.cal.ball.radius;

export const BALL_TESTS: readonly BallTest[] = [
  { id: 'roll', label: '1 · Rolling', detail: '8 m/s ground ball, struck without spin: skids, then rolls', run: (s) => launch(s, { x: -6, y: groundY(s), z: 10 }, 8, 0, 0) },
  { id: 'short', label: '2 · Short kick', detail: '10 m/s pass with natural roll', run: (s) => launch(s, { x: -6, y: groundY(s), z: 10 }, 10, 1, 0, { top: 10 / 0.11 * 0.8 }) },
  { id: 'power', label: '3 · Power shot', detail: '30 m/s from 24 m, 6°, light topspin', run: (s) => launch(s, { x: 0, y: groundY(s), z: 28.5 }, 30, 6, 0, { top: 10 }) },
  { id: 'long', label: '4 · Long pass', detail: '24 m/s at 28°, backspin', run: (s) => launch(s, { x: -20, y: groundY(s), z: -10 }, 24, 28, 25, { top: -14 }) },
  { id: 'lob', label: '5 · Lob', detail: '15 m/s at 50°, strong backspin', run: (s) => launch(s, { x: 0, y: groundY(s), z: 26 }, 15, 50, 0, { top: -30 }) },
  { id: 'cross', label: '6 · Cross', detail: 'From the right wing, 22°, in-swinging curl', run: (s) => launch(s, { x: -30, y: groundY(s), z: 40 }, 24, 20, 75, { side: -35, top: -8 }) },
  { id: 'curl', label: '7 · Curved shot', detail: '25 m/s, 8 rev/s sidespin, bends to the far post', run: (s) => launch(s, { x: 8, y: groundY(s), z: 30 }, 25, 10, -20, { side: 50 }) },
  { id: 'bounce', label: '8 · Bouncing', detail: 'Dropped from 3 m: shrinking bounces, then rest', run: (s) => s.placeBall({ x: -4, y: 3, z: 20 }) },
  { id: 'post', label: '9 · Goalpost', detail: '22 m/s straight at the right post', run: (s) => launch(s, { x: -3.72, y: 1.0, z: 40 }, 22, 2, 0) },
  { id: 'net', label: '10 · Net', detail: '24 m/s into the roof of the net', run: (s) => launch(s, { x: 1.5, y: groundY(s), z: 36 }, 24, 9, 0, { top: 6 }) },
];
