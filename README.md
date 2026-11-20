# Legends — prototype

A 3D arcade soccer game in the spirit of FIFA 98, built with three.js.
Ten decade teams (1910–2000) of all-time greats, 11-a-side in a 4-3-3 formation, played in the browser on localhost.

## Run it

You need Node.js 18 or newer.

```bash
cd 3dfootball
npm install      # first time only
npm run dev      # then open the http://localhost:5173 link it prints
```

`npm test` runs the headless match simulations (no browser needed).

If you're building with friends, see [CONTRIBUTING.md](CONTRIBUTING.md) for
the code ownership split, local setup, and GitHub branch/review workflow. See
[ROADMAP.md](ROADMAP.md) for milestones toward a fuller FIFA 98-inspired game.

## Modes

- **1 Player vs AI**: you pick your team and an AI opponent (Easy / Normal / Hard).
- **2 Players**: same keyboard (or two gamepads).
- **Watch AI vs AI**
- **Decades Cup**: an 8-team knockout tournament with quick AI-simulated fixtures. Tied user matches play extra time, then go to playable penalties: aim each shot, choose a keeper dive and continue through sudden death if needed.
- **Penalty Shootout**: a standalone sudden-death shootout where you place shots and choose your keeper's dive.
- **Practice**: your full team against just their goalkeeper, with no clock, halftime or full-time whistle.
- **Indoor Soccer**: fast five-a-side play with active side and end boards that keep the ball in motion. Indoor sides use their own compact shape; substitutions remain available from Team Management.
- **Career Season**: an 18-matchday, 10-team league with AI-simulated matches, standings and saved progress.
- **Full 11-player teams** with four named reserves, up to three substitutions, 4-3-3/4-4-2/3-5-2 formations, full-size pitch, halftime end switch, offside calls, fouls, free kicks, penalties and yellow/red cards
- **Goal replays** show the last four seconds from the broadcast camera; press R or use Skip Replay to return to play.
- **Procedural match sound** for kicks, tackles, saves, whistles, goals and crowd ambience; toggle it in the HUD
- **Team management** from the pause menu: choose formation, set balanced/attacking/defensive support shape, and make up to three substitutions

## Modes and options

- **1 Player vs AI** (Beginner / Easy / Normal / Hard), **2 Players**, **Watch AI vs AI**
- **Interactive tutorial**: practice with a checklist (move, sprint, get the ball, pass, shoot, change player, score)
- **Assist** (menu): Off / Assisted (default) / Full. Assisted bends your run onto a loose ball when you press roughly towards it.
- **Developer options** (menu or pause): game speed slider (default 75%) and the debug overlay. Remembered between visits.
- **Tackle drill** (Developer options → Checks): an attacker runs at your defender over and over; tackles won / tried are counted.
- **Debug overlay**: F1 or the ` key. Shows keys pressed, inputs, assist, ball, AI states.
- Matches have a halftime and teams change ends.

## Controls

| Action | Player 1 | Player 2 | Gamepad |
|---|---|---|---|
| Move | W A S D | Arrow keys | Left stick / D-pad |
| Pass, or switch player (without the ball) | F or Space | `.` | A / Cross |
| Shoot (hold for power), or tackle (without the ball) | G | `/` | B / Circle |
| Sprint | Left Shift | Right Shift | RT / RB |
| Touch screen | Virtual stick + action buttons, Pause, Camera | | |
| Pause | Esc or P | | Start |
| Change camera | C | | |

- **Rings under players:** green = the player you control, yellow = who you get next
  (your pass target with the ball, your switch target without it), red = computer-controlled.
- The menu and pause screen have a **How to play** page with step-by-step instructions.
- When you pass, you take control of the player receiving the ball, and the passer goes back to the AI.
- When an AI teammate wins the ball, control jumps to them.
- When the opponent wins the ball and another teammate is clearly closer, control jumps to that teammate.
- Throw-ins can only be thrown: pressing Shoot on a throw-in throws it.
- While shooting, hold up or down to aim at the far or near corner.
- Player 1 always uses W A S D; player 2 always uses the arrow keys.
- A flashing orange ring on an opponent means he's close enough to tackle.
- The panel at the bottom shows which keys do what right now.

## Project layout

```
src/
  data/teams.js        10 decade teams: players, ratings, kits (edit freely)
  game/constants.js    pitch size, physics, difficulty, formation
  game/match.js        rules, ball physics, passing/shooting/tackling, restarts
  game/ai.js           team AI and goalkeepers
  game/input.js        keyboard and gamepad
  render/scene.js      three.js stadium, players, ball, camera
  main.js              menus, HUD, game loop
tests/sim.test.mjs     headless simulations
```

The rules, AI and team data in `src/game` and `src/data` don't use three.js,
so they can be ported to Unity or Godot later. Only `render/` and `main.js`
would need rebuilding.

## Adding a team

Add an entry to `TEAMS` in `src/data/teams.js` with eleven starting players in
the order GK, DEF, DEF, MID, FWD, DEF, DEF, MID, MID, FWD, FWD, plus a `bench`
array with reserve roles and ratings. It appears in the menu automatically.

## Still in progress

The prototype now has basic offside calls for receiving the ball and for
nearby challenges, plus foul and card decisions, rare injuries, and pause-menu
substitutions. It does not yet model every Laws of the Game detail, including
line-of-sight offside interference, all foul decisions, full player animations,
or complete match presentation.
