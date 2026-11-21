// GOLD STANDARD PLAYER & BALL LAB
// One reference footballer, one reference ball, a full training pitch.
// The engine steps at a fixed 60 Hz (accumulator); rendering runs at the
// display rate or a chosen cap and interpolates between physics states.
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BallModel, type RenderClock } from '../ball/BallModel.tsx';
import { decomposeSpin } from '../ball/BallSpin.ts';
import type { TrajectoryPoint } from '../ball/BallTypes.ts';
import type { PhysicsEvent } from '../physics/PhysicsEvents.ts';
import type { Simulation } from '../physics/Simulation.ts';
import { PlayerModel, type KitColours } from '../player/PlayerModel.tsx';
import type { PlayerController } from '../player/PlayerController.ts';
import { footWorld } from '../player/PlayerRig.ts';
import { BallDebugPanel, BallLabPanel } from './BallDebugPanel.tsx';
import { BALL_TESTS } from './BallTestPresets.ts';
import { LabEnvironment } from './LabEnvironment.tsx';
import { LabInput, SKILL_KEYS } from './LabInput.ts';
import { useLabStore, type CameraMode, type FpsCap, type LabStats, type SparringMode } from './labStore.ts';
import { PlayerDebugPanel } from './PlayerDebugPanel.tsx';
import { sparringInput } from './SparringAI.ts';

const USER_KIT: KitColours = { shirt: '#1b3fa8', secondary: '#ffc72c', shorts: '#0b1533', socks: '#1b3fa8', gk: '#2e7d32', design: 'plain' };
const SPAR_KIT: KitColours = { shirt: '#c8102e', secondary: '#ffffff', shorts: '#ffffff', socks: '#c8102e', gk: '#2e7d32', design: 'plain' };

interface Shared {
  clock: RenderClock;
  camYaw: { current: number };
  predicted: { current: TrajectoryPoint[] };
  fps: { current: number };
}

function describe(e: PhysicsEvent): string | null {
  const t = e.time.toFixed(2);
  switch (e.type) {
    case 'ballKick': return `${t}s ${e.kind} ${e.speed.toFixed(1)} m/s · ${e.foot} foot · contact ${(e.quality * 100).toFixed(0)}%`;
    case 'ballTouch': return `${t}s touch ${e.foot} · ${e.speed.toFixed(1)} m/s`;
    case 'ballContact': return e.surface === 'ground' && e.speed < 3 ? null : `${t}s ball hit ${e.surface} at ${e.speed.toFixed(1)} m/s`;
    case 'tackle': return `${t}s ${e.kind} tackle ${e.won ? 'won the ball' : 'missed'}`;
    case 'playerCollision': return `${t}s collision ${e.impulse.toFixed(0)} N·s`;
    case 'balanceLost': return `${t}s ${e.playerId} lost balance`;
    default: return null;
  }
}

// ------------------------------------------------------------ loop driver
function LoopDriver({ sim, user, shared }: { sim: Simulation; user: PlayerController; shared: Shared }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let raf = 0, lastRender = performance.now(), lastPublish = 0, frames = 0, fpsT = lastRender;
    let stepsAtPublish = sim.clock.stepCount, publishT = lastRender;
    const log: string[] = [];
    const off = sim.pw.events.on((e) => {
      const s = describe(e);
      if (s) { log.push(s); if (log.length > 30) log.shift(); }
      if (e.type === 'ballKick') shared.predicted.current = sim.ball.predict(5);
    });
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const st = useLabStore.getState();
      const elapsed = (now - lastRender) / 1000;
      if (st.fpsCap && elapsed < 1 / st.fpsCap - 0.0015) return;
      lastRender = now;
      let dt = Math.min(0.25, elapsed);
      if (st.paused) dt = 0;
      if (st.slowmo) dt *= 0.25;
      const r = sim.advance(dt);
      shared.clock.alpha = r.alpha;
      advance(now / 1000);
      frames++;
      if (now - fpsT > 500) { shared.fps.current = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
      if (now - lastPublish > 100) {
        const hz = ((sim.clock.stepCount - stepsAtPublish) * 1000) / Math.max(1, now - publishT);
        stepsAtPublish = sim.clock.stepCount; publishT = now; lastPublish = now;
        useLabStore.getState().set({ stats: collectStats(sim, user, log, shared.fps.current, st.paused ? 0 : hz) });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); off(); };
  }, [sim, user, shared, advance]);
  return null;
}

function collectStats(sim: Simulation, p: PlayerController, events: string[], fps: number, hz: number): LabStats {
  const b = sim.ball.curr;
  const sp = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
  const heading = ((Math.atan2(p.vel.x, p.vel.z) * 180) / Math.PI + 360) % 360;
  return {
    player: {
      speed: p.speed, accel: Math.hypot(p.accel.x, p.accel.z), heading, animation: p.sm.current, movement: p.movement,
      stamina: p.stamina, balance: p.balance, grounded: p.pose.lift < 0.02, colliding: p.colliding, hasBall: p.hasBall,
      supportFoot: p.contact.supportFoot(p.gait), gaitPhase: p.contact.phase,
      charge: { pass: p.charge('pass', sim.time), through: p.charge('through', sim.time), lob: p.charge('lob', sim.time), shoot: p.charge('shoot', sim.time) },
      pending: p.pending?.kind ?? null,
    },
    ball: {
      speed: sp, position: [b.position.x, b.position.y, b.position.z], velocity: [b.velocity.x, b.velocity.y, b.velocity.z],
      angular: [b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z], spin: decomposeSpin(b.velocity, b.angularVelocity),
      height: b.position.y - sim.cal.ball.radius, grounded: b.grounded, lastSurface: b.lastContact?.surface ?? '—', lastTouchBy: sim.ball.lastTouchBy ?? '—',
    },
    events: [...events], fps, physicsHz: hz, simTime: sim.time,
  };
}

// ------------------------------------------------------------ camera
function CameraRig({ sim, user, shared }: { sim: Simulation; user: PlayerController; shared: Shared }) {
  const { camera, gl } = useThree();
  const mode = useLabStore((s) => s.camera);
  const ballTab = useLabStore((s) => s.tab === 'ball');
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { controls.enabled = mode === 'free'; controls.enableDamping = true; }, [controls, mode]);
  useEffect(() => () => controls.dispose(), [controls]);
  useFrame((_, dt) => {
    // In the Ball Physics Lab the camera watches the ball, otherwise the player.
    const a = ballTab ? sim.ball.prev.position : user.prev.position, b = ballTab ? sim.ball.curr.position : user.curr.position, t = shared.clock.alpha;
    target.set(a.x + (b.x - a.x) * t, 1.0, a.z + (b.z - a.z) * t);
    const k = 1 - Math.exp(-dt * 4);
    if (mode === 'follow') {
      // Behind the player looking up the pitch (+z), like an end-to-end view.
      want.set(target.x * 0.85, 4.6, target.z - 9.5);
      camera.position.lerp(want, k);
      camera.lookAt(target.x, 0.9, target.z + 4);
      shared.camYaw.current = 0;
    } else if (mode === 'side') {
      // Close, side-on, at hip height: for judging animation and foot contact.
      want.set(target.x - 6.5, 1.5, target.z);
      camera.position.lerp(want, 1 - Math.exp(-dt * 8));
      camera.lookAt(target.x, 0.85, target.z);
      shared.camYaw.current = Math.PI / 2;
    } else if (mode === 'broadcast') {
      want.set(-30, 14, target.z * 0.9);
      camera.position.lerp(want, k);
      camera.lookAt(target.x * 0.5, 0.5, target.z);
      shared.camYaw.current = Math.PI / 2;
    } else {
      controls.target.lerp(target, k);
      controls.update();
      shared.camYaw.current = Math.atan2(controls.target.x - camera.position.x, controls.target.z - camera.position.z);
    }
  });
  return null;
}

function SunShadow({ user }: { user: PlayerController }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const p = user.curr.position;
    l.position.set(p.x + 18, 36, p.z - 14);
    l.target.position.set(p.x, 0, p.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight ref={light} intensity={2.4} color="#fff6e5" castShadow
      shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004}
      shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={90} />
  );
}

// ------------------------------------------------------------ overlays
const LINE_CAP = 1024;
/** A line with a fixed-size buffer; points beyond the capacity are dropped. */
function fixedLine(material: THREE.LineBasicMaterial | THREE.LineDashedMaterial): THREE.Line {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_CAP * 3), 3));
  g.setDrawRange(0, 0);
  const line = new THREE.Line(g, material);
  line.frustumCulled = false;
  return line;
}
function writeLine(line: THREE.Line, pts: ReadonlyArray<{ x: number; y: number; z: number }>): void {
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const n = Math.min(pts.length, LINE_CAP);
  for (let i = 0; i < n; i++) attr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
}

function Overlays({ sim, user, shared }: { sim: Simulation; user: PlayerController; shared: Shared }) {
  const trail = useMemo(() => fixedLine(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })), []);
  const pred = useMemo(() => fixedLine(new THREE.LineDashedMaterial({ color: '#36d6ff', dashSize: 0.4, gapSize: 0.25 })), []);
  const vel = useMemo(() => new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0xffc72c, 0.3, 0.18), []);
  const bvel = useMemo(() => new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0x36d6ff, 0.2, 0.12), []);
  const footL = useRef<THREE.Mesh>(null), footR = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const c = sim.ball.curr.position;
    writeLine(trail, [...sim.ball.trail, c]);
    writeLine(pred, shared.predicted.current.map((p) => p.p));
    pred.computeLineDistances();
    const p = user.curr;
    vel.position.set(p.position.x, 0.05, p.position.z);
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    vel.visible = sp > 0.2;
    if (sp > 0.2) { vel.setDirection(tmp.set(p.velocity.x / sp, 0, p.velocity.z / sp)); vel.setLength(Math.max(0.5, sp * 0.4), 0.3, 0.18); }
    const bv = sim.ball.curr.velocity, bs = Math.hypot(bv.x, bv.y, bv.z);
    bvel.position.set(c.x, c.y, c.z);
    bvel.visible = bs > 0.3;
    if (bs > 0.3) { bvel.setDirection(tmp.set(bv.x / bs, bv.y / bs, bv.z / bs)); bvel.setLength(Math.max(0.4, bs * 0.12), 0.2, 0.12); }
    for (const [ref, side] of [[footL, 'L'], [footR, 'R']] as const) {
      const m = ref.current;
      if (!m) continue;
      const fw = footWorld(user.pose, side, { x: user.pos.x, y: 0, z: user.pos.z }, user.yaw, user.dims);
      m.position.set(fw.x, fw.y, fw.z);
    }
    if (ring.current) ring.current.position.set(p.position.x, 0.01, p.position.z);
  });
  return (
    <group>
      <primitive object={trail} />
      <primitive object={pred} />
      <primitive object={vel} />
      <primitive object={bvel} />
      <mesh ref={footL}><sphereGeometry args={[0.045, 12, 8]} /><meshBasicMaterial color="#36d6ff" depthTest={false} /></mesh>
      <mesh ref={footR}><sphereGeometry args={[0.045, 12, 8]} /><meshBasicMaterial color="#ff5a6a" depthTest={false} /></mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[user.tuning.interceptReach - 0.02, user.tuning.interceptReach + 0.02, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ guide
function ControlsGuide() {
  const rows: Array<[string, string]> = [
    ['W A S D', 'Move (relative to camera)'], ['Shift', 'Sprint'], ['Q / Alt', 'Jog / walk'],
    ['J', 'Short pass (hold = driven)'], ['K', 'Through ball'], ['I', 'Lob (hold = long; wide = cross)'],
    ['L', 'Shoot (hold for power)'], ['E / R / T / F + L', 'Finesse / low driven / chip / power shot'],
    ['C', 'Defensive stance · jockey · shield'], ['X', 'Standing tackle'], ['Z', 'Sliding tackle'],
    ['B', 'Jump / header'], ['G', 'Celebrate'],
  ];
  return (
    <section className="lab-panel lab-guide">
      <h3>Controls</h3>
      <dl>{rows.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
      <h4>Space + number: skill moves</h4>
      <dl>{SKILL_KEYS.map(([code, , label]) => <div key={code}><dt><kbd>Space+{code.replace('Digit', '')}</kbd></dt><dd>{label}</dd></div>)}</dl>
      <h4>Lab</h4>
      <dl>
        <div><dt><kbd>Backspace</kbd></dt><dd>Ball to feet</dd></div><div><dt><kbd>N</kbd></dt><dd>Reset to centre spot</dd></div><div><dt><kbd>V</kbd></dt><dd>Camera (behind / side / broadcast / free)</dd></div>
        <div><dt><kbd>P</kbd> / <kbd>M</kbd></dt><dd>Pause / slow motion</dd></div><div><dt><kbd>O</kbd> / <kbd>H</kbd></dt><dd>Overlays / this guide</dd></div>
      </dl>
    </section>
  );
}

// ------------------------------------------------------------ 3D scene
interface SceneProps { sim: Simulation; user: PlayerController; shared: Shared; spar: MutableRefObject<PlayerController | null>; sparring: SparringMode; overlays: boolean }
const LabScene = memo(function LabScene({ sim, user, shared, spar, sparring, overlays }: SceneProps) {
  return (
    <Canvas shadows frameloop="never" dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 45, near: 0.1, far: 500, position: [0, 4.6, user.pos.z - 9.5] }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}>
      <LoopDriver sim={sim} user={user} shared={shared} />
      <CameraRig sim={sim} user={user} shared={shared} />
      <SunShadow user={user} />
      <LabEnvironment pitch={sim.cal.pitch} />
      <PlayerModel player={user} kit={USER_KIT} clock={shared.clock} />
      {spar.current && sparring !== 'off' ? <PlayerModel key={spar.current.id} player={spar.current} kit={SPAR_KIT} clock={shared.clock} /> : null}
      <BallModel ball={sim.ball} clock={shared.clock} radius={sim.cal.ball.radius} />
      {overlays ? <Overlays sim={sim} user={user} shared={shared} /> : null}
    </Canvas>
  );
});

function LabMeta() {
  const s = useLabStore((x) => x.stats);
  return <div className="lab-meta">{s ? `${s.fps.toFixed(0)} fps · physics ${s.physicsHz.toFixed(0)} Hz · t ${s.simTime.toFixed(1)} s` : 'starting…'}</div>;
}

// ------------------------------------------------------------ main
export function PlayerBallLab({ sim, user }: { sim: Simulation; user: PlayerController }) {
  // Subscribe to UI settings only (not the 10 Hz stats) so the 3D scene does not re-render.
  const st = {
    camera: useLabStore((x) => x.camera), fpsCap: useLabStore((x) => x.fpsCap), sparring: useLabStore((x) => x.sparring),
    paused: useLabStore((x) => x.paused), slowmo: useLabStore((x) => x.slowmo), showOverlays: useLabStore((x) => x.showOverlays),
    showPanels: useLabStore((x) => x.showPanels), showGuide: useLabStore((x) => x.showGuide), tab: useLabStore((x) => x.tab),
    set: useLabStore((x) => x.set),
  };
  const shared = useMemo<Shared>(() => ({ clock: { alpha: 1 }, camYaw: { current: 0 }, predicted: { current: [] }, fps: { current: 0 } }), []);
  const input = useMemo(() => new LabInput(), []);
  const sparRef = useRef<PlayerController | null>(null);

  // Inputs are sampled once per fixed physics step.
  useEffect(() => {
    sim.beforeStep = () => {
      user.input = input.read(shared.camYaw.current);
      const sp = sparRef.current;
      if (sp) sp.input = sparringInput(sp, user, sim.ball, useLabStore.getState().sparring, sim.time);
    };
    return () => { sim.beforeStep = null; };
  }, [sim, user, input, shared]);

  const resetPosition = () => {
    user.teleport({ x: 0, z: 0 }, 0);
    ballToFeet();
  };
  const ballToFeet = () => {
    const f = { x: Math.sin(user.yaw), z: Math.cos(user.yaw) };
    sim.ball.reset({ x: user.pos.x + f.x * 0.6, y: sim.cal.ball.radius, z: user.pos.z + f.z * 0.6 });
    sim.ball.touched(user.id, 'touch');
    shared.predicted.current = [];
  };

  useEffect(() => {
    input.attach();
    input.onKey = (code) => {
      const s = useLabStore.getState();
      const modes: CameraMode[] = ['follow', 'side', 'broadcast', 'free'];
      if (code === 'KeyV') s.set({ camera: modes[(modes.indexOf(s.camera) + 1) % modes.length] });
      if (code === 'KeyN') resetPosition();
      if (code === 'KeyP') s.set({ paused: !s.paused });
      if (code === 'KeyM') s.set({ slowmo: !s.slowmo });
      if (code === 'KeyO') s.set({ showOverlays: !s.showOverlays });
      if (code === 'KeyH') s.set({ showGuide: !s.showGuide });
      if (code === 'Tab') s.set({ tab: s.tab === 'player' ? 'ball' : 'player' });
      if (code === 'Backspace') ballToFeet();
    };
    return () => input.detach();
  });

  // Sparring partner: same controller, AI input.
  useEffect(() => {
    if (st.sparring === 'off') {
      if (sparRef.current) { sim.removePlayer(sparRef.current.id); sparRef.current = null; }
      return;
    }
    if (!sparRef.current) {
      const p = sim.addPlayer({ id: 'sparring', name: 'Sparring Partner', number: 4, start: { x: user.pos.x + 2, z: user.pos.z + 8 }, yaw: Math.PI, seed: 99 });
      sparRef.current = p;
      if (st.sparring === 'dribbler') { sim.ball.reset({ x: p.pos.x, y: sim.cal.ball.radius, z: p.pos.z - 0.6 }); sim.ball.touched(p.id, 'touch'); }
    }
  }, [st.sparring, sim, user]);

  const runTest = (id: string) => {
    const t = BALL_TESTS.find((x) => x.id === id);
    if (!t) return;
    useLabStore.getState().set({ sparring: 'off', lastTest: id, tab: 'ball' });
    user.teleport({ x: -14, z: 22 }, Math.PI / 2);
    t.run(sim);
    sim.ball.lastTouchBy = null;
    shared.predicted.current = sim.ball.predict(6);
  };

  return (
    <div className="lab">
      <LabScene sim={sim} user={user} shared={shared} spar={sparRef} sparring={st.sparring} overlays={st.showOverlays} />

      <header className="lab-top">
        <div className="lab-title"><b>GOLD STANDARD</b> Player &amp; Ball Lab</div>
        <LabMeta />
        <label>Camera
          <select value={st.camera} onChange={(e) => st.set({ camera: e.target.value as CameraMode })}>
            <option value="follow">Behind (follow)</option><option value="side">Side (animation)</option><option value="broadcast">Broadcast</option><option value="free">Free orbit</option>
          </select>
        </label>
        <label>Render cap
          <select value={st.fpsCap} onChange={(e) => st.set({ fpsCap: Number(e.target.value) as FpsCap })}>
            <option value={0}>Display rate</option><option value={30}>30 fps</option><option value={60}>60 fps</option><option value={120}>120 fps</option><option value={144}>144 fps</option>
          </select>
        </label>
        <label>Sparring
          <select value={st.sparring} onChange={(e) => st.set({ sparring: e.target.value as SparringMode })}>
            <option value="off">Off</option><option value="defender">Defender (presses you)</option><option value="dribbler">Dribbler (tackle him)</option><option value="passer">Passer (plays you in)</option>
          </select>
        </label>
        <button type="button" onClick={() => st.set({ paused: !st.paused })}>{st.paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className={st.slowmo ? 'on' : ''} onClick={() => st.set({ slowmo: !st.slowmo })}>Slow-mo</button>
        <button type="button" className={st.showOverlays ? 'on' : ''} onClick={() => st.set({ showOverlays: !st.showOverlays })}>Overlays</button>
        <button type="button" className={st.showPanels ? 'on' : ''} onClick={() => st.set({ showPanels: !st.showPanels })}>Panels</button>
        <button type="button" onClick={ballToFeet}>Ball to feet</button>
        <button type="button" onClick={resetPosition}>Reset position</button>
      </header>

      {st.showPanels ? (
        <aside className="lab-left">
          <PlayerDebugPanel />
          <BallDebugPanel />
        </aside>
      ) : null}
      <aside className="lab-right">
        <nav className="lab-tabs">
          <button type="button" className={st.tab === 'player' ? 'on' : ''} onClick={() => st.set({ tab: 'player' })}>Player lab</button>
          <button type="button" className={st.tab === 'ball' ? 'on' : ''} onClick={() => st.set({ tab: 'ball' })}>Ball physics lab</button>
        </nav>
        {st.tab === 'ball' ? <BallLabPanel cal={sim.cal} onTest={runTest} onCalibrate={() => sim.refreshMaterials()} /> : st.showGuide ? <ControlsGuide /> : null}
      </aside>
    </div>
  );
}
