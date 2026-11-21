// Types for the football data: seed files, normalised tables, the team
// service's player cards and team objects, and saved user settings.

import type { Attributes, EngineStats, Identity, Kit, PlayerData, Role, TeamData } from './game.ts';
import type { AppearanceOverride } from '../game/players/identity.ts';

export type Group = Role;
export type EraId = 'modern' | 'fifa18' | 'fifa14' | 'fifa07' | 'legends' | 'custom';
export type KitType = 'home' | 'away' | 'third' | 'gk';
export type TeamPool = 'clubs' | 'nations' | 'decades';
export type IdentityMode = 'authentic' | 'parody' | 'mixed';

// ---------- seed data ----------

/** [design, shirt, secondary, shorts, socks] */
export type KitTuple = [string, string, string, string, string];
export interface SeedKits { home: KitTuple; away: KitTuple; third?: KitTuple; gk: string }
export interface CrestSpec { shape: string; pattern: string; emblem: string; mono: string; cross?: boolean }
/** [layout, ...colours] */
export type FlagSpec = [string, ...string[]];

export interface SeedClub {
  id: string; name: string; short: string; code: string; parody: string; country: string; league: string;
  colors: string[]; stadium: string; capacity: number; city: string; crest: CrestSpec; kits: SeedKits;
}
export interface SeedNation {
  id: string; iso: string; name: string; short: string; code: string; parody: string; confed: string;
  colors: string[]; flag: FlagSpec; emblem: string; kits: SeedKits; stadium: string;
}
/** Roster text per team: one `name|pos|ovr|number|nat[|foot][|pace]` line per player. */
export type RosterSource = Record<string, string>;

// ---------- normalised tables ----------

export interface TeamRow {
  id: string; kind: 'club' | 'nation'; name: string; short: string; code: string; country: string;
  league: string; league_name: string; colors: string[]; stadium_id: string;
  crest?: CrestSpec; city?: string; flag?: FlagSpec; emblem?: string; captain?: string;
}
export interface TeamAliasRow { id: string; club_id: string; universe: 'parody'; name: string; short: string }
export interface LogoRow { id: string; team_id: string; universe: 'authentic' | 'parody'; path: string; licensed: boolean }
export interface StadiumRow { id: string; name: string; city: string | null; capacity: number | null }
export interface KitRow {
  id: string; team_id: string; type: KitType; design: string; primary: string; secondary: string;
  accent: string; shorts: string; socks: string; number_style: string; sleeves: string;
}
export interface PlayerRow {
  id: string; name: string; nationality: string; preferred_foot: 'Left' | 'Right';
  primary_position: string; group: Group; namesake: boolean; appearance?: AppearanceOverride;
}
export interface PlayerAliasRow { id: string; player_id: string; universe: 'parody'; name: string; bio: string; inspiration: string }
export interface RosterRow { id: string; team_id: string; era: string; preferred_formation: string }
export interface RosterMemberRow {
  id: string; roster_id: string; player_id: string; position: string; overall: number;
  shirt_number: number; pace_hint: number | null; weak_foot: number; skill_moves: number;
}
export interface FormationRow { id: string; name: string }
export interface CompetitionRow { id: string; name: string; pool: 'clubs' | 'nations'; format: string; trophy: 'league' | 'cup' }

export interface Tables {
  clubs: TeamRow[]; club_aliases: TeamAliasRow[]; club_logos: LogoRow[]; national_teams: TeamRow[];
  stadiums: StadiumRow[]; kits: KitRow[]; players: PlayerRow[]; player_aliases: PlayerAliasRow[];
  rosters: RosterRow[]; roster_members: RosterMemberRow[]; formations: FormationRow[]; competitions: CompetitionRow[];
}

export interface Era { id: EraId; label: string; season: string }
export interface PositionInfo { role: string; group: Group }
export interface ParodyAlias { name: string; bio: string; inspiration: string }

// ---------- team service ----------

/** A player's rating edit saved by the user. */
export interface PlayerEdit { overall?: number; position?: string; attributes?: Attributes }

export interface CustomTeam { name?: string; players: string[] }

export interface DbPrefs {
  era: EraId | string;
  clubIdentity: IdentityMode;
  playerIdentity: 'real' | 'parody';
  edits: Record<string, PlayerEdit>;
  custom: CustomTeam | null;
  officialLogos: Record<string, string>;
}

/** One squad member with every display and engine value worked out. */
export interface PlayerCard {
  playerId: string; memberId: string; realName: string; name: string;
  parody: PlayerAliasRow | undefined; number: number; position: string;
  roleName: string | undefined; group: Group; overall: number;
  identity: Identity; heightCm: number; weightKg: number; age: number;
  nationality: string; foot: string; weakFoot: number; skillMoves: number;
  attributes: Attributes; stats: EngineStats;
}

/** A legends-by-decade squad (src/data/teams.ts). */
export interface DecadeTeam {
  id: string; name: string; nickname: string; kit: Kit;
  players: PlayerData[]; bench?: PlayerData[];
}

/** A team ready for the menus and the match engine. */
export interface BuiltTeam extends TeamData {
  id: string;
  kind: 'club' | 'nation' | 'custom' | 'decade';
  display: string;
  sub: string;
  crest: string;
  kitType: string;
  era?: string;
  nickname?: string;
  realName?: string;
  country?: string;
  league?: string;
  stadium?: string;
  colors?: string[];
  cards?: PlayerCard[];
}

export interface KitClash { home: Kit; away: Kit; switched: string | null }
