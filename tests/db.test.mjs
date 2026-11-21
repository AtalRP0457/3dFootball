// Database + identity tests (run with: npm test)
import { DB } from '../src/db/index.ts';
import { validateDatabase } from '../src/db/validate.ts';
import { buildTeam, configure, isPlayable, resolveKitClash } from '../src/db/teams.ts';
import { createMatch, stepMatch } from '../src/game/match.ts';
import { FIXED_DT } from '../src/game/constants.ts';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  FAIL:', msg); } };

console.log('Database integrity');
const report = validateDatabase();
check(report.errors.length === 0, `validation errors: ${report.errors.slice(0, 3).join('; ')}`);
check(DB.clubs.length >= 100, `100+ clubs (${DB.clubs.length})`);
check(DB.national_teams.length >= 50, `50+ national teams (${DB.national_teams.length})`);

console.log('Identity modes (tests B and C)');
configure({ era: 'modern', clubIdentity: 'authentic', playerIdentity: 'real' });
const realB = buildTeam('fcb'), realR = buildTeam('rma');
configure({ era: 'modern', clubIdentity: 'parody', playerIdentity: 'parody' });
const parB = buildTeam('fcb'), parR = buildTeam('rma');
check(realB.name === 'FC Barcelona' && parB.name === 'Barceloona', `club names ${realB.name} / ${parB.name}`);
check(realR.name === 'Real Madrid' && parR.name === 'Vardrid', `club names ${realR.name} / ${parR.name}`);
check(parB.id === realB.id && parR.id === realR.id, 'team IDs unchanged');
check(JSON.stringify(realB.players.map((p) => [p.playerId, p.stats, p.overall])) === JSON.stringify(parB.players.map((p) => [p.playerId, p.stats, p.overall])), 'player stats identical in parody mode');
check(realB.players.some((p) => p.name === 'Robert Lewandowski') && !parB.players.some((p) => p.name === 'Robert Lewandowski'), 'player names switch');
check(new Set(DB.players.map((p) => p.id)).size === DB.players.length, 'no duplicate player records');

console.log('Roster profiles (tests D and E)');
configure({ era: 'fifa07', clubIdentity: 'authentic', playerIdentity: 'real' });
const b07 = buildTeam('fcb');
check(b07.players.some((p) => p.name === 'Ronaldinho') && b07.players.some((p) => p.name === "Samuel Eto'o"), 'FIFA 07 Barcelona has Ronaldinho and Eto\'o');
check(!b07.players.some((p) => p.name === 'Lamine Yamal'), 'FIFA 07 Barcelona has no modern players');
configure({ era: 'modern' });
const bm = buildTeam('fcb');
check(bm.players.some((p) => p.name === 'Lamine Yamal') && !bm.players.some((p) => p.name === 'Ronaldinho'), 'Modern Barcelona roster');
check(isPlayable('fcb') && isPlayable('rma'), 'Barcelona and Real Madrid playable');

console.log('Kits (test G)');
const kits = resolveKitClash('fcb', 'home', 'rma', 'third');
check(kits.home.design === 'stripes' && kits.away.type === 'third', 'chosen kits kept');
const clash = resolveKitClash('liv', 'home', 'mun', 'home');
check(clash.switched && clash.away.type !== 'home', 'red v red clash moves away kit');

console.log('Full match with database teams (test I)');
for (const mode of ['real', 'parody']) {
  configure({ era: 'modern', clubIdentity: mode === 'real' ? 'authentic' : 'parody', playerIdentity: mode });
  const home = buildTeam('fcb'), away = buildTeam('rma', 'third');
  const s = createMatch({ home, away, controllers: ['ai', 'ai'], duration: 90 });
  const names = new Set([...home.players, ...home.bench, ...away.players, ...away.bench].map((p) => p.name));
  const scorers = [];
  for (let i = 0; i < 60 * 400 && s.phase !== 'fulltime'; i++) {
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) if (e.type === 'goal' && s.players[e.scorer]) scorers.push(s.players[e.scorer].name);
    s.events.length = 0;
  }
  check(s.phase === 'fulltime', `${mode}: match finished`);
  check(s.teams[0].data.name === home.name && s.teams[1].data.name === away.name, `${mode}: team identities in result`);
  check(s.players.every((p) => names.has(p.name)), `${mode}: every on-pitch name comes from the selected squads`);
  console.log(`  ${mode}: ${s.teams[0].data.name} ${s.teams[0].score}-${s.teams[1].score} ${s.teams[1].data.name}`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll database checks passed');
process.exit(failed ? 1 : 0);
