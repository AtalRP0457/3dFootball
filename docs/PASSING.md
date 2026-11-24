# Passing model

How a pass is chosen, struck, flown and received on the engine. Numbers are
the ones the tests check (`tests/passing.test.ts`); the tools in
`tests/gameplay/` measure them (`pass-lab.ts` per pass type, `pass-stats.ts`
over full AI matches, `roll-calib.ts` for the rolling ball).

## Ball

- The engine ball (Rapier) is physically right and is not tuned for passing.
  A rolling ball decelerates by F / (m + I/r²), 60 % of the sliding value for
  the hollow size-5 ball, because friction must also slow its spin; the
  rolling-resistance torque adds 40 % of that force. Measured: 0.67 m/s² at
  4.6 m/s, 1.46 at 11, 3.0 at 18.
- A ground pass leaves the foot with 85 % of rolling spin (`PASS_ROLL_SPIN`)
  and skids for an instant, keeping ~94 % of its pace.
- `predictTrajectory` (used by the AI, receivers, solvers) models the same
  rolling and skid, and `firstLanding` finds the first bounce even between
  samples. Predicted vs engine: within 0.1 m over 3 s rolling, 0.3 m landing.

## Weight (ground, driven, through)

`passArriveSpeed` sets the speed a pass should still have at the receiver;
`MatchPhysics.groundLaunch` / `groundTime` solve the engine's rolling model in
closed form (v = c·tan φ), so the kick and the receiver lead use one model.

| | 6 m | 12 m | 20 m | 30 m |
| --- | --- | --- | --- | --- |
| ground arrival (m/s) | 6.5 | 8 | 10 | 12.5 |
| launch (m/s) | ~7.7 | ~10.1 | ~13.5 | ~18.2 |

Driven: arrival 10.5 + 0.22·d (12-18 m/s). Through: 3.5 + 0.12·d (4-7.5 m/s)
into the runner's stride. Holding pass scales the arrival 0.7× (soft) to
1.5× (full).

## Lofted, long balls, crosses

- Elevation by distance (`loftElevation`): 20 m → 34°, 35 m → 31°,
  50 m → 28°, 60 m → 26°; crosses 19°; chips 42°.
- Backspin (`loftBackspin`, matching the engine kick table): lob 22 rad/s,
  long ball 35 rad/s (~5.6 rev/s), cross 15 rad/s with ±32 rad/s curl.
- `loftedFlight` solves launch speed and flight time with the engine's own
  trajectory. The ball drops just short of the receiver (94 %, 97 % assisted)
  and the lead uses the real flight time. A 50 m ball: ~28 m/s, ~3 s.
- Curled strikes (crosses) are started outside the aim line by the angle the
  curl bends them back (`curlAngle`).
- A through ball chosen beyond 38 m is played over the top (lofted).

## Accuracy

Angular spread (planner `sigma`) uses the rating for that pass:
short passing up to ~18 m blending into long passing by ~38 m; vision for
through balls (also their lead); crossing for crosses; long passing (+ vision)
for lofted balls; keeper distribution for keepers. It grows with distance,
running pace, passing more than ~45° across the body, pressure, fatigue,
injury, AI difficulty, and a first-time strike (incoming pace, and how far
the ball is turned: played on in its own direction is hardest).
Elite short passer ~0.5°, poor ~2.4° on a 15 m pass.

The engine adds contact quality: weak foot (1★ 0.76 … 5★ 1.0 quality, from
the database weak-foot rating), balance, gap to the ball. A planned strike is
re-aimed at contact from where the ball really is (`KickRequest.target`), so
lining up or a last touch does not shift the pass onto a parallel line.

## Receiving

- First touch (`receive`): difficulty from the ball's pace relative to the
  player, its height, how sharply the touch turns it, an opponent within
  2.5 m, and stretching; first touch (60 %) and ball control (40 %) decide
  how much of it becomes a heavy touch. A heavy touch keeps part of the ball's
  pace and glances off; the player can't play it again until he catches it up.
- AI receivers meet the ball at the earliest point they reach at a firm run
  (`receivePoint`), on the engine-accurate predicted path.
- A defender needs ~0.16-0.24 s to react to a pass struck past him; before
  that he only gets it if it is played into him.

## Choosing the pass

`laneRisk` (shared by human target choice and AI): for each opponent, where
he will be after the wind-up, the time the ball needs to pass the nearest
point of the lane versus his reaction + run time; a defender standing in the
path counts fully. The AI weighs it heavily, holds a risky pass unless he is
about to be tackled, and under tight pressure looks for the safe ball.

## Sources

- EA SPORTS FC 26 Pitch Notes, Gameplay Deep Dive (July 2025): first-touch
  difficulty factors, passing lanes for through balls, faster short passes,
  less accurate first-time passes behind the player, more driven lobs.
- FC 26 PlayStyle descriptions (Incisive / Pinged / Long Ball / Tiki Taka /
  Whipped Pass) for which attribute governs which pass type.
- eFootball attribute guides: weak-foot rating scales lofted / driven pass
  accuracy.
- Turf ball-roll test ranges (FIFA / DIN 18035-7) for rolling deceleration.
