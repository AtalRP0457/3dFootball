# Futbol Super League database

The game runs entirely in the browser (Vite + three.js), so the database is a
normalised in-memory model built from seed files at startup, plus user data in
`localStorage`. There is no server; nothing needs to be installed beyond
`npm install`.

## Seed data (source of truth)

| File | Contents |
| --- | --- |
| `src/db/seed/clubs.js` | 104 clubs: names, parody names, country, league, colours, stadium, crest design, home/away/third/GK kits |
| `src/db/seed/nations.js` | 52 national teams: names, parody names, confederation, flag layout, emblem, kits |
| `src/db/seed/rosters/*.js` | Squads per roster profile: `modern` (2024-25, all 156 teams), `fifa18`, `fifa14`, `fifa07` (top clubs) and `legends` (all-time XIs), one line per player: `Name|Position|Overall|Shirt|Nation|Foot|Pace` |
| `src/db/parody.js` | Hand-written parody names for famous players + a deterministic pun generator for everyone else |
| `src/data/teams.ts` | The original ten decade legends teams (kept as the "Decade Legends" pool) |

Ratings are this game's own estimates on a 1–99 scale, not EA data. Detailed
attributes (pace, finishing, vision, GK diving, ...) are derived from each
player's position profile and overall rating, with an optional pace value per
player; every attribute can be edited in-game (Player Database tab).

## Tables (`src/db/index.ts`)

| Table | Key | Relations |
| --- | --- | --- |
| `clubs`, `national_teams` | `id` (`fcb`, `n-esp`) | `stadium_id → stadiums` |
| `club_aliases` | `<teamId>:parody` | `club_id → clubs/national_teams` |
| `club_logos` | `<teamId>:original` / `:parody` | `team_id`, file path under `public/` |
| `stadiums` | slug of name | |
| `kits` | `<teamId>:home|away|third|gk` | `team_id` |
| `players` | slug of name (one record per real person) | |
| `player_aliases` | `<playerId>:parody` | `player_id → players` |
| `rosters` | `<era>:<teamId>` | `team_id` |
| `roster_members` | `<era>:<teamId>:<playerId>` | `roster_id → rosters`, `player_id → players`; holds the era-specific rating, shirt, position |
| `formations`, `competitions` | `id` | |

Changing club or player identity only changes which alias is displayed; IDs,
ratings and relationships never change, and no records are duplicated.

## User data and migrations (`src/state/store.js`)

User settings, saved squads (`<era>:<teamId>`), rating edits (per roster
member), the custom Ultimate Team, favourites, head-to-head records, results and
tournaments are stored in `localStorage`. `fsl-data-version` tracks the schema:

- **v1 → v2**: saved squads re-keyed by roster profile (old decade squads become
  `decades:<id>`); legacy settings that point at decade teams get the
  `decades` pool. Old data is copied forward, never deleted.

Settings → **Export saved data** / **Import saved data** moves everything as JSON.

## Assets

`npm run assets` (also run automatically before `npm run build`) writes original
crest SVGs to `public/assets/clubs/logos/` (`<id>.svg`, `<id>-parody.svg`) and
kit SVGs to `public/assets/kits/`. These are club-*inspired* originals, not
official badges.

**Licensed logos:** put files you are licensed to use in
`public/assets/clubs/logos/official/` and map team IDs to file names in
`manifest.json` there, e.g. `{ "fcb": "fcb.png" }`. They replace the original
art in authentic mode everywhere (select, preview, management, scoreboard).

## Validation

`npm run db:validate` checks unique IDs, names, countries, logos, kits, roster
links, positions, ratings, shirt numbers, squad sizes, parody-name uniqueness
and that every asset file exists, then writes `reports/db-validation.md`
(exit code 1 on errors). The same checks run in-game under Settings →
Database check. `npm test` runs the engine tests, database tests and validator.
