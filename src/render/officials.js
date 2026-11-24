// Match officials: the referee and two assistant referees (visual only, they
// never touch the ball or block players).
//
// Positioning follows the standard diagonal system of control:
//  - Each assistant referee (AR) runs one touchline and covers one half: AR1
//    on the near touchline for the right half, AR2 on the far touchline for
//    the left half. He stays level with the second-last defender (the offside
//    line), or with the ball when it is nearer the goal line, and never
//    crosses halfway.
//  - The referee works the diagonal between them, keeping play between
//    himself and the active AR, ~12-15 m from the ball, out of passing lanes.
// The ARs raise the flag for offside and when the ball leaves the field on
// their side; the referee points towards the restart.
import * as THREE from 'three';
import { createCharacter } from './character/character.js';
import { playerIdentity } from '../game/players/identity.ts';
import { HALF_L, HALF_W } from '../game/constants.ts';

const KITS = [
  { shirt: '#f2d300', shorts: '#111111', socks: '#111111', gk: '#f2d300' }, // yellow
  { shirt: '#151515', shorts: '#151515', socks: '#151515', gk: '#151515' }, // black
  { shirt: '#ff4f9a', shorts: '#151515', socks: '#151515', gk: '#ff4f9a' }, // pink
  { shirt: '#30d158', shorts: '#151515', socks: '#151515', gk: '#30d158' }, // green
];
const hex = (h) => { const v = parseInt(String(h || '#888').slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const cdist = (a, b) => { const x = hex(a), y = hex(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/** Pick the officials' kit that clashes least with both teams (and both keepers). */
function officialsKit(teams) {
  let best = KITS[0], bd = -1;
  for (const k of KITS) {
    const d = Math.min(...teams.flatMap((t) => [cdist(k.shirt, t.kit.shirt), cdist(k.shirt, t.kit.gk)]));
    if (d > bd) { bd = d; best = k; }
  }
  return best;
}

export function createOfficials(scene) {
  let list = [];
  const flagGeo = new THREE.BoxGeometry(0.02, 0.32, 0.26);
  const poleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6);

  function build(state) {
    for (const o of list) { scene.remove(o.root); o.character.dispose(); }
    list = [];
    if (state.indoor) return;
    const kit = officialsKit(state.teams);
    const roles = [
      { role: 'REF', name: 'Referee', start: { x: -8, z: 10 } },
      { role: 'AR1', name: 'Assistant 1', start: { x: 20, z: -(HALF_W + 1.3) }, side: -1, half: 1 },
      { role: 'AR2', name: 'Assistant 2', start: { x: -20, z: HALF_W + 1.3 }, side: 1, half: -1 },
    ];
    for (const r of roles) {
      const identity = playerIdentity({ playerId: `official-${r.role}`, name: r.name, number: 0, position: 'CM' });
      const character = createCharacter({ identity, kit: { ...kit, design: 'plain', secondary: kit.shorts }, keeper: false, teamKey: `officials|${kit.shirt}` });
      const o = {
        ...r, character, root: character.group,
        pos: { ...r.start }, vel: { x: 0, z: 0 }, face: { x: r.side ? 0 : 1, z: r.side ? -r.side : 0 },
        flagUp: 0, point: 0,
      };
      if (r.side) {
        // A flag in the right hand.
        const hand = character.bones['hand.R'];
        const pole = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#dddddd' }));
        const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: '#ffd400', emissive: '#332a00' }));
        pole.position.set(0, -0.12, 0.06); flag.position.set(0, 0.1, 0.13);
        pole.add(flag);
        if (hand) hand.add(pole);
      }
      o.root.position.set(o.pos.x, 0, o.pos.z);
      scene.add(o.root);
      list.push(o);
    }
  }

  /** Second-last defender of the team defending the goal at sign(goalSide)·HALF_L. */
  function offsideLine(state, goalSide) {
    const defending = state.teams.find((t) => -t.dir === goalSide) ?? state.teams[0];
    const xs = state.players.filter((p) => p.onPitch && !p.sentOff && p.team === defending.index).map((p) => p.pos.x * goalSide).sort((a, b) => b - a);
    return (xs[1] ?? 0) * goalSide;
  }

  function steer(o, target, maxSpeed, dt) {
    const dx = target.x - o.pos.x, dz = target.z - o.pos.z, d = Math.hypot(dx, dz);
    const want = d < 0.3 ? 0 : Math.min(maxSpeed, d * 1.6);
    const vx = d > 1e-3 ? (dx / d) * want : 0, vz = d > 1e-3 ? (dz / d) * want : 0;
    const k = 1 - Math.exp(-dt * 3.5); // acceleration like a running official
    o.vel.x += (vx - o.vel.x) * k; o.vel.z += (vz - o.vel.z) * k;
    o.pos.x += o.vel.x * dt; o.pos.z += o.vel.z * dt;
  }

  function update(state, dt) {
    if (!list.length || dt <= 0) return;
    const b = state.ball.pos;
    for (const o of list) {
      let target, faceTo;
      if (o.role === 'REF') {
        // Diagonal: opposite side of the play from the active AR.
        const right = b.x >= 0;
        target = { x: b.x + (right ? -9 : 9), z: b.z + (right ? 11 : -11) };
        target.x = THREE.MathUtils.clamp(target.x, -HALF_L + 8, HALF_L - 8);
        target.z = THREE.MathUtils.clamp(target.z, -HALF_W + 3, HALF_W - 3);
        // Stay out of the ball carrier's way.
        if (Math.hypot(target.x - b.x, target.z - b.z) < 8) target.z += right ? 6 : -6;
        faceTo = b;
      } else {
        const line = offsideLine(state, o.half);
        let x = o.half > 0 ? Math.max(line, b.x) : Math.min(line, b.x);
        x = o.half > 0 ? THREE.MathUtils.clamp(x, 0, HALF_L) : THREE.MathUtils.clamp(x, -HALF_L, 0);
        target = { x, z: o.side * (HALF_W + 1.3) };
        faceTo = { x: o.pos.x, z: 0 }; // faces the field and side-steps along the line
      }
      steer(o, target, o.role === 'REF' ? 7.2 : 7.6, dt);
      const fx = faceTo.x - o.pos.x, fz = faceTo.z - o.pos.z, fl = Math.hypot(fx, fz);
      if (fl > 0.5) {
        const want = Math.atan2(fx / fl, fz / fl), cur = Math.atan2(o.face.x, o.face.z);
        let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const a = cur + THREE.MathUtils.clamp(d, -6 * dt, 6 * dt);
        o.face.x = Math.sin(a); o.face.z = Math.cos(a);
      }
      o.root.position.set(o.pos.x, 0, o.pos.z);
      o.root.rotation.y = Math.atan2(o.face.x, o.face.z);
      o.character.update(dt, { vel: o.vel, face: o.face, kickAnim: 0, touchAnim: 0, stun: 0, stagger: 0, dive: 0, holding: false, role: 'MID', id: -1 }, { owner: false });
      // Flag up / pointing arm, layered on the animated pose.
      o.flagUp = Math.max(0, o.flagUp - dt); o.point = Math.max(0, o.point - dt);
      const arm = o.character.bones['upperArm.R'];
      if (arm && (o.flagUp > 0 || o.point > 0)) { arm.rotation.x = -2.8; arm.rotation.z = -0.15; }
    }
  }

  /** Match events: flags for offside / ball out on an AR's side, the referee points. */
  function onEvent(state, e) {
    if (!list.length) return;
    const ref = list.find((o) => o.role === 'REF');
    const arFor = (x) => list.find((o) => o.half === (x >= 0 ? 1 : -1));
    if (e.type === 'offside') {
      const p = state.players[e.player] ?? state.players.find((q) => q.id === e.player);
      const ar = arFor(p ? p.pos.x : state.ball.pos.x);
      if (ar) ar.flagUp = 2.2;
      if (ref) ref.point = 1.5;
    } else if (e.type === 'whistle' && e.kind && e.kind !== 'restart' && e.kind !== 'kickoff') {
      if (e.kind === 'throw-in' || e.kind === 'corner' || e.kind === 'goal kick') {
        const ar = arFor(e.x ?? state.ball.pos.x);
        if (ar) ar.flagUp = 1.6;
      }
      if (ref) ref.point = 1.4;
    }
  }

  return { build, update, onEvent, get list() { return list; } };
}
