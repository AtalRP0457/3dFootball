# Game engine: reference player & ball (`packages/game-engine`)

The permanent foundation for every footballer and every ball interaction.
Strict TypeScript (`strict`, `noImplicitAny`, `strictNullChecks`,
`noUnusedLocals`, `noUnusedParameters`), Rapier physics, React Three Fiber
rendering, Zustand UI state. It is **not yet wired into the match**: by
request, the reference player is approved in the Lab first.

## In the match

`src/game/engineBridge.ts` runs every outdoor match on this engine (setting
**Physics: Gold Standard engine**, the default; **Classic** keeps the old
physics). The match keeps the football – rules, restarts, offside, cards, AI
and human decisions, pass targeting, keeper judgement – and the engine does
the physics:

- every player on the pitch is a Rapier body on the shared PlayerController
  (intents become PlayerInput; difficulty, stuns and injuries scale speed);
- match pass/shot decisions become engine kicks: the planner still picks the
  receiver and lead point or the corner, the speed is re-solved for the real
  rolling ball (ground passes) or with the engine's trajectory predictor
  (lofted passes), and the match bookkeeping (offside, shot stats, control
  switch) runs when the foot actually releases the ball;
- tackles are physical: won (foot reaches the ball), missed, or a foul when
  the foot catches the dribbler's legs (free kick / penalty / cards);
- possession changes from the engine go through the match rules (double
  touch, offside on receiving, back-pass, keeper picking up);
- the scene draws engine poses (interpolated); keeper dives/holds, throw-ins
  and goal celebrations keep their existing clips.

The match pitch runs along x and the engine's along z; the bridge rotates
between them. `npm run test:match-engine` plays the staged checks (1, 2, 5 and
22 players, plus human pass/shot) through the real match code.

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

## Player–ball interaction (one authority)

`PlayerBallInteraction` exists **once per Simulation** and is the only code
that changes the ball's velocity. Players, AI, skills and tackles *queue*
impulses with it; `flush()` applies exactly one per fixed step (kicks and
tackles beat blocks and first touches, which beat dribble touches) before
Rapier steps. The Architecture test fails if any other engine file writes
ball velocity.

### Possession state machine

`FreeBall → PossessionAcquired → ControlledDribbling / SprintDribbling /
TurningWithBall → Passing / Shooting → BallReleased → FreeBall`, plus
`PossessionLost` (ball escaped, tackled, blocked). Every transition is a
`BallPossession` event with its reason.

### Dribbling

Touches happen on foot strikes, or earlier when the ball would leave the
control zone or the stick changes direction. Each touch is solved so the
rolling ball reaches **where the player will be** (the movement model is run
forward under the current input) plus a lead ahead of him, in his local
frame, to the side of the foot that plays next (alternating feet). Reach
grows with stride length. If the stick turns away while the ball is out of
reach, the player first steps to the ball, then turns it with a directional
touch. Releasing the stick cushions the ball to his slowing pace and puts
the sole on it. Touch kinds: slow, normal, sprint, directional, stop;
surfaces: inside, outside, laces, sole.

### Passing and shooting pipeline

`J/K/I/L released → hold time → power (tap 25%, 0.3 s 50%, 0.6 s 75%, 0.9 s
100%) → PassCommand/ShotCommand requested → accepted | buffered (running onto
the ball or lining up) | rejected (with reason) → wind-up: the player adjusts
his approach so the striking foot meets the ball → BallContact at the
animation contact frame (forward kinematics of the foot) → BallImpulse →
BallRelease`. Ball speed = foot speed × (1 + e)·M/(M + m) × technique
(skill, balance) × contact quality; foot speed comes from the shot/pass type
and the input power, never from randomness. Direction error comes from
skill and contact quality only.

### Debugging an action

The Lab's left panel shows movement state, animation, current action,
velocity, direction, stick, possession, selected foot, the J/K/I/L buttons
held, hold duration and power, and for the ball its owner, possession and
physics state, last contact and last impulse. The event log lists every
step of the pipeline, so a failing action shows exactly where it stopped.
The **Gameplay tests** tab runs tests A–D (dribbling, passing, shooting,
possession) live with scripted controller input; `npm run test:engine` runs
the same scripts headlessly.

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
- **Keepers** still use the match's save model and their own animations
  (dives, catches, holding); the engine has no goalkeeper hands yet. Their
  saves and throws go through the interaction authority as rules impulses.
- **Indoor fives** (rebound boards) and the **penalty shoot-out** mode still
  run on classic physics.
