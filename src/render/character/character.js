// A footballer character: skinned body + kit + boots + hair + accessories,
// animated by an AnimationController. The same factory is used on the
// pitch, in replays and celebrations, and in the Kick-Off player preview,
// so a player looks identical everywhere.
//
// If a professional rigged GLB has been registered (see assets.js and
// docs/PLAYER_ASSETS.md), it is used instead of the procedural body, with
// the same identity-driven kit, boots, skin and hair colours.

import * as THREE from 'three';
import { bodyGeometry } from './body.js';
import { createSkeletonBones, REF } from './rig.js';
import { characterMaterials } from './materials.js';
import { hairGeometry, facialHairGeometry, bandGeometry } from './appearance.js';
import { AnimationController } from './controller.js';
import { LEG_LENGTH } from './clips.js';
import { activeAsset, instantiateAsset } from './assets.js';

/**
 * @param o {
 *   identity   from game/players/identity.js
 *   kit        team kit colours/design
 *   keeper     goalkeeper kit and gloves
 *   crestUrl   team crest for the shirt
 *   teamKey    cache key for shared team materials
 *   shadows    cast shadows (default true)
 * }
 */
export function createCharacter(o) {
  const identity = o.identity;
  const keeper = !!(o.keeper ?? identity.keeper);
  const mats = characterMaterials(identity, o.kit, { keeper, crestUrl: o.crestUrl, teamKey: o.teamKey });
  const asset = activeAsset();
  if (asset) return instantiateAsset(asset, identity, mats, o);

  const longSleeves = keeper || identity.accessories.includes('longSleeves');
  const { geometry, layout } = bodyGeometry(identity.bodyType, longSleeves);
  const { root, bones, list } = createSkeletonBones(layout);
  const mesh = new THREE.SkinnedMesh(geometry, mats.slots);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(list));
  mesh.frustumCulled = false; // dives and slides leave the bind-pose bounds
  mesh.castShadow = o.shadows !== false;
  mesh.name = `player-${identity.id}`;

  // Hair and facial hair ride on the head bone.
  const hair = new THREE.Mesh(hairGeometry(identity.hair.style), mats.hair);
  hair.castShadow = o.shadows !== false;
  bones.head.add(hair);
  const fh = facialHairGeometry(identity.facialHair);
  if (fh) bones.head.add(new THREE.Mesh(fh, mats.hair));

  // Accessories.
  const band = bandGeometry();
  const limb = layout.dims.build.limb;
  let armband = null;
  if (identity.captain) {
    armband = new THREE.Mesh(band, mats.armband);
    const r = 0.054 * limb + 0.017;
    armband.scale.set(r, 0.05, r);
    armband.position.set(0, -0.1, 0);
    bones['upperArm.L'].add(armband);
  }
  if (identity.accessories.includes('headband')) {
    const hb = new THREE.Mesh(band, mats.headband);
    hb.scale.set(0.083, 0.02, 0.1);
    hb.position.set(0, 0.17, 0.0);
    bones.head.add(hb);
  }
  if (identity.accessories.includes('wristTape')) {
    for (const s of ['L', 'R']) {
      const t = new THREE.Mesh(band, mats.tape);
      t.scale.set(0.033, 0.035, 0.036);
      t.position.set(0, -REF.forearm + 0.03, 0);
      bones[`lowerArm.${s}`].add(t);
    }
  }

  const group = new THREE.Group();
  group.add(mesh);
  const scale = identity.heightCm / 100 / layout.dims.crown;
  mesh.scale.setScalar(scale);
  const legScale = ((layout.dims.thigh + layout.dims.shin + REF.ankle) * scale) / LEG_LENGTH;
  const controller = new AnimationController(mesh, { legScale, leftFooted: identity.foot === 'Left' });

  return {
    group, mesh, bones, controller, identity, armband, scale,
    /** World-space head height (for markers above the player). */
    headHeight: identity.heightCm / 100 + 0.12,
    update(dt, p, ctx) { controller.update(dt, p, ctx); },
    setCaptain(on) { if (armband) armband.visible = on; },
    dispose() {
      controller.dispose();
      group.removeFromParent();
      // Geometry and materials are shared through caches; nothing else to free.
    },
  };
}
