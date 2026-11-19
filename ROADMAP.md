# Legends development roadmap

Legends is a playable prototype, not a FIFA 98 feature-complete game. This
roadmap keeps the full target visible and gives each contributor a clear area
to own. Agree on the state or event interface before a feature crosses areas.

## Work areas

| Owner | Primary files | Main responsibility |
|---|---|---|
| Match simulation | `src/game/match.js`, `src/game/constants.js` | Rules, ball and player physics, collisions, restarts, clock, match flow |
| AI and football systems | `src/game/ai.js`, `src/data/teams.js` | Team behavior, goalkeepers, ratings, tactics, squads and roster data |
| Graphics and audio | `src/render/scene.js`, `src/render/audio.js`, `src/style.css` | Stadiums, player models and animation, camera, effects, sound and HUD styling |
| Modes and integration | `src/main.js`, `index.html` | Menus, controls, match setup, tournament and season flow, saving and accessibility |

Keep the match simulation independent of Three.js. It should emit events for
presentation (for example, a save or booking); rendering and audio consume
those events without changing game state.

## Milestones

### 1. Reliable match loop

- **Simulation / AI:** tune movement, first touch, passing, shooting, tackling,
  goalkeeper saves and player separation; complete restarts and match-end cases.
- **Presentation:** make player movement, kicks, tackles, dives, goals and
  referee decisions readable; keep the ball and player markers visible from
  every camera mode.
- **Modes:** make kickoff, pause, halftime, replay, full time, rematch and quit
  work consistently for 1P, 2P and CPU matches.
- **Done when:** a teammate can play several full matches in each controller
  mode, reproduce no stuck phases or unhandled restarts, and review any known
  rule shortcuts in the README.

### 2. Football rules and match management

- Finish offside decisions, fouls, advantage or free kicks, penalties, cards,
  injuries, substitutions, extra time and shootouts as chosen for each mode.
- Make formations and tactics change team behavior in ways players can see.
- **Done when:** each implemented rule has a repeatable manual scenario and
  the UI, simulation and audio agree on the resulting event.

### 3. FIFA 98-inspired match variety

- Scope the signature variants before coding: indoor 5-a-side, alternate
  stadium or pitch presentation, and any special rules each variant needs.
- Add match setup options and make the AI and controls work in each variant.
- **Done when:** each selectable variant has its own verified rules, field
  layout, camera framing and complete match flow. Do not label a variant
  complete just because it reuses the standard 11-a-side match.

### 4. Teams, tournaments and career

- Review squad accuracy and balance; finish roster editing, team selection,
  tournament progression, season tables, results, saves and restart behavior.
- Decide which historic teams and presentation details are original content
  and which need sourced or commissioned assets.
- **Done when:** saved campaigns survive reloads and can be completed or
  restarted without corrupting standings or fixtures.

### 5. Presentation and release

- Replace or refine procedural models and stadium art; add animation variety,
  crowd and commentary options, transitions, menus, sound controls and
  accessibility details.
- Check desktop and mobile layouts, keyboard, gamepad and touch controls,
  performance, browser compatibility and loading behavior.
- **Done when:** the group has reviewed complete matches on its target devices,
  documented known limitations, and can launch the release build from a clean
  checkout using the README instructions.

## Collaboration cadence

1. Pick one milestone item and name one owner before editing.
2. Keep each change on a short-lived branch; avoid simultaneous edits to
   `src/main.js` or `src/game/match.js` by agreeing on interfaces first.
3. The owner writes a short manual scenario and requests review from another
   teammate. For visual work, include a screenshot or short recording.
4. Build and review the integrated branch before merging. Simulation changes
   also need targeted gameplay checks; a passing build only proves bundling.
5. Update this roadmap and the README when a milestone is actually complete.

## Current status

The project has 11-a-side decade squads, 1P/2P/CPU matches, a Decades Cup,
Career Season, basic rules and match management, touch controls, procedural
stadium graphics, sound, goal replays and player-controlled cup shootouts. It still lacks several rule details,
the signature FIFA 98 variants, extensive animation and presentation, and
release-level verification. Keep those gaps visible while developing.
