// Shooting statistics over full AI-vs-AI matches on the engine: shots, on
// target, goals, saves (held / parried / tipped), shot pace and distance,
// keeper dives. Not a pass/fail test.
//   npx tsx tests/gameplay/shot-stats.ts [matches]
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT, HALF_L } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
import { seedRandom } from '../support/seed.ts';

seedRandom();
await preparePhysics();
const fixtures: Array<[string, string]> = [['rma', 'mci'], ['fcb', 'liv'], ['bay', 'psg'], ['ars', 'int']];
const n = Number(process.argv[2] ?? 4);
const t = { shots: 0, goals: 0, onTarget: 0, catch: 0, parry: 0, tip: 0, dives: 0, speed: 0, dist: 0, kinds: {} as Record<string, number>, goalsBy: {} as Record<string, number>, matches: 0 };
for (let m = 0; m < n; m++) {
  const [h, a] = fixtures[m % fixtures.length];
  const s = createMatch({ home: buildTeam(h), away: buildTeam(a), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  let steps = 0, lastShotKind = '', measure = -1;
  while (s.phase !== 'fulltime' && steps < 60 * 60 * 8) {
    steps++;
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) {
      if (e.type === 'shot') {
        t.shots++; lastShotKind = String(e.shotType); t.kinds[lastShotKind] = (t.kinds[lastShotKind] ?? 0) + 1;
        const p = s.players.find((q) => q.id === e.player)!;
        t.dist += Math.hypot(HALF_L * s.teams[p.team].dir - p.pos.x, p.pos.z);
        measure = 2;
      }
      if (e.type === 'goal') { t.goals++; t.goalsBy[lastShotKind || '?'] = (t.goalsBy[lastShotKind || '?'] ?? 0) + 1; }
      if (e.type === 'save') { if (e.kind === 'catch') t.catch++; else if (e.kind === 'tip') t.tip++; else t.parry++; }
      if (e.type === 'dive') t.dives++;
    }
    if (measure > 0 && --measure === 0) t.speed += Math.hypot(s.ball.vel.x, s.ball.vel.y, s.ball.vel.z);
    s.events.length = 0;
  }
  t.onTarget += s.teams[0].onTarget + s.teams[1].onTarget;
  t.matches++;
  console.log(`${h}-${a}: ${s.teams[0].score}-${s.teams[1].score}, shots ${s.teams[0].shots}-${s.teams[1].shots}, on target ${s.teams[0].onTarget}-${s.teams[1].onTarget}`);
  s.engine.dispose();
}
const per = (v: number) => (v / t.matches).toFixed(1);
console.log(`per 4-min match: shots ${per(t.shots)}, on target ${per(t.onTarget)}, goals ${per(t.goals)}; saves: held ${t.catch}, parried ${t.parry}, tipped ${t.tip}; dives ${t.dives}`);
console.log(`conversion ${((100 * t.goals) / Math.max(1, t.shots)).toFixed(0)}% of shots, ${((100 * t.goals) / Math.max(1, t.onTarget)).toFixed(0)}% of on-target; mean distance ${(t.dist / Math.max(1, t.shots)).toFixed(1)} m, mean launch ${(t.speed / Math.max(1, t.shots)).toFixed(1)} m/s`);
console.log(`shot kinds ${JSON.stringify(t.kinds)}; goals by kind ${JSON.stringify(t.goalsBy)}`);
