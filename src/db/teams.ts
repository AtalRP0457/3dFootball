// Team service: turns database rows + the user's settings (roster era, club
// identity, player identity, rating edits, kit choice) into the team objects
// the match engine and the menus use. Changing identity or kits never touches
// the underlying records; it only changes what is displayed.
import { TEAMS as DECADE_TEAMS } from '../data/teams.ts';
import { DB, IDX, POSITIONS, deriveAttributes, computeOverall, teamRecord, hasRoster, ERAS } from './index.ts';
import { playerIdentity, chooseCaptain } from '../game/players/identity.ts';
import type { Attributes, EngineStats, Kit, PlayerData } from '../types/game.ts';
import type { BuiltTeam, DbPrefs, KitClash, PlayerCard, RosterMemberRow, TeamPool } from '../types/db.ts';

// import.meta.env exists under Vite; scripts and tests run without it.
const BASE: string = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
function hash(s: unknown): number { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ---------- user-editable state, injected by the app ----------
let prefs: DbPrefs = { era: 'modern', clubIdentity: 'authentic', playerIdentity: 'real', edits: {}, custom: null, officialLogos: {} };
const teamCache = new Map<string, BuiltTeam>();
const ratingCache = new Map<string, number | null>();
export function configure(next: Partial<DbPrefs>): void {
  prefs = { ...prefs, ...next };
  teamCache.clear();
  ratingCache.clear();
}
export const currentPrefs = (): DbPrefs => prefs;

// ---------- identity ----------
export function useParodyClub(teamId: string): boolean {
  if (prefs.clubIdentity === 'parody') return true;
  if (prefs.clubIdentity === 'mixed') return hash(teamId) % 2 === 0;
  return false;
}
export function teamDisplayName(teamId: string, { short = false } = {}): string {
  const rec = teamRecord(teamId);
  if (!rec) return DECADE_TEAMS.find((t) => t.id === teamId)?.nickname || teamId;
  if (useParodyClub(teamId)) return IDX.aliasesByTeam.get(teamId)?.name || rec.name;
  return short ? rec.short : rec.name;
}
export function playerDisplayName(playerId: string, fallback: string): string {
  if (prefs.playerIdentity === 'parody') return IDX.aliasesByPlayer.get(playerId)?.name || fallback;
  return IDX.players.get(playerId)?.name || fallback;
}
export function crestUrl(teamId: string): string {
  if (DECADE_TEAMS.some((t) => t.id === teamId)) return `${BASE}assets/clubs/logos/decade-${teamId}.svg`;
  if (useParodyClub(teamId)) return `${BASE}assets/clubs/logos/${teamId}-parody.svg`;
  if (prefs.officialLogos[teamId]) return `${BASE}assets/clubs/logos/official/${prefs.officialLogos[teamId]}`;
  return `${BASE}assets/clubs/logos/${teamId}.svg`;
}
export const kitUrl = (teamId: string, type: string): string => `${BASE}assets/kits/${teamId}-${type}.svg`;

// ---------- kits ----------
export function kitFor(teamId: string, type = 'home'): Kit {
  const k = IDX.kits.get(`${teamId}:${type}`) || IDX.kits.get(`${teamId}:home`);
  const gk = IDX.kits.get(`${teamId}:gk`);
  if (!k) {
    const d = DECADE_TEAMS.find((t) => t.id === teamId);
    return d ? { ...d.kit } : { shirt: '#ffffff', shorts: '#111111', socks: '#ffffff', gk: '#2e7d32' };
  }
  return { shirt: k.primary, secondary: k.secondary, accent: k.accent, shorts: k.shorts, socks: k.socks, sleeves: k.sleeves, design: k.design, gk: gk?.primary || '#2e7d32', type };
}
export function kitTypes(teamId: string): string[] {
  return IDX.kits.has(`${teamId}:home`) ? ['home', 'away', 'third'] : ['home'];
}
function rgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const dist = (a: string, b: string): number => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
/** Resolve a clash: keep the home choice, move the away side to its next kit. */
export function resolveKitClash(homeId: string, homeType: string, awayId: string, awayType: string): KitClash {
  const home = kitFor(homeId, homeType);
  let away = kitFor(awayId, awayType);
  let switched: string | null = null;
  if (dist(home.shirt, away.shirt) < 130) {
    for (const t of kitTypes(awayId)) {
      const k = kitFor(awayId, t);
      if (dist(home.shirt, k.shirt) >= 130) { away = k; switched = t; break; }
    }
  }
  return { home, away, switched };
}

// ---------- squads ----------
const SLOT_PREFS = [
  ['GK'], ['CB', 'CDM', 'RB', 'LB'], ['CB', 'CDM', 'LB', 'RB'], ['CDM', 'CM', 'CAM'], ['ST', 'CF', 'LW', 'RW', 'CAM'],
  ['LB', 'LWB', 'LM', 'CB', 'RB'], ['RB', 'RWB', 'RM', 'CB', 'LB'], ['CM', 'CAM', 'CDM', 'LM', 'RM'], ['CM', 'CAM', 'CDM', 'RM', 'LM'],
  ['LW', 'LM', 'RW', 'CF', 'ST', 'CAM'], ['RW', 'RM', 'LW', 'CF', 'ST', 'CAM'],
];
const FILL_ORDER = [0, 1, 2, 4, 5, 6, 9, 10, 3, 7, 8];

type Member = RosterMemberRow;
interface EffectiveMember extends Member { attrEdits?: Attributes }

function membersFor(teamId: string, era: string): Member[] {
  if (era === 'custom') {
    const ids = (prefs.custom?.players || []).filter((id) => IDX.players.has(id));
    return ids.flatMap((pid, i): Member[] => {
      // A custom pick plays with his best rating from any roster.
      const best = (IDX.membersByPlayer.get(pid) || []).slice().sort((a, b) => b.overall - a.overall)[0];
      if (!best) return [];
      return [{ ...best, id: `custom:${pid}`, roster_id: 'custom:ultimate', shirt_number: best.shirt_number || i + 1 }];
    });
  }
  return IDX.membersByRoster.get(`${era}:${teamId}`) || [];
}
function effective(m: Member): EffectiveMember {
  const e = prefs.edits[m.player_id] || prefs.edits[m.id];
  return e ? { ...m, overall: e.overall ?? m.overall, position: e.position ?? m.position, attrEdits: e.attributes } : m;
}

/** Engine stats (0-99) from full attributes. */
export function engineStats(a: Attributes, position: string): EngineStats {
  const avg = (...k: string[]) => Math.round(k.reduce((s, x) => s + a[x], 0) / k.length);
  return {
    spd: avg('pace', 'acceleration', 'sprintSpeed'), pas: avg('passing', 'vision'), sho: avg('finishing', 'shooting'),
    tac: avg('tackling', 'defensiveAwareness', 'interceptions'), dri: avg('dribbling', 'ballControl', 'agility'),
    gk: position === 'GK' ? avg('gkDiving', 'gkReflexes', 'gkHandling', 'gkPositioning') : 20,
  };
}

export function playerCard(m: Member): PlayerCard {
  const eff = effective(m);
  const p = IDX.players.get(m.player_id);
  if (!p) throw new Error(`Roster member ${m.id} references unknown player ${m.player_id}`);
  const attributes = deriveAttributes(m.player_id, eff.position, eff.overall, m.pace_hint, eff.attrEdits);
  const overall = computeOverall(attributes, eff.position, eff.overall, m.player_id, m.pace_hint);
  const identity = playerIdentity({
    playerId: m.player_id, name: p.name, position: eff.position, number: m.shirt_number,
    overall, attributes, foot: p.preferred_foot, appearance: p.appearance,
  });
  return {
    playerId: m.player_id, memberId: m.id, realName: p.name, name: playerDisplayName(m.player_id, p.name),
    parody: IDX.aliasesByPlayer.get(m.player_id), number: m.shirt_number, position: eff.position,
    roleName: POSITIONS[eff.position]?.role, group: POSITIONS[eff.position]?.group || 'MID', overall,
    identity, heightCm: identity.heightCm, weightKg: identity.weightKg, age: identity.age,
    nationality: p.nationality, foot: p.preferred_foot, weakFoot: m.weak_foot, skillMoves: m.skill_moves,
    attributes, stats: engineStats(attributes, eff.position),
  };
}

/** Mark the captain of a starting XI (identity + armband follow the flag). */
function withCaptain(players: PlayerData[], override?: string | null): PlayerData[] {
  // Engine players carry no appearance override, so they fit chooseCaptain's input.
  const i = chooseCaptain(players as Parameters<typeof chooseCaptain>[0], override);
  return players.map((p, k) => (k === i && p.identity ? { ...p, captain: true, identity: { ...p.identity, captain: true } } : p));
}

/** Build a playable team. Players come back in engine slot order (4-3-3 shape). */
export function buildTeam(teamId: string, kitType = 'home'): BuiltTeam {
  const decade = DECADE_TEAMS.find((t) => t.id === teamId);
  if (decade) return { ...decade, kind: 'decade', display: decade.nickname, sub: `${decade.name}s legends`, crest: crestUrl(teamId), kitType: 'home' };
  const key = `${teamId}|${kitType}`;
  const hit = teamCache.get(key);
  if (hit) return hit;
  const era = prefs.era;
  const rec = era === 'custom' && teamId === 'custom' ? null : teamRecord(teamId);
  const cards = membersFor(teamId, era).map(playerCard);
  const pool = [...cards];
  const slots: (PlayerCard | null)[] = Array(11).fill(null);
  for (const s of FILL_ORDER) {
    for (const pos of SLOT_PREFS[s]) {
      const cand = pool.filter((c) => c.position === pos).sort((a, b) => b.overall - a.overall)[0];
      if (cand) { slots[s] = cand; pool.splice(pool.indexOf(cand), 1); break; }
    }
    if (!slots[s] && pool.length) { pool.sort((a, b) => b.overall - a.overall); slots[s] = pool.shift() ?? null; }
  }
  // Bench: a reserve keeper first, then the best remaining (up to 7).
  pool.sort((a, b) => b.overall - a.overall);
  const gkIdx = pool.findIndex((c) => c.position === 'GK');
  const bench = [...(gkIdx >= 0 ? pool.splice(gkIdx, 1) : []), ...pool].slice(0, 7);
  const toEngine = (c: PlayerCard, role?: PlayerData['role']): PlayerData => ({
    name: c.name, number: c.number, stats: c.stats, attributes: c.attributes, playerId: c.playerId,
    position: c.position, overall: c.overall, identity: c.identity, nationality: c.nationality, foot: c.foot, weakFoot: c.weakFoot,
    ...(role ? { role } : {}),
  });
  const custom = era === 'custom';
  if (!custom && !rec) throw new Error(`Unknown team ${teamId}`);
  const team: BuiltTeam = {
    id: teamId,
    kind: custom ? 'custom' : rec!.kind,
    era,
    name: custom ? (prefs.custom?.name || 'Ultimate XI') : teamDisplayName(teamId),
    short: custom ? 'ULT' : rec!.code,
    nickname: custom ? (prefs.custom?.name || 'Ultimate XI') : teamDisplayName(teamId),
    display: custom ? (prefs.custom?.name || 'Ultimate XI') : teamDisplayName(teamId),
    sub: custom ? 'Custom Ultimate Team' : `${rec!.league_name} · ${ERAS.find((e) => e.id === era)?.label}`,
    realName: rec?.name || 'Ultimate XI',
    country: rec?.country || '',
    league: rec?.league || 'custom',
    stadium: rec ? IDX.stadiums.get(rec.stadium_id)?.name : 'Ultimate Arena',
    colors: rec?.colors || ['#f3c34a', '#0a1633', '#ffffff'],
    crest: custom ? `${BASE}assets/clubs/logos/custom.svg` : crestUrl(teamId),
    kitType,
    kit: custom ? { shirt: '#f3c34a', secondary: '#0a1633', shorts: '#0a1633', socks: '#f3c34a', gk: '#2e7d32', design: 'plain' } : kitFor(teamId, kitType),
    players: withCaptain(slots.filter((c): c is PlayerCard => !!c).map((c) => toEngine(c)), rec?.captain),
    bench: bench.map((c) => toEngine(c, POSITIONS[c.position]?.group || 'MID')),
    cards,
  };
  teamCache.set(key, team);
  return team;
}

export function isPlayable(teamId: string): boolean {
  if (DECADE_TEAMS.some((t) => t.id === teamId)) return true;
  if (prefs.era === 'custom') return teamId === 'custom' && (prefs.custom?.players || []).length >= 11;
  return hasRoster(teamId, prefs.era) && (IDX.membersByRoster.get(`${prefs.era}:${teamId}`) || []).length >= 15;
}

/** Teams in a pool for the current era: 'clubs' | 'nations' | 'decades'. */
export function poolTeamIds(pool: TeamPool | string): string[] {
  if (pool === 'decades') return DECADE_TEAMS.map((t) => t.id);
  if (prefs.era === 'custom') return ['custom'];
  const rows = pool === 'nations' ? DB.national_teams : DB.clubs;
  return rows.map((r) => r.id);
}

export function teamRating(teamId: string): number | null {
  if (ratingCache.has(teamId)) return ratingCache.get(teamId) ?? null;
  let r: number | null = null;
  if (isPlayable(teamId)) {
    const team = buildTeam(teamId);
    const xi = team.players.map((p) => p.overall ?? Math.round((p.stats.pas + p.stats.sho + p.stats.dri + p.stats.tac) / 4));
    r = Math.round(xi.reduce((a, b) => a + b, 0) / xi.length);
  }
  ratingCache.set(teamId, r);
  return r;
}

export { DECADE_TEAMS };
