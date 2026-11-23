// Diagnostic: passing options for the ball carrier in AI matches (seeded).
import { seedRandom } from '../support/seed.ts';
seedRandom();
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
import type { MatchState, Player } from '../../src/types/game.ts';
await preparePhysics();
const seg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};
export function options(s: MatchState, c: Player) {
  let open = 0, fwd = 0, crowd = 0;
  const dir = s.teams[c.team].dir;
  for (const t of s.players) {
    if (t === c || t.team !== c.team || !t.onPitch || t.sentOff || t.role === 'GK') continue;
    const d = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
    if (d < 4) crowd++;
    if (d < 6 || d > 25) continue;
    const blocked = s.players.some((o) => o.team !== c.team && o.onPitch && !o.sentOff && Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) > 2 && seg(o.pos.x, o.pos.z, c.pos.x, c.pos.z, t.pos.x, t.pos.z) < 1.6);
    if (blocked) continue;
    open++;
    if ((t.pos.x - c.pos.x) * dir > 3) fwd++;
  }
  return { open, fwd, crowd };
}
const states: Record<string, number> = {};
let samples = 0, sumOpen = 0, zeroOpen = 0, hasFwd = 0, crowded = 0;
for (const [h, a] of [['rma', 'mci'], ['fcb', 'liv']]) {
  const s = createMatch({ home: buildTeam(h), away: buildTeam(a), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  let steps = 0;
  while (s.phase !== 'fulltime' && steps < 400 * 60) {
    stepMatch(s, {}, FIXED_DT); s.events.length = 0; steps++;
    const c = s.ball.owner;
    if (steps % 15 || s.phase !== 'play' || !c || c.role === 'GK') continue;
    const o = options(s, c);
    for (const t of s.players) if (t.team === c.team && t !== c && t.onPitch && t.role !== 'GK') { const k = (t.aiState ?? '-').replace(/\(.*\)/, ''); states[k] = (states[k] ?? 0) + 1; }
    samples++; sumOpen += o.open; if (!o.open) zeroOpen++; if (o.fwd) hasFwd++; if (o.crowd) crowded++;
  }
  s.engine.dispose();
}
console.log(JSON.stringify(states));
console.log(`carrier samples ${samples}: avg open options ${(sumOpen / samples).toFixed(2)}, no open option ${(100 * zeroOpen / samples).toFixed(0)}%, has a forward option ${(100 * hasFwd / samples).toFixed(0)}%, teammate within 4 m ${(100 * crowded / samples).toFixed(0)}%`);
