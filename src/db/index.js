// FUTBOL SUPER LEAGUE football database.
//
// Seed files (src/db/seed) hold compact, human-editable source data. This
// module normalises them into relational tables with stable IDs:
//
//   clubs, club_aliases, club_logos, national_teams, stadiums, kits,
//   players, player_aliases, rosters, roster_members, player_attributes,
//   formations, competitions
//
// A player appears ONCE in `players` no matter how many clubs, nations or
// eras he belongs to; each membership is a row in `roster_members` with its
// own rating and attributes (ratings change between eras).
import { CLUBS, LEAGUES } from './seed/clubs.js';
import { NATIONS } from './seed/nations.js';
import { ROSTER_SOURCES } from './seed/rosters/index.js';
import { buildParodyAliases } from './parody.js';

export const SCHEMA_VERSION = 2;

export const ERAS = [
  { id: 'modern', label: 'Modern Football', season: '2024-25' },
  { id: 'fifa18', label: 'FIFA 18 Classics', season: '2017-18' },
  { id: 'fifa14', label: 'FIFA 14 Classics', season: '2013-14' },
  { id: 'fifa07', label: 'FIFA 07 Classics', season: '2006-07' },
  { id: 'legends', label: 'All-Time Legends', season: 'All time' },
  { id: 'custom', label: 'Custom Ultimate Teams', season: 'Your picks' },
];

export const POSITIONS = {
  GK: { role: 'Goalkeeper', group: 'GK' },
  CB: { role: 'Centre Back', group: 'DEF' },
  LB: { role: 'Full Back', group: 'DEF' }, RB: { role: 'Full Back', group: 'DEF' },
  LWB: { role: 'Full Back', group: 'DEF' }, RWB: { role: 'Full Back', group: 'DEF' },
  CDM: { role: 'Defensive Midfielder', group: 'MID' },
  CM: { role: 'Central Midfielder', group: 'MID' },
  CAM: { role: 'Attacking Midfielder', group: 'MID' },
  LM: { role: 'Winger', group: 'MID' }, RM: { role: 'Winger', group: 'MID' },
  LW: { role: 'Winger', group: 'FWD' }, RW: { role: 'Winger', group: 'FWD' },
  CF: { role: 'Striker', group: 'FWD' }, ST: { role: 'Striker', group: 'FWD' },
};

export const ATTRIBUTE_KEYS = [
  'pace', 'acceleration', 'sprintSpeed', 'shooting', 'finishing', 'longShots', 'passing', 'vision', 'crossing',
  'dribbling', 'ballControl', 'agility', 'strength', 'stamina', 'jumping', 'heading', 'defensiveAwareness',
  'tackling', 'interceptions', 'gkDiving', 'gkReflexes', 'gkHandling', 'gkPositioning', 'gkKicking',
  // Derived from the base set above unless edited: one consistent attribute
  // system shared by cards, the 3D preview and the match engine.
  'balance', 'shortPassing', 'longPassing', 'shotPower', 'firstTouch', 'curve', 'marking', 'positioning',
];

/** Attribute groups as shown on player cards (label, key). */
export const ATTRIBUTE_GROUPS = [
  ['Physical', [['Acceleration', 'acceleration'], ['Sprint speed', 'sprintSpeed'], ['Strength', 'strength'],
    ['Balance', 'balance'], ['Stamina', 'stamina'], ['Agility', 'agility'], ['Jumping', 'jumping']]],
  ['Technical', [['Ball control', 'ballControl'], ['First touch', 'firstTouch'], ['Dribbling', 'dribbling'],
    ['Short passing', 'shortPassing'], ['Long passing', 'longPassing'], ['Vision', 'vision'], ['Crossing', 'crossing'],
    ['Shot power', 'shotPower'], ['Finishing', 'finishing'], ['Shooting', 'shooting'], ['Long shots', 'longShots'],
    ['Curve', 'curve'], ['Heading', 'heading']]],
  ['Defending', [['Tackling', 'tackling'], ['Marking', 'marking'], ['Interceptions', 'interceptions'],
    ['Positioning', 'positioning'], ['Awareness', 'defensiveAwareness']]],
  ['Goalkeeping', [['Reflexes', 'gkReflexes'], ['Diving', 'gkDiving'], ['Handling', 'gkHandling'],
    ['Positioning', 'gkPositioning'], ['Distribution', 'gkKicking']]],
];

// Weights for the overall rating by role (normalised when used).
const OVERALL_WEIGHTS = {
  GK: { gkReflexes: 3, gkDiving: 3, gkHandling: 2.5, gkPositioning: 2.5, gkKicking: 1 },
  'Centre Back': { tackling: 3, marking: 3, interceptions: 2, positioning: 2, defensiveAwareness: 2, strength: 2, heading: 1.5, jumping: 1, shortPassing: 1, pace: 0.5 },
  'Full Back': { pace: 2, sprintSpeed: 1, stamina: 1.5, tackling: 2, marking: 1.5, interceptions: 1.5, crossing: 1.5, shortPassing: 1, dribbling: 1 },
  'Defensive Midfielder': { interceptions: 2.5, tackling: 2, marking: 1.5, shortPassing: 2.5, longPassing: 1.5, stamina: 1.5, strength: 1, ballControl: 1, positioning: 1 },
  'Central Midfielder': { shortPassing: 3, longPassing: 2, vision: 2, ballControl: 2, firstTouch: 1, dribbling: 1.5, stamina: 1.5, longShots: 1, interceptions: 0.5 },
  'Attacking Midfielder': { vision: 2.5, shortPassing: 2.5, ballControl: 2, dribbling: 2.5, agility: 1, longShots: 1.5, finishing: 1, firstTouch: 1 },
  Winger: { pace: 2, sprintSpeed: 1.5, acceleration: 1.5, dribbling: 3, ballControl: 2, crossing: 2, agility: 1.5, finishing: 1, shortPassing: 1 },
  Striker: { finishing: 3.5, shotPower: 2, shooting: 1.5, heading: 1.5, ballControl: 2, firstTouch: 1, acceleration: 1, sprintSpeed: 1, strength: 1, positioning: 0.5 },
};
const roleOf = (position) => (position === 'GK' ? 'GK' : POSITIONS[position]?.role || 'Central Midfielder');

// Attribute offsets from the overall rating, by role.
const PROFILE = {
  GK: { pace: -30, acceleration: -28, sprintSpeed: -30, shooting: -60, finishing: -65, longShots: -60, passing: -30, vision: -30, crossing: -55, dribbling: -50, ballControl: -40, agility: -20, strength: -15, stamina: -40, jumping: -10, heading: -55, defensiveAwareness: -60, tackling: -65, interceptions: -60, gkDiving: 1, gkReflexes: 2, gkHandling: -1, gkPositioning: 0, gkKicking: -9 },
  'Centre Back': { pace: -12, acceleration: -14, sprintSpeed: -10, shooting: -38, finishing: -42, longShots: -34, passing: -14, vision: -22, crossing: -28, dribbling: -20, ballControl: -12, agility: -18, strength: 3, stamina: -6, jumping: 0, heading: 2, defensiveAwareness: 2, tackling: 2, interceptions: 1 },
  'Full Back': { pace: 2, acceleration: 2, sprintSpeed: 2, shooting: -24, finishing: -30, longShots: -24, passing: -6, vision: -12, crossing: -1, dribbling: -6, ballControl: -6, agility: -4, strength: -10, stamina: 4, jumping: -10, heading: -14, defensiveAwareness: -4, tackling: -3, interceptions: -4 },
  'Defensive Midfielder': { pace: -12, acceleration: -12, sprintSpeed: -12, shooting: -16, finishing: -22, longShots: -12, passing: -2, vision: -6, crossing: -18, dribbling: -8, ballControl: -2, agility: -10, strength: 0, stamina: 3, jumping: -8, heading: -10, defensiveAwareness: -1, tackling: 0, interceptions: 2 },
  'Central Midfielder': { pace: -8, acceleration: -6, sprintSpeed: -8, shooting: -8, finishing: -12, longShots: -5, passing: 2, vision: 1, crossing: -8, dribbling: -1, ballControl: 1, agility: -4, strength: -10, stamina: 2, jumping: -14, heading: -18, defensiveAwareness: -14, tackling: -12, interceptions: -10 },
  'Attacking Midfielder': { pace: -4, acceleration: -2, sprintSpeed: -4, shooting: -3, finishing: -5, longShots: -2, passing: 1, vision: 3, crossing: -6, dribbling: 2, ballControl: 2, agility: 1, strength: -18, stamina: -6, jumping: -20, heading: -24, defensiveAwareness: -40, tackling: -42, interceptions: -38 },
  Winger: { pace: 4, acceleration: 5, sprintSpeed: 4, shooting: -5, finishing: -5, longShots: -6, passing: -6, vision: -6, crossing: -3, dribbling: 2, ballControl: 0, agility: 3, strength: -18, stamina: -4, jumping: -20, heading: -24, defensiveAwareness: -45, tackling: -46, interceptions: -42 },
  Striker: { pace: -2, acceleration: -2, sprintSpeed: -1, shooting: 1, finishing: 3, longShots: -6, passing: -14, vision: -12, crossing: -20, dribbling: -6, ballControl: -2, agility: -8, strength: -2, stamina: -8, jumping: -6, heading: -3, defensiveAwareness: -52, tackling: -52, interceptions: -50 },
};

function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Full attribute set derived from position + overall (+ optional pace and edits). */
export function deriveAttributes(playerId, position, overall, pace, edits) {
  const role = POSITIONS[position]?.role || 'Central Midfielder';
  const prof = position === 'GK' ? PROFILE.GK : PROFILE[role];
  const a = {};
  for (const k of ATTRIBUTE_KEYS) {
    if (k.startsWith('gk')) {
      a[k] = position === 'GK' ? clamp(overall + (prof[k] || 0) + ((hash(playerId + k) % 7) - 3), 30, 99) : clamp(8 + (hash(playerId + k) % 10), 5, 20);
      continue;
    }
    if (DERIVED[k]) continue;
    const jitter = (hash(playerId + k) % 9) - 4;
    a[k] = clamp(Math.round(overall + (prof[k] ?? -10) + jitter), 20, 99);
  }
  if (pace) {
    a.pace = clamp(pace, 20, 99);
    a.acceleration = clamp(pace + ((hash(playerId + 'acc') % 5) - 1), 20, 99);
    a.sprintSpeed = clamp(pace + ((hash(playerId + 'spr') % 5) - 2), 20, 99);
  }
  const merged = { ...a, ...(edits || {}) };
  // Derived attributes follow their base attributes (including edits) unless
  // edited themselves.
  for (const [k, f] of Object.entries(DERIVED)) {
    if (edits && edits[k] != null) continue;
    const jitter = (hash(playerId + k) % 7) - 3;
    merged[k] = clamp(Math.round(f(merged) + jitter), 20, 99);
  }
  return merged;
}

const DERIVED = {
  balance: (a) => a.agility * 0.6 + a.strength * 0.25 + a.ballControl * 0.15,
  shortPassing: (a) => a.passing * 0.8 + a.ballControl * 0.2 + 1,
  longPassing: (a) => a.passing * 0.5 + a.vision * 0.3 + a.crossing * 0.2,
  shotPower: (a) => a.shooting * 0.55 + a.strength * 0.25 + a.longShots * 0.2 + 2,
  firstTouch: (a) => a.ballControl * 0.75 + a.dribbling * 0.25,
  curve: (a) => a.crossing * 0.5 + a.passing * 0.25 + a.longShots * 0.25,
  marking: (a) => a.defensiveAwareness * 0.6 + a.tackling * 0.4,
  positioning: (a) => a.defensiveAwareness * 0.5 + a.interceptions * 0.5,
};

/**
 * Overall rating from the attributes that matter for a position. Calibrated
 * so unedited attributes reproduce the listed rating; edits move it.
 */
export function computeOverall(attributes, position, listedOverall, playerId = null, pace = null) {
  const role = roleOf(position);
  const w = OVERALL_WEIGHTS[role] || OVERALL_WEIGHTS['Central Midfielder'];
  let sum = 0, ws = 0;
  for (const [k, wt] of Object.entries(w)) { if (attributes[k] != null) { sum += attributes[k] * wt; ws += wt; } }
  if (!ws) return listedOverall ?? 60;
  const raw = sum / ws;
  if (listedOverall == null) return clamp(Math.round(raw), 1, 99);
  // Calibration: what a player of the listed rating scores with this role's
  // default profile, so the rating moves only when attributes differ from it.
  const base = deriveAttributes(playerId || `__calib__${role}`, position, listedOverall, pace, null);
  let bsum = 0;
  for (const [k, wt] of Object.entries(w)) bsum += base[k] * wt;
  return clamp(Math.round(listedOverall + (raw - bsum / ws)), 1, 99);
}

// ---------- normalise seed data ----------
function parseRoster(text) {
  return text.trim().split('\n').map((line) => {
    const [name, position, ovr, number, nat, foot, pace] = line.split('|').map((x) => x.trim());
    return { name, position, overall: Number(ovr), number: Number(number), nat, foot: foot === 'L' ? 'Left' : 'Right', pace: pace ? Number(pace) : null };
  });
}

function buildTables() {
  const t = {
    clubs: [], club_aliases: [], club_logos: [], national_teams: [], stadiums: [], kits: [],
    players: [], player_aliases: [], rosters: [], roster_members: [], formations: [], competitions: [],
  };
  const stadiumIds = new Map();
  const addStadium = (name, city, capacity) => {
    const id = slug(name);
    if (!stadiumIds.has(id)) { stadiumIds.set(id, true); t.stadiums.push({ id, name, city: city || null, capacity: capacity || null }); }
    return id;
  };
  const addKits = (teamId, kits) => {
    for (const type of ['home', 'away', 'third']) {
      const k = kits[type] || kits.away;
      const [design, shirt, secondary, shorts, socks] = k;
      t.kits.push({ id: `${teamId}:${type}`, team_id: teamId, type, design, primary: shirt, secondary, accent: secondary, shorts, socks, number_style: 'block', sleeves: design === 'sleeves' ? secondary : shirt });
    }
    t.kits.push({ id: `${teamId}:gk`, team_id: teamId, type: 'gk', design: 'plain', primary: kits.gk, secondary: '#111111', accent: '#111111', shorts: '#1a1a1a', socks: kits.gk, number_style: 'block', sleeves: kits.gk });
  };
  for (const c of CLUBS) {
    t.clubs.push({ id: c.id, kind: 'club', name: c.name, short: c.short, code: c.code, country: c.country, league: c.league, league_name: LEAGUES[c.league] || c.league, colors: c.colors, crest: c.crest, stadium_id: addStadium(c.stadium, c.city, c.capacity), city: c.city });
    t.club_aliases.push({ id: `${c.id}:parody`, club_id: c.id, universe: 'parody', name: c.parody, short: c.parody });
    t.club_logos.push({ id: `${c.id}:original`, team_id: c.id, universe: 'authentic', path: `assets/clubs/logos/${c.id}.svg`, licensed: false });
    t.club_logos.push({ id: `${c.id}:parody`, team_id: c.id, universe: 'parody', path: `assets/clubs/logos/${c.id}-parody.svg`, licensed: false });
    addKits(c.id, c.kits);
  }
  for (const n of NATIONS) {
    t.national_teams.push({ id: n.id, kind: 'nation', name: n.name, short: n.short, code: n.code, country: n.code, league: n.confed, league_name: n.confed, colors: n.colors, flag: n.flag, emblem: n.emblem, stadium_id: addStadium(n.stadium, n.name, null) });
    t.club_aliases.push({ id: `${n.id}:parody`, club_id: n.id, universe: 'parody', name: n.parody, short: n.parody });
    t.club_logos.push({ id: `${n.id}:original`, team_id: n.id, universe: 'authentic', path: `assets/clubs/logos/${n.id}.svg`, licensed: false });
    t.club_logos.push({ id: `${n.id}:parody`, team_id: n.id, universe: 'parody', path: `assets/clubs/logos/${n.id}-parody.svg`, licensed: false });
    addKits(n.id, n.kits);
  }
  const playerIndex = new Map();
  const personIds = new Map();
  for (const [era, byTeam] of Object.entries(ROSTER_SOURCES)) {
    for (const [teamId, text] of Object.entries(byTeam)) {
      const rosterId = `${era}:${teamId}`;
      t.rosters.push({ id: rosterId, team_id: teamId, era, preferred_formation: '4-3-3' });
      for (const row of parseRoster(text)) {
        // One record per person: same name + same nationality = same player.
        // A namesake from another country gets a disambiguated ID.
        const base = slug(row.name);
        const natKey = `${base}|${row.nat}`;
        let pid = personIds.get(natKey);
        if (!pid) {
          pid = playerIndex.has(base) ? `${base}-${row.nat.toLowerCase()}` : base;
          personIds.set(natKey, pid);
          const player = { id: pid, name: row.name, nationality: row.nat, preferred_foot: row.foot, primary_position: row.position, group: POSITIONS[row.position]?.group || 'MID', namesake: pid !== base };
          playerIndex.set(pid, player);
          t.players.push(player);
        }
        t.roster_members.push({
          id: `${rosterId}:${pid}`, roster_id: rosterId, player_id: pid, position: row.position, overall: row.overall,
          shirt_number: row.number, pace_hint: row.pace,
          weak_foot: 2 + (hash(pid + 'wf') % 3) + (row.overall > 86 ? 1 : 0) > 5 ? 5 : 2 + (hash(pid + 'wf') % 3) + (row.overall > 86 ? 1 : 0),
          skill_moves: ['LW', 'RW', 'CAM', 'LM', 'RM', 'CF'].includes(row.position) ? clamp(Math.round((row.overall - 60) / 8), 2, 5) : clamp(Math.round((row.overall - 66) / 9), 1, 4),
        });
      }
    }
  }
  const aliases = buildParodyAliases(t.players);
  for (const p of t.players) t.player_aliases.push({ id: `${p.id}:parody`, player_id: p.id, universe: 'parody', name: aliases[p.id].name, bio: aliases[p.id].bio, inspiration: aliases[p.id].inspiration });
  t.formations = ['4-3-3', '4-4-2', '3-5-2'].map((id) => ({ id, name: id }));
  t.competitions = [
    { id: 'super-league', name: 'Super League', pool: 'clubs', format: '10-team league, 18 matchdays', trophy: 'league' },
    { id: 'internationals-cup', name: 'Internationals Cup', pool: 'nations', format: '8-team knockout, extra time and penalties', trophy: 'cup' },
    { id: 'super-cup', name: 'Super Cup', pool: 'clubs', format: '8-team knockout', trophy: 'cup' },
  ];
  return t;
}

export const DB = buildTables();

// Indexes
const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
export const IDX = {
  clubs: byId(DB.clubs), nations: byId(DB.national_teams), stadiums: byId(DB.stadiums), kits: byId(DB.kits),
  players: byId(DB.players), rosters: byId(DB.rosters),
  aliasesByTeam: new Map(DB.club_aliases.map((a) => [a.club_id, a])),
  aliasesByPlayer: new Map(DB.player_aliases.map((a) => [a.player_id, a])),
  membersByRoster: DB.roster_members.reduce((m, r) => { (m.get(r.roster_id) || m.set(r.roster_id, []).get(r.roster_id)).push(r); return m; }, new Map()),
  membersByPlayer: DB.roster_members.reduce((m, r) => { (m.get(r.player_id) || m.set(r.player_id, []).get(r.player_id)).push(r); return m; }, new Map()),
};
export const teamRecord = (id) => IDX.clubs.get(id) || IDX.nations.get(id) || null;
export const allTeamRecords = () => [...DB.clubs, ...DB.national_teams];
export const eraLabel = (id) => (ERAS.find((e) => e.id === id) || ERAS[0]).label;
export const hasRoster = (teamId, era) => IDX.rosters.has(`${era}:${teamId}`);
