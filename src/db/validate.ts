// Database validation shared by the in-game "Database check" and
// scripts/validate-db.mjs. Returns { errors, warnings, stats }.
import { DB, IDX, POSITIONS } from './index.ts';

export interface ValidationReport { errors: string[]; warnings: string[]; stats: Record<string, number | string> }

export function validateDatabase(): ValidationReport {
  const errors: string[] = [], warnings: string[] = [];
  const dupes = (rows: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const r of rows) { if (seen.has(r.id)) errors.push(`Duplicate ${label} ID: ${r.id}`); seen.add(r.id); }
  };
  for (const [table, rows] of Object.entries(DB)) dupes(rows, table);

  const teams = [...DB.clubs, ...DB.national_teams];
  const teamIds = new Set(teams.map((t) => t.id));
  for (const t of teams) {
    if (!t.name) errors.push(`Team ${t.id} has no name`);
    if (!t.country) errors.push(`Team ${t.id} has no country`);
    if (!IDX.stadiums.has(t.stadium_id)) errors.push(`Team ${t.id} references missing stadium ${t.stadium_id}`);
    if (!DB.club_logos.some((l) => l.team_id === t.id && l.universe === 'authentic')) errors.push(`Team ${t.id} has no logo record`);
    if (!DB.club_aliases.some((a) => a.club_id === t.id)) errors.push(`Team ${t.id} has no parody identity`);
    for (const k of ['home', 'away', 'third', 'gk']) if (!IDX.kits.has(`${t.id}:${k}`)) errors.push(`Team ${t.id} is missing its ${k} kit`);
    if (!DB.rosters.some((r) => r.team_id === t.id)) warnings.push(`${t.name} has no squad in any roster profile yet`);
  }
  for (const k of DB.kits) if (!teamIds.has(k.team_id)) errors.push(`Kit ${k.id} belongs to unknown team ${k.team_id}`);
  for (const l of DB.club_logos) if (!teamIds.has(l.team_id)) errors.push(`Logo ${l.id} belongs to unknown team`);
  for (const r of DB.rosters) {
    if (!teamIds.has(r.team_id)) errors.push(`Roster ${r.id} belongs to unknown team ${r.team_id}`);
    const members = IDX.membersByRoster.get(r.id) || [];
    if (members.length < 18) warnings.push(`Roster ${r.id} has ${members.length} players (target 18)`);
    if (members.length < 15) errors.push(`Roster ${r.id} has only ${members.length} players (15 needed to play)`);
    if (!members.some((m) => m.position === 'GK')) errors.push(`Roster ${r.id} has no goalkeeper`);
    const nums = new Map<number, string>();
    for (const m of members) {
      if (nums.has(m.shirt_number)) errors.push(`Roster ${r.id}: shirt ${m.shirt_number} used by ${nums.get(m.shirt_number)} and ${m.player_id}`);
      nums.set(m.shirt_number, m.player_id);
    }
  }
  for (const m of DB.roster_members) {
    if (!IDX.rosters.has(m.roster_id)) errors.push(`Member ${m.id} belongs to missing roster`);
    if (!IDX.players.has(m.player_id)) errors.push(`Member ${m.id} references missing player`);
    if (!POSITIONS[m.position]) errors.push(`Member ${m.id} has invalid position ${m.position}`);
    if (!(m.overall >= 1 && m.overall <= 99)) errors.push(`Member ${m.id} has invalid rating ${m.overall}`);
    if (!(m.shirt_number >= 1 && m.shirt_number <= 99)) errors.push(`Member ${m.id} has invalid shirt number ${m.shirt_number}`);
  }
  for (const p of DB.players) if (!IDX.membersByPlayer.has(p.id)) errors.push(`Player ${p.id} is not in any roster`);
  for (const p of DB.players) if (p.namesake) warnings.push(`Namesake kept separate: ${p.name} (${p.nationality}) has ID ${p.id}`);
  // Same surname + same nationality may be one
  // person spelled two ways (would split his records).
  const bySurname = new Map<string, [string, string][]>();
  for (const p of DB.players) {
    const parts = p.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(' ');
    if (parts.length < 2) continue;
    const key = `${parts[parts.length - 1]}|${p.nationality}`;
    const first = parts[0];
    for (const [otherFirst, otherId] of bySurname.get(key) || []) {
      if (first !== otherFirst && (first.endsWith(otherFirst) || otherFirst.endsWith(first) || first.startsWith(otherFirst) || otherFirst.startsWith(first))) {
        warnings.push(`Possible duplicate player: ${otherId} / ${p.id}`);
      }
    }
    bySurname.set(key, [...(bySurname.get(key) || []), [first, p.id]]);
  }
  const parody = new Map<string, string>();
  for (const a of DB.player_aliases) {
    if (parody.has(a.name)) errors.push(`Parody name "${a.name}" used twice (${parody.get(a.name)}, ${a.player_id})`);
    parody.set(a.name, a.player_id);
  }
  const eras = [...new Set(DB.rosters.map((r) => r.id.split(':')[0]))];
  const stats = {
    Clubs: DB.clubs.length,
    'National teams': DB.national_teams.length,
    'Unique players': DB.players.length,
    'Roster memberships': DB.roster_members.length,
    Rosters: DB.rosters.length,
    'Roster profiles with data': eras.join(', '),
    'Teams with a squad': new Set(DB.rosters.map((r) => r.team_id)).size,
    Kits: DB.kits.length,
    'Logo records': DB.club_logos.length,
    Stadiums: DB.stadiums.length,
    'Parody player names': DB.player_aliases.length,
  };
  return { errors, warnings, stats };
}
