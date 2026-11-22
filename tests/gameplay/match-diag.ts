// Diagnostic: falls, stumbles and collisions in a full AI match on the engine.
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
await preparePhysics();
const s = createMatch({ home: buildTeam('rma'), away: buildTeam('mci'), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
s.engine = new MatchPhysics(s);
const sim = (s.engine as any).sim;
const teamOf = (id: string) => s.players.find((p) => (s.engine as any).ctrl.get(p)?.id === id)?.team;
const stat = { falls: 0, stumbles: 0, collMate: 0, collOpp: 0, hardMate: 0, hardOpp: 0, fallsWithBallNear: 0 };
const imp: number[] = [];
const mateCtx: Record<string, number> = {};
const fallLog: string[] = [];
sim.pw.events.on((e: any) => {
  if (e.type === 'playerCollision') {
    const same = teamOf(e.a) === teamOf(e.b);
    if (same) stat.collMate++; else stat.collOpp++;
    if (same) {
      const pa = s.players.find((p) => (s.engine as any).ctrl.get(p)?.id === e.a)!, pb = s.players.find((p) => (s.engine as any).ctrl.get(p)?.id === e.b)!;
      const key = [pa.aiState ?? '-', pb.aiState ?? '-'].sort().join(' + ') + (s.ball.owner === pa || s.ball.owner === pb ? ' (one has ball)' : '') + ` phase ${s.phase}`;
      mateCtx[key] = (mateCtx[key] ?? 0) + 1;
    }
    imp.push(e.impulse);
    if (e.impulse > 60) { if (same) stat.hardMate++; else stat.hardOpp++; }
  }
  if (e.type === 'balanceLost') {
    const c = [...(s.engine as any).ctrl.values()].find((c: any) => c.id === e.playerId);
    const name = c?.sm.action?.clip.name;
    if (name === 'fall') stat.falls++; else stat.stumbles++;
    if (fallLog.length < 12) fallLog.push(`${s.clock.toFixed(1)}s ${e.playerId} ${name} sev ${e.severity.toFixed(2)}`);
  }
});
let steps = 0;
while (s.phase !== 'fulltime' && steps < 340 * 60) { stepMatch(s, {}, FIXED_DT); s.events.length = 0; steps++; }
imp.sort((a, b) => a - b);
console.log(JSON.stringify(stat), 'collisions', imp.length, 'impulse median', imp[imp.length >> 1]?.toFixed(1), 'p90', imp[Math.floor(imp.length * 0.9)]?.toFixed(1));
console.log(fallLog.join('\n'));
console.log(Object.entries(mateCtx).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v}  ${k}`).join('\n'));
s.engine.dispose();
