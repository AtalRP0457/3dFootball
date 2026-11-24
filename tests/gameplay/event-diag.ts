// Diagnostic: event order around fouls/restarts and clock progression in AI matches.
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
await preparePhysics();
for (const [h, a] of [['rma', 'mci'], ['fcb', 'liv']]) {
  const s = createMatch({ home: buildTeam(h), away: buildTeam(a), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  let steps = 0, playSteps = 0, prevPhase = s.phase, lastFoulStep = -999;
  const log: string[] = [];
  const counts: Record<string, number> = {};
  const phaseEntries: Record<string, number> = {};
  let resumeDelays: number[] = [], foulAt = -1, foulDist: number[] = [], foulBallLoose = 0, doubleFoul = 0;
  while (s.phase !== 'fulltime' && steps < 400 * 60) {
    const before = s.phase;
    const ballOwnerBefore = s.ball.owner;
    stepMatch(s, {}, FIXED_DT);
    steps++;
    if (before === 'play') playSteps++;
    for (const e of s.events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.type === 'foul') {
        if (steps - lastFoulStep < 30) doubleFoul++;
        lastFoulStep = steps; foulAt = steps;
        const victim = s.players.find((p) => p.id === e.victim)!;
        const d = Math.hypot(s.ball.pos.x - victim.pos.x, s.ball.pos.z - victim.pos.z);
        foulDist.push(d);
        if (ballOwnerBefore !== victim) foulBallLoose++;
        if (log.length < 8) log.push(`step ${steps} foul by ${e.player} on ${e.victim}: phase before ${before} -> ${s.phase}, ball ${d.toFixed(1)} m from victim, victim had ball ${ballOwnerBefore === victim}, restart ${s.restart?.type ?? '-'}`);
      }
    }
    s.events.length = 0;
    if (s.phase !== prevPhase) { phaseEntries[s.phase] = (phaseEntries[s.phase] ?? 0) + 1; if (prevPhase === 'restart' && s.phase === 'play' && foulAt > 0) { resumeDelays.push((steps - foulAt) * FIXED_DT); foulAt = -1; } }
    prevPhase = s.phase;
  }
  console.log(`${h} v ${a}: steps ${steps} (${(steps * FIXED_DT).toFixed(0)} s real), live play ${(playSteps * FIXED_DT).toFixed(0)} s, clock ${s.clock.toFixed(1)} / ${s.duration}`);
  console.log('  events', JSON.stringify(counts));
  console.log('  phase entries', JSON.stringify(phaseEntries));
  console.log(`  fouls: ${foulDist.length}, victim not on ball ${foulBallLoose}, ball dist median ${foulDist.sort((x, y) => x - y)[foulDist.length >> 1]?.toFixed(1)}, within 0.5 s of another ${doubleFoul}, play resumes after ${resumeDelays.map((x) => x.toFixed(1)).join(' ')} s`);
  for (const l of log) console.log('   ', l);
  s.engine.dispose();
}
