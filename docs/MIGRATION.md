# TypeScript + React migration

Goal: one strictly typed codebase. React renders the menus and the in-match
HUD; the game (engine, physics, AI, 3D renderer) stays framework-free
TypeScript and runs in its own fixed-timestep loop, with React only hosting
the canvas. The game keeps working at every step of the migration.

## Tooling (done)

- TypeScript 5.9 `strict`, `allowJs` while JS files remain (`tsconfig.json`).
- React 19 with `@vitejs/plugin-react` (`vite.config.ts`).
- `npm run typecheck` (tsc --noEmit); CI runs it before the tests.
- Tests run through `tsx`, so they import `.ts` files on any Node version.
- Imports use explicit `.ts` / `.tsx` extensions.

## Status

| Area | Files | State |
| --- | --- | --- |
| Shared types | `src/types/game.ts`, `src/types/db.ts` | done |
| Engine | `src/game/**` (match, ai, input, physics, mechanics, identity, constants) | **TypeScript (strict)** |
| In-match HUD | `src/ui/hud/Hud.tsx`, `hudStore.ts` | **React + TypeScript** |
| Data | `src/db/**` (tables, team service, crests, validation, seeds), `src/data/**`, `src/state/**` | **TypeScript (strict)** |
| 3D renderer | `src/render/**` (scene, character, stadium, viewer, audio) | JavaScript, next |
| Menus | `src/ui/frontend.js`, `hero.js`, `art.js` | JavaScript, React screen by screen |
| App shell | `src/main.js` | JavaScript, becomes `App.tsx` + a `GameHost` canvas component last |

## Order for the rest (each step lands separately, tests + typecheck green)

1. ~~`src/db`, `src/state`, `src/data` to TypeScript~~ (done: seed, table,
   player card and built team types in `src/types/db.ts`).
2. `src/render` to TypeScript (Three.js has its own types).
3. Menus to React, one screen per PR, sharing a small settings/session
   store: title and hub, team select (the 3D viewer becomes a `<PlayerViewer>`
   component), match preview, team management, players, settings. The old
   screen is deleted when its React version lands.
4. `main.js` becomes `App.tsx` (routes, overlays: pause, full time, cup
   bracket, tutorial) and `GameHost` (owns the canvas, renderer, loop,
   input and match).

Coordinate step 3 with whoever is working on the menus: one person per
screen at a time to avoid merge conflicts.
