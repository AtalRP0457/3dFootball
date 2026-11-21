import { useLabStore } from './labStore.ts';

const f = (n: number, d = 2) => n.toFixed(d);

function Bar({ v, color }: { v: number; color: string }) {
  return <span className="lab-bar"><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} /></span>;
}

export function PlayerDebugPanel() {
  const s = useLabStore((st) => st.stats);
  if (!s) return null;
  const p = s.player;
  return (
    <section className="lab-panel">
      <h3>Player</h3>
      <dl>
        <dt>Speed</dt><dd>{f(p.speed)} m/s <small>({f(p.speed * 3.6, 1)} km/h)</small></dd>
        <dt>Acceleration</dt><dd>{f(p.accel)} m/s²</dd>
        <dt>Direction</dt><dd>{f(p.heading, 0)}°</dd>
        <dt>Animation</dt><dd><b>{p.animation}</b></dd>
        <dt>Movement</dt><dd>{p.movement}</dd>
        <dt>Stamina</dt><dd><Bar v={p.stamina} color="#4cd37a" /> {f(p.stamina * 100, 0)}%</dd>
        <dt>Balance</dt><dd><Bar v={p.balance} color="#ffc72c" /> {f(p.balance * 100, 0)}%</dd>
        <dt>Ground contact</dt><dd>{p.grounded ? 'grounded' : 'airborne'} · support {p.supportFoot} · phase {f(p.gaitPhase)}</dd>
        <dt>Collision</dt><dd className={p.colliding ? 'warn' : ''}>{p.colliding ? 'in contact' : 'clear'}</dd>
        <dt>Possession</dt><dd>{p.hasBall ? 'dribbling' : '—'}{p.pending ? ` · lining up ${p.pending}` : ''}</dd>
      </dl>
      <div className="lab-charges">
        {(['pass', 'through', 'lob', 'shoot'] as const).map((k) => (
          <span key={k}><em>{k}</em><Bar v={p.charge[k]} color="#5aa0ff" /></span>
        ))}
      </div>
    </section>
  );
}
