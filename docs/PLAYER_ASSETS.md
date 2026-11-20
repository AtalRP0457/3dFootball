# Player characters and assets

## What ships today

Every footballer is a **procedural skinned character** built in code
(`src/render/character/`), so the game needs no third-party art:

| Part | File | Notes |
| --- | --- | --- |
| Skeleton | `rig.js` | 22 bones (root, hips, spine, chest, neck, head, shoulders, arms, hands, thighs, shins, feet, toes). Proportions per body type, scaled to the player's height. |
| Body mesh | `body.js` | Lofted anatomical surfaces with smooth skin weights; shirt, sleeves, shorts, socks, boots (sole + studs) are separate surfaces / material slots. ~3.8k vertices, geometry cached per body type. |
| Hair / beard / accessories | `appearance.js` | 10 hair styles, beard / goatee / moustache, captain's armband, headband, wrist tape. Rigid meshes on bones. |
| Materials | `materials.js` | Canvas-painted kit (pattern from the team kit design, collar, crest, front number, surname + number on the back), face, boots. Cached and shared. |
| Animation | `clips.js`, `controller.js` | `THREE.AnimationClip`s played by `THREE.AnimationMixer`. Locomotion is IK-solved and played at speed / stride, so feet stay planted. |
| Assembly | `character.js` | `createCharacter({ identity, kit, keeper, crestUrl })`: used on the pitch, in replays, in the Kick-Off viewer and on the Players tab. |

Identity (height, weight, age, body type, skin tone, hair, facial hair,
boots, accessories, captaincy) comes from `src/game/players/identity.js` and is
the same object the physics uses for mass and reach.

### Honest limits of the procedural characters

- They are stylised, not photo-real; faces are painted, not sculpted.
- Appearance is **generated**, not a real likeness: hair, skin tone and face
  are derived from the player ID. No likeness of a real person is modelled.
  Verified, licensed appearance data can be entered in
  `APPEARANCE_OVERRIDES` (identity.js); it then drives every view.
- Clips are hand-keyed / IK-generated, not motion capture.

## Dropping in professional assets

`assets.js` loads **`public/assets/players/footballer.glb`** if it exists and
uses it for every player instead of the procedural body (kit, boots, skin
and hair materials and the animation controller stay the same). Call
`loadFootballerAsset()` before the first match; if the file is missing or
invalid the procedural characters are used.

### Required GLB contents

1. **One rigged, skinned footballer** (glTF 2.0 binary), Y-up, facing +Z,
   standing on Y = 0, **1.80 m tall** (`ASSET_MANIFEST.assetHeightM`),
   ≤ 15k triangles, one skeleton (Mixamo naming is fine).
2. **Material names** so kits can be recoloured per team:
   `Skin`, `Face`, `Shirt`, `Sleeves`, `Shorts`, `Socks`, `Boots`, `Soles`,
   `Hands`, `Hair` (UVs: shirt front centre at U = 0.25, back centre U = 0.75).
3. **Animation clips** (names in `ASSET_MANIFEST.clips`), in place (no root
   motion):
   - Required: `Idle`, `Walk`, `Run`.
   - Locomotion: `Jog`, `Sprint`, `Dribble`, `TurnLeft`, `TurnRight` — loops of
     exactly one gait cycle; set the ground distance of each cycle in
     `ASSET_MANIFEST.cycleDistance`.
   - Actions: `Pass`, `LongPass`, `Shoot`, `Touch`, `SlideTackle`,
     `StandingTackle`, `Jump`, `Fall`, `GetUp`, `Stumble`, `ThrowIn`,
     `ThrowInHold`.
   - Celebrations: `Celebrate`, `CelebrateRun`, `KneeSlide`, `Embrace`, `Dejected`.
   - Goalkeeper: `GKReady`, `GKDiveLeft`, `GKDiveRight`, `GKCatch`, `GKHold`.
   Missing optional clips fall back to the nearest supplied one.
4. **Licence** that allows redistribution in a browser game.

The GLB path is wired but has not been exercised with a real asset yet,
because none is in the repository. Validate a supplied file in
`dev/character-lab.html` before shipping it.

## Inspecting characters

Run `npm run dev` and open `/dev/character-lab.html?team=bay` (query params:
`team`, `i` squad index, `kit`, `anim`, `view`, `zoom`).
