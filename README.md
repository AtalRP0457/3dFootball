# Legends — prototype

A 3D arcade soccer game in the spirit of FIFA 98, built with three.js.
Ten decade teams (1910–2000) of all-time greats, 5-a-side, played in the browser on localhost.

## Run it

You need Node.js 18 or newer.

```bash
cd 3dfootball
npm install      # first time only
npm run dev      # then open the http://localhost:5173 link it prints
```

`npm test` runs the headless match simulations (no browser needed).

## Modes

- **1 Player vs AI**: you pick your team and an AI opponent (Easy / Normal / Hard).
- **2 Players**: same keyboard (or two gamepads).
- **Watch AI vs AI**

## Controls

| Action | Player 1 | Player 2 | Gamepad |
|---|---|---|---|
| Move | W A S D | Arrow keys | Left stick / D-pad |
| Pass, or switch player (without the ball) | F or Space | `.` | A / Cross |
| Shoot (hold for power), or tackle (without the ball) | G | `/` | B / Circle |
| Sprint | Left Shift | Right Shift | RT / RB |
| Pause | Esc or P | | Start |
| Change camera | C | | |

- When you pass, you take control of the player receiving the ball, and the passer goes back to the AI.
- When an AI teammate wins the ball, control jumps to them.
- While shooting, hold up or down to aim at the far or near corner.
- In 1-player mode the arrow keys also work for you.

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

Add an entry to `TEAMS` in `src/data/teams.js` with five players in the order
GK, DEF, DEF, MID, FWD. It appears in the menu automatically.

## Not in the prototype yet

11-a-side, offside, fouls and penalties, halftime side switch, audio,
tournament or career modes, replays, proper player models.
