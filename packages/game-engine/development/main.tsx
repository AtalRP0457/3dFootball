// Entry point for /dev/player-ball-lab.html
import { createRoot } from 'react-dom/client';
import { Simulation } from '../physics/Simulation.ts';
import { PlayerBallLab } from './PlayerBallLab.tsx';
import './lab.css';

async function start(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root missing');
  const sim = await Simulation.create();
  const user = sim.addPlayer({ id: 'reference', name: 'Reference Player', number: 10, start: { x: 0, z: 12 }, yaw: 0, seed: 7 });
  sim.ball.reset({ x: 0, y: sim.cal.ball.radius, z: 12.6 });
  sim.ball.touched(user.id, 'touch');
  createRoot(root).render(<PlayerBallLab sim={sim} user={user} />);
}

start().catch((err: unknown) => {
  const el = document.getElementById('root');
  if (el) el.textContent = `Lab failed to start: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
