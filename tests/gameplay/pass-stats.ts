// Passing statistics over full AI-vs-AI matches on the engine: completion,
// interceptions, passes out of play, pace, and how often the first touch is
// heavy. Not a pass/fail test. Usage: npx tsx tests/gameplay/pass-stats.ts [matches]
import { createMatch, stepMatch } from '../../src/game/match.ts';
import { buildTeam } from '../../src/db/teams.ts';
import { FIXED_DT } from '../../src/game/constants.ts';
import { MatchPhysics, preparePhysics } from '../../src/game/engineBridge.ts';
import { laneRisk } from '../../src/game/mechanics/lanes.ts';
import type { Player } from '../../src/types/game.ts';
import { seedRandom } from '../support/seed.ts';

seedRandom();
await preparePhysics();
const fixtures: Array<[string, string]> = [['rma', 'mci'], ['fcb', 'liv'], ['bay', 'psg'], ['ars', 'int']];
const n = Number(process.argv[2] ?? 2);
const icept: string[] = [];
const lat: number[] = [];
const latK: Record<string, number[]> = {};
const tot = { passes: 0, completed: 0, toTarget: 0, intercepted: 0, out: 0, ground: 0, lofted: 0, through: 0, speed: 0, heavy: 0, touches: 0, kinds: {} as Record<string, [number, number]> };
for (let m = 0; m < n; m++) {
  const [h, a] = fixtures[m % fixtures.length];
  const s = createMatch({ home: buildTeam(h), away: buildTeam(a), controllers: ['ai', 'ai'], difficulty: 'normal', duration: 240 });
  s.engine = new MatchPhysics(s);
  let open: { from: Player; to: Player; kind: string; at: number; speed: number; risk: number; perp: Map<Player, number>; closest: number; why: string } | null = null;
  let measure = -1;
  const close = (result: 'completed' | 'target' | 'intercepted' | 'out') => {
    if (!open) return;
    const k = (tot.kinds[open.kind] ??= [0, 0]);
    k[0]++;
    if (result === 'completed' || result === 'target') { tot.completed++; k[1]++; }
    if (result === 'target') tot.toTarget++;
    if (result === 'intercepted') tot.intercepted++;
    if (result === 'out') tot.out++;
    open = null;
  };
  let steps = 0;
  while (s.phase !== 'fulltime' && steps < 60 * 60 * 8) {
    steps++;
    const prevPhase = s.phase;
    stepMatch(s, {}, FIXED_DT);
    for (const e of s.events) {
      if (e.type === 'pass') {
        close('out'); // a new pass before the last resolved shouldn't happen; count it as lost
        tot.passes++;
        const from = s.players.find((p) => p.id === e.from)!, to = s.players.find((p) => p.id === e.to)!;
        const perp = new Map<Player, number>();
        const vx = to.pos.x - s.ball.pos.x, vz = to.pos.z - s.ball.pos.z, L2 = vx * vx + vz * vz || 1;
        for (const o of s.players) if (o.team !== from.team && o.onPitch) {
          const t = Math.max(0, Math.min(1, ((o.pos.x - s.ball.pos.x) * vx + (o.pos.z - s.ball.pos.z) * vz) / L2));
          perp.set(o, Math.hypot(o.pos.x - (s.ball.pos.x + vx * t), o.pos.z - (s.ball.pos.z + vz * t)));
        }
        open = { from, to, kind: String(e.kind), at: s.clock, speed: 0, risk: laneRisk(s, s.ball.pos, to.pos, from.team), perp, closest: Infinity, why: '' };
        measure = 3;
      }
    }
    s.events.length = 0;
    if (open && !s.ball.owner) {
      const r = open.to, d = Math.hypot(s.ball.pos.x - r.pos.x, s.ball.pos.z - r.pos.z);
      if (d < open.closest) {
        const eng = s.engine as unknown as { ctrl: Map<Player, { input: { noBall?: boolean }; kicking: boolean; sm: { action: { clip: { name: string } } | null } }> };
        const c = eng.ctrl.get(r);
        open.closest = d;
        open.why = `closest ${d.toFixed(2)}m y ${s.ball.pos.y.toFixed(2)} ballv ${Math.hypot(s.ball.vel.x, s.ball.vel.z).toFixed(1)} rv ${Math.hypot(r.vel.x, r.vel.z).toFixed(1)} ai ${r.aiState ?? '-'} noBall ${c?.input.noBall} kicking ${c?.kicking} act ${c?.sm.action?.clip.name ?? '-'} kickCd ${r.kickCd.toFixed(2)} stun ${r.stun.toFixed(2)} onPitch ${r.onPitch}`;
      }
    }
    if (open && measure > 0) { measure--; if (measure === 0) { const sp = Math.hypot(s.ball.vel.x, s.ball.vel.z, s.ball.vel.y); open.speed = sp; tot.speed += sp;
      const aim = s.ball.passAim;
      if (aim) {
        const ax = aim.x - s.ball.pos.x, az = aim.z - s.ball.pos.z, al = Math.hypot(ax, az), h = Math.hypot(s.ball.vel.x, s.ball.vel.z);
        if (al > 3 && h > 1) { const m = Math.abs(ax * s.ball.vel.z - az * s.ball.vel.x) / h; lat.push(m); if (m > 3 && process.env.TAIL) console.log(`TAIL ${open.kind} aim ${al.toFixed(1)}m miss ${m.toFixed(2)} speed ${h.toFixed(1)} angle ${(Math.asin(Math.min(1, m / al)) * 57.3).toFixed(1)}deg from ${open.from.name} ft ${open.from.phys.passAccuracy.toFixed(2)} ballY ${s.ball.pos.y.toFixed(2)} owner ${s.ball.owner?.name ?? '-'} lastTouch ${s.ball.lastTouch?.name ?? '-'}`); (latK[open.kind] ??= []).push(m); }
      }
    } }
    if (open && s.ball.owner && s.ball.owner !== open.from) {
      const o = s.ball.owner;
      const res = o.team === open.from.team ? (o === open.to ? 'target' : 'completed') : 'intercepted';
      if (res === 'intercepted') {
        const L = Math.hypot(open.to.pos.x - open.from.pos.x, open.to.pos.z - open.from.pos.z);
        const along = Math.hypot(s.ball.pos.x - open.from.pos.x, s.ball.pos.z - open.from.pos.z);
        const toRecv = Math.hypot(o.pos.x - open.to.pos.x, o.pos.z - open.to.pos.z);
        icept.push(`risk ${open.risk.toFixed(2)} perp ${(open.perp.get(o) ?? NaN).toFixed(1)}m ${open.kind} ${L.toFixed(0)}m at ${(along / Math.max(1, L) * 100).toFixed(0)}% t ${(s.clock - open.at).toFixed(2)}s, ${toRecv.toFixed(1)}m from recv, recv owned? ${open.to === s.ball.owner} | ${open.why}`);
      }
      close(res);
      // First touch: pace left on the ball relative to the receiver a few steps later.
      const rc = o;
      let k = 0;
      while (k++ < 4 && s.phase === 'play') { stepMatch(s, {}, FIXED_DT); s.events.length = 0; }
      if (s.ball.owner === rc) {
        tot.touches++;
        if (Math.hypot(s.ball.vel.x - rc.vel.x, s.ball.vel.z - rc.vel.z) > 3) tot.heavy++;
      }
    }
    if (open && prevPhase === 'play' && s.phase !== 'play') close('out');
    if (open && s.clock - open.at > 6) close('out');
  }
  s.engine.dispose();
}
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) : '-') + '%';
console.log(`${n} AI matches: ${tot.passes} passes, completed ${pct(tot.completed, tot.passes)} (to the intended man ${pct(tot.toTarget, tot.passes)}), intercepted ${pct(tot.intercepted, tot.passes)}, lost/out ${pct(tot.out, tot.passes)}`);
console.log(`by kind: ${Object.entries(tot.kinds).map(([k, [a, c]]) => `${k} ${c}/${a} (${pct(c, a)})`).join(', ')}`);
const near = icept.filter((x) => +x.split(', ')[1].split('m')[0] < 2.5).length;
const lowRisk = icept.filter((x) => +x.split(' ')[1] < 0.3).length;
console.log(`intercepted passes that had lane risk < 0.3 at the strike: ${lowRisk}/${icept.length}`);
console.log(`interceptions within 2.5 m of the receiver: ${near}/${icept.length}`);
if (process.env.SHOW) console.log(icept.slice(0, 40).join('\n'));
lat.sort((a, b) => a - b);
console.log(`launch line vs aim, lateral miss at the aim: median ${lat[Math.floor(lat.length / 2)]?.toFixed(2)} m, p90 ${lat[Math.floor(lat.length * 0.9)]?.toFixed(2)} m, max ${lat[lat.length - 1]?.toFixed(2)} m (n ${lat.length})`);
for (const [k, v] of Object.entries(latK)) { v.sort((a, b) => a - b); console.log(`  ${k}: median ${v[Math.floor(v.length / 2)].toFixed(2)} m, p90 ${v[Math.floor(v.length * 0.9)].toFixed(2)} m (n ${v.length})`); }
console.log(`mean launch speed ${(tot.speed / Math.max(1, tot.passes)).toFixed(1)} m/s; heavy first touches ${pct(tot.heavy, tot.touches)} of ${tot.touches}`);
