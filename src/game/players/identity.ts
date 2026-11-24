// Player identity: the single description of what a footballer looks like
// and how his body is built. Used by the 3D character (pitch, replays,
// celebrations, Kick-Off preview), the player cards, and the physics
// profile (mass, height/reach, stride), so every view shows the same man.
//
// Values are generated deterministically from the player's stable ID, his
// position and his attributes, so the same player always looks the same.
// They are a game profile, not real-world biographical data: anything known
// can be pinned with APPEARANCE_OVERRIDES (or an `appearance` object on the
// player record), which wins over the generated values.

import type { Identity, BodyBuild, BootStyle, Attributes } from '../../types/game.ts';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Known appearance data for a player (overrides generated values). */
export interface AppearanceOverride {
  heightCm?: number; weightKg?: number; age?: number; bodyType?: string; skinTone?: string;
  hair?: { style?: string; color?: string; hex?: string }; facialHair?: string; boots?: string;
  eyes?: string; accessories?: string[];
  /** Face proportions (head.ts FaceShape keys, 1 = average): build, not a portrait likeness. */
  face?: Record<string, number>;
}
/** What playerIdentity() needs to know about a player. */
export interface IdentityInput {
  playerId?: string; id?: string | number; name: string; number: number;
  position?: string; role?: string; overall?: number | null; attributes?: Attributes | null;
  foot?: string; captain?: boolean; appearance?: AppearanceOverride;
}

export function hashString(s: unknown): number {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Deterministic 0..1 value for a key. */
function unit(key: string): number {
  return (hashString(key) % 100000) / 100000;
}
function pick<T>(arr: readonly T[], key: string): T {
  return arr[hashString(key) % arr.length];
}

export const SKIN_TONES = ['#f6d7c3', '#eac4a6', '#d9a982', '#c68e64', '#a8704a', '#8a5636', '#6b3f26', '#4a2a19'];
export const HAIR_COLORS: Record<string, string> = {
  black: '#141110', darkBrown: '#2e1d13', brown: '#5a3a22', lightBrown: '#8a6240',
  blond: '#c9a464', platinum: '#e3d5b0', ginger: '#9c4a22', grey: '#8b8680',
};
export const HAIR_STYLES = ['buzz', 'short', 'crop', 'quiff', 'sidePart', 'curly', 'afro', 'manBun', 'long', 'shaved'];
export const FACIAL_HAIR = ['none', 'none', 'none', 'stubble', 'stubble', 'beard', 'goatee', 'moustache'];
export const BODY_TYPES: Record<string, BodyBuild> = {
  // shoulder / chest / waist / hip widths and limb thickness, relative to an
  // "athletic" 1.0. Leg length is relative to height.
  lean: { label: 'Lean', shoulder: 0.94, chest: 0.92, waist: 0.92, hip: 0.95, limb: 0.9, leg: 1.02 },
  athletic: { label: 'Athletic', shoulder: 1, chest: 1, waist: 1, hip: 1, limb: 1, leg: 1 },
  compact: { label: 'Compact & agile', shoulder: 0.97, chest: 0.98, waist: 0.98, hip: 1.0, limb: 1.0, leg: 0.97 },
  strong: { label: 'Strong', shoulder: 1.08, chest: 1.08, waist: 1.04, hip: 1.04, limb: 1.1, leg: 0.99 },
  powerful: { label: 'Powerful', shoulder: 1.06, chest: 1.06, waist: 1.02, hip: 1.05, limb: 1.12, leg: 1.0 },
  tall: { label: 'Tall & rangy', shoulder: 1.02, chest: 1.0, waist: 0.98, hip: 1.0, limb: 0.98, leg: 1.04 },
};
export const BOOT_STYLES: BootStyle[] = [
  { id: 'black-classic', name: 'Black classic', upper: '#111214', accent: '#f2f2f2', sole: '#d9d9d9' },
  { id: 'white-gold', name: 'White / gold', upper: '#f4f4f2', accent: '#d4a83a', sole: '#1c1c1c' },
  { id: 'volt', name: 'Volt', upper: '#d6f22e', accent: '#141414', sole: '#f15a24' },
  { id: 'crimson', name: 'Crimson', upper: '#c4142b', accent: '#ffffff', sole: '#202020' },
  { id: 'cyan', name: 'Hyper cyan', upper: '#1fb6e8', accent: '#0b1f3a', sole: '#ff3a7a' },
  { id: 'orange', name: 'Solar orange', upper: '#ff6a13', accent: '#1a1a1a', sole: '#ffffff' },
  { id: 'silver', name: 'Silver', upper: '#c9ccd2', accent: '#111111', sole: '#3a6df0' },
  { id: 'pink', name: 'Pink glow', upper: '#ff4fa0', accent: '#1a1a1a', sole: '#ffffff' },
  { id: 'navy', name: 'Navy', upper: '#17264d', accent: '#e8b923', sole: '#ffffff' },
];

/**
 * Known appearance data, keyed by player ID. Anything here replaces the
 * generated value. Kept empty by default: fill it from licensed / verified
 * data only.
 * Example: 'some-player-id': { heightCm: 188, weightKg: 86, hair: { style: 'short', color: 'brown' } }
 */
export const APPEARANCE_OVERRIDES: Record<string, AppearanceOverride> = {
  // Publicly reported physical profile only (height, build, hair, colouring);
  // no scanned or photographic likeness.
  'erling-haaland': {
    heightCm: 194, weightKg: 88, age: 26, bodyType: 'strong', skinTone: '#f6d7c3',
    hair: { style: 'slickBackPonytail', color: 'blond', hex: '#c8a35f' }, facialHair: 'none', eyes: '#4f7fa8', accessories: [],
    face: { headLength: 1.07, headWidth: 1.0, jaw: 1.16, chin: 1.35, cheek: 1.1, brow: 1.3, noseLength: 1.1, noseWidth: 0.95, noseBridge: 1.2, lips: 0.85 },
  },
};

const POSITION_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM',
  LM: 'W', RM: 'W', LW: 'W', RW: 'W', CF: 'ST', ST: 'ST', DEF: 'CB', MID: 'CM', FWD: 'ST',
};
// Height ranges (cm) by position group: [mean, spread].
const HEIGHT_BY_GROUP: Record<string, [number, number]> = {
  GK: [191, 5], CB: [188, 5], FB: [179, 5], DM: [182, 6], CM: [179, 6], AM: [176, 6], W: [175, 6], ST: [183, 7],
};

/**
 * @param p {
 *   playerId?, name, position (GK/CB/.../ST or DEF/MID/FWD), number, overall?,
 *   nationality?, attributes? (0-99), appearance? (overrides)
 * }
 */
export function playerIdentity(p: IdentityInput): Identity {
  const id = p.playerId || p.id || `${p.name}#${p.number}`;
  const pos = p.position || p.role || 'CM';
  const group = POSITION_GROUP[pos] || 'CM';
  const a = p.attributes || {};
  const strength = a.strength ?? 60;
  const agility = a.agility ?? 65;
  const pace = a.pace ?? 65;

  // Height: position mean, nudged by strength (taller) and agility (shorter).
  const [mean, spread] = HEIGHT_BY_GROUP[group];
  const r = unit(`${id}:h`) + unit(`${id}:h2`) - 1; // triangular -1..1
  let heightCm = mean + r * spread * 1.6 + (strength - 65) * 0.08 - (agility - 70) * 0.06;
  heightCm = Math.round(clamp(heightCm, 163, 202));

  // Weight from a BMI that grows with strength.
  const bmi = clamp(21.2 + (strength - 60) * 0.06 + (unit(`${id}:w`) - 0.5) * 1.6 - (pace - 75) * 0.015, 19.8, 26.5);
  const weightKg = Math.round(bmi * (heightCm / 100) ** 2);

  // Age: within a career window, older for high-overall defenders/keepers.
  const base = group === 'GK' ? 28 : group === 'CB' ? 27 : 25;
  const age = Math.round(clamp(base + (unit(`${id}:age`) - 0.5) * 10 + ((p.overall ?? 75) - 80) * 0.12, 18, 38));

  // Body type from build and role.
  let bodyType;
  if (group === 'GK' || heightCm >= 192) bodyType = 'tall';
  else if (bmi >= 23.2 && strength >= 74 && (group === 'ST' || group === 'CB' || group === 'DM')) bodyType = 'powerful';
  else if (strength >= 80 || (group === 'CB' && bmi >= 23)) bodyType = 'strong';
  else if (heightCm <= 172 || (agility >= 85 && heightCm <= 178)) bodyType = 'compact';
  else if (bmi <= 21.3 || group === 'W') bodyType = 'lean';
  else bodyType = 'athletic';

  // Looks: deterministic per player.
  const skinTone = pick(SKIN_TONES, `${id}:skin`);
  const skinIndex = SKIN_TONES.indexOf(skinTone);
  const darkSkin = skinIndex >= 4;
  const colorPool = darkSkin
    ? ['black', 'black', 'black', 'darkBrown', 'platinum']
    : ['black', 'darkBrown', 'darkBrown', 'brown', 'brown', 'lightBrown', 'blond', 'ginger'];
  const stylePool = darkSkin
    ? ['buzz', 'buzz', 'short', 'crop', 'curly', 'afro', 'shaved', 'manBun']
    : ['buzz', 'short', 'short', 'crop', 'quiff', 'sidePart', 'curly', 'manBun', 'long', 'shaved'];
  let hairStyle = pick(stylePool, `${id}:hs`);
  let hairColor = pick(colorPool, `${id}:hc`);
  if (age >= 34 && unit(`${id}:grey`) < 0.35) hairColor = 'grey';
  const facialHair = age < 20 ? 'none' : pick(FACIAL_HAIR, `${id}:fh`);
  const boots = pick(BOOT_STYLES, `${id}:boots`);
  const accessories: string[] = [];
  if (hairStyle === 'long' && unit(`${id}:band`) < 0.5) accessories.push('headband');
  if (unit(`${id}:tape`) < 0.18) accessories.push('wristTape');
  if (unit(`${id}:sleeve`) < 0.12 && group !== 'GK') accessories.push('longSleeves');

  const identity: Identity = {
    id: String(id),
    name: p.name,
    number: p.number,
    position: pos,
    group,
    heightCm,
    weightKg,
    age,
    bodyType,
    build: BODY_TYPES[bodyType],
    skinTone,
    hair: { style: hairStyle, color: hairColor, hex: HAIR_COLORS[hairColor] },
    facialHair,
    eyes: pick(['#3b2a1d', '#4b3621', '#2f4f6f', '#4f6b3a', '#5b4a35'], `${id}:eyes`),
    boots,
    accessories,
    foot: p.foot || 'Right',
    captain: !!p.captain,
    keeper: pos === 'GK',
  };
  const ov: AppearanceOverride = { ...(APPEARANCE_OVERRIDES[String(id)] || {}), ...(p.appearance || {}) };
  if (ov.heightCm) identity.heightCm = ov.heightCm;
  if (ov.weightKg) identity.weightKg = ov.weightKg;
  if (ov.age) identity.age = ov.age;
  if (ov.bodyType && BODY_TYPES[ov.bodyType]) { identity.bodyType = ov.bodyType; identity.build = BODY_TYPES[ov.bodyType]; }
  if (ov.skinTone) identity.skinTone = ov.skinTone;
  if (ov.hair) {
    const color = ov.hair.color ?? identity.hair.color;
    identity.hair = { style: ov.hair.style ?? identity.hair.style, color, hex: HAIR_COLORS[color] || ov.hair.hex || identity.hair.hex };
  }
  if (ov.facialHair) identity.facialHair = ov.facialHair;
  if (ov.eyes) identity.eyes = ov.eyes;
  if (ov.accessories) identity.accessories = [...ov.accessories];
  if (ov.face) identity.face = { ...ov.face };
  if (ov.boots) identity.boots = BOOT_STYLES.find((b) => b.id === ov.boots) || identity.boots;
  return identity;
}

/** Scale of the character relative to the 1.80 m reference skeleton. */
export const heightScale = (identity: Pick<Identity, 'heightCm'>) => identity.heightCm / 180;

/**
 * Pick a captain: an override from the team record, else the highest-rated
 * experienced outfield starter (age breaks ties). Returns an index into
 * `players` or -1.
 */
export function chooseCaptain(players: Array<IdentityInput & { identity?: Identity }>, override?: string | null): number {
  if (override) {
    const i = players.findIndex((p) => p.playerId === override || p.name === override);
    if (i >= 0) return i;
  }
  let best = -1, score = -Infinity;
  players.forEach((p, i) => {
    if ((p.position || p.role) === 'GK') return;
    const idn = p.identity || playerIdentity(p);
    const s = (p.overall ?? 70) + idn.age * 0.35;
    if (s > score) { score = s; best = i; }
  });
  return best;
}
