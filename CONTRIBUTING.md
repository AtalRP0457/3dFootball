# Working together on Legends

Legends is a browser game built with Vite and Three.js. Keep the match rules
independent of rendering so gameplay can be simulated and tuned without a
browser. The main integration boundaries are `src/game/`, `src/render/`, and
`src/main.js`.

## Divide work by area

With four people, use these ownership areas. With fewer people, combine areas;
with more people, split the gameplay area into rules and AI.

| Owner | Main files | Work |
|---|---|---|
| Match rules and physics | `src/game/match.js`, `src/game/constants.js` | Ball motion, player movement, collisions, goals, fouls, restarts, match clock |
| AI and team data | `src/game/ai.js`, `src/data/teams.js` | Team shape, player ratings, keeper behavior, attacking and defending decisions |
| 3D presentation and sound | `src/render/scene.js`, `src/render/audio.js`, `src/style.css` | Stadium, pitch, player models and animation, cameras, effects, sound |
| Menus, modes and integration | `src/main.js`, `index.html`, `README.md` | Input-to-match wiring, HUD, cup/season flow, accessibility, player-facing instructions |

Try to keep a task within one area. When a feature crosses areas, agree on the
match event or state field first. For example, the match engine can emit a
`{ type: 'card', player, color }` event; the UI displays it and the audio layer
plays its cue. That lets each owner work against a small, clear interface.

## Set up and run

Install Node.js 18 or newer, then run:

```sh
npm install
npm run dev
```

Vite prints the local address. `npm run build` creates the production bundle.
The match engine is plain JavaScript and does not import Three.js; rendering
code reads the state produced by the engine.

## GitHub workflow

1. Keep `main` runnable. Start a short branch such as `codex/keeper-ai` or
   `feature/replays` from the latest `main`.
2. Before editing, tell the group which files and behavior the change owns.
   Avoid having two people edit `src/main.js` or `src/game/match.js` at once.
3. Make focused commits. If your work depends on another branch, agree on the
   interface and merge order before building on it.
4. Open a pull request with the player-facing change, files touched, and how
   you checked it. Have another teammate review gameplay changes in a running
   browser, not just the diff.
5. Merge one feature at a time and keep the game launching from `main`.

## Feature handoff checklist

- State what a player can now do or see.
- Identify the match state or event the feature reads and writes.
- Keep rendering details out of `src/game/` and game rules out of `src/render/`.
- Use metres and seconds in the simulation; pitch dimensions and tunable
  constants belong in `src/game/constants.js`.
- Update the tutorial or README when controls or rules change.
- Run the production build before asking for review. For a gameplay change,
  include a short manual scenario that a teammate can reproduce.

## Suggested feature order

1. Make match flow and core rules reliable: restarts, scoring, clock, fouls,
   offsides, cards, and player switching.
2. Tune movement, ball control, passing, shooting, goalkeeping, and team AI.
3. Add the missing roster and match-management features, then improve player
   models, animation, stadium presentation, and sound.
4. Finish tournament/season persistence, settings, input rebinding, and browser
   compatibility before calling the game release-ready.

The current game is a prototype. A successful build only confirms that the
files bundle; it does not by itself prove that every rule or game mode works.
