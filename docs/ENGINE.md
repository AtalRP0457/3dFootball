# Game engine: reference player & ball (`packages/game-engine`)

The permanent foundation for every footballer and every ball interaction.
Strict TypeScript (`strict`, `noImplicitAny`, `strictNullChecks`,
`noUnusedLocals`, `noUnusedParameters`), Rapier physics, React Three Fiber
rendering, Zustand UI state. It is **not yet wired into the match**: by
request, the reference player is approved in the Lab first.

## Run it

```bash
npm run lab                 # opens /dev/player-ball-lab.html on the dev server
npm run test:engine         # 41 headless acceptance checks (real Rapier)
npm run typecheck           # main project + strict engine project
```

## Layout

| Folder | Files | Role |
|---|---|---|
| `physics/` | `PhysicsConfig.ts` | Every constant (SI units): ball, player, world, pitch. `createCalibration()` gives the Lab a mutable copy; shipped values stay frozen. |
| | `FixedTimestep.ts` | Accumulator: identical 1/60 s steps whatever the render rate; returns interpolation `alpha`; caps spikes. |
| | `PhysicsWorld.ts` | Rapier world: turf, goal frames (posts/crossbar as cylinders), nets; substeps (8 per step); collision → surface names. |
| | `PhysicsEvents.ts` | Typed event stream (kicks, touches, contacts, tackles, balance, foot plants). |
| | `Simulation.ts` | One world + one ball + N players, stepped in a fixed order. Used by the Lab, the tests and (next) the match. |
| `ball/` | `BallPhysics.ts` | Rapier rigid body (0.43 kg, r 0.11 m, thin-shell inertia, CCD) + forces Rapier lacks: drag, Magnus, spin decay, rolling resistance, bounce settling. Trajectory predictor with the same model. |
| | `BallAerodynamics.ts` | F_drag = −½ρC_dA|v|v; Magnus lift with C_L from the spin parameter rω/|v| (saturating fit). |
| | `BallSpin.ts` | Top/side/gyro spin ↔ world angular velocity; rolling spin; contact slip. |
| | `BallCollision.ts`, `BallController.ts`, `BallTypes.ts` | Surface handling (nets absorb), snapshots for interpolation, last touch. |
| | `BallModel.tsx` | Original 32-panel ball (12 navy/gold pentagons, 20 white hexagons) generated per pixel: colour map, recessed seams + grain bump map, clear-coat PBR. |
| `player/` | `PlayerTypes.ts`, `PlayerAttributes.ts` | Typed `PlayerAttributes` (18 ratings) → `PlayerTuning` (SI). One mapping for everyone. |
| | `PlayerMovement.ts` | Momentum model: fading acceleration, grip-limited turning (radius ∝ v²), plant-and-brake reversals, coast-down, yaw-rate limits, stamina. |
| | `PlayerPhysics.ts` | 75 kg Rapier capsule, rotation locked, stays on the ground plane; contacts feed back into the next step. |
| | `PlayerCollision.ts` | Contact impulse from closing speed and masses → balance damage weighted by strength, balance and bracing. |
| | `PlayerRig.ts` | Skeleton dimensions (1.80 m reference) and forward kinematics for feet and head. |
| | `PlayerAnimation.ts` | Pose per fixed step: stride-synced leg IK, lean from real acceleration, roll into turns, arm swing, idle breathing/weight shift/look-around, action layer. |
| | `PlayerBallInteraction.ts` | All ball contact: kicks, dribble touches, skill touches, tackles, first touch, blocks. |
| | `PlayerController.ts` | The one controller (humans and AI): buttons & charging, kick approach, movement, stride, state machine, pose, interaction. |
| | `PlayerModel.tsx` | Renders a controller with the shared skinned footballer (22-bone rig, modelled kit), interpolating poses between steps. |
| `animation/` | `FootContact.ts` | Gait phase advanced by **distance travelled / cycle length**, so planted feet cannot slide; strike events. |
| | `InverseKinematics.ts` | Two-bone leg IK + FK. |
| | `ActionClips.ts` | 31 timed actions (16 kicks, 8 skills, tackles, jump/header, stumble/fall/get-up, celebrate, trap) with contact markers. |
| | `AnimationStateMachine.ts`, `AnimationBlending.ts`, `AnimationEvents.ts` | Locomotion state from physics, crossfades, keyframe sampling/mirroring, marker events. |
| `development/` | `PlayerBallLab.tsx` + panels | The Lab (below). `PhysicsTests.ts` = acceptance checks. `SparringAI.ts` = training partner on the same controller. |

## One fixed step

```
inputs (human keyboard / AI)  →  for each player: preStep
   read Rapier velocity (includes last contacts) → buttons → kick approach
   → movement model → body velocity → stride phase (+ foot strikes)
   → state machine (+ markers) → pose (IK) → ball impulses at markers/strikes
→ Rapier: 8 substeps, ball aerodynamics/rolling applied before each
→ snapshots (render interpolation) → player–player contact consequences
```

Rendering never advances the simulation; it interpolates the last two
snapshots with `alpha`. Results are bit-identical at 30, 60, 120 and 144 fps
(check 38).

## How the ball is struck (no teleporting, no attachment)

- **Kicks**: a button press only *requests* a kick. The player approaches
  until the ball will be at the kicking foot at the clip's contact frame, then
  swings. At the `contact` marker the foot's position is computed from the
  current pose by forward kinematics; if it is within reach of the ball, an
  impulse is applied: speed from the kick type, charge and attributes, scaled
  by contact quality (gap, body angle to the aim, balance, preferred foot,
  ball speed); direction error from skill and quality; spin from the kick type
  and off-centre contact; part of the run's momentum carries into the ball.
  Out of reach = a fresh air shot.
- **Dribbling**: on foot strikes while in possession, the swinging foot taps
  the ball. Each touch is solved so the ball (skidding, then rolling) comes
  back to the player's feet after a touch interval that depends on pace and
  dribbling; touches alternate feet at close control and steer the ball back
  onto the player's line.
- **Tackles**: the tackling foot (FK) must reach the ball during the lunge or
  slide; missing the ball but catching the opponent's legs trips him.
- **Receiving**: a ball arriving in reach is cushioned (quality from ball
  control, ball speed and height) or, if hard and low while defending, blocked.

## Attributes → physics

| Attribute | Drives |
|---|---|
| pace, sprintSpeed | run and sprint top speed (calibrated to 4.5–6.0 / 7.0–9.0 m/s) |
| acceleration | time to top speed (2.6–4.2 s) |
| agility | lateral grip (turning radius), yaw rate, braking, jockey speed |
| balance | contact resistance, recovery rate |
| strength | contact resistance (shielding, shoulder-to-shoulder) |
| stamina | drain/recovery; fatigue lowers speed and acceleration |
| ballControl | first touch, dribble touch accuracy |
| dribbling | touch rhythm/length, skill touch accuracy, top speed with the ball |
| passing / shooting / finishing | contact quality and direction error; shot power |
| defensiveAwareness, tackling, interceptions | tackle reach and success, poke speed, interception reach |
| jumping, heading | jump height, header power and accuracy |

## Player & Ball Lab

`/dev/player-ball-lab.html` (`npm run lab`). Full pitch with goals and nets,
floodlit, one reference player and one ball.

- Controls: WASD move (camera-relative), Shift sprint, Q jog, Alt walk,
  J pass (hold = driven), K through ball, I lob (hold = long; wide = cross),
  L shoot (hold = power; E/R/T/F + L = finesse/low/chip/power), C stance /
  jockey / shield, X standing tackle, Z sliding tackle, B jump/header,
  G celebrate, Space + 1–8 skill moves, Backspace ball to feet, N reset,
  V camera, P pause, M slow motion, O overlays, H guide.
- Cameras: behind, side (for judging animation and foot contact), broadcast, free orbit.
- Render cap 30/60/120/144 fps: physics stays at 60 Hz.
- Sparring partner (same controller, AI input): defender, dribbler, passer.
- Panels: player (speed, acceleration, direction, animation, movement state,
  stamina, balance, ground contact, collision, possession, charge meters) and
  ball (speed, position, velocities, spin, height, contact, events).
- Overlays: velocity arrows, foot contact points, reach ring, ball trail,
  predicted trajectory.
- Ball Physics Lab tab: the ten test launches and live calibration sliders
  (drag, Magnus, rolling resistance, bounce, turf friction, spin decay).
  Calibration is developer-only and not saved.

## Honest limits (next steps)

- **Character art**: the reference player uses the project's procedural
  skinned body (22 bones, modelled kit, boots, hair). It is stylised, not
  photo-real: no sculpted face, strand hair or motion capture. A licensed or
  commissioned rigged GLB can replace it through the existing asset slot
  (`docs/PLAYER_ASSETS.md`); the engine only needs bone names and the 1.80 m scale.
- **Animation** is procedural (IK gait + authored keyframe clips), not mocap.
- **Jumps** are animated root lift; the physics capsule stays on the ground
  plane (headers use the animated head position).
- **Not integrated** into the match yet (stages 9–10), pending your approval
  of the reference player.
