// Training pitch for the lab: striped grass, full markings, two goals with
// nets, floodlights and a night-sky backdrop. Purely visual: the physical
// pitch and goal frames live in PhysicsWorld with the same dimensions.
import { useMemo } from 'react';
import * as THREE from 'three';
import type { PitchConfig } from '../physics/PhysicsConfig.ts';

function grassTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = '#2f6b2a'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random();
    img.data[i] = 40 + n * 22; img.data[i + 1] = 98 + n * 40; img.data[i + 2] = 36 + n * 18;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = `rgba(${150 + Math.random() * 60},${200 + Math.random() * 40},${110 + Math.random() * 40},0.12)`;
    const x = Math.random() * 512, y = Math.random() * 512;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 4 - Math.random() * 5); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function netTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Line({ w, l, x = 0, z = 0, rot = 0 }: { w: number; l: number; x?: number; z?: number; rot?: number }) {
  return (
    <mesh position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, rot]} receiveShadow>
      <planeGeometry args={[w, l]} />
      <meshStandardMaterial color="#f4f6f2" roughness={0.9} />
    </mesh>
  );
}
function Arc({ r, x = 0, z = 0, start = 0, len = Math.PI * 2 }: { r: number; x?: number; z?: number; start?: number; len?: number }) {
  return (
    <mesh position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r - 0.06, r + 0.06, 96, 1, start, len]} />
      <meshStandardMaterial color="#f4f6f2" roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Goal({ side, p, net }: { side: 1 | -1; p: PitchConfig; net: THREE.Texture }) {
  const z = side * p.length / 2;
  const r = p.postRadius, H = p.goalHeight, W = p.goalWidth / 2 + r, D = p.goalDepth;
  const mat = <meshStandardMaterial color="#f7f7f5" roughness={0.35} metalness={0.2} />;
  const netMat = (rx: number, ry: number) => {
    const t = net.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
    return <meshStandardMaterial alphaMap={t} transparent color="#ffffff" side={THREE.DoubleSide} depthWrite={false} roughness={1} />;
  };
  return (
    <group>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * W, H / 2 + r / 2, z + side * r]} castShadow>
          <cylinderGeometry args={[r, r, H + r, 20]} />{mat}
        </mesh>
      ))}
      <mesh position={[0, H + r, z + side * r]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[r, r, 2 * W + 2 * r, 20]} />{mat}
      </mesh>
      <mesh position={[0, H / 2, z + side * (D + 2 * r)]}>
        <planeGeometry args={[2 * W, H]} />{netMat(2 * W * 5, H * 5)}
      </mesh>
      <mesh position={[0, H + 2 * r, z + side * (D / 2 + 2 * r)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * W, D]} />{netMat(2 * W * 5, D * 5)}
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={`s${sx}`} position={[sx * W, H / 2, z + side * (D / 2 + 2 * r)]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[D, H]} />{netMat(D * 5, H * 5)}
        </mesh>
      ))}
    </group>
  );
}

function Floodlight({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 15, 0]}><cylinderGeometry args={[0.25, 0.4, 30, 8]} /><meshStandardMaterial color="#5b6478" /></mesh>
      <mesh position={[0, 30.5, 0]} rotation={[0.5 * Math.sign(-z) || 0.5, 0, 0]}>
        <boxGeometry args={[6, 3, 0.6]} />
        <meshStandardMaterial color="#fffbe8" emissive="#fff6d0" emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

export function LabEnvironment({ pitch }: { pitch: PitchConfig }) {
  const grass = useMemo(() => grassTexture(), []);
  const net = useMemo(() => netTexture(), []);
  const L = pitch.length, W = pitch.width;
  const stripes = useMemo(() => Array.from({ length: 14 }, (_, i) => i), []);
  return (
    <group>
      <color attach="background" args={['#0b1424']} />
      <fog attach="fog" args={['#0b1424', 90, 220]} />
      <hemisphereLight args={['#cfe0ff', '#24401f', 0.55]} />
      <ambientLight intensity={0.15} />

      {/* Turf with mowing stripes */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W + 24, L + 24]} />
        <meshStandardMaterial map={grass} roughness={0.95} map-repeat={[16, 24]} />
      </mesh>
      {stripes.map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -L / 2 + (i + 0.5) * (L / 14)]} receiveShadow>
          <planeGeometry args={[W, L / 14]} />
          <meshStandardMaterial color={i % 2 ? '#ffffff' : '#000000'} transparent opacity={0.05} depthWrite={false} />
        </mesh>
      ))}

      {/* Markings */}
      <Line w={0.12} l={L} x={-W / 2} /><Line w={0.12} l={L} x={W / 2} />
      <Line w={W} l={0.12} z={-L / 2} /><Line w={W} l={0.12} z={L / 2} />
      <Line w={W} l={0.12} />
      <Arc r={9.15} />
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.15, 20]} /><meshStandardMaterial color="#f4f6f2" /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Line w={40.32} l={0.12} z={s * (L / 2 - 16.5)} />
          <Line w={0.12} l={16.5} x={-20.16} z={s * (L / 2 - 8.25)} /><Line w={0.12} l={16.5} x={20.16} z={s * (L / 2 - 8.25)} />
          <Line w={18.32} l={0.12} z={s * (L / 2 - 5.5)} />
          <Line w={0.12} l={5.5} x={-9.16} z={s * (L / 2 - 2.75)} /><Line w={0.12} l={5.5} x={9.16} z={s * (L / 2 - 2.75)} />
          <mesh position={[0, 0.005, s * (L / 2 - 11)]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.12, 16]} /><meshStandardMaterial color="#f4f6f2" /></mesh>
          <Arc r={9.15} z={s * (L / 2 - 11)} start={s > 0 ? Math.PI + 0.93 : 0.93} len={Math.PI - 1.86} />
        </group>
      ))}

      <Goal side={1} p={pitch} net={net} />
      <Goal side={-1} p={pitch} net={net} />
      {[[-48, -62], [48, -62], [-48, 62], [48, 62]].map(([x, z]) => <Floodlight key={`${x}${z}`} x={x} z={z} />)}
    </group>
  );
}
