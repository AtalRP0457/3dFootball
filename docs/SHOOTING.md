# Shooting, the ball in flight, keepers and penalties

How a shot is chosen, struck, flown and saved on the engine. The numbers
are the ones the tests check (`tests/shooting.test.ts`,
`tests/shootout.test.ts`). The tools in `tests/gameplay/` measure them:
`shot-lab.ts` runs every human shot through the real input path, with or
without a keeper (`--keeper`), and `shot-stats.ts` covers full AI matches.

## The ball in flight (`packages/game-engine/ball/BallAerodynamics.ts`)

- **Drag crisis.** A ball below ~11 m/s in the air has a laminar boundary
  layer and Cd ≈ 0.42. A struck ball is turbulent, with Cd ≈ 0.25. The
  change is smoothed over ±2.5 m/s (Goff, *Physics Today* 2010: crisis at
  ~12 m/s; Asai/Hong wind tunnels). Spin adds drag (Cd + 0.1·S). The rolling
  ball keeps the calibrated Cd, so pass weights are unchanged.
- **Magnus lift.** This is unchanged, a saturating Cl(S) fit to wind-tunnel
  data.
- **Knuckling.** A ball above 14 m/s with less than 7 rad/s of spin
  (about 1 rev/s) sheds an unstable wake. A side and lift force with
  coefficient up to ~0.075 moves it about irregularly over wavelengths of
  3–5 m (Hong & Asai). Each strike picks new phases. The predictor does not
  include this force, so keepers can't read a knuckler.

## Effort → the strike (`src/game/mechanics/shooting.ts`, `shotPaceAndSpin`)

The charge (0.25 tap … 1 full) is the effort of the swing. The ball leaves
at roughly 1.2–1.3× the foot speed: a 1–2 kg effective foot hitting a
0.43 kg ball with e ≈ 0.5. Part of the run-up is added (0.3 × the speed
along the shot).

| | tap | half | hard | full / power |
| --- | --- | --- | --- | --- |
| laces (m/s) | ~18 | ~23 | ~28 | — |
| power shot (m/s) | — | — | — | ~35 |

- Laces: 2–3 rev/s of topspin.
- Finesse (side-foot): 17–25 m/s, 6.5–10 rev/s of sidespin, curling back
  inside the far post.
- Power shot: struck through the middle of the ball with little spin. A
  big hitter (shot power > 0.78) from beyond 20 m can take almost all of
  the spin off, and the ball knuckles.
- Low driven, FC 26's global modifier for every shot but the chip: press
  shoot **again** during the wind-up, or E while powering up. It is struck
  over the ball, flatter, and crosses at ~0.4 m.
- Chip: scooped at 38–46° with 3–5 rev/s of backspin. Its pace is solved
  so it drops under the bar.
- Volleys and headers are chosen from the ball's height where it reaches
  the player. A header's pace comes from the neck plus 0.35 × the incoming
  ball.
- **The swing shows the effort.** A full strike plays its clip at up to
  0.82× speed, a longer back-swing. A tap plays at ~1.06×, the minimal
  wind-up FC 26 uses for close-range finishes. While you power up, the
  dribble sets the ball into the player's stride, so the strike follows the
  release (≈0.23 s at a sprint).
- **Sound.** The strike's thump grows louder and deeper with effort.

## Aim

- The stick aims across the goal mouth. While a shot is being powered up,
  the stick aims and does not turn the run: the player keeps his line
  instead of swinging side-on.
- Effort sets the height: a tap crosses at ~0.4 m, half power at ~0.9 m,
  hard shots at ~1.6 m, a power shot at ~1.6 m. Low drives cross at ~0.4 m.
- With no stick, the shot goes where the body faces, inside the posts.
- **Solver.** The launch elevation (or a chip's pace) is found by bisection
  and the direction by secant steps, both on the engine's own predicted
  flight. Every type crosses within 0.1 m of its target with error
  switched off. The engine gets the planner's spin, so curl and dip match
  what was solved, and a strike re-aims at contact by the change in bearing
  (keeping the curl allowance).

## Error

The angular spread (σ) starts from the attribute for that shot:

- finishing up to 14 m, blending into long shots by 26 m, with a 25%
  share of shot accuracy;
- curve for a finesse shot;
- heading for headers;
- balance and first touch for volleys;
- finishing and accuracy for penalties.

It is then multiplied by:

- effort and technique (a power shot is ×1.6, a chip ×1.7);
- running pace;
- body shape: the angle between facing and the shot, which counts fully
  at a sprint and about a third when standing on the ball;
- the ball being away from the foot;
- pressure (an opponent within 2.6 m, less for a composed finisher);
- a first-time strike (incoming pace);
- distance;
- fatigue and injury;
- AI difficulty.

Height error uses 0.72 σ. Two things add a lift on top of that:

- **Leaning back** at pace when striking hard (worse with poor balance).
- **Over-hitting** near full effort skies it: above 0.9 power the shot
  lifts, ×1.6 on a penalty.

At contact the engine also applies its contact quality: the foot used
(weak foot), balance, the gap to the ball and the incoming pace. A mishit
loses pace and gains spin noise.

## Keepers (`src/game/mechanics/goalkeeping.ts`)

A save is physical; it is no longer a dice roll when the ball comes near
him.

1. **Positioning.** He stands on the line from the ball to the middle of
   the goal (the bisector of the angle), 1.1–2.6 m off his line. A poorer
   positional keeper drifts towards the near post.
2. **Reaction.** He reads the shooter's body and the strike: 0.13 s
   (elite) to 0.25 s (poor), plus 0.12 s when the shot comes through
   bodies (screened). Before that he can only stop what is hit at him; a
   keeper set close to the shooter is spread big.
3. **Reading and the dive.** He shuffles across while there is time, then
   dives just in time for where the predicted flight will pass him.
   - Hand reach grows from 0.75 m (arms) to 0.75 + 1.35–2.2 m (diving
     rating, height) over 0.6–0.74 s.
   - The first step is quick and the full stretch comes late.
   - Top corners need ~12% more stretch.
   - Once he has dived, the direction is fixed. A set keeper can still go
     if the ball moves away from him.
4. **Contact.** The real ball (knuckle and deflections included) meets his
   plane. The margin between his reach at that instant and the reach he
   needs, plus the ball's pace and his handling, decide the outcome:
   - **Held** when it's at him, slower, and he has good hands.
   - **Parried** away from danger, wide and back out (FC 26 deflection
     control), or over the bar when high. Poor hands push it into the
     middle.
   - **Fingertips** at full stretch only bend the ball. It can still go in
     or hit the post.

Results:

- **Lab** (Courtois, unpressured, 12–16 shots per case):
  - taps and placed half-power shots are mostly saved;
  - hard and power shots score 30–50%;
  - finesse shots into the far corner score 35–60%;
  - a shot at him is never a goal.
- **AI matches:** about 50% of shots on target are saved. Most AI shots
  are close-range finishes (mean 12.5 m).

## Penalty shoot-out (Law 10, `startShootout` in `src/game/match.ts`)

- **Setup.**
  - The referee picks one goal for both teams; a coin toss decides who
    kicks first.
  - Only the players on the pitch at the end take part, in equal numbers.
  - The best penalty takers go first and the keepers last. Every eligible
    player kicks once before anyone kicks twice.
- **Order and finish.**
  - Kicks alternate A B A B, five each.
  - The shoot-out stops as soon as one team can't catch up.
  - Then sudden death in pairs.
- **Positions.**
  - The others stand in the centre circle.
  - The kicking team's keeper waits where the goal line meets the penalty
    area.
  - The keeper facing the kick stays on his line until it is struck
    (Law 14).
- **Each kick.** It is lined up behind a fade to black, so nobody slides,
  and played on the engine:
  - the kicker holds shoot for power and aims with the stick (over-hitting
    skies it);
  - the keeper commits at the kick, either on a guess (a good keeper
    reads it more often) or the human's stick direction;
  - the kick is over once the ball is held, stops, goes out or crosses the
    line, and the kicker may not play it again.
- **Where it appears.**
  - The menu's Penalty Shootout mode.
  - Cup ties still level after extra time.
  - Any match with **Draws: Penalty shoot-out**.
- **HUD.** Five marks per team (more in sudden death). The camera sits
  behind the taker.
- **Measured.** Over six AI shoot-outs, 84% of kicks scored (real
  shoot-outs run around 75%). Nobody moved more than 0.12 m in a step
  during a kick.

## Sources

- EA SPORTS FC 26 Pitch Notes, Gameplay Deep Dive (July 2025):
  - low driven as a global modifier (press shoot again, every type but the
    chip);
  - timed finishing removed in favour of "precision shooting" (timing,
    aim, power control, shot selection);
  - minimal wind-up close in;
  - keeper deflections away from danger;
  - more physical rebounds, blocks and bounces.
- J. E. Goff, "Power and spin in the beautiful game", *Physics Today* 63(7)
  2010: the drag crisis near 12 m/s, free-kick sidespin of ~600 rpm, and a
  Magnus force comparable to the ball's weight.
- Hong & Asai, knuckling-effect studies: unstable side forces at low spin
  near the drag crisis.
- Goalkeeper dive studies (Frontiers in Sports and Active Living 2019,
  2020; ISBS 2005; van der Kamp): ~0.5 s from the spot to the line,
  ~0.6 s to reach a low corner and ~1 s for the top corner, faster dives
  to the low corners.
- IFAB Laws of the Game: Law 10 (penalties), Law 14 (the penalty kick).
