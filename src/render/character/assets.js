// Optional professional character asset (rigged GLB) pipeline.
//
// The game ships with procedural skinned footballers. When a licensed,
// rigged and animated footballer GLB is supplied at
// public/assets/players/footballer.glb (see docs/PLAYER_ASSETS.md for the
// exact requirements), `loadFootballerAsset()` loads it once and every
// character is created from a SkeletonUtils clone of it instead, keeping the
// identity-driven kit, boots, skin and hair materials and the same
// AnimationController (fed with the GLB's own clips).

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationController } from './controller.js';
import { SLOT } from './body.js';

export const ASSET_MANIFEST = {
  url: 'assets/players/footballer.glb',
  // Our clip name -> name in the GLB.
  clips: {
    idle: 'Idle', walk: 'Walk', jog: 'Jog', run: 'Run', sprint: 'Sprint', dribble: 'Dribble',
    turnLeft: 'TurnLeft', turnRight: 'TurnRight', pass: 'Pass', longPass: 'LongPass', shoot: 'Shoot',
    touch: 'Touch', tackle: 'SlideTackle', poke: 'StandingTackle', jump: 'Jump', fall: 'Fall', getUp: 'GetUp',
    stumble: 'Stumble', celebrate: 'Celebrate', celebrateRun: 'CelebrateRun', kneeSlide: 'KneeSlide',
    embrace: 'Embrace', dejected: 'Dejected', gkReady: 'GKReady', gkDiveL: 'GKDiveLeft', gkDiveR: 'GKDiveRight',
    gkCatch: 'GKCatch', gkHold: 'GKHold', throwHold: 'ThrowInHold', throwIn: 'ThrowIn',
  },
  // Ground distance (m) one locomotion cycle covers at the asset's height.
  cycleDistance: { walk: 1.45, jog: 2.3, dribble: 2.0, run: 3.2, sprint: 4.2, celebrateRun: 3.0 },
  assetHeightM: 1.8,
  // Material names in the GLB -> body material slots.
  materials: {
    Skin: SLOT.skin, Face: SLOT.face, Shirt: SLOT.shirt, Sleeves: SLOT.sleeve, Shorts: SLOT.shorts,
    Socks: SLOT.socks, Boots: SLOT.boot, Soles: SLOT.sole, Hands: SLOT.hands,
  },
  hairMaterial: 'Hair',
};

let asset = null;
let attempted = false;

export function activeAsset() { return asset; }

/**
 * Try to load the GLB once. Resolves to the asset or null (missing / invalid).
 * Never throws: the procedural characters remain the fallback.
 */
export async function loadFootballerAsset(baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') {
  if (attempted) return asset;
  attempted = true;
  const url = `${baseUrl}${ASSET_MANIFEST.url}`;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const type = head.headers.get('content-type') || '';
    if (!head.ok || type.includes('text/html')) return null;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    asset = registerAsset(gltf);
  } catch (err) {
    console.warn('[players] footballer.glb not loaded, using procedural characters:', err?.message || err);
    asset = null;
  }
  return asset;
}

/** Validate and register a loaded glTF ({ scene, animations }). */
export function registerAsset(gltf) {
  let skinned = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) throw new Error('GLB has no skinned mesh');
  const byName = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  const clips = {};
  const missing = [];
  for (const [ours, theirs] of Object.entries(ASSET_MANIFEST.clips)) {
    const c = byName[theirs] || byName[ours];
    if (c) {
      const cc = c.clone();
      cc.name = ours;
      if (ASSET_MANIFEST.cycleDistance[ours]) cc.userData = { cycleDistance: ASSET_MANIFEST.cycleDistance[ours] };
      clips[ours] = cc;
    } else missing.push(theirs);
  }
  for (const req of ['idle', 'walk', 'run']) if (!clips[req]) throw new Error(`GLB is missing the ${ASSET_MANIFEST.clips[req]} clip`);
  if (missing.length) console.info('[players] GLB clips not supplied (fallback to nearest):', missing.join(', '));
  // Fill gaps with the nearest supplied clip so the controller always works.
  const fallback = { jog: 'run', sprint: 'run', dribble: 'jog', celebrateRun: 'run', turnLeft: 'walk', turnRight: 'walk' };
  for (const [k, v] of Object.entries(fallback)) if (!clips[k] && clips[v]) { clips[k] = clips[v].clone(); clips[k].name = k; }
  return { gltf, clips };
}

/** Create a character from the registered GLB. */
export function instantiateAsset(a, identity, mats, o) {
  const scene = cloneSkinned(a.gltf.scene);
  const meshes = [];
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    meshes.push(obj);
    obj.castShadow = o.shadows !== false;
    obj.frustumCulled = false;
    const swap = (m) => {
      if (m.name === ASSET_MANIFEST.hairMaterial) return mats.hair;
      const slot = ASSET_MANIFEST.materials[m.name];
      return slot != null ? mats.slots[slot] : m;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material);
  });
  const group = new THREE.Group();
  group.add(scene);
  const scale = identity.heightCm / 100 / ASSET_MANIFEST.assetHeightM;
  scene.scale.multiplyScalar(scale);
  const controller = new AnimationController(scene, { clips: a.clips, legScale: scale, leftFooted: identity.foot === 'Left' });
  return {
    group, mesh: meshes[0], bones: {}, controller, identity, armband: null, scale,
    headHeight: identity.heightCm / 100 + 0.12,
    update(dt, p, ctx) { controller.update(dt, p, ctx); },
    setCaptain() {},
    dispose() { controller.dispose(); group.removeFromParent(); },
  };
}
