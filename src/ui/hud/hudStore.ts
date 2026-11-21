// HUD state shared between the game loop and the React HUD.
//
// The loop calls `publishFrame(match)` every rendered frame; the store turns
// the match into a small view model and only notifies React when something
// visible changed (clock second, score, active player, stamina step...), so
// the HUD re-renders a few times a second, not 60. The radar canvas reads
// the live match directly on its own animation frame.

import type { MatchState, Player, Team, TeamData } from '../../types/game.ts';

export interface HudActive {
  number: number;
  surname: string;
  stamina: number; // 0..1 rounded to 2 decimals
  charge: number; // 0..1 shot power while charging
  human: string; // 'P1' | 'P2' | ''
}
export interface HudTeam {
  code: string;
  crest: string;
  colors: [string, string];
  score: number | string;
  active: HudActive | null;
  hidden: boolean;
}
export interface HudGoalCard { word: string; team: string; name: string; color: string }
export interface HudState {
  visible: boolean;
  clock: string;
  teams: [HudTeam, HudTeam];
  goalCard: HudGoalCard | null;
  banner: string | null;
  notice: string | null;
  replay: boolean;
}

const emptyTeam = (): HudTeam => ({ code: '', crest: '', colors: ['#fff', '#fff'], score: 0, active: null, hidden: false });
let state: HudState = {
  visible: false, clock: '00:00', teams: [emptyTeam(), emptyTeam()],
  goalCard: null, banner: null, notice: null, replay: false,
};
const listeners = new Set<() => void>();
let liveMatch: MatchState | null = null;

export const hudStore = {
  get: (): HudState => state,
  subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); },
  /** The running match, for the radar (read on its own frame, no re-render). */
  match: (): MatchState | null => liveMatch,
};

function set(patch: Partial<HudState>): void {
  const next = { ...state, ...patch };
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  for (const fn of listeners) fn();
}

// ---------- helpers (pure) ----------
export const shortCode = (t: Partial<TeamData> & { name?: string }): string =>
  String(t.short || t.code || t.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'TEAM';

/** Match clock as a 90-minute broadcast clock (mm:ss). */
export function broadcastClock(m: MatchState): string {
  if (!Number.isFinite(m.duration)) return '00:00';
  const reg = m.regulationDuration || m.duration;
  const total = Math.max(0, (m.clock / reg) * 90 * 60);
  const min = Math.floor(total / 60), sec = Math.floor(total % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** The player each team "has": your controlled man, or for the computer the man on the ball / nearest to it. */
export function activePlayer(m: MatchState, team: Team): Player | null {
  if (team.controlled && !team.controlled.sentOff) return team.controlled;
  const b = m.ball;
  if (b.owner && b.owner.team === team.index) return b.owner;
  let best: Player | null = null, bd = Infinity;
  for (const p of m.players) {
    if (p.team !== team.index || !p.onPitch || p.sentOff) continue;
    const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function surnameOf(name: string): string {
  const parts = name.split(' ');
  return (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).toUpperCase();
}

const SHOWN_BANNERS = new Set(['HALF TIME', 'FULL TIME', 'EXTRA TIME', 'PENALTY']);

// ---------- what the game loop calls ----------
let goalTimer = 0;
let noticeTimer = 0;

/** New match: names, crests and kit colours. */
export function startHud(m: MatchState): void {
  liveMatch = m;
  goalTimer = 0; noticeTimer = 0;
  const teams = m.teams.map((t, i): HudTeam => {
    const k = t.kit;
    return {
      code: m.practice && i === 1 ? 'PRC' : shortCode(t.data),
      crest: String(t.data.crest || ''),
      colors: [k.shirt, k.secondary && k.secondary !== k.shirt ? k.secondary : k.shorts],
      score: 0,
      active: null,
      hidden: m.practice && i === 1,
    };
  }) as [HudTeam, HudTeam];
  set({ visible: true, teams, goalCard: null, banner: null, notice: null, replay: false, clock: '00:00' });
}

export function hideHud(): void { liveMatch = null; set({ visible: false }); }

/** Every rendered frame. */
export function publishFrame(m: MatchState, dt: number): void {
  liveMatch = m;
  if (goalTimer > 0) { goalTimer -= dt; if (goalTimer <= 0) set({ goalCard: null }); }
  if (noticeTimer > 0) { noticeTimer -= dt; if (noticeTimer <= 0) set({ notice: null }); }
  const teams = state.teams.map((ht, i): HudTeam => {
    const team = m.teams[i];
    const p = activePlayer(m, team);
    return {
      ...ht,
      score: m.practice && i === 1 ? '–' : team.score,
      active: p ? {
        number: p.number,
        surname: surnameOf(p.name),
        stamina: Math.round(p.stamina * 50) / 50,
        charge: Math.round((p.charge || 0) * 25) / 25,
        human: team.human ? team.human.toUpperCase() : '',
      } : null,
    };
  }) as [HudTeam, HudTeam];
  const clock = m.practice ? 'TRAINING' : m.phase === 'halftime' ? 'HT' : m.phase === 'fulltime' ? 'FT' : broadcastClock(m);
  const banner = m.banner && m.phase !== 'fulltime' && SHOWN_BANNERS.has(m.banner.text) ? m.banner.text : null;
  set({ teams, clock, banner });
}

/** Short broadcast-style notice (cards, offside, substitutions...). */
export function showNotice(text: string, seconds = 1.6): void {
  noticeTimer = seconds;
  set({ notice: text });
}

/** GOAL card with team and scorer. */
export function showGoal(team: Team, scorer: string, ownGoal: boolean): void {
  goalTimer = 3.2;
  set({ goalCard: { word: ownGoal ? 'OWN GOAL' : 'GOAL', team: shortCode(team.data), name: scorer, color: team.kit.shirt } });
}

export function setReplay(on: boolean): void { set({ replay: on }); }
