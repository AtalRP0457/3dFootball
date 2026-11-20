# Legends — gameplay, physics & visual overhaul plan

Reference for feel and presentation: arcade mobile football of the mid-2010s
(weighty players, broadcast camera, readable ball flight). Everything here is
our own implementation; no third-party game assets, models or code.

## 1. What exists today (audit)

| Area | File | State |
| --- | --- | --- |
| Main loop | `src/main.js` `frame()` | Fixed 60 Hz step with accumulator already exists. Rendering reads the latest physics state directly, so on 75/120/144 Hz displays the picture stutters (0 or 2 steps per frame, no interpolation). |
| Player movement | `match.js` `movePlayer()` | Velocity is steered straight at the target with a flat 20 m/s² cap. A sprinting player can reverse in ~0.9 s on a dime: no turn-rate limit, no braking phase, no momentum. Facing is lerped independently of velocity. |
| Attributes | `db/teams.js` `toEngine()` | The DB derives 24 attributes (acceleration, agility, strength, stamina…) but only six summary stats reach the engine. Acceleration, agility, balance and stamina have no effect. |
| Ball | `match.js` `updateBall()` | Point mass, gravity, linear air drag, flat rolling decel. No spin, no Magnus curve, bounce loses a fixed 15% horizontally regardless of spin. |
| Ball ↔ players | `updatePossession()` | Only "control radius" capture at < 1.1 m height. A ball above that, or near a player on kick cooldown, passes straight through bodies. Fast balls can tunnel (0.5 m per step at 30 m/s). |
| Duplicated logic | `ai.js` `predictBall()` / `runSpeed()` | Re-implements the rolling model and running speed; any physics change silently desyncs AI prediction and pass calibration. |
| Dribbling | `attachBall()` | Ball is teleported to `pos + face*0.75` every step — magnetic, independent of speed or touch. |
| Shooting / passing | `doShot()` / `doPass()` | Single trajectory formula each; no spin, no shot types, running speed and body orientation ignored. |
| Players | `scene.js` `makePlayer()` | Box/sphere primitives, sine-wave leg swing, no skeleton. |
| Camera | `scene.js` `cameraTarget()` | Broadcast cam 20+ m back; tightens only in the final third. |
| Tests | `tests/sim.test.mjs` | Good headless coverage of rules. One check (`opponent in range is highlighted for tackling`) already fails on `main` before any change. |

## 2. Prioritised plan

Each phase ends with `npm test`, `npm run build` and a manual play check.

### Phase 1 — Core physics (this branch)
1. `src/game/physics/attributes.js`: one physical profile per player (run/sprint
   speed, acceleration, agility, balance, strength, stamina) from full DB
   attributes, with a fallback from the six legacy stats. Pass full attributes
   through `toEngine()`.
2. `src/game/physics/playerPhysics.js`: momentum-based locomotion — speed-
   dependent turn rate, braking into sharp turns, acceleration curve that
   fades near top speed, natural coast-down, body yaw with angular-speed
   limit, exposed acceleration for lean, stamina drain/recovery by attribute.
   Used by human and AI players alike (single `movePlayer`).
3. Player–player collisions: mass-weighted separation plus cancelling the
   closing velocity; heavy hits make the weaker/less balanced player stagger.
4. `src/game/physics/ballPhysics.js`: ball with spin vector; gravity, quadratic
   drag, Magnus curve, ground contact with restitution and friction impulse
   (spin ↔ velocity exchange), rolling resistance, sub-stepping against
   tunnelling, and collision with player bodies.
5. Shared prediction helpers (`rollDistance`, `speedForRollDistance`,
   `predictGroundBall`) used by passing *and* AI.
6. Render interpolation between physics steps; ball rotation driven by the
   physics spin.
7. Automated tests for frame-rate independence and the physics laws.

### Phase 2 — Football mechanics (implemented)
Status: done on `feature/physics-overhaul`, covered by `tests/mechanics.test.mjs`.
- `src/game/mechanics/dribbling.js`: ball stays a free physics object while
  owned; close control (spring-damper, only within foot reach) below 2.6 m/s,
  discrete touches above it, touch length from speed and dribbling, stop /
  drag-back touch on sharp turns, possession lost when the ball runs away.
  Opponents can nick the ball between touches.
- Passes and shots need the ball within reach; otherwise the action is held
  for 0.6 s while the player gets to it.
- First touch: fails more with ball speed, height, low control or being off
  balance; a good touch cushions the ball without moving it.
- `src/game/mechanics/shooting.js`: normal / power / low / finesse / chip with
  an error model (finishing, power, run speed, body angle, ball distance,
  fatigue, AI difficulty) and spin; launch solved with the real integrator.
- `src/game/mechanics/passing.js`: ground (short/long, driven), lofted,
  through and chip passes with receiver lead and an error model.
- AI predicts the ball from a per-step simulated path (spin, bounce, roll),
  picks shot types and pass kinds situationally.
- Controls: P1 V lofted, R through, H curl, T chip; P2 `,` `;` `'` `]`;
  pad Y/X for lofted/through, LB/LT + B for curl/chip.

Original scope:
Touch-based dribbling (ball is kicked ahead and re-collected; touch length
from speed and dribbling; heavy touches on sharp turns at sprint), shot types
(normal, power, finesse with sidespin, low driven with topspin, chip with
backspin) with error from power, running speed, body angle and ball distance;
pass types (short/long ground, lofted, through ball) with receiver lead and
first-touch quality.

### Phase 3 — Human players, identity & animation (implemented, procedural)
Status: done on `feature/player-identity` with procedural characters; see
`docs/PLAYER_ASSETS.md` for what a professional GLB would replace.
- One player record per person in the Players list (club + country shown
  together); "Database" wording removed from the UI.
- `src/game/players/identity.js`: height, weight, age, body type, looks,
  boots, accessories and captain, shared by cards, 3D views and physics.
- Extended attributes (balance, short/long passing, shot power, first
  touch, curve, marking, positioning) and position-weighted overall ratings;
  every attribute is used by the engine (see physics/attributes.js header).
- Skinned characters with kits, crests, numbers, names, boots and studs,
  hair and armbands; AnimationMixer clips with stride-synced locomotion.
- Kick-Off 3D viewer (rotate, zoom, front/side/back, animations, captain,
  random, XI overview), 3D star players on the match preview, 3D figure on
  the Players tab.
- Goal celebrations (scorer runs off, teammates join), then a close-up
  replay with slow motion around the strike and the goal.

Original scope:
`PlayerModel` interface that loads rigged GLB characters (one shared skeleton,
kit colours applied via material slots) and an `AnimationController` built on
`THREE.AnimationMixer` with a locomotion blend space driven by actual speed,
plus one-shot clips (kick, pass, tackle, dive, celebrate, fall/get-up). We do
not have licensed GLB assets in the repo yet: this phase needs either assets
supplied by the team or a decision to author/commission them. Until then a
procedural skinned fallback will be clearly labelled as such.

### Phase 4 — AI
Same physics for everyone (done in Phase 1); then support runs into space,
pass-lane evaluation using the shared ball predictor, interception, marking,
compact defensive block.

### Phase 5 — Visual overhaul
Stadium module with a `StadiumDefinition` (pitch, stands, roof, lights,
boards) so new venues are data; mowed-stripe pitch with normal detail,
instanced crowd, floodlight rig, closer DLS-style broadcast camera with zoom
and follow-sensitivity settings.

### Phase 6 — Game experience
Celebration director (scorer run, teammates converge, celebration camera),
goal banner/scoreboard, richer event audio, restart flow.

### Phase 7 — Optimisation & final testing
Instancing, shared geometry/materials, shadow budget, disposal on match end,
full manual pass of every mode on keyboard/gamepad/touch.
