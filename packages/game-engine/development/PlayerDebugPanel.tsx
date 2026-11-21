import { useLabStore } from './labStore.ts';

const f = (n: number, d = 2) => n.toFixed(d);

function Bar({ v, color }: { v: number; color: string }) {
  return <span className="lab-bar"><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} /></span>;
}

export function PlayerDebugPanel() {
  const s = useLabStore((st) => st.stats);
  if (!s) return null;
  const p = s.player, i = s.input;
  const key = (k: 'J' | 'K' | 'I' | 'L') => <kbd className={i.held[k] ? 'on' : ''}>{k}</kbd>;
  return (
    <section className="lab-panel">
      <h3>Player</h3>
      <dl>
        <dt>Movement state</dt><dd>{p.movement}</dd>
        <dt>Animation</dt><dd><b>{p.animation}</b></dd>
        <dt>Current action</dt><dd>{p.action}{p.pending ? ` · ${p.pending}` : ''}</dd>
        <dt>Velocity</dt><dd>{f(p.velocity[0])}, {f(p.velocity[1])} · {f(p.speed)} m/s <small>({f(p.speed * 3.6, 1)} km/h)</small></dd>
        <dt>Direction</dt><dd>{f(p.heading, 0)}°</dd>
        <dt>Stick input</dt><dd>{f(p.stick[0])}, {f(p.stick[1])}</dd>
        <dt>Possession</dt><dd className={p.hasBall ? 'good' : ''}>{p.possession}</dd>
        <dt>Selected foot</dt><dd>{p.selectedFoot === 'L' ? 'left' : 'right'}</dd>
        <dt>Acceleration</dt><dd>{f(p.accel)} m/s²</dd>
        <dt>Stamina</dt><dd><Bar v={p.stamina} color="#4cd37a" /> {f(p.stamina * 100, 0)}%</dd>
        <dt>Balance</dt><dd><Bar v={p.balance} color="#ffc72c" /> {f(p.balance * 100, 0)}%</dd>
        <dt>Ground contact</dt><dd>{p.grounded ? 'grounded' : 'airborne'} · support {p.supportFoot}</dd>
        <dt>Collision</dt><dd className={p.colliding ? 'warn' : ''}>{p.colliding ? 'in contact' : 'clear'}</dd>
      </dl>
      <h4>Input</h4>
      <dl>
        <dt>Buttons held</dt><dd className="lab-keys">{key('J')}{key('K')}{key('I')}{key('L')}</dd>
        <dt>Hold duration</dt><dd>{f(i.hold)} s</dd>
        <dt>Power</dt><dd><Bar v={i.power} color="#5aa0ff" /> {i.power ? `${f(i.power * 100, 0)}%` : '—'}</dd>
        <dt>Last release</dt><dd>{i.last}</dd>
      </dl>
    </section>
  );
}
