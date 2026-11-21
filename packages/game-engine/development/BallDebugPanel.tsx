import { useState } from 'react';
import { useLabStore } from './labStore.ts';
import { BALL_TESTS } from './BallTestPresets.ts';
import type { PhysicsCalibration } from '../physics/PhysicsConfig.ts';
import { PHYSICS_DEFAULTS } from '../physics/PhysicsConfig.ts';

const f = (n: number, d = 2) => n.toFixed(d);
const v3 = (v: [number, number, number], d = 2) => `${f(v[0], d)}, ${f(v[1], d)}, ${f(v[2], d)}`;
const REV = 1 / (2 * Math.PI);

export function BallDebugPanel() {
  const s = useLabStore((st) => st.stats);
  if (!s) return null;
  const b = s.ball;
  return (
    <section className="lab-panel">
      <h3>Ball</h3>
      <dl>
        <dt>Possession owner</dt><dd>{b.owner}</dd>
        <dt>Possession state</dt><dd><b>{b.possessionState}</b></dd>
        <dt>Physics state</dt><dd>{b.physicsState}</dd>
        <dt>Speed</dt><dd>{f(b.speed)} m/s <small>({f(b.speed * 3.6, 1)} km/h)</small></dd>
        <dt>Position</dt><dd>{v3(b.position)}</dd>
        <dt>Linear velocity</dt><dd>{v3(b.velocity)}</dd>
        <dt>Angular velocity</dt><dd>{v3(b.angular, 1)} rad/s</dd>
        <dt>Spin</dt><dd>top {f(b.spin.top * REV, 1)} · side {f(b.spin.side * REV, 1)} rev/s</dd>
        <dt>Height</dt><dd>{f(b.height)} m</dd>
        <dt>Contact</dt><dd>{b.grounded ? 'on the ground' : 'in the air'} · last: {b.lastSurface}</dd>
        <dt>Last contact</dt><dd>{b.lastContact}</dd>
        <dt>Last impulse</dt><dd>{b.lastImpulse}</dd>
      </dl>
      <h4>Event log</h4>
      <ol className="lab-events">{s.events.slice(-14).reverse().map((e, i) => <li key={i}>{e}</li>)}</ol>
    </section>
  );
}

type BallKey = keyof PhysicsCalibration['ball'];
const SLIDERS: Array<[BallKey, string, number, number, number]> = [
  ['dragCoefficient', 'Drag Cd', 0.1, 0.5, 0.01],
  ['magnusScale', 'Magnus scale', 0, 2, 0.05],
  ['rollingResistance', 'Rolling resistance', 0.01, 0.15, 0.005],
  ['groundRestitution', 'Bounce (restitution)', 0.3, 0.9, 0.01],
  ['groundFriction', 'Turf friction', 0.1, 1.2, 0.05],
  ['spinDecayTime', 'Spin decay τ (s)', 1, 15, 0.5],
];

export function BallLabPanel({ cal, onTest, onCalibrate }: { cal: PhysicsCalibration; onTest: (id: string) => void; onCalibrate: () => void }) {
  const lastTest = useLabStore((st) => st.lastTest);
  const [, force] = useState(0);
  return (
    <section className="lab-panel">
      <h3>Ball Physics Lab</h3>
      <div className="lab-tests">
        {BALL_TESTS.map((t) => (
          <button key={t.id} type="button" className={lastTest === t.id ? 'on' : ''} title={t.detail} onClick={() => onTest(t.id)}>{t.label}</button>
        ))}
      </div>
      <p className="lab-note">{BALL_TESTS.find((t) => t.id === lastTest)?.detail ?? 'Launch a test. The cyan line is the predicted path, the white trail the real one.'}</p>
      <h4>Calibration <small>(developer only, not saved)</small></h4>
      {SLIDERS.map(([k, label, min, max, step]) => (
        <label key={k} className="lab-slider">
          <span>{label}</span>
          <input type="range" min={min} max={max} step={step} value={cal.ball[k]}
            onChange={(e) => { cal.ball[k] = Number(e.target.value); onCalibrate(); force((n) => n + 1); }} />
          <b>{f(cal.ball[k], 3)}</b>
        </label>
      ))}
      <button type="button" className="lab-reset" onClick={() => { Object.assign(cal.ball, PHYSICS_DEFAULTS.ball); onCalibrate(); force((n) => n + 1); }}>Reset to defaults</button>
    </section>
  );
}
