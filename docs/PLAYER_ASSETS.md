# Player characters and assets

## What ships today

Every footballer is a **procedural skinned character** built in code
(`src/render/character/`), so the game needs no third-party art:

| Part | File | Notes |
| --- | --- | --- |
| Skeleton | `rig.js` | 22 bones (root, hips, spine, chest, neck, head, shoulders, arms, hands, thighs, shins, feet, toes). Proportions per body type, scaled to the player's height. |
| Body mesh | `body.js` | Lofted anatomical surfaces with smooth skin weights, densified with Catmull-Rom rings for smooth limbs and torso; shirt, sleeves, shorts, socks, boots (sole + studs) are separate surfaces / material slots. Geometry cached per body type. |
| Head and face | `head.ts` | Each player's own sculpted head (64×64 loft): skull, jaw, chin, cheekbones, brow ridge, eye sockets, nose with nostrils, lips with a mouth crease. Proportions come from a deterministic `FaceShape` per player (or the `face` field of an appearance override). Separate eyeballs (sclera, iris, pupil, clearcoat), upper and lower lids, eyebrows and ears. Physical skin material (sheen, tiling pore normal map) with painted cheek warmth, lips and stubble. |
| Hair / beard / accessories | `appearance.js` | 10 hair styles, beard / goatee / moustache, captain's armband, headband, wrist tape. Shells are fitted to each player's own head surface (`headPoint`), thinning out at the hairline. Rigid meshes on bones. |
| Materials | `materials.js` | Canvas-painted kit (pattern from the team kit design, collar, crest, front number, surname + number on the back, stitched side seams, waist folds); jersey is a physical material with a soft sheen and a tiling knit normal map (smoother weave on shorts, ribbed socks); hair has a strand-like sheen. Cached and shared. |
| Level of detail | `scene.js` | Eyes, lids and brows are hidden beyond 30 m from the camera; players beyond 70 m stop casting shadows. |
| Animation | `clips.js`, `controller.js` | `THREE.AnimationClip`s played by `THREE.AnimationMixer`. Locomotion is IK-solved and played at speed / stride, so feet stay planted. |
| Assembly | `character.js` | `createCharacter({ identity, kit, keeper, crestUrl })`: used on the pitch, in replays, in the Kick-Off viewer and on the Players tab. |

Identity (height, weight, age, body type, skin tone, hair, facial hair,
boots, accessories, captaincy) comes from `src/game/players/identity.ts` and is
the same object the physics uses for mass and reach.

### Known appearance data

`APPEARANCE_OVERRIDES` (`src/game/players/identity.ts`) pins real, publicly
reported physical data for a player: height, weight, age, build, skin tone,
hair style and colour, facial hair, eye colour and broad face proportions.
Erling Haaland (`erling-haaland`) is entered: 1.94 m, 88 kg, strong build,
long blond hair tied back, fair skin, blue eyes, long face with a strong
jaw and chin. This is a physical profile, **not a portrait likeness**: no
photograph or scan of him was used.

### Asset sources and licences

No third-party models, textures, scans or photographs were added for the
characters. Everything above (geometry, skin, eye, knit and pore textures)
is generated in code at runtime, so there is nothing to attribute.

### Honest limits of the procedural characters

- They are stylised, not photo-real. Faces are sculpted procedurally, but
  without scanned geometry or photographic textures they do not reach
  modern licensed-game realism. That needs artist-made or scanned assets
  (see below); none were available on this machine (no Blender, MakeHuman or
  licensed character packs).
- Appearance is **generated** unless an override exists: hair, skin tone
  and face are derived from the player ID, so most real players will not
  match their real appearance until verified data is entered in
  `APPEARANCE_OVERRIDES`; it then drives every view.
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
`team`, `i` squad index, `kit`, `anim`, `view`, `zoom`). Zoom in (wheel or
`zoom=14`) for a face close-up; `?team=mci&i=4&zoom=14` shows Haaland.
