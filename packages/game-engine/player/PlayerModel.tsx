// Renders a PlayerController with the shared skinned footballer (22-bone
// rig, modelled kit, boots, hair). The pose is computed by the engine every
// fixed step; here it is interpolated between the last two steps and written
// onto the bones, so animation never runs at a different rate or place from
// the physics.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createCharacter, type Character } from '../../../src/render/character/character.js';
import { playerIdentity } from '../../../src/game/players/identity.ts';
import { POSE_BONES } from '../animation/AnimationBlending.ts';
import { angleDiff } from '../physics/Vec3.ts';
import type { PlayerController } from './PlayerController.ts';
import type { RenderClock } from '../ball/BallModel.tsx';

export interface KitColours { shirt: string; shorts: string; socks: string; gk: string; design: string; secondary?: string }

function buildCharacter(p: PlayerController, kit: KitColours): Character {
  const identity = playerIdentity({
    playerId: `lab-${p.id}`, name: p.name, number: p.number, position: 'CAM', overall: p.attributes.overall,
    foot: p.preferredFoot === 'L' ? 'Left' : 'Right',
    appearance: { heightCm: Math.round(p.tuning.heightM * 100), weightKg: Math.round(p.tuning.massKg), bodyType: 'athletic' },
  });
  return createCharacter({ identity, kit, keeper: false, teamKey: `lab-${p.id}-${kit.shirt}` });
}

export function PlayerModel({ player, kit, clock }: { player: PlayerController; kit: KitColours; clock: RenderClock }) {
  const character = useMemo(() => buildCharacter(player, kit), [player, kit]);
  const bind = useMemo(() => ({ hipsY: character.bones.hips?.position.y ?? 0.93 }), [character]);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    for (const b of Object.values(character.bones)) b.rotation.order = 'YXZ';
    character.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return () => character.dispose();
  }, [character]);

  useFrame(() => {
    const g = character.group;
    const a = player.prev, b = player.curr, t = clock.alpha;
    const pa = a.pose, pb = b.pose;
    const lift = pa.lift + (pb.lift - pa.lift) * t;
    g.position.set(a.position.x + (b.position.x - a.position.x) * t, lift, a.position.z + (b.position.z - a.position.z) * t);
    const yawA = a.yaw + pa.yawOffset;
    const yaw = yawA + angleDiff(yawA, b.yaw + pb.yawOffset) * t;
    g.rotation.set(pa.pitch + (pb.pitch - pa.pitch) * t, yaw, pa.roll + (pb.roll - pa.roll) * t, 'YXZ');
    for (const name of POSE_BONES) {
      const bone = character.bones[name];
      if (!bone) continue;
      const x = pa.bones[name], y = pb.bones[name];
      bone.rotation.set(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, 'YXZ');
    }
    const hips = character.bones.hips;
    if (hips) hips.position.y = bind.hipsY - (pa.hipDrop + (pb.hipDrop - pa.hipDrop) * t) / character.scale;
  });

  return <primitive ref={group} object={character.group} />;
}
