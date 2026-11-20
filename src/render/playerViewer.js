// Kick-Off 3D player viewer: a small studio scene that shows a footballer
// built by the same createCharacter() + identity used on the pitch, so what
// you inspect here is exactly who walks out in the match.
//
// Interaction: drag to rotate, wheel / pinch / buttons to zoom, front / side
// / back views, animation previews (idle, jog, sprint, shoot, celebrate...).

import * as THREE from 'three';
import { createCharacter } from './character/character.js';

const VIEWS = { front: 0, side: Math.PI / 2, back: Math.PI, threeQuarter: Math.PI / 5 };
// Animation demos: speed for locomotion, or a one-shot clip.
export const VIEWER_ANIMS = [
  ['idle', 'Idle'], ['walk', 'Walk'], ['jog', 'Jog'], ['sprint', 'Sprint'], ['dribble', 'Dribble'],
  ['shoot', 'Shoot'], ['pass', 'Pass'], ['tackle', 'Tackle'], ['jump', 'Jump'], ['celebrate', 'Celebrate'], ['dive', 'GK dive'],
];
const DEMO_SPEED = { idle: 0, walk: 1.5, jog: 3.6, sprint: 8.6, dribble: 4.2 };

export class PlayerViewer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pv3d-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    // Studio lighting: warm key, cool fill, strong rim for the silhouette.
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#20252e', 0.9));
    const key = new THREE.DirectionalLight('#fff3e2', 2.6);
    key.position.set(2.2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 12 });
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#9fc4ff', 0.9);
    fill.position.set(-3, 2, 1.5);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 1.8);
    rim.position.set(-1.5, 3, -3.5);
    this.scene.add(rim);
    // Turf disc with a soft shadow.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 48),
      new THREE.MeshStandardMaterial({ color: '#2f7a3b', roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.26, 1.32, 64), new THREE.MeshBasicMaterial({ color: '#f3c34a' }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
    this.scene.add(ring);

    this.char = null;
    this.key = null;
    this.yaw = VIEWS.threeQuarter; // current
    this.yawTarget = this.yaw;
    this.dist = 4.2; this.distTarget = 4.2;
    this.focusY = 1.0; this.focusTarget = 1.0;
    this.anim = 'idle';
    this.animT = 0;
    this.clock = new THREE.Clock();
    this.running = false;
    this.bindInput();
    this.loop = this.loop.bind(this);
  }

  bindInput() {
    let drag = null;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: this.yawTarget }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yawTarget = drag.yaw - (e.clientX - drag.x) * 0.012;
    });
    const end = () => { drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    c.addEventListener('dblclick', () => this.view('threeQuarter', true));
  }

  zoom(dir) {
    this.distTarget = THREE.MathUtils.clamp(this.distTarget * (dir > 0 ? 1.15 : 1 / 1.15), 1.4, 6);
    // Close up: look at the upper body/face; far: whole body.
    const k = (this.distTarget - 1.4) / (6 - 1.4);
    this.focusTarget = THREE.MathUtils.lerp(1.45, 0.95, Math.min(1, k * 1.6));
  }

  view(name, resetZoom = false) {
    const target = VIEWS[name] ?? VIEWS.front;
    // Rotate the short way round from where we are.
    let d = target - (this.yawTarget % (Math.PI * 2));
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    this.yawTarget += d;
    if (resetZoom) { this.distTarget = 4.2; this.focusTarget = 1.0; }
  }

  mount(host) {
    if (!host) return;
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
    this.resize();
    if (!this.ro) {
      this.ro = new ResizeObserver(() => this.resize());
    }
    this.ro.disconnect();
    this.ro.observe(host);
    if (!this.running) { this.running = true; this.clock.getDelta(); requestAnimationFrame(this.loop); }
  }

  unmount() {
    this.running = false;
    this.ro?.disconnect();
    this.canvas.remove();
  }

  resize() {
    const host = this.canvas.parentElement;
    if (!host) return;
    const w = Math.max(10, host.clientWidth), h = Math.max(10, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Show a player. o = { identity, kit, keeper, crestUrl, teamKey } */
  show(o) {
    const key = `${o.identity.id}|${o.identity.number}|${o.keeper}|${o.kit.shirt}|${o.kit.shorts}|${o.identity.captain}`;
    if (key === this.key) return;
    this.key = key;
    if (this.char) { this.char.dispose(); this.char = null; }
    this.char = createCharacter({ ...o, shadows: true });
    this.char.group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.scene.add(this.char.group);
    this.setAnim(o.keeper ? 'gkReady' : 'idle');
  }

  setAnim(name) {
    this.anim = name;
    this.animT = 0;
    if (!this.char) return;
    const c = this.char.controller;
    c.reset();
    const map = { shoot: 'shoot', pass: 'pass', tackle: 'tackle', jump: 'jump', dive: 'gkDiveL' };
    if (map[name]) c.play(name === 'shoot' || name === 'pass' ? c.kickName(map[name]) : map[name]);
  }

  loop() {
    if (!this.running) return;
    // Stop drawing when the menu is hidden (match running) or the canvas was
    // removed; mount() restarts the loop.
    if (!this.canvas.isConnected || this.canvas.offsetParent === null) { this.running = false; return; }
    const dt = Math.min(0.05, this.clock.getDelta());
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 8);
    this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 8);
    this.focusY += (this.focusTarget - this.focusY) * Math.min(1, dt * 8);
    if (this.char) {
      const speed = DEMO_SPEED[this.anim] ?? 0;
      const celebrating = this.anim === 'celebrate';
      const keeperIdle = this.anim === 'gkReady';
      // Treadmill: the character runs on the spot, the controller still uses
      // the real speed for the gait.
      this.char.update(dt, {
        vel: { x: 0, z: speed }, face: { x: 0, z: 1 }, role: keeperIdle ? 'GK' : 'MID',
        kickAnim: 0, touchAnim: this.anim === 'dribble' && (this.animT % 0.55) < dt ? 0.22 : 0,
      }, { owner: this.anim === 'dribble', keeperAlert: keeperIdle, forceState: celebrating ? 'celebrate' : null, id: 7 });
      this.animT += dt;
      // Replay one-shots every couple of seconds.
      const oneShot = ['shoot', 'pass', 'tackle', 'jump', 'dive'].includes(this.anim);
      if (oneShot && this.animT > 2.4) this.setAnim(this.anim);
      const h = this.char.identity.heightCm / 100;
      this.focusTarget = Math.min(this.focusTarget, h * 0.82);
    }
    const t = new THREE.Vector3(0, this.focusY, 0);
    // Narrow (portrait) frames need more distance to keep head and boots in.
    const d = this.dist * Math.max(1, 0.8 / this.camera.aspect);
    this.camera.position.set(Math.sin(this.yaw) * d, this.focusY + 0.15 + d * 0.04, Math.cos(this.yaw) * d);
    this.camera.lookAt(t);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  dispose() {
    this.unmount();
    if (this.char) this.char.dispose();
    this.renderer.dispose();
  }
}

let shared = null;
/** One viewer for the whole front end (one WebGL context). */
export function sharedPlayerViewer() {
  if (!shared) shared = new PlayerViewer();
  return shared;
}
