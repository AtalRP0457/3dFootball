// Penalty shoot-outs on the engine (Law 10): order, early finish, sudden
// death, the keeper and the kicker's team-mates where they belong, every
// kick physically struck and saved, and a realistic conversion rate.
//   npx tsx tests/shootout.test.ts
import { createMatch, stepMatch, startShootout } from '../src/game/match.ts';
import { buildTeam } from '../src/db/teams.ts';
import { FIXED_DT, HALF_L, BOX } from '../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../src/game/engineBridge.ts';
import type { MatchState, ShootoutState } from '../src/types/game.ts';
import { seedRandom } from './support/seed.ts';

seedRandom();
await preparePhysics();
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

interface Run { so: ShootoutState; maxJump: number; encroach: number; keeperOff: number; struck: number; dives: number; saves: number; steps: number; s: MatchState }
function run(h: string, a: string): Run {
  const s = createMatch({ home: buildTeam(h), away: buildTeam(a), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  startShootout(s);
  let maxJump = 0, encroach = 0, keeperOff = 0, struck = 0, dives = 0, saves = 0, steps = 0;
  const prev = new Map(s.players.map((p) => [p, { x: p.pos.x, z: p.pos.z }]));
  while (s.phase !== 'fulltime' && steps < 60 * 60 * 6) {
    steps++;
    const so = s.shootout!;
    const live = so.stage === 'ready' || so.stage === 'struck';
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) {
      if (e.type === 'shot') struck++;
      if (e.type === 'dive') dives++;
      if (e.type === 'save') saves++;
    }
    s.events.length = 0;
    if (live && (so.stage === 'ready' || so.stage === 'struck')) {
      for (const p of s.players) {
        const q = prev.get(p)!;
        maxJump = Math.max(maxJump, Math.hypot(p.pos.x - q.x, p.pos.z - q.z));
      }
      if (so.stage === 'ready') {
        // Law 14: others outside the penalty area / behind the ball; keeper on his line.
        for (const p of s.players) {
          if (p === so.kicker || p === so.keeper || !p.onPitch) continue;
          const inBox = Math.abs(p.pos.x - so.goalX) < BOX.depth && Math.abs(p.pos.z) < BOX.width / 2;
          if (inBox) encroach++;
        }
        if (Math.abs(so.keeper!.pos.x - so.goalX) > 0.6) keeperOff++;
      }
    }
    for (const p of s.players) { const q = prev.get(p)!; q.x = p.pos.x; q.z = p.pos.z; }
  }
  s.engine.dispose();
  return { so: s.shootout!, maxJump, encroach, keeperOff, struck, dives, saves, steps, s };
}

const fixtures: Array<[string, string]> = [['rma', 'mci'], ['fcb', 'liv'], ['bay', 'psg'], ['ars', 'int'], ['rma', 'fcb'], ['mci', 'liv']];
const runs = fixtures.map(([h, a]) => run(h, a));
let kicks = 0, goals = 0, saved = 0, missed = 0;
let orderOk = true, alternateOk = true, endOk = true, noRepeatEarly = true;
for (const r of runs) {
  const { so } = r;
  kicks += so.kicks.length; goals += so.kicks.filter((k) => k.scored).length;
  saved += so.kicks.filter((k) => k.how === 'saved').length; missed += so.kicks.filter((k) => k.how === 'missed' || k.how === 'post').length;
  // A B A B …, starting with the coin-toss winner.
  so.kicks.forEach((k, i) => { if (k.team !== (i % 2 === 0 ? so.first : 1 - so.first)) alternateOk = false; });
  // Nobody kicks twice before every eligible team-mate has kicked.
  for (const t of [0, 1]) {
    const mine = so.kicks.filter((k) => k.team === t).map((k) => k.player);
    const n = so.order[t].length;
    for (let i = 0; i < mine.length; i++) if (mine[i] !== so.order[t][i % n]) orderOk = false;
    if (new Set(mine.slice(0, Math.min(n, mine.length))).size !== Math.min(n, mine.length)) noRepeatEarly = false;
  }
  // Ended exactly when decided.
  const [a, b] = so.scores, [ta, tb] = so.taken;
  const decided = ta <= 5 && tb <= 5 && !(ta === 5 && tb === 5) ? (a > b + (5 - tb) || b > a + (5 - ta)) : ta === tb && a !== b;
  if (!decided || so.winner !== (a > b ? 0 : 1)) endOk = false;
  console.log(`  ${r.s.teams[0].data.name} ${a}-${b} ${r.s.teams[1].data.name} (${ta}+${tb} kicks, first ${so.first}): ${so.kicks.map((k) => (k.scored ? 'o' : k.how === 'saved' ? 's' : 'x')).join('')}`);
}
check('Every shoot-out finishes with a winner', runs.every((r) => r.s.phase === 'fulltime' && r.so.stage === 'done' && r.so.winner !== null), runs.map((r) => r.so.stage).join(','));
check('Kicks alternate A B A B from the coin-toss winner', alternateOk);
check('Kick order: everyone eligible before anyone kicks again', orderOk && noRepeatEarly);
check('Ends as soon as one team cannot catch up, or a sudden-death pair is unequal', endOk);
check('Every kick is a real strike on the engine', runs.every((r) => r.struck >= r.so.kicks.length), runs.map((r) => `${r.struck}/${r.so.kicks.length}`).join(' '));
check('Conversion like real shoot-outs (~65-85 %)', goals / kicks > 0.6 && goals / kicks < 0.9,
  `${goals}/${kicks} scored (${((100 * goals) / kicks).toFixed(0)}%), ${saved} saved, ${missed} missed`);
check('Keepers dive and save some', runs.reduce((n, r) => n + r.dives, 0) > kicks * 0.5 && saved > 0, `${runs.reduce((n, r) => n + r.dives, 0)} dives`);
check('Nobody teleports during a live kick (line-ups happen behind the cut)', Math.max(...runs.map((r) => r.maxJump)) < 0.3, `largest step ${Math.max(...runs.map((r) => r.maxJump)).toFixed(2)} m`);
check('Before the kick: others out of the box, keeper on his line (Law 14)', runs.every((r) => r.encroach === 0 && r.keeperOff === 0),
  runs.map((r) => `${r.encroach}/${r.keeperOff}`).join(' '));
check('A shoot-out uses one goal', runs.every((r) => Math.abs(r.so.goalX) === HALF_L));

// Draw at full time → shoot-out (cup ties).
{
  const s = createMatch({ home: buildTeam('rma'), away: buildTeam('mci'), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 20, penalties: true });
  s.engine = new MatchPhysics(s);
  let steps = 0, started = false;
  while (s.phase !== 'fulltime' && steps < 60 * 400) {
    steps++;
    stepMatch(s, {}, FIXED_DT);
    if (s.events.some((e) => e.type === 'shootoutStart')) started = true;
    s.events.length = 0;
  }
  const draw = s.teams[0].score === s.teams[1].score;
  check('A drawn match with penalties set goes to a shoot-out', !draw || (started && s.shootout?.winner != null),
    `${s.teams[0].score}-${s.teams[1].score}, shoot-out ${started ? `${s.shootout?.scores.join('-')}` : 'none'}`);
  s.engine.dispose();
}

console.log(failed ? `\n${failed} shoot-out check(s) failed` : '\nall shoot-out checks passed');
process.exit(failed ? 1 : 0);
