// Persistent user data (browser localStorage) with versioned, non-destructive
// migrations and JSON import/export. Tables kept here:
//   user_settings   -> 'legends-settings'
//   saved_squads    -> 'fsl-squads'        { "<era>:<teamId>": { order, formation, tactic } }
//   player edits    -> 'fsl-edits'         { playerId: { overall, position, attributes } }
//   custom teams    -> 'fsl-custom'        { name, players: [playerId] }
//   favourites      -> 'fsl-favorites'     [teamId]
//   match_results / team_statistics -> 'fsl-h2h', 'fsl-profile', 'fsl-results'
//   tournaments     -> 'legends-decades-cup', 'legends-career-season'
export const DATA_VERSION = 2;
const VERSION_KEY = 'fsl-data-version';
const KEYS = ['legends-settings', 'legends-dev', 'legends-decades-cup', 'legends-career-season', 'fsl-squads', 'fsl-edits',
  'fsl-custom', 'fsl-favorites', 'fsl-h2h', 'fsl-profile', 'fsl-results', 'fsl-ui'];

export const ls = {
  get<T = any>(key: string, fallback: T): T {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown): boolean { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

const DECADE_IDS = new Set(['1910', '1920', '1930', '1940', '1950', '1960', '1970', '1980', '1990', '2000']);

export interface MigrationResult { from: number; to: number; applied: string[] }

/** Run pending migrations. Never deletes user data; old values are copied forward. */
export function migrate(): MigrationResult {
  const from = Number(ls.get(VERSION_KEY, 1)) || 1;
  if (from >= DATA_VERSION) return { from, to: from, applied: [] };
  const applied: string[] = [];
  if (from < 2) {
    // v1 -> v2: squads were keyed by team id only; v2 keys them by roster
    // profile so the same club can have different line-ups per era.
    const squads = ls.get<Record<string, unknown>>('fsl-squads', {});
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(squads)) {
      if (k.includes(':')) next[k] = v;
      else next[DECADE_IDS.has(k) ? `decades:${k}` : `modern:${k}`] = v;
    }
    ls.set('fsl-squads', next);
    // Existing settings that point at decade teams keep working: put them in
    // the "decades" pool.
    const s = ls.get<{ home?: string; pool?: string } | null>('legends-settings', null);
    if (s && s.home && DECADE_IDS.has(s.home) && !s.pool) ls.set('legends-settings', { ...s, pool: 'decades' });
    applied.push('v2: era-scoped saved squads, decade pool for legacy settings');
  }
  ls.set(VERSION_KEY, DATA_VERSION);
  return { from, to: DATA_VERSION, applied };
}

export interface UserDataExport { app: 'futbol-super-league'; version: number; exportedAt: string; data: Record<string, unknown> }

export function exportUserData(): UserDataExport {
  const data: Record<string, unknown> = {};
  for (const k of KEYS) { const v = ls.get<unknown>(k, undefined); if (v !== undefined) data[k] = v; }
  return { app: 'futbol-super-league', version: DATA_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Import a previous export. Only known keys are written; returns what changed. */
export function importUserData(json: string | UserDataExport): string[] {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed || parsed.app !== 'futbol-super-league' || typeof parsed.data !== 'object') throw new Error('Not a Futbol Super League export file.');
  const written: string[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (!KEYS.includes(k)) continue;
    ls.set(k, v); written.push(k);
  }
  ls.set(VERSION_KEY, Math.min(Number(parsed.version) || 1, DATA_VERSION));
  migrate();
  return written;
}
