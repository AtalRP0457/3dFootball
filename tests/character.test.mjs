// Headless tests for the footballer character: rig, clips, gait sync (no
// foot sliding), animation selection by speed, and identity consistency.
import * as THREE from 'three';
import { createCharacter } from '../src/render/character/character.js';
import { clipLibrary } from '../src/render/character/clips.js';
import { playerIdentity, BODY_TYPES } from '../src/game/players/identity.js';
import { physicalProfile } from '../src/game/physics/attributes.js';

let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.error('  FAIL:', msg); } }

const kit = { shirt: '#c8102e', secondary: '#ffffff', shorts: '#ffffff', socks: '#c8102e', gk: '#2e7d32', design: 'plain' };
const ident = (over = {}) => ({ ...playerIdentity({ playerId: 'test-player', name: 'Alex Example', position: 'ST', number: 9, overall: 87 }), ...over });

console.log('Identity');
{
  const a = playerIdentity({ playerId: 'x1', name: 'A B', position: 'CB', number: 4, attributes: { strength: 88, agility: 60, pace: 70 } });
  const b = playerIdentity({ playerId: 'x1', name: 'A B', position: 'CB', number: 4, attributes: { strength: 88, agility: 60, pace: 70 } });
  check(JSON.stringify(a) === JSON.stringify(b), 'identity is deterministic');
  const gk = playerIdentity({ playerId: 'g', name: 'G K', position: 'GK', number: 1 });
  const w = playerIdentity({ playerId: 'w', name: 'W W', position: 'RW', number: 7, attributes: { strength: 55, agility: 90, pace: 92 } });
  check(gk.heightCm > w.heightCm, `keepers are taller than wingers (${gk.heightCm} vs ${w.heightCm})`);
  const ids = Array.from({ length: 200 }, (_, i) => playerIdentity({
    playerId: `p${i}`, name: `P ${i}`, position: ['ST', 'CM', 'CB', 'LW', 'GK'][i % 5], number: i % 30 + 1,
    attributes: { strength: 50 + ((i * 37) % 45), agility: 50 + ((i * 53) % 45), pace: 55 + ((i * 29) % 40) },
  }));
  const looks = new Set(ids.map((x) => `${x.skinTone}|${x.hair.style}|${x.hair.color}|${x.facialHair}|${x.bodyType}|${x.boots.id}`));
  check(looks.size > 150, `players look different (${looks.size}/200 unique looks)`);
  check(new Set(ids.map((x) => x.bodyType)).size >= 5, 'several body types in use');
  // Identity feeds physics: weight is the mass in collisions.
  const prof = physicalProfile({}, { strength: 80 }, a);
  check(prof.mass === a.weightKg && prof.heightCm === a.heightCm, 'physics uses the same height/weight');
}

console.log('Rig and clips');
{
  const lib = clipLibrary();
  for (const name of ['idle', 'walk', 'jog', 'run', 'sprint', 'dribble', 'turnLeft', 'turnRight', 'pass', 'longPass', 'shoot', 'touch',
    'tackle', 'jump', 'fall', 'getUp', 'celebrate', 'celebrateRun', 'kneeSlide', 'gkDiveL', 'gkDiveR', 'gkCatch', 'throwIn']) {
    check(!!lib[name], `clip ${name} exists`);
  }
  const c = createCharacter({ identity: ident(), kit });
  let unbound = 0;
  for (const clip of Object.values(lib)) {
    for (const t of clip.tracks) {
      const node = t.name.split('.')[0];
      if (!THREE.PropertyBinding.findNode(c.mesh, node)) unbound++;
    }
  }
  check(unbound === 0, `every animation track binds to a bone (${unbound} unbound)`);
  for (const bt of Object.keys(BODY_TYPES)) {
    const h = 170 + Object.keys(BODY_TYPES).indexOf(bt) * 4;
    const ch = createCharacter({ identity: ident({ bodyType: bt, build: BODY_TYPES[bt], heightCm: h }), kit });
    ch.group.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    ch.bones.head.getWorldPosition(head);
    const top = head.y + 0.245 * ch.scale;
    check(Math.abs(top - h / 100) < 0.01, `${bt}: rendered height ${top.toFixed(3)} m matches ${h} cm`);
  }
}

console.log('Locomotion sync (no foot sliding)');
{
  const ch = createCharacter({ identity: ident(), kit });
  const foot = new THREE.Vector3();
  for (const speed of [1.4, 3.5, 6, 8.5]) {
    const p = { vel: { x: 0, z: speed }, face: { x: 0, z: 1 }, kickAnim: 0, touchAnim: 0, stun: 0, stagger: 0, dive: 0 };
    let z = 0;
    const samples = [];
    const dt = 1 / 120;
    for (let i = 0; i < 480; i++) {
      z += speed * dt;
      ch.group.position.set(0, 0, z);
      ch.update(dt, p, {});
      ch.group.updateMatrixWorld(true);
      ch.bones['foot.L'].getWorldPosition(foot);
      samples.push({ y: foot.y, z: foot.z });
    }
    const minY = Math.min(...samples.slice(120).map((s) => s.y));
    // Foot speed while it is on the ground (lowest few cm).
    let slip = 0, n = 0;
    for (let i = 121; i < samples.length; i++) {
      if (samples[i].y < minY + 0.012 && samples[i - 1].y < minY + 0.012) {
        slip += Math.abs(samples[i].z - samples[i - 1].z) / dt; n++;
      }
    }
    const ratio = slip / Math.max(1, n) / speed;
    check(n > 10, `foot plants at ${speed} m/s`);
    check(ratio < 0.3, `planted foot speed ${(ratio * 100).toFixed(0)}% of body speed at ${speed} m/s`);
    console.log(`  ${speed} m/s: gait ${ch.controller.debug.gait}, planted-foot slip ${(ratio * 100).toFixed(0)}%`);
  }
  const gaitAt = (v) => {
    const c2 = createCharacter({ identity: ident(), kit });
    const p = { vel: { x: 0, z: v }, face: { x: 0, z: 1 } };
    for (let i = 0; i < 30; i++) c2.update(1 / 60, p, {});
    return c2.controller.debug.gait;
  };
  check(gaitAt(0) === 'idle', 'idle when standing');
  check(gaitAt(1.4) === 'walk', 'walk at 1.4 m/s');
  check(gaitAt(8.6) === 'sprint', 'sprint only at sprint speed');
  check(gaitAt(3.2) !== 'sprint', 'no sprint animation when jogging');
}

console.log('Action triggers');
{
  const ch = createCharacter({ identity: ident(), kit });
  const p = { vel: { x: 0, z: 0 }, face: { x: 0, z: 1 }, kickAnim: 0, stun: 0, dive: 0 };
  ch.update(1 / 60, p, {});
  p.kickAnim = 0.3; p.kickType = 'shot';
  ch.update(1 / 60, p, {});
  check(ch.controller.debug.oneShot === 'shoot', 'shot plays the shooting animation');
  const gk = createCharacter({ identity: ident({ keeper: true, position: 'GK' }), kit, keeper: true });
  const q = { vel: { x: 3, z: 0 }, face: { x: 0, z: 1 }, dive: 0, role: 'GK' };
  gk.update(1 / 60, q, {});
  q.dive = 0.45;
  gk.update(1 / 60, q, {});
  check(gk.controller.debug.oneShot === 'gkDiveL', 'keeper dives to the side he moves (left = +x)');
  const v = createCharacter({ identity: ident(), kit });
  const r = { vel: { x: 0, z: 0 }, face: { x: 0, z: 1 }, stun: 0 };
  v.update(1 / 60, r, {});
  r.stun = 0.6;
  v.update(1 / 60, r, {});
  check(v.controller.debug.oneShot === 'fall', 'tackled player falls');
  for (let i = 0; i < 60; i++) { r.stun = Math.max(0, r.stun - 1 / 60); v.update(1 / 60, r, {}); }
  check(v.controller.debug.oneShot === 'getUp', 'and gets back up');
}

console.log(failures ? `\n${failures} character check(s) failed` : '\nall character checks passed');
process.exitCode = failures ? 1 : 0;
