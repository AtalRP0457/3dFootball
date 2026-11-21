// The reference football: an original 32-panel design (12 pentagons, 20
// hexagons) generated per pixel on the sphere, with recessed seams in a bump
// map, a pebbled surface grain and a clear-coat PBR material. Rotation and
// position come from the physics snapshots, interpolated between steps.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BallController } from './BallController.ts';

const PHI = (1 + Math.sqrt(5)) / 2;

function panelCentres(): { pent: THREE.Vector3[]; hex: THREE.Vector3[] } {
  const ico: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) { ico.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]); }
  const pent = ico.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const hex: THREE.Vector3[] = [];
  // Hexagon centres sit at the icosahedron's face centres.
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
    const a = pent[i], b = pent[j], c = pent[k];
    if (a.distanceTo(b) < 1.1 && b.distanceTo(c) < 1.1 && a.distanceTo(c) < 1.1) hex.push(a.clone().add(b).add(c).normalize());
  }
  return { pent, hex };
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface BallTextures { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }
let cached: BallTextures | null = null;

/** Equirectangular colour + bump maps matching SphereGeometry's UV layout. */
export function ballTextures(): BallTextures {
  if (cached) return cached;
  const W = 1024, H = 512;
  const { pent, hex } = panelCentres();
  const all = [...pent.map((v) => ({ v, pent: true })), ...hex.map((v) => ({ v, pent: false }))];
  const cMap = document.createElement('canvas'), cBump = document.createElement('canvas');
  cMap.width = cBump.width = W; cMap.height = cBump.height = H;
  const gm = cMap.getContext('2d'), gb = cBump.getContext('2d');
  if (!gm || !gb) throw new Error('2D canvas unavailable');
  const im = gm.createImageData(W, H), ib = gb.createImageData(W, H);
  const d = new THREE.Vector3();
  for (let py = 0; py < H; py++) {
    const theta = ((py + 0.5) / H) * Math.PI;
    for (let px = 0; px < W; px++) {
      const phi = ((px + 0.5) / W) * Math.PI * 2;
      // Same parameterisation as THREE.SphereGeometry.
      d.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
      let best = -2, second = -2, bi = 0;
      for (let i = 0; i < all.length; i++) {
        const c = d.dot(all[i].v);
        if (c > best) { second = best; best = c; bi = i; } else if (c > second) second = c;
      }
      const seam = Math.acos(Math.min(1, second)) - Math.acos(Math.min(1, best)); // angular distance to the panel edge
      const p = all[bi];
      const edge = Math.min(1, seam / 0.022);
      const grain = hash(px, py) * 0.06;
      let r = 245, g = 246, b = 242;
      if (p.pent) {
        // Navy pentagon with a gold inner ring (original design).
        const ang = Math.acos(Math.min(1, best));
        const ring = Math.abs(ang - 0.17) < 0.018;
        if (ring) { r = 226; g = 178; b = 58; } else if (ang < 0.17) { r = 18; g = 34; b = 86; } else { r = 28; g = 58; b = 140; }
      } else {
        // Hexagons: white with a faint pearl gradient towards the edges.
        const t = 1 - edge;
        r -= 10 * t; g -= 8 * t; b -= 2 * t;
      }
      const k = 0.82 + 0.18 * edge;
      const o = (py * W + px) * 4;
      im.data[o] = r * k * (1 - grain * 0.3); im.data[o + 1] = g * k * (1 - grain * 0.3); im.data[o + 2] = b * k * (1 - grain * 0.3); im.data[o + 3] = 255;
      // Bump: recessed seam + pebbled grain on the panels.
      const h = 255 * (0.25 + 0.75 * edge) - grain * 120 * edge;
      ib.data[o] = ib.data[o + 1] = ib.data[o + 2] = Math.max(0, Math.min(255, h)); ib.data[o + 3] = 255;
    }
  }
  gm.putImageData(im, 0, 0);
  gb.putImageData(ib, 0, 0);
  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(cBump);
  cached = { map, bump };
  return cached;
}

export interface RenderClock { alpha: number }

export function BallModel({ ball, clock, radius }: { ball: BallController; clock: RenderClock; radius: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => ballTextures(), []);
  const qa = useMemo(() => new THREE.Quaternion(), []), qb = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const a = ball.prev, b = ball.curr, t = clock.alpha;
    m.position.set(
      a.position.x + (b.position.x - a.position.x) * t,
      a.position.y + (b.position.y - a.position.y) * t,
      a.position.z + (b.position.z - a.position.z) * t,
    );
    qa.set(a.rotation.x, a.rotation.y, a.rotation.z, a.rotation.w);
    qb.set(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
    m.quaternion.slerpQuaternions(qa, qb, t);
    const s = shadow.current;
    if (s) {
      s.position.set(m.position.x, 0.006, m.position.z);
      const h = Math.max(0, m.position.y - radius);
      s.scale.setScalar(1 + h * 0.35);
      (s.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.45 - h * 0.08);
    }
  });
  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[radius, 64, 48]} />
        <meshPhysicalMaterial map={tex.map} bumpMap={tex.bump} bumpScale={1.2} roughness={0.42} metalness={0} clearcoat={0.6} clearcoatRoughness={0.32} sheen={0.2} />
      </mesh>
      <mesh ref={shadow} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[radius * 1.05, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}
