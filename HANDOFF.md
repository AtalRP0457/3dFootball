# Legends handoff

## Objective

Continue building and publishing a polished browser 3D arcade football game,
inspired by late-1990s football games without using FIFA branding or assets.

## Repository state

- Workspace: `/Users/swoyambanskota/Desktop/PROJECTS/3dFootball`
- Remote: `https://github.com/AtalRP0457/3dFootball.git`
- Branch: `codex/gameplay-expansion`
- Latest commit: `26ecfcb Animate team celebrations after goals`
- Local preview: `http://127.0.0.1:5174/`
- Working tree was clean after the latest commit.

Run locally:

```sh
npm install
npm run dev -- --host 127.0.0.1
npm test
npm run build
```

## GitHub blocker

No work has been pushed from this environment. `git push -u origin
codex/gameplay-expansion` fails with:

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

Authenticate GitHub HTTPS in the environment, then push the existing branch.
Do not reset or rewrite branch history.

## Current product

### Match modes

- 1 Player vs AI
- 2 Players local multiplayer
- AI vs AI spectator match
- Decades Cup: eight-team knockout bracket, extra time, playable penalties
- Career Season: 18 matchdays, table, saved progression
- Penalty Shootout: standalone player-controlled penalties
- Practice: open play, easy AI, no halftime or full-time whistle
- Indoor Soccer: five-a-side, boards, no offside, indoor presentation

### Gameplay and rules

- Player movement, dribbling, sprinting, passing, tackles and goalkeeper AI.
- Directional passing and automatic receiver control.
- Short-pass correction: rolling speed is now calculated from intended pass
  distance; nearby aimed teammates are preferred over long passes.
- Charged shots: hold Shoot to fill an on-screen power bar, release to shoot.
- Kickoff, throw-ins, goal kicks, corners, free kicks, penalties and walls.
- Offside including nearby interference cases; indoor soccer explicitly disables
  offside.
- Yellow/red cards, injuries, substitutions, formations and tactics.
- Restart double-touch, direct throw-in goal and direct/indirect free-kick
  restrictions.
- Extra time before Cup shootouts, then five kicks and sudden death.

### Presentation and UI

- Three.js stadium, pitch, crowd, goals, procedural sound, ball shadow and
  goal replay.
- Detailed procedural players: kit numbers front/back, jersey panel texture,
  collar/sleeve/shorts/sock trim, hair and basic facial features.
- Goal celebrations animate the scoring outfield players.
- Camera improvements: tighter default broadcast view, final-third attack zoom,
  close camera with 40-degree FOV, tighter indoor framing.
- Retro navy/blue/red/white original menu styling, mode cards and selected-mode
  briefing panel.
- Keyboard, gamepad and touch controls, pause, tutorial, audio and camera
  buttons.

## Important implementation files

- `src/game/match.js`: state, rules, physics, passes, shots, restarts,
  substitutions, extra time.
- `src/game/ai.js`: team/player/keeper AI.
- `src/game/constants.js`: physics, formations and `INDOOR_FORMATION`.
- `src/render/scene.js`: Three.js presentation, player geometry, cameras.
- `src/main.js`: menus, modes, Cup/Career persistence and HUD.
- `src/game/input.js`: keyboard/gamepad/touch mapping.
- `tests/sim.test.mjs`: headless gameplay regression coverage.

## Verification

At the latest implementation state:

```sh
npm test
npm run build
```

both passed. CI is included at `.github/workflows/ci.yml`; after GitHub access
is connected, pushes and pull requests will run `npm ci`, `npm test` and
`npm run build`.

## Key commits

- `7431e84` match rules, modes and team management
- `906468d` formations and set pieces
- `45e4afc` / `79ebbe8` touch controls, pause and camera
- `31e2e98` through `098be52` offside and restart edge-case rules
- `7ef9014` / `da26548` Cup shootout records and old-save compatibility
- `ef50dca` playable Cup shootout, closer camera, short-pass/UI/model work
- `5c5c4a9` Practice and standalone penalties
- `8bb7bdf` / `fa07fbb` Indoor five-a-side and management behavior
- `a47adb6` calibrated short passes
- `57cde96` kit patterns and trim
- `c9e2c2b` no indoor offside
- `8b04fd2` selected-mode briefing
- `c514594` / `608ea05` Cup extra time and documentation
- `dce4c33` dynamic camera zoom and reliable restart-test assertion
- `6aa57be` GitHub Actions CI
- `26ecfcb` goal celebrations

## Bugs already fixed

- Short passes overshot because the old speed formula added too much fixed
  power.
- Cup shootout UI existed but had not been wired into gameplay/bracket state.
- AI halftime substitutions crashed because an event referenced undefined
  `teamIdx`; use `team.index` instead.
- Older saved Cup state lacked penalty tally fields.
- Restart edge cases: duplicate touches, direct own goals, direct throw-in
  goals, and indirect free-kick goals.
- Tests had stale pitch dimensions, wrong throw-in ownership and randomized
  false failures around restart categories and AI shot volume.

## Known limitations / suggested work

- The indoor variant uses five-a-side rules and boards but still shares the
  primary stadium and pitch scale; a dedicated small indoor arena is the most
  valuable remaining visual task.
- Player faces and animations are procedural, not realistic portraits or
  motion capture.
- No online multiplayer/network synchronization.
- No commentary voice system, transfer market, roster editor, weather or
  separate stadium selection.
- Foul/offside behavior does not implement every real football-law edge case.
- Before release, manually play every mode with keyboard, gamepad and touch.
- After GitHub authentication, push `codex/gameplay-expansion` and open a PR.
