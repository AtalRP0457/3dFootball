// FUTBOL SUPER LEAGUE front end: title, hub (home / play / clubs / players /
// settings), team select, match preview, team management and the VS intro.
//
// It is a single-page app: screens swap in place, every control is a
// type="button" (never a form submit or link), navigation uses the History
// API (#/hub, #/select, ...) so browser Back/Forward move between screens,
// and selections live in persisted settings so nothing is lost on a reload.
import './frontend.css';
import { trophySVG, ballSVG, esc, shade } from './art.js';
import { playerSVG, coverSVG, customCoverUrls, loadUserImages } from './hero.js';
import { DB, IDX, ATTRIBUTE_KEYS, ATTRIBUTE_GROUPS, POSITIONS, eraLabel, ERAS } from '../db/index.ts';
import { playerIdentity } from '../game/players/identity.ts';
import { sharedPlayerViewer, PlayerViewer, VIEWER_ANIMS } from '../render/playerViewer.js';
import { playerCard, kitUrl, kitTypes, kitFor, crestUrl, teamDisplayName } from '../db/teams.ts';
import { kitSVG } from '../db/crests.ts';
import { validateDatabase } from '../db/validate.ts';
import { ls, exportUserData, importUserData } from '../state/store.ts';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---------- ratings and positions (display only) ----------
export function playerRating(pd, role) {
  if (pd.overall) return pd.overall;
  const s = pd.stats;
  if (role === 'GK') return Math.round(s.gk * 0.85 + s.spd * 0.05 + s.pas * 0.1);
  if (role === 'DEF') return Math.round(s.tac * 0.55 + s.spd * 0.2 + s.pas * 0.15 + s.dri * 0.1);
  if (role === 'MID') return Math.round(s.pas * 0.4 + s.dri * 0.25 + s.sho * 0.15 + s.tac * 0.1 + s.spd * 0.1);
  return Math.round(s.sho * 0.45 + s.dri * 0.25 + s.spd * 0.2 + s.pas * 0.1);
}
function slotLabel(slot) {
  const { role, x, z } = slot;
  const side = z < 0 ? 'L' : 'R';
  if (role === 'GK') return 'GK';
  if (role === 'DEF') return Math.abs(z) >= 0.6 ? `${side}B` : Math.abs(z) < 0.05 ? 'CB' : `${side}CB`;
  if (role === 'MID') {
    if (Math.abs(z) >= 0.6) return `${side}M`;
    if (Math.abs(z) < 0.05) return x < -0.11 ? 'CDM' : 'CM';
    return `${side}CM`;
  }
  if (Math.abs(z) >= 0.3) return `${side}W`;
  return Math.abs(z) < 0.05 ? 'ST' : `${side}S`;
}
const ROLE_CLASS = { GK: 'gk', DEF: 'def', MID: 'mid', FWD: 'fwd' };
const GROUP_OF = (pos) => POSITIONS[pos]?.group || 'MID';

const POOL_NAMES = { clubs: 'Clubs', nations: 'National Teams', decades: 'Decade Legends' };
const CUP_NAMES = { clubs: 'Super Cup', nations: 'Internationals Cup', decades: 'Legends Cup' };
const LEAGUE_NAMES = { clubs: 'Super League', nations: 'Nations League', decades: 'Legends League' };
function modeInfo(mode, pool) {
  const base = {
    '1p': { title: 'Kick Off', sub: 'Quick match against the computer', comp: 'Exhibition Match', sides: ['Home · P1', 'Away · CPU'] },
    '2p': { title: 'Head to Head', sub: 'Two players on one keyboard or two pads', comp: 'Exhibition Match', sides: ['Player 1', 'Player 2'] },
    cpu: { title: 'Watch Live', sub: 'Sit back while the AI plays both sides', comp: 'Exhibition Match', sides: ['Home · CPU', 'Away · CPU'] },
    cup: { title: CUP_NAMES[pool], sub: '8-team knockout · extra time and penalties', comp: CUP_NAMES[pool], sides: ['Your team · P1', 'Opening opponent'], trophy: 'cup' },
    career: { title: LEAGUE_NAMES[pool], sub: '10 teams · 18 matchdays · one champion', comp: LEAGUE_NAMES[pool], sides: ['Your club · P1', 'Matchday opponent'], single: true, trophy: 'league' },
    indoor: { title: 'Indoor Fives', sub: 'Five-a-side, rebound boards, no offside', comp: 'Indoor Fives', sides: ['Home · P1', 'Away · CPU'] },
    penalties: { title: 'Penalty Shootout', sub: 'Pick your spot, read the keeper', comp: 'Penalty Shootout', sides: ['Shooters · P1', 'Keeper · CPU'] },
    practice: { title: 'Training Ground', sub: 'Your XI against their goalkeeper, no clock', comp: 'Training Session', sides: ['Your squad · P1', 'Goalkeeper only'], single: true },
    tutorial: { title: 'Skill School', sub: 'Guided lesson: move, pass, shoot, score', comp: 'Skill School', sides: ['Your squad · P1', 'Goalkeeper only'], single: true },
  };
  return base[mode] || base['1p'];
}
// Hub cards: [mode, fixed pool or null]
const PLAY_CARDS = [['1p', null], ['2p', null], ['cpu', null], ['career', 'clubs'], ['cup', 'nations'], ['cup', 'clubs'], ['indoor', null], ['penalties', null], ['practice', null], ['tutorial', null]];

const DECADE_STADIUMS = {
  1910: 'Victoria Grounds', 1920: 'Estadio Centenario Park', 1930: 'Hohe Warte Arena', 1940: 'Maracanã Velha',
  1950: 'Népstadion Bowl', 1960: 'Estádio do Sol', 1970: 'De Meer Arena', 1980: 'Azteca Heights', 1990: 'San Siro Lights', 2000: 'Galaxy Bernabéu Park',
};
const stadiumFor = (team) => team.stadium || DECADE_STADIUMS[team.id] || 'Legends Arena';

const OPTIONS = {
  roster: { label: 'Roster profile', values: ERAS.map((e) => [e.id, e.label]) },
  clubIdentity: { label: 'Club identity', values: [['authentic', 'Authentic names'], ['parody', 'Parody universe'], ['mixed', 'Mixed universe']] },
  playerIdentity: { label: 'Player names', values: [['real', 'Real players'], ['parody', 'Parody players']] },
  difficulty: { label: 'Difficulty', values: [['beginner', 'Amateur'], ['easy', 'Semi-Pro'], ['normal', 'Professional'], ['hard', 'World Class']] },
  duration: { label: 'Match length', values: [[120, '2 minutes'], [240, '4 minutes'], [360, '6 minutes']] },
  assist: { label: 'Control assist', values: [['off', 'Manual'], ['assisted', 'Assisted'], ['full', 'Full assist']] },
  dribbleStyle: { label: 'Dribbling', values: [['sticky', 'Arcade (ball at feet)'], ['touch', 'Realistic (touches)']] },
  physics: { label: 'Physics', values: [['engine', 'Gold Standard engine'], ['classic', 'Classic']] },
  camera: { label: 'Camera', values: [['broadcast', 'Broadcast'], ['close', 'Close'], ['wide', 'Tactical (wide)']] },
  intro: { label: 'Pre-match intro', values: [['on', 'On'], ['off', 'Off']] },
  graphics: { label: 'Graphics quality', values: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low (faster)']] },
  cameraZoom: { label: 'Camera zoom (in match: − / = , 0 resets)', values: [[0.8, 'Far'], [0.9, 'Wider'], [1, 'Default'], [1.1, 'Closer'], [1.2, 'Near'], [1.3, 'Nearest']] },
  era: { label: 'Era colour grading', values: [['on', 'On'], ['off', 'Off']] },
};
const optionText = (key, v) => (OPTIONS[key].values.find(([x]) => String(x) === String(v)) || OPTIONS[key].values[0])[1];
const DB_OPTIONS = new Set(['roster', 'clubIdentity', 'playerIdentity']);

// ---------- menu sound effects (tiny synth, no audio files) ----------
class UiSound {
  constructor(prefs) { this.prefs = prefs; this.ctx = null; }
  ensure() {
    if (this.ctx || !this.prefs.sounds) return this.ctx;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
    return this.ctx;
  }
  tone(freq, dur, type = 'sine', vol = 0.05, slide = 0) {
    if (!this.prefs.sounds || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  whoosh() {
    if (!this.prefs.sounds || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime, len = 0.45;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3200, t + len);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  move() { this.tone(1400, 0.05, 'triangle', 0.025); }
  select() { this.tone(660, 0.08, 'triangle', 0.05); setTimeout(() => this.tone(990, 0.12, 'triangle', 0.045), 60); }
  back() { this.tone(520, 0.12, 'triangle', 0.04, 0.6); }
  impact() { this.tone(90, 0.5, 'sine', 0.18, 0.5); this.whoosh(); }
}

const SCREENS = ['title', 'hub', 'select', 'preview', 'manage'];
const HUB_TABS = [['home', 'Home'], ['play', 'Play'], ['clubs', 'Clubs'], ['players', 'Players'], ['settings', 'Settings']];

// =====================================================================
export function createFrontend(api) {
  const { settings } = api;
  const uiPrefs = { sounds: true, hubTab: 'home', browse: {}, ...ls.get('fsl-ui', {}) };
  const browse = { pool: settings.pool, league: 'all', q: '', sort: 'rating', fav: false, ...uiPrefs.browse };
  const saveUi = () => { uiPrefs.browse = { ...browse, q: '' }; ls.set('fsl-ui', uiPrefs); };
  const sfx = new UiSound(uiPrefs);
  let squadPrefs = ls.get('fsl-squads', {});
  let favorites = new Set(ls.get('fsl-favorites', []));
  let screen = null;
  let hubTab = HUB_TABS.some(([k]) => k === uiPrefs.hubTab) ? uiPrefs.hubTab : 'home';
  let selSide = 0;
  // Kick-Off 3D viewer state: which squad member is shown and in which mode.
  const viewer3d = { teamId: null, idx: -1, mode: 'team', anim: 'idle', tab: 'Physical' };
  let manageSide = 0;
  let manageSel = null;
  let manageCursor = 0;
  let manageOnlyId = null;
  let manageReturn = 'preview';
  let previewTab = 'preview';
  let clubsTeam = settings.home;
  let dbQuery = '';
  let dbPlayer = null;
  let dbMember = null;
  let busy = false;
  let introTimer = null;
  let introDone = null;

  // ---------- DOM skeleton ----------
  const root = h(`<div id="frontend" class="fe">
    <div class="fe-bg"><div class="fe-cover"><div class="cv-slot"></div><div class="cv-slot"></div></div><div class="fe-rays"></div><div class="fe-vignette"></div><div class="fe-grain"></div></div>
    <div class="fe-stage">
      ${SCREENS.map((s) => `<section class="fe-screen" data-screen="${s}"></section>`).join('')}
      <div class="fe-modal hidden" id="feModal"><div class="fe-modal-card"></div></div>
    </div>
    <div class="fe-wipe"><i></i><i></i><i></i></div>
  </div>`);
  document.body.appendChild(root);
  const intro = h('<section class="fe-intro hidden" id="feIntro"></section>');
  document.body.appendChild(intro); // outside the menu so it can fade over the match
  const stage = root.querySelector('.fe-stage');
  const screenEl = (name) => root.querySelector(`[data-screen="${name}"]`);
  const modal = root.querySelector('#feModal');
  const wipe = root.querySelector('.fe-wipe');
  const coverEl = root.querySelector('.fe-cover');

  function fit() {
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.setProperty('--s', String(s));
  }
  window.addEventListener('resize', fit);
  fit();

  // Every button we render is type="button" so nothing can submit a form or
  // navigate the page, even if the menu is later embedded in a <form>.
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'BUTTON' && !n.hasAttribute('type')) n.type = 'button';
      n.querySelectorAll?.('button:not([type])').forEach((b) => { b.type = 'button'; });
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- data helpers ----------
  const team = (id) => api.getTeam(id);
  const crest = (t, cls = '') => `<img class="crest ${cls}" src="${esc(t.crest || crestUrl(t.id))}" alt="${esc(t.display || t.name)} crest" width="200" height="220" decoding="async">`;
  const crestLazy = (t) => `<img class="crest" src="${esc(t.crest || crestUrl(t.id))}" alt="" width="200" height="220" loading="lazy" decoding="async">`;
  const display = (t) => t.display || t.nickname || t.name;
  const sub = (t) => t.sub || `${t.name}s legends`;
  const squadKey = (t) => (t.kind === 'decade' ? `decades:${t.id}` : `${t.era || settings.roster}:${t.id}`);
  const formationOf = (t) => squadPrefs[squadKey(t)]?.formation || '4-3-3';
  const tacticOf = (t) => squadPrefs[squadKey(t)]?.tactic || 'balanced';
  function orderOf(t) {
    const n = t.players.length + (t.bench || []).length;
    const o = squadPrefs[squadKey(t)]?.order;
    if (Array.isArray(o) && o.length === n && new Set(o).size === n && o.every((i) => i >= 0 && i < n)) return o;
    return [...Array(n).keys()];
  }
  function squadOf(t) {
    const all = [...t.players, ...(t.bench || [])];
    const order = orderOf(t);
    const slots = api.formations[formationOf(t)] || api.formations['4-3-3'];
    return order.map((i, k) => {
      const pd = all[i];
      const slot = k < 11 ? slots[k] : null;
      const role = slot ? slot.role : (pd.role || api.formations['4-3-3'][i]?.role || 'MID');
      return { pd, src: i, k, slot, role, pos: slot ? slotLabel(slot) : 'SUB', rating: playerRating(pd, role) };
    });
  }
  function teamRatings(t) {
    const xi = squadOf(t).slice(0, 11);
    const by = (r) => xi.filter((p) => p.role === r).map((p) => p.rating);
    const att = Math.round(avg(by('FWD'))), mid = Math.round(avg(by('MID')));
    const def = Math.round(avg([...by('DEF'), ...by('GK')]));
    const ovr = Math.round(avg(xi.map((p) => p.rating)));
    return { att, mid, def, ovr, stars: clamp(Math.round(((ovr - 62) / 5) * 2) / 2, 0.5, 5) };
  }
  const starPlayer = (t) => squadOf(t).slice(0, 11).filter((p) => p.role !== 'GK').sort((a, b) => b.rating - a.rating)[0];
  function starsHTML(n) {
    let out = '';
    for (let i = 1; i <= 5; i++) out += `<i class="${n >= i ? 'full' : n >= i - 0.5 ? 'half' : ''}">★</i>`;
    return `<span class="fe-stars" aria-label="${n} stars">${out}</span>`;
  }
  const ratingBar = (label, v) => `<div class="fe-rbar"><b>${v || '–'}</b><span><i style="width:${clamp(((v - 50) / 49) * 100, 4, 100)}%"></i></span><em>${label}</em></div>`;
  const keyCap = (k) => `<kbd class="fe-key">${k}</kbd>`;
  const kitImg = (teamId, type, cls = '') => (kitTypes(teamId).length > 1
    ? `<img class="kit-img ${cls}" src="${esc(kitUrl(teamId, type))}" alt="${type} kit" width="200" height="260" loading="lazy">`
    : `<span class="kit-img ${cls}">${kitSVG({ design: 'plain', ...kitFor(teamId, type) })}</span>`);

  function saveSquad(t, patch) {
    squadPrefs = { ...squadPrefs, [squadKey(t)]: { formation: formationOf(t), tactic: tacticOf(t), order: orderOf(t), ...patch } };
    ls.set('fsl-squads', squadPrefs);
  }
  function getH2H(a, b) {
    const rec = ls.get('fsl-h2h', {})[[a, b].sort().join('|')] || { wins: {}, draws: 0 };
    return { a: rec.wins[a] || 0, b: rec.wins[b] || 0, draws: rec.draws || 0 };
  }
  const profile = () => ({ played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, ...ls.get('fsl-profile', {}) });
  const toggleFav = (id) => { if (favorites.has(id)) favorites.delete(id); else favorites.add(id); ls.set('fsl-favorites', [...favorites]); };

  // ---------- team browsing (shared by team select and the club database) ----------
  function browseIds() {
    const pool = browse.pool;
    let ids = api.poolTeamIds(pool);
    const q = browse.q.trim().toLowerCase();
    const rows = ids.map((id) => {
      const rec = IDX.clubs.get(id) || IDX.nations.get(id);
      const t = rec ? null : team(id);
      return {
        id, rec, name: rec ? teamDisplayName(id) : display(t), real: rec ? rec.name : display(t),
        league: rec ? rec.league : 'decades', leagueName: rec ? rec.league_name : 'Decade Legends',
        country: rec ? rec.country : '', playable: api.isPlayable(id), rating: rec ? (api.teamRating(id) ?? 0) : teamRatings(t).ovr,
      };
    });
    let out = rows.filter((r) => (browse.league === 'all' || r.league === browse.league)
      && (!browse.fav || favorites.has(r.id))
      && (!q || r.name.toLowerCase().includes(q) || r.real.toLowerCase().includes(q) || r.country.toLowerCase() === q));
    out.sort((a, b) => (b.playable - a.playable) || (browse.sort === 'az' ? a.name.localeCompare(b.name) : b.rating - a.rating || a.name.localeCompare(b.name)));
    return out;
  }
  function leagueOptions() {
    if (browse.pool === 'decades') return [];
    const rows = browse.pool === 'nations' ? DB.national_teams : DB.clubs;
    const seen = new Map();
    for (const r of rows) seen.set(r.league, r.league_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  function browseToolbar(fixedPool) {
    return `<div class="br-tools">
      <div class="br-pools">${['clubs', 'nations', 'decades'].map((p) => `<button class="${browse.pool === p ? 'on' : ''}" data-act="pool" data-v="${p}" ${fixedPool && fixedPool !== p ? 'disabled' : ''}>${POOL_NAMES[p]}</button>`).join('')}</div>
      <div class="br-row">
        <input class="br-search" type="search" placeholder="Search ${browse.pool === 'nations' ? 'nations' : 'clubs'} or country code…" value="${esc(browse.q)}" data-input="search" aria-label="Search teams">
      </div>
      <div class="br-row">
        <select data-change="league" aria-label="Filter by league">${browse.pool === 'decades' ? '<option value="all">All decades</option>' : `<option value="all">All ${browse.pool === 'nations' ? 'confederations' : 'leagues'}</option>${leagueOptions().map(([id, name]) => `<option value="${esc(id)}" ${browse.league === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}`}</select>
        <button class="br-chip ${browse.sort === 'rating' ? 'on' : ''}" data-act="sort" data-v="rating">Rating</button>
        <button class="br-chip ${browse.sort === 'az' ? 'on' : ''}" data-act="sort" data-v="az">A–Z</button>
        <button class="br-chip ${browse.fav ? 'on' : ''}" data-act="favOnly" title="Show favourites only">★</button>
      </div>
    </div>`;
  }
  function browseListHTML(selectedId, act) {
    const ids = browseIds();
    if (!ids.length) return '<div class="br-empty">No teams match these filters.</div>';
    return ids.map((r) => {
      const t = r.playable || !r.rec ? null : null;
      void t;
      return `<div class="br-item ${r.id === selectedId ? 'on' : ''} ${r.playable ? '' : 'na'}">
        <button class="br-main" data-nav data-act="${act}" data-v="${r.id}" ${r.playable ? '' : 'aria-disabled="true"'}>
          <span class="br-crest">${crestLazy({ id: r.id, crest: crestUrl(r.id) })}</span>
          <span class="br-name"><b>${esc(r.name)}</b><small>${r.playable ? esc(r.leagueName) : `No ${esc(eraLabel(settings.roster))} squad`}</small></span>
          <span class="br-ovr">${r.playable ? r.rating : '—'}</span>
        </button>
        <button class="br-fav ${favorites.has(r.id) ? 'on' : ''}" data-act="fav" data-v="${r.id}" aria-label="Favourite">★</button>
      </div>`;
    }).join('');
  }
  function refreshBrowseList(scope, selectedId, act) {
    const list = scope.querySelector('.br-list');
    if (list) list.innerHTML = browseListHTML(selectedId, act);
  }

  // ---------- transitions + routing ----------
  function sweep(swap, { sound = true } = {}) {
    if (busy) return;
    busy = true;
    if (sound) sfx.whoosh();
    wipe.classList.remove('run'); void wipe.offsetWidth; wipe.classList.add('run');
    setTimeout(swap, 330);
    setTimeout(() => { wipe.classList.remove('run'); busy = false; }, 760);
  }
  const routeFor = (name) => (name === 'hub' ? `#/hub/${hubTab}` : `#/${name}`);
  function pushRoute(name, replace = false) {
    try {
      const url = routeFor(name);
      if (location.hash === url) return;
      if (replace) history.replaceState({ screen: name, tab: hubTab }, '', url);
      else history.pushState({ screen: name, tab: hubTab }, '', url);
    } catch { /* sandboxed */ }
  }
  function activate(name) {
    screen = name;
    root.dataset.screen = name;
    root.querySelectorAll('.fe-screen').forEach((el) => el.classList.toggle('active', el.dataset.screen === name));
    render();
    const el = screenEl(name);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    updateCover();
    focusFirst();
  }

  // ---------- cover backgrounds (title, hub, team select) ----------
  const COVER_KINDS = ['fist', 'back', 'flag'];
  const coverCache = new Map();
  let coverIdx = 0, coverKey = '', coverTimer = null;
  function coverFor(kind, t) {
    const star = api.isPlayable(t.id) ? starPlayer(t) : null;
    const pl = star ? { name: star.pd.name, number: star.pd.number, playerId: star.pd.playerId } : { name: display(t), number: 10 };
    const key = `${kind}|${t.id}|${t.kit.shirt}|${t.kit.design}|${pl.name}`;
    if (!coverCache.has(key)) {
      if (coverCache.size > 12) coverCache.clear();
      const seed = [...String(t.id)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
      coverCache.set(key, coverSVG(kind, { kit: t.kit, player: pl, flagColors: [t.kit.shirt, t.kit.secondary || '#ffffff', t.kit.shirt], seed, cx: 1190 }));
    }
    return coverCache.get(key);
  }
  function showCover(html) {
    const [a, b] = coverEl.children;
    const next = a.classList.contains('on') ? b : a, cur = next === a ? b : a;
    next.innerHTML = html; void next.offsetWidth;
    next.classList.add('on'); cur.classList.remove('on');
    setTimeout(() => { if (!cur.classList.contains('on')) cur.innerHTML = ''; }, 1500);
  }
  function updateCover() {
    const on = root.classList.contains('show') && ['title', 'hub', 'select'].includes(screen);
    root.classList.toggle('has-cover', on);
    clearInterval(coverTimer); coverTimer = null;
    if (!on) { coverKey = ''; return; }
    const custom = customCoverUrls();
    const sel = screen === 'select' && !custom.length;
    const t = team(screen === 'select' && selSide === 1 ? settings.away : settings.home);
    const make = () => (custom.length ? (() => { const u = esc(custom[coverIdx % custom.length]); return `<div class="cv-photo"><img class="bg" src="${u}" alt=""><img class="fg" src="${u}" alt=""></div>`; })()
      : coverFor(sel ? (selSide ? 'back' : 'fist') : COVER_KINDS[coverIdx % COVER_KINDS.length], t));
    const key = sel ? `sel|${t.id}|${selSide}` : `rot|${t.id}|${custom.length}|${coverIdx}`;
    if (key !== coverKey) { coverKey = key; try { showCover(make()); } catch (err) { console.warn('[cover]', err); } }
    if (!sel) coverTimer = setInterval(() => { coverIdx += 1; coverKey = ''; updateCover(); }, 10000);
  }
  function go(name, opts = {}) {
    if (!opts.fromHistory) pushRoute(name, opts.replace);
    if (screen === null || opts.instant) { activate(name); return; }
    sweep(() => activate(name), opts);
  }
  window.addEventListener('popstate', () => {
    if (!root.classList.contains('show')) return; // match running: main.js handles it
    const r = parseRoute();
    if (r.tab) { hubTab = r.tab; uiPrefs.hubTab = r.tab; saveUi(); }
    if (!modal.classList.contains('hidden')) modal.classList.add('hidden');
    go(r.screen, { fromHistory: true });
  });
  function parseRoute() {
    const m = /^#\/(\w+)(?:\/(\w+))?/.exec(location.hash || '');
    const name = m && SCREENS.includes(m[1]) ? m[1] : null;
    return { screen: name || 'title', tab: name === 'hub' && HUB_TABS.some(([k]) => k === m[2]) ? m[2] : null };
  }
  function focusFirst() {
    const el = screenEl(screen)?.querySelector('[data-autofocus]') || screenEl(screen)?.querySelector('[data-nav]');
    el?.focus({ preventScroll: true });
  }

  // ---------- rendering with an error boundary ----------
  function render() {
    try {
      if (screen === 'title') renderTitle();
      if (screen === 'hub') renderHub();
      if (screen === 'select') { renderSelect(); mountViewer(); } else sharedPlayerViewer().unmount();
      if (screen === 'hub') mountEditorFigure();
      if (screen === 'preview') renderPreview();
      if (screen === 'preview') mountPreviewFigures(); else unmountPreviewFigures();
      if (screen === 'manage') renderManage();
    } catch (err) {
      console.error('[front end]', err);
      screenEl(screen).innerHTML = `<div class="fe-error">
        <h2>Something went wrong on this screen</h2><p>${esc(err.message || String(err))}</p>
        <p>Your settings and saved progress are safe.</p>
        <button class="fe-btn primary" data-act="recover">Back to the hub</button></div>`;
    }
  }

  function renderTitle() {
    screenEl('title').innerHTML = `
      <div class="t27">
        <div class="t27-mark a-in" style="--i:0">
          <span class="t27-badge">${ballSVG()}<b>FSL</b></span>
          <div><div class="t27-kicker">Futbol</div><h1 class="t27-logo">SUPER LEAGUE <em>27</em></h1></div>
        </div>
        <div class="t27-bar a-in" style="--i:1"></div>
        <p class="t27-tag a-in" style="--i:2">The beautiful game. The ultimate competition.</p>
      </div>
      <button class="title-press a-in" style="--i:5" data-nav data-autofocus data-act="start">Press any key</button>
      <div class="title-foot">${DB.clubs.length} clubs · ${DB.national_teams.length} national teams · ${DB.players.length} players</div>`;
  }

  // ----- hub -----
  function renderHub() {
    const pr = profile();
    const progress = api.getProgress();
    const me = team(settings.home);
    screenEl('hub').innerHTML = `
      <header class="hub-top ${hubTab === 'home' ? 'is-home' : ''} a-in" style="--i:0">
        <div class="hub-brand"><span class="mini-ball">${ballSVG()}</span><b>FUTBOL</b><em>SUPER LEAGUE</em></div>
        <nav class="hub-tabs">${keyCap('Q')}
          ${HUB_TABS.map(([k, label]) => `<button class="hub-tab ${hubTab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${label}</button>`).join('')}
          ${keyCap('E')}</nav>
        <div class="hub-profile">
          <div class="avatar">${crest(me)}</div>
          <div><b>Manager</b><span>${pr.played} played · ${pr.w}W ${pr.d}D ${pr.l}L</span><small>${esc(eraLabel(settings.roster))}</small></div>
        </div>
      </header>
      <div class="hub-body">${{ home: hubHome, play: hubPlay, clubs: hubClubs, players: hubPlayers, settings: hubSettings }[hubTab](progress)}</div>
      <footer class="fe-foot">${keyCap('↑↓←→')} Navigate ${keyCap('Enter')} Select ${keyCap('Q/E')} Switch tab ${keyCap('Esc')} Title screen</footer>`;
  }
  function tile(mode, pool, cls, extra = '', i = 0) {
    const m = modeInfo(mode, pool || settings.pool);
    return `<button class="tile ${cls} a-in" style="--i:${i}" data-nav data-act="mode" data-v="${mode}" data-pool="${pool || ''}">
      <span class="tile-shine"></span>${extra}
      <span class="tile-text"><b>${esc(m.title)}</b><small>${esc(m.sub)}</small></span></button>`;
  }
  const HUB_ICONS = { home: '⌂', play: '◉', clubs: '⛨', players: '☻', settings: '⚙' };
  function latestResults() {
    const rows = ls.get('fsl-results', []).slice(-5).reverse();
    if (!rows.length) return '<p class="h18-empty">Play a match and your results show up here.</p>';
    const code = (id) => { try { const t = team(id); return esc((t.short || display(t)).slice(0, 3).toUpperCase()); } catch { return '???'; } };
    return rows.map((r) => {
      let home = null; try { home = team(r.homeId); } catch { /* removed team */ }
      return `<div class="h18-res">${home ? crest(home) : ''}<b>${code(r.homeId)} ${r.hs}–${r.as} ${code(r.awayId)}</b><small>${esc(modeInfo(r.mode, settings.pool).title)}</small></div>`;
    }).join('');
  }
  function hubHome(progress) {
    const home = team(settings.home);
    const playable = api.isPlayable(home.id);
    const star = playable ? starPlayer(home) : null;
    const r = playable ? teamRatings(home) : { stars: 0 };
    const pr = profile();
    const level = 1 + Math.floor(pr.played / 3);
    const keeper = playable ? squadOf(home)[0] : null;
    return `<div class="h18 a-in" style="--i:1">
      <aside class="h18-side">
        <div class="h18-prof">${crest(home)}<div><b>Manager</b><span>LVL: <em>${level}</em></span><small>${pr.w}W · ${pr.d}D · ${pr.l}L</small></div></div>
        <nav class="h18-nav">${HUB_TABS.map(([k, label]) => `<button class="${hubTab === k ? 'on' : ''}" data-nav data-act="tab" data-v="${k}"><i>${HUB_ICONS[k]}</i>${esc(label)}</button>`).join('')}</nav>
        <div class="h18-latest"><h4><i>▶</i>Latest results</h4>${latestResults()}</div>
      </aside>
      <div class="h18-grid">
        ${tile('1p', null, 'tile-kick', `${star ? `<span class="tile-player">${playerSVG(star.pd, home.kit, { pose: 'fist', crop: true })}</span>` : ''}
          <span class="tile-team">${crest(home)}<span><em>Team form</em><span class="form-chips"><i class="w">▲${pr.w}</i><i class="l">▼${pr.l}</i><i class="d">${esc(display(home)).slice(0, 14)}</i></span>${starsHTML(r.stars)}</span></span>`, 2)}
        ${tile('career', 'clubs', 'tile-league', `<span class="tile-trophy">${trophySVG('league')}</span>
          <span class="tile-status ${progress.league ? 'live' : ''}">${esc(progress.league || 'New season')}</span>`, 3)}
        ${tile('cup', 'nations', 'tile-cup', `<span class="tile-trophy">${trophySVG('cup')}</span>
          <span class="tile-status ${progress.cup ? 'live' : ''}">${esc(progress.cup || 'New tournament')}</span>`, 4)}
        ${tile('practice', null, 'tile-train', `<span class="tile-balls">${ballSVG()}${ballSVG()}${ballSVG()}</span>`, 5)}
        ${tile('indoor', null, 'tile-indoor', star ? `<span class="tile-fig">${playerSVG({ ...star.pd, name: `${star.pd.name} b` }, kitFor(home.id, 'away'), { pose: 'roar', crop: true })}</span>` : '', 6)}
        ${tile('penalties', null, 'tile-pens', keeper ? `<span class="tile-fig">${playerSVG(keeper.pd, home.kit, { keeper: true, crop: true })}</span>` : '', 7)}
      </div>
    </div>`;
  }
  function hubPlay() {
    return `<div class="play-grid">${PLAY_CARDS.map(([m, pool], i) => {
      const info = modeInfo(m, pool || settings.pool);
      return `<button class="mode-card a-in" style="--i:${i}" data-nav data-act="mode" data-v="${m}" data-pool="${pool || ''}">
        <span class="tile-shine"></span><span class="mc-num">${String(i + 1).padStart(2, '0')}</span>
        <b>${esc(info.title)}</b><small>${esc(info.sub)}</small><span class="mc-comp">${esc(pool ? POOL_NAMES[pool] : info.comp)}</span>
      </button>`;
    }).join('')}</div>`;
  }
  function teamDetailHTML(t, withActions) {
    if (!api.isPlayable(t.id)) {
      return `<div class="sd-empty">${crest(t)}<h2>${esc(display(t))}</h2><p>No squad for ${esc(eraLabel(settings.roster))} yet. Choose another roster profile in Settings, or another team.</p></div>`;
    }
    const r = teamRatings(t);
    const sq = squadOf(t);
    return `<div class="sd-head">${crest(t)}<div><h2>${esc(display(t))}</h2><p>${esc(stadiumFor(t))} · ${formationOf(t)} · ${tacticOf(t)}</p>${starsHTML(r.stars)}</div>
        <div class="sd-bars">${ratingBar('ATT', r.att)}${ratingBar('MID', r.mid)}${ratingBar('DEF', r.def)}${ratingBar('OVR', r.ovr)}</div></div>
      <div class="sd-xi">${sq.slice(0, 11).map((p) => `<div class="sd-p"><span class="pos ${ROLE_CLASS[p.role]}">${p.pos}</span><b>${esc(p.pd.name)}</b><em>${p.rating}</em></div>`).join('')}</div>
      <div class="sd-bench"><span>Bench</span>${sq.slice(11).map((p) => `${esc(p.pd.name)} <em>${p.rating}</em>`).join(' · ')}</div>
      <div class="sd-kits">${kitTypes(t.id).map((k) => `<figure>${kitImg(t.id, k)}<figcaption>${k}</figcaption></figure>`).join('')}</div>
      ${withActions ? `<button class="fe-btn primary" data-nav data-act="manageSquad" data-v="${t.id}">Manage squad</button>` : ''}`;
  }
  function hubClubs() {
    const t = team(clubsTeam);
    return `<div class="squads">
      <div class="browse a-in" style="--i:1">${browseToolbar(null)}<div class="br-list">${browseListHTML(clubsTeam, 'clubsTeam')}</div></div>
      <div class="squad-detail a-in" style="--i:2">${teamDetailHTML(t, true)}</div>
    </div>`;
  }
  function settingsRows(keys = Object.keys(OPTIONS)) {
    return keys.map((key) => `
      <div class="set-row" data-nav tabindex="0" data-act="cycle" data-v="${key}">
        <span>${OPTIONS[key].label}</span>
        <span class="set-val"><button tabindex="-1" data-act="cycle" data-v="${key}" data-d="-1">◀</button><b>${esc(optionText(key, settings[key]))}</b><button tabindex="-1" data-act="cycle" data-v="${key}" data-d="1">▶</button></span>
      </div>`).join('') + (keys.includes('difficulty') ? `
      <div class="set-row" data-nav tabindex="0" data-act="sounds" data-v="sounds">
        <span>Menu sounds</span><span class="set-val"><button tabindex="-1" data-act="sounds">◀</button><b>${uiPrefs.sounds ? 'On' : 'Off'}</b><button tabindex="-1" data-act="sounds">▶</button></span>
      </div>` : '');
  }
  function hubSettings() {
    const locked = api.getProgress().cup || api.getProgress().league;
    return `<div class="settings-pane">
      <div class="set-col a-in" style="--i:1">
        <h3>Football universe</h3>${settingsRows(['roster', 'clubIdentity', 'playerIdentity'])}
        ${locked ? '<p class="set-note">A tournament in progress keeps the roster profile it started with. Names and crests follow your identity choice everywhere.</p>' : ''}
        <h3>Match settings</h3>${settingsRows(['difficulty', 'duration', 'assist', 'physics', 'camera', 'cameraZoom', 'graphics', 'intro', 'dribbleStyle', 'era'])}
      </div>
      <div class="set-col a-in" style="--i:2"><h3>Help, tools & data</h3>
        <button class="set-link" data-nav data-act="controls" data-v="controls"><b>Controller settings</b><small>Keyboard, gamepad and touch layout</small></button>
        <button class="set-link" data-nav data-act="howto" data-v="howto"><b>How to play</b><small>Moving, passing, shooting, defending, rules</small></button>
        <button class="set-link" data-nav data-act="dev" data-v="dev"><b>Developer options</b><small>Game speed, debug overlay, drills</small></button>
        <button class="set-link" data-nav data-act="validate" data-v="validate"><b>Data check</b><small>Run the validation report (IDs, rosters, logos, kits)</small></button>
        <button class="set-link" data-nav data-act="export" data-v="export"><b>Export saved data</b><small>Settings, squads, rating edits, tournaments → JSON file</small></button>
        <button class="set-link" data-nav data-act="import" data-v="import"><b>Import saved data</b><small>Restore from an exported JSON file</small></button>
        <input type="file" accept="application/json,.json" class="hidden" data-change="importFile">
        <button class="set-link" data-nav data-act="resetSquads" data-v="resetSquads"><b>Reset squads</b><small>Restore default line-ups and formations</small></button>
      </div>
    </div>`;
  }

  // ----- players -----
  // One row per footballer: a player who plays for a club and a national
  // team (e.g. Bayern and England) is listed once with both teams.
  const clubFirst = (a, b) => (IDX.clubs.has(a.roster_id.split(':')[1]) ? 0 : 1) - (IDX.clubs.has(b.roster_id.split(':')[1]) ? 0 : 1);
  function dbResults() {
    const q = dbQuery.trim().toLowerCase();
    const byPlayer = new Map();
    for (const m of DB.roster_members) {
      const [era] = m.roster_id.split(':');
      if (era !== settings.roster && settings.roster !== 'custom') continue;
      (byPlayer.get(m.player_id) || byPlayer.set(m.player_id, []).get(m.player_id)).push(m);
    }
    const rows = [];
    for (const [pid, members] of byPlayer) {
      members.sort(clubFirst);
      const m = members[0];
      const p = IDX.players.get(pid);
      const teamIds = [...new Set(members.map((r) => r.roster_id.split(':')[1]))];
      const teamNames = teamIds.map((id) => teamDisplayName(id));
      const alias = IDX.aliasesByPlayer.get(pid)?.name || '';
      if (q && !p.name.toLowerCase().includes(q) && !alias.toLowerCase().includes(q)
          && !teamNames.some((n) => n.toLowerCase().includes(q))) continue;
      rows.push({ m, p, teamId: teamIds[0], teamNames, card: playerCard(m) });
    }
    rows.sort((a, b) => b.card.overall - a.card.overall || a.p.name.localeCompare(b.p.name));
    return rows;
  }
  function hubPlayers() {
    const rows = dbResults();
    const shown = rows.slice(0, 80);
    if ((!dbMember || !rows.some((r) => r.m.id === dbMember)) && shown[0]) { dbMember = shown[0].m.id; dbPlayer = shown[0].m.player_id; }
    return `<div class="pdb">
      <div class="pdb-left a-in" style="--i:1">
        <input class="br-search" type="search" placeholder="Search players, parody names or teams…" value="${esc(dbQuery)}" data-input="dbsearch" aria-label="Search players">
        <div class="pdb-count">${rows.length} players in ${esc(eraLabel(settings.roster === 'custom' ? 'modern' : settings.roster))}${rows.length > shown.length ? ` · showing top ${shown.length}` : ''}</div>
        <div class="pdb-list">${pdbListHTML(shown)}</div>
      </div>
      <div class="pdb-right a-in" style="--i:2">${playerEditorHTML()}</div>
    </div>`;
  }
  function pdbListHTML(shown) {
    const edits = ls.get('fsl-edits', {});
    return shown.map(({ m, teamNames, card }) => {
      return `<button class="pdb-row ${m.id === dbMember ? 'on' : ''}" data-nav data-act="dbPick" data-v="${m.id}">
        <span class="pos ${ROLE_CLASS[GROUP_OF(card.position)]}">${card.position}</span>
        <span class="pdb-name"><b>${esc(card.name)}</b><small>${esc(teamNames.join(' · '))}${edits[m.player_id] || edits[m.id] ? ' · edited' : ''}</small></span>
        <span class="pdb-ovr">${card.overall}</span></button>`;
    }).join('') || '<div class="br-empty">No players found.</div>';
  }
  function playerEditorHTML() {
    const m = DB.roster_members.find((r) => r.id === dbMember);
    if (!m) return '<div class="br-empty">Select a player.</div>';
    const card = playerCard(m);
    const alias = IDX.aliasesByPlayer.get(m.player_id);
    const memberships = (IDX.membersByPlayer.get(m.player_id) || []).map((r) => {
      const [era, tid] = r.roster_id.split(':');
      return `${eraLabel(era)} · ${teamDisplayName(tid)} #${r.shirt_number}`;
    });
    const custom = ls.get('fsl-custom', { name: 'Ultimate XI', players: [] });
    const inCustom = custom.players.includes(m.player_id);
    const attrLabel = (k) => k.replace(/^gk/, 'GK ').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    const shownAttrs = ATTRIBUTE_KEYS.filter((k) => card.position === 'GK' || !k.startsWith('gk'));
    return `<div class="pe-head">
        <div class="pe-fig" data-pe3d="${esc(m.id)}"></div>
        <div><h2>${esc(card.name)}</h2>
          <p>${esc(card.roleName || '')} · ${esc(card.nationality)} · ${card.foot} foot · Weak foot ${card.weakFoot}★ · Skills ${card.skillMoves}★</p>
          <p class="pe-alias">Real: <b>${esc(card.realName)}</b> · Parody: <b>${esc(alias?.name || '—')}</b></p>
          <p class="pe-bio">${esc(alias?.bio || '')}</p>
          <p class="pe-mem">${memberships.map(esc).join('<br>')}</p>
        </div>
        <div class="pe-ovr"><input type="number" min="1" max="99" value="${card.overall}" data-edit="overall" aria-label="Overall"><small>OVR</small>
          <select data-edit="position" aria-label="Position">${Object.keys(POSITIONS).map((p) => `<option ${p === card.position ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      </div>
      <div class="pe-attrs">${shownAttrs.map((k) => `<label><span>${attrLabel(k)}</span><input type="number" min="1" max="99" value="${card.attributes[k]}" data-edit-attr="${k}"></label>`).join('')}</div>
      <div class="pe-actions">
        <button class="fe-btn primary" data-act="saveEdit">Save ratings</button>
        <button class="fe-btn" data-act="resetEdit">Reset to original ratings</button>
        <button class="fe-btn" data-act="toggleCustom">${inCustom ? 'Remove from' : 'Add to'} Ultimate Team (${custom.players.length}/18)</button>
      </div>
      <p class="set-note">Edits apply to this player for every team he plays for (club and country) and are saved in this browser. The Custom Ultimate Teams roster profile plays your picked players.</p>`;
  }

  // ----- team select (FIFA style) -----
  function selectFixedPool() {
    if (settings.mode === 'career') return 'clubs';
    return null;
  }
  function renderSelect() {
    const m = modeInfo(settings.mode, settings.pool);
    if (browse.pool !== settings.pool) { browse.pool = settings.pool; browse.league = 'all'; }
    const singleSide = m.single;
    if (singleSide) selSide = 0;
    const fx = api.resolveFixture();
    const editing = team(selSide === 0 ? settings.home : settings.away);
    screenEl('select').innerHTML = `
      <header class="scr-head a-in" style="--i:0"><span class="scr-kicker">${esc(m.comp)} · ${esc(eraLabel(settings.roster))}</span><h1>Select teams</h1></header>
      <div class="ts-shell">
        <div class="browse a-in" style="--i:1">${browseToolbar(m.trophy ? (settings.mode === 'career' ? 'clubs' : settings.pool) : selectFixedPool())}<div class="br-list">${browseListHTML(editing.id, 'pickTeam')}</div></div>
        <div class="ts-center a-in" style="--i:2">${selectCenterHTML(editing)}</div>
        <div class="ts-right a-in" style="--i:3">${selectRightHTML(fx, m)}</div>
      </div>
      <footer class="fe-foot">
        <span>${keyCap('↑↓')} Browse ${keyCap('Q/E')} Home / away ${keyCap('Drag')} Rotate player</span>
        <button class="fe-btn ghost" data-act="back">${keyCap('Esc')} Back</button>
        <button class="fe-btn primary" data-act="toPreview" ${canContinue() ? '' : 'disabled'}>${keyCap('Enter')} Continue</button>
      </footer>`;
  }
  function canContinue() {
    const { home, away } = api.resolveFixture();
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    return api.isPlayable(home.id) && (keeperOnly || api.isPlayable(away.id));
  }
  function selectCenterHTML(t) {
    if (!api.isPlayable(t.id)) return `<div class="ts-crest">${crest(t)}</div><h2 class="ts-name">${esc(display(t))}</h2><p class="ts-sub">No ${esc(eraLabel(settings.roster))} squad — pick another team or roster profile.</p>`;
    const r = teamRatings(t);
    syncViewerTeam(t);
    return `<div class="ts-side-tag ${selSide ? 'away' : 'home'}">${selSide ? 'Away team' : 'Home team'}</div>
      <div class="ts-headrow">
        <div class="ts-crest small" data-key="${t.id}">${crest(t)}</div>
        <div class="ts-title"><h2 class="ts-name">${esc(display(t))}</h2><p class="ts-sub">${esc(sub(t))}</p>${starsHTML(r.stars)}</div>
        <div class="ts-bars compact">${ratingBar('OVR', r.ovr)}${ratingBar('ATT', r.att)}${ratingBar('MID', r.mid)}${ratingBar('DEF', r.def)}</div>
      </div>
      <div class="pv3d">
        <div class="pv3d-stage" data-pv3d-host>
          <div class="pv3d-views">${[['front', 'Front'], ['side', 'Side'], ['back', 'Back']].map(([k, l]) => `<button class="pv3d-chip" data-act="pv3dView" data-v="${k}">${l}</button>`).join('')}</div>
          <div class="pv3d-zoom"><button class="pv3d-chip" data-act="pv3dZoom" data-v="-1" aria-label="Zoom in">+</button><button class="pv3d-chip" data-act="pv3dZoom" data-v="1" aria-label="Zoom out">−</button></div>
          <div class="pv3d-hint">Drag to rotate · scroll to zoom</div>
        </div>
        <div class="pv3d-side">${viewerSideHTML(t)}</div>
      </div>
      <div class="pv3d-anims">${VIEWER_ANIMS.map(([k, l]) => `<button class="pv3d-chip ${viewer3d.anim === k ? 'on' : ''}" data-act="pv3dAnim" data-v="${k}">${l}</button>`).join('')}</div>`;
  }
  // ----- Kick-Off 3D player viewer -----
  const viewerSquad = (t) => squadOf(t);
  function captainIndex(t) {
    const sq = viewerSquad(t);
    const i = sq.findIndex((p) => p.pd.captain);
    return i >= 0 ? i : sq.findIndex((p) => p.role !== 'GK');
  }
  function syncViewerTeam(t) {
    if (viewer3d.teamId !== t.id) {
      viewer3d.teamId = t.id;
      viewer3d.idx = captainIndex(t);
      viewer3d.mode = 'team';
      viewer3d.anim = 'idle';
    }
  }
  function identityOf(pd, role) {
    return pd.identity || playerIdentity({ ...pd, position: pd.position || (role === 'GK' ? 'GK' : role) });
  }
  function viewerKit(t) {
    const type = settings[selSide === 0 ? 'homeKit' : 'awayKit'];
    return kitTypes(t.id).length > 1 ? kitFor(t.id, type) : t.kit;
  }
  function viewerSideHTML(t) {
    const sq = viewerSquad(t);
    const cur = sq[viewer3d.idx] || sq[0];
    const nav = `<div class="pv3d-nav">
        <button class="pv3d-chip" data-act="pv3dStep" data-v="-1" aria-label="Previous player">◀</button>
        <button class="pv3d-chip" data-act="pv3dCaptain">Captain</button>
        <button class="pv3d-chip" data-act="pv3dRandom">Random</button>
        <button class="pv3d-chip" data-act="pv3dStep" data-v="1" aria-label="Next player">▶</button>
      </div>`;
    const tabs = `<nav class="pv3d-tabs"><button class="${viewer3d.mode === 'team' ? 'on' : ''}" data-act="pv3dMode" data-v="team">Team overview</button><button class="${viewer3d.mode === 'player' ? 'on' : ''}" data-act="pv3dMode" data-v="player">Player</button></nav>`;
    if (viewer3d.mode === 'team') {
      const cap = sq[captainIndex(t)];
      const kit = viewerKit(t);
      const colors = [kit.shirt, kit.secondary, kit.shorts, kit.socks].filter(Boolean);
      return `${tabs}
        <div class="pv3d-team">
          <div class="pv3d-meta"><span><em>Formation</em><b>${formationOf(t)}</b></span><span><em>Captain</em><b>${cap ? esc(cap.pd.name) : '—'}</b></span>
            <span><em>Colours</em><b class="pv3d-swatches">${colors.map((c) => `<i style="background:${c}"></i>`).join('')}</b></span></div>
          <ol class="pv3d-xi">${sq.slice(0, 11).map((p, i) => `<li><button class="${i === viewer3d.idx ? 'on' : ''}" data-act="pv3dPick" data-v="${i}">
            <span class="num">${p.pd.number ?? ''}</span><span class="pos ${ROLE_CLASS[p.role]}">${esc(p.pos)}</span><span class="nm">${esc(p.pd.name)}${p.pd.captain ? ' <i class="cap">C</i>' : ''}</span><b>${p.rating}</b></button></li>`).join('')}</ol>
        </div>${nav}`;
    }
    if (!cur) return tabs;
    const pd = cur.pd;
    const idn = identityOf(pd, cur.role);
    const a = pd.attributes;
    const groups = a
      ? ATTRIBUTE_GROUPS.filter(([g]) => (cur.role === 'GK') === (g === 'Goalkeeping') || g === 'Physical')
      : [['Ratings', [['Speed', 'spd'], ['Passing', 'pas'], ['Shooting', 'sho'], ['Dribbling', 'dri'], ['Tackling', 'tac'], ...(cur.role === 'GK' ? [['Goalkeeping', 'gk']] : [])]]];
    const src = a || pd.stats;
    const tab = groups.find(([g]) => g === viewer3d.tab) || groups[0];
    const bar = ([label, k]) => `<div class="pv3d-attr"><span>${label}</span><i><b style="width:${clamp(src[k] ?? 0, 0, 99)}%;background:${(src[k] ?? 0) >= 80 ? '#3ddc84' : (src[k] ?? 0) >= 70 ? '#f3c34a' : '#ef7d3a'}"></b></i><em>${src[k] ?? '–'}</em></div>`;
    return `${tabs}
      <div class="pv3d-player">
        <div class="pv3d-id"><span class="num">${pd.number ?? ''}</span><div><h3>${esc(pd.name)}${pd.captain ? ' <i class="cap">C</i>' : ''}</h3>
          <p>${esc(pd.position || cur.pos)} · ${esc(display(t))}</p></div><b class="ovr">${cur.rating}<small>OVR</small></b></div>
        <div class="pv3d-bio">
          <span><em>Height</em>${idn.heightCm} cm</span><span><em>Weight</em>${idn.weightKg} kg</span><span><em>Age</em>${idn.age}</span>
          <span><em>Foot</em>${esc(pd.foot || idn.foot || 'Right')}</span><span><em>Build</em>${esc(idn.build.label)}</span><span><em>Boots</em>${esc(idn.boots.name)}</span>
        </div>
        <nav class="pv3d-gtabs">${groups.map(([g]) => `<button class="${g === tab[0] ? 'on' : ''}" data-act="pv3dTab" data-v="${g}">${g}</button>`).join('')}</nav>
        <div class="pv3d-attrs">${tab[1].map(bar).join('')}</div>
      </div>${nav}`;
  }
  function mountViewer() {
    const el = screenEl('select');
    const host = el?.querySelector('[data-pv3d-host]');
    const viewer = sharedPlayerViewer();
    if (!host) { viewer.unmount(); return; }
    const t = team(selSide === 0 ? settings.home : settings.away);
    const sq = viewerSquad(t);
    const cur = sq[viewer3d.idx] || sq[0];
    if (!cur) return;
    viewer.mount(host);
    const keeper = cur.role === 'GK';
    viewer.show({
      identity: { ...identityOf(cur.pd, cur.role), captain: !!cur.pd.captain },
      kit: viewerKit(t), keeper, crestUrl: t.crest, teamKey: `viewer|${t.id}|${viewerKit(t).shirt}`,
    });
    if (viewer.anim !== viewer3d.anim && !(keeper && viewer3d.anim === 'idle')) viewer.setAnim(viewer3d.anim);
  }
  /** Players tab: the selected player in 3D, in his primary team's kit. */
  function mountEditorFigure() {
    const host = screenEl('hub')?.querySelector('[data-pe3d]');
    if (!host) return;
    const m = DB.roster_members.find((r) => r.id === host.dataset.pe3d);
    if (!m) return;
    const card = playerCard(m);
    const teamId = m.roster_id.split(':')[1];
    const viewer = sharedPlayerViewer();
    viewer.mount(host);
    viewer.show({
      identity: card.identity, kit: kitFor(teamId, 'home'), keeper: card.position === 'GK',
      crestUrl: crestUrl(teamId), teamKey: `editor|${teamId}`,
    });
  }
  function refreshViewerSide() {
    const el = screenEl('select');
    const t = team(selSide === 0 ? settings.home : settings.away);
    const side = el.querySelector('.pv3d-side');
    if (side) side.innerHTML = viewerSideHTML(t);
    el.querySelectorAll('[data-act="pv3dAnim"]').forEach((b) => b.classList.toggle('on', b.dataset.v === viewer3d.anim));
    mountViewer();
  }
  function viewerAction(act, v) {
    const viewer = sharedPlayerViewer();
    const t = team(selSide === 0 ? settings.home : settings.away);
    const n = viewerSquad(t).length;
    if (act === 'pv3dView') { viewer.view(v); return; }
    if (act === 'pv3dZoom') { viewer.zoom(Number(v)); return; }
    if (act === 'pv3dAnim') { viewer3d.anim = v; viewer.setAnim(v === 'idle' && viewerSquad(t)[viewer3d.idx]?.role === 'GK' ? 'gkReady' : v); refreshViewerSide(); return; }
    if (act === 'pv3dPick') { viewer3d.idx = Number(v); viewer3d.mode = 'player'; }
    if (act === 'pv3dStep') { viewer3d.idx = (viewer3d.idx + Number(v) + n) % n; viewer3d.mode = 'player'; }
    if (act === 'pv3dCaptain') { viewer3d.idx = captainIndex(t); viewer3d.mode = 'player'; viewer.view('front', true); }
    if (act === 'pv3dRandom') { viewer3d.idx = Math.floor(Math.random() * n); viewer3d.mode = 'player'; }
    if (act === 'pv3dMode') viewer3d.mode = v;
    if (act === 'pv3dTab') viewer3d.tab = v;
    sfx.move();
    refreshViewerSide();
  }
  function selectRightHTML(fx, m) {
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    const homeT = fx.home, awayT = fx.away;
    const kits = api.matchKits(homeT, awayT);
    const sideCard = (t, side, label) => {
      const fixed = side === 1 && (m.single || keeperOnly);
      return `<button class="ts-sidecard ${selSide === side ? 'on' : ''} ${side ? 'away' : 'home'}" data-act="side" data-v="${side}" ${fixed ? 'disabled' : ''}>
        <span class="ts-sc-label">${esc(label)}</span>${crest(t)}<b>${esc(keeperOnly && side ? 'Goalkeeper only' : display(t))}</b>
        <span>${api.isPlayable(t.id) ? `${teamRatings(t).ovr} OVR` : 'No squad'}</span></button>`;
    };
    const editingId = selSide === 0 ? homeT.id : awayT.id;
    const kitKey = selSide === 0 ? 'homeKit' : 'awayKit';
    const types = kitTypes(editingId);
    const editT = selSide === 0 ? homeT : awayT;
    return `<div class="ts-compare">${sideCard(homeT, 0, m.sides[0])}<span class="ts-vs">VS</span>${sideCard(awayT, 1, m.sides[1])}</div>
      ${fx.stage ? `<div class="ts-stage">${esc(fx.stage)}</div>` : ''}
      <div class="ts-block"><h4>Stadium</h4><p><b>${esc(stadiumFor(homeT))}</b>${IDX.stadiums.get(IDX.clubs.get(homeT.id)?.stadium_id)?.capacity ? ` · ${IDX.stadiums.get(IDX.clubs.get(homeT.id).stadium_id).capacity.toLocaleString()} seats` : ''}${IDX.clubs.get(homeT.id)?.city ? ` · ${esc(IDX.clubs.get(homeT.id).city)}` : ''}</p></div>
      <div class="ts-block"><h4>${selSide ? 'Away' : 'Home'} kit · ${esc(display(editT))}</h4>
        <div class="ts-kits">${types.map((k) => `<button class="ts-kit ${settings[kitKey] === k || (types.length === 1) ? 'on' : ''}" data-act="kit" data-v="${k}">${kitImg(editingId, k)}<span>${k}</span></button>`).join('')}</div>
        ${kits.switched && !keeperOnly ? `<p class="ts-warn">Kit clash: away side will wear its ${esc(kits.switched)} kit.</p>` : ''}
      </div>
      <div class="ts-block"><h4>Formation</h4><p><b>${formationOf(editT)}</b> · ${esc(tacticOf(editT))} <button class="ts-link" data-act="manageFromSelect">Team management ›</button></p></div>`;
  }
  function refreshSelectParts() {
    const el = screenEl('select');
    const m = modeInfo(settings.mode, settings.pool);
    const editing = team(selSide === 0 ? settings.home : settings.away);
    el.querySelector('.ts-center').innerHTML = selectCenterHTML(editing);
    el.querySelector('.ts-right').innerHTML = selectRightHTML(api.resolveFixture(), m);
    refreshBrowseList(el, editing.id, 'pickTeam');
    mountViewer();
    const cont = el.querySelector('[data-act="toPreview"]');
    if (cont) cont.disabled = !canContinue();
    updateCover();
  }

  // ----- match preview -----
  function renderPreview() {
    const m = modeInfo(settings.mode, settings.pool);
    const fx = api.resolveFixture();
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    const kits = api.matchKits(fx.home, fx.away);
    const home = { ...fx.home, kit: kits.home }, away = { ...fx.away, kit: kits.away };
    const rh = teamRatings(home), ra = teamRatings(away);
    const sh = starPlayer(home);
    const sa = keeperOnly ? { pd: away.players[0], rating: playerRating(away.players[0], 'GK'), pos: 'GK' } : starPlayer(away);
    const h2h = getH2H(home.id, away.id);
    const ctrl = api.controllers();
    const who = (c) => (c === 'ai' ? 'CPU' : c.toUpperCase());
    const minutes = settings.mode === 'penalties' || keeperOnly ? 'Untimed' : `${settings.duration / 60} minutes`;
    let center = '';
    if (previewTab === 'preview') {
      const total = h2h.a + h2h.b + h2h.draws;
      center = `
        <div class="pv-meta"><span>${esc(stadiumFor(home))}</span><span>${esc(fx.stage || m.comp)}</span><span>${minutes}</span></div>
        <div class="pv-h2h-title">Overall head to head</div>
        <div class="pv-h2h"><div><b class="hc">${h2h.a}</b> Wins</div><div><b>${h2h.draws}</b> Draws</div><div>Wins <b class="ac">${h2h.b}</b></div></div>
        <div class="pv-h2h-bar"><i class="hc" style="flex:${h2h.a || (total ? 0 : 1)}"></i><i style="flex:${h2h.draws || (total ? 0 : 1)}"></i><i class="ac" style="flex:${h2h.b || (total ? 0 : 1)}"></i></div>
        <div class="pv-vs-row"><div class="pv-ctrl ${ctrl[0]}">${who(ctrl[0])}</div>
          <div class="pv-kits">${kitImg(home.id, kits.home.type || 'home')}<span>VS</span>${kitImg(away.id, kits.away.type || 'away')}</div>
          <div class="pv-ctrl ${ctrl[1]}">${who(ctrl[1])}</div></div>
        <div class="pv-conditions">
          <span><em>Difficulty</em>${optionText('difficulty', settings.difficulty)}</span>
          <span><em>Roster</em>${esc(eraLabel(settings.roster))}</span>
          <span><em>Kits</em>${esc(kits.home.type || 'home')} v ${esc(kits.away.type || 'away')}</span>
          <span><em>Formation</em>${formationOf(home)} v ${keeperOnly ? '—' : formationOf(away)}</span>
        </div>
        <div class="pv-welcome">${fx.continuing ? `Continue your ${esc(m.comp)} run` : `Welcome to ${esc(m.title)}`}</div>`;
    } else if (previewTab === 'stats') {
      const row = (label, a, b) => `<div class="pv-stat"><b>${a}</b><span><i class="hc" style="width:${(a / (a + b || 1)) * 100}%"></i><i class="ac" style="width:${(b / (a + b || 1)) * 100}%"></i></span><em>${label}</em><b>${b}</b></div>`;
      center = `<div class="pv-stats">${row('Overall', rh.ovr, keeperOnly ? 0 : ra.ovr)}${row('Attack', rh.att, keeperOnly ? 0 : ra.att)}${row('Midfield', rh.mid, keeperOnly ? 0 : ra.mid)}${row('Defence', rh.def, keeperOnly ? 0 : ra.def)}${row('Star rating', sh.rating, sa.rating)}</div>`;
    } else {
      const list = (t) => squadOf(t).slice(0, keeperOnly && t === away ? 1 : 11).map((p) => `<li><span class="pos ${ROLE_CLASS[p.role]}">${p.pos}</span>${esc(p.pd.name)}<em>${p.rating}</em></li>`).join('');
      center = `<div class="pv-lineups"><ol>${list(home)}</ol><ol>${list(away)}</ol></div>`;
    }
    screenEl('preview').innerHTML = `
      <div class="pv-tunnel"></div>
      <div class="pv-fig left a-in" style="--i:1"><div class="pv-fig3d" data-fig3d="0"></div><div class="pv-figname"><b>${esc(sh.pd.name)}</b><span>${sh.rating} · ${esc(sh.pd.position || sh.pos || '')}</span></div></div>
      <div class="pv-fig right a-in" style="--i:2"><div class="pv-fig3d" data-fig3d="1"></div><div class="pv-figname"><b>${esc(sa.pd.name)}</b><span>${sa.rating} · ${esc(sa.pd.position || sa.pos || 'GK')}</span></div></div>
      <div class="pv-center a-in" style="--i:0">
        <nav class="pv-tabs">${[['preview', 'Match preview'], ['stats', 'Team stats'], ['lineups', 'Line-ups']].map(([k, l]) => `<button class="${previewTab === k ? 'on' : ''}" data-act="pvTab" data-v="${k}">${l}</button>`).join('')}</nav>
        <div class="pv-crests"><div class="pv-crest">${crest(home)}<b>${esc(display(home))}</b></div><div class="pv-crest">${crest(away)}<b>${esc(keeperOnly ? 'Goalkeeper' : display(away))}</b></div></div>
        <div class="pv-body">${center}</div>
      </div>
      <nav class="pv-menu a-in" style="--i:3">
        <button class="pv-item primary" data-nav data-autofocus data-act="play"><b>${fx.continuing ? 'Continue' : 'Play match'}</b><span class="pv-ico">${ballSVG()}</span></button>
        <button class="pv-item" data-nav data-act="manage"><b>Team management</b><span class="pv-ico ico-pitch"></span></button>
        <button class="pv-item" data-nav data-act="settingsModal"><b>Game settings</b><span class="pv-ico ico-gear">⚙</span></button>
        <button class="pv-item" data-nav data-act="controls"><b>Controller settings</b><span class="pv-ico ico-pad">✜</span></button>
        ${fx.continuing ? `<button class="pv-item" data-nav data-act="abandon"><b>New ${esc(m.comp)}</b><span class="pv-ico">↺</span></button>` : '<button class="pv-item" data-nav data-act="pvStats"><b>Detailed stats</b><span class="pv-ico">▮▮</span></button>'}
      </nav>
      <footer class="fe-foot">${keyCap('Enter')} Advance ${keyCap('Esc')} Back ${keyCap('Q/E')} Switch tab</footer>`;
    previewFigures = [
      { pd: sh.pd, role: sh.role, kit: home.kit, crest: home.crest, keeper: false },
      { pd: sa.pd, role: keeperOnly ? 'GK' : sa.role, kit: away.kit, crest: away.crest, keeper: keeperOnly },
    ];
  }
  // Match preview: the two star players in 3D (same characters as the match).
  let previewFigures = [];
  const previewViewers = [];
  function mountPreviewFigures() {
    const el = screenEl('preview');
    previewFigures.forEach((f, i) => {
      const host = el?.querySelector(`[data-fig3d="${i}"]`);
      if (!host) return;
      if (!previewViewers[i]) previewViewers[i] = new PlayerViewer();
      const v = previewViewers[i];
      v.mount(host);
      v.show({
        identity: { ...identityOf(f.pd, f.role), captain: !!f.pd.captain },
        kit: f.kit, keeper: f.keeper || f.role === 'GK', crestUrl: f.crest, teamKey: `preview|${i}|${f.kit.shirt}`,
      });
      v.view(i === 0 ? 'threeQuarter' : 'front');
      if (i === 1) v.yawTarget = -Math.PI / 5;
    });
  }
  function unmountPreviewFigures() { for (const v of previewViewers) v?.unmount(); }

  // ----- team management (FIFA 07 style) -----
  function manageTeams() {
    if (manageOnlyId) return [team(manageOnlyId)];
    const { home, away } = api.resolveFixture();
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    return keeperOnly ? [home] : [home, away];
  }
  function renderManage() {
    const list = manageTeams();
    manageSide = Math.min(manageSide, list.length - 1);
    const t = list[manageSide];
    if (!api.isPlayable(t.id)) { screenEl('manage').innerHTML = `<div class="fe-error"><h2>No squad for ${esc(display(t))}</h2><p>This team has no ${esc(eraLabel(settings.roster))} roster.</p><button class="fe-btn primary" data-act="back">Back</button></div>`; return; }
    const sq = squadOf(t);
    const r = teamRatings(t);
    const indoor = settings.mode === 'indoor' && !manageOnlyId;
    const formation = formationOf(t);
    const slots = indoor ? api.indoorFormation : (api.formations[formation] || api.formations['4-3-3']);
    manageCursor = clamp(manageCursor, 0, sq.length - 1);
    const rows = sq.map((p, i) => `
      ${i === 11 ? '<div class="mg-divider">Substitutes</div>' : ''}
      <button class="mg-row ${manageSel === i ? 'sel' : ''} ${manageCursor === i ? 'cur' : ''} ${indoor && i >= 5 && i < 11 ? 'dim' : ''}" data-act="mgRow" data-v="${i}">
        <span class="mg-pos">${indoor && i < 5 ? slotLabel(slots[i]) : p.pos}</span><span class="mg-tag ${ROLE_CLASS[p.role]}"></span>
        <span class="mg-name">${esc(p.pd.name)}</span><span class="mg-num">${p.pd.number}</span><span class="mg-ovr">${p.rating}</span>
      </button>`).join('');
    const dots = slots.map((slot, i) => {
      const p = sq[i];
      const top = 50 - slot.x * 44, left = 50 + slot.z * 42;
      return `<button class="mg-dot ${ROLE_CLASS[slot.role]} ${manageSel === i ? 'sel' : ''} ${manageCursor === i ? 'cur' : ''}" style="top:${top}%;left:${left}%;--kit:${slot.role === 'GK' ? t.kit.gk : t.kit.shirt}" data-act="mgRow" data-v="${i}">
        <i>${p.pd.number}</i><span>${esc(p.pd.name.split(' ').slice(-1)[0])}</span></button>`;
    }).join('');
    const cur = sq[manageCursor];
    screenEl('manage').innerHTML = `
      <div class="mg-shell">
        <div class="mg-left a-in" style="--i:1">
          <div class="mg-tabs">${list.length > 1 ? keyCap('Q') : ''}${list.map((x, i) => `<button class="${i === manageSide ? 'on' : ''}" data-act="mgSide" data-v="${i}">${esc(x.short || display(x))}</button>`).join('')}${list.length > 1 ? keyCap('E') : ''}<span>Starting XI</span></div>
          <button class="mg-done" data-act="back" data-nav data-autofocus>Done</button>
          <div class="mg-list" style="--team:${t.kit.shirt}">${rows}</div>
        </div>
        <div class="mg-mid a-in" style="--i:2">
          <div class="mg-crest">${crest(t)}</div>
          <h2>${esc(display(t))}</h2>
          ${starsHTML(r.stars)}
          <div class="mg-rates">${ratingBar('OFF', r.att)}${ratingBar('MID', r.mid)}${ratingBar('DEF', r.def)}</div>
          <div class="mg-opt"><span>Formation</span>
            ${indoor ? '<b class="mg-fixed">Indoor 1-2-1 (fixed)</b>' : `<div class="set-val"><button data-act="formation" data-d="-1">◀</button><b>${formation}</b><button data-act="formation" data-d="1">▶</button></div>`}
          </div>
          <div class="mg-opt"><span>Tactics</span><div class="set-val"><button data-act="tactic" data-d="-1">◀</button><b>${tacticOf(t)}</b><button data-act="tactic" data-d="1">▶</button></div></div>
          <div class="mg-help">${manageSel === null ? 'Select a player, then select another to swap them.' : `Swap <b>${esc(sq[manageSel].pd.name)}</b> with…`}</div>
        </div>
        <div class="mg-right a-in" style="--i:3">
          <div class="mg-title"><b>Team management</b><span>${esc(display(t))} · ${indoor ? 'Indoor' : formation}</span></div>
          <div class="mg-pitch"><div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="half"></i><i class="circle"></i></div>${dots}</div>
        </div>
      </div>
      <aside class="mg-bio" style="--kit:${t.kit.shirt}">
        <div class="bio-fig">${playerSVG(cur.pd, t.kit, { keeper: cur.role === 'GK' })}</div>
        <div class="bio-info"><span class="bio-num">${cur.pd.number}</span><h3>${esc(cur.pd.name)}</h3>
          <p>${cur.pos === 'SUB' ? `Substitute · ${esc(cur.pd.position || cur.role)}` : `${cur.pos}${cur.pd.position ? ` (${esc(cur.pd.position)})` : ''}`}</p>
          ${[['Pace', 'spd'], ['Passing', 'pas'], ['Shooting', 'sho'], ['Tackling', 'tac'], ['Dribbling', 'dri'], ['Goalkeeping', 'gk']].map(([l, k]) => ratingBar(l, cur.pd.stats[k])).join('')}
        </div>
      </aside>
      <footer class="fe-foot">${keyCap('↑↓')} Browse ${keyCap('Enter')} Select / swap ${keyCap('F')} Formation ${keyCap('T')} Tactics ${keyCap('R')} Reset ${keyCap('Esc')} Done</footer>`;
  }

  // ----- modals -----
  function openModal(kind, html) {
    sfx.select();
    const card = modal.querySelector('.fe-modal-card');
    if (kind === 'controls') {
      const pad = (k) => `<kbd>${k}</kbd>`;
      card.innerHTML = `<h2>Controller settings</h2>
        <div class="ctl-grid">
          <div class="ctl-col"><h4>Player 1 · keyboard</h4><p><span>Move</span>${pad('W')}${pad('A')}${pad('S')}${pad('D')}</p><p><span>Pass / switch</span>${pad('F')} or ${pad('Space')}</p><p><span>Shoot (hold) / tackle</span>${pad('G')}</p><p><span>Sprint</span>${pad('Left Shift')}</p></div>
          <div class="ctl-col"><h4>Player 2 · keyboard</h4><p><span>Move</span>${pad('↑')}${pad('←')}${pad('↓')}${pad('→')}</p><p><span>Pass / switch</span>${pad('.')}</p><p><span>Shoot (hold) / tackle</span>${pad('/')}</p><p><span>Sprint</span>${pad('Right Shift')}</p></div>
          <div class="ctl-col"><h4>Gamepad</h4><p><span>Move</span>${pad('Left stick')}</p><p><span>Pass / switch</span>${pad('A')} / ${pad('✕')}</p><p><span>Shoot / tackle</span>${pad('B')} / ${pad('○')}</p><p><span>Sprint</span>${pad('RT')} ${pad('RB')}</p></div>
          <div class="ctl-col"><h4>In match</h4><p><span>Pause</span>${pad('Esc')} ${pad('P')}</p><p><span>Camera</span>${pad('C')}</p><p><span>Skip replay</span>${pad('R')}</p><p><span>Touch screen</span>Stick + Pass / Shoot / Sprint</p></div>
        </div>
        <button class="fe-btn primary" data-act="closeModal" data-autofocus>Done</button>`;
    } else if (kind === 'settings') {
      card.innerHTML = `<h2>Game settings</h2><div class="set-col">${settingsRows()}</div><button class="fe-btn primary" data-act="closeModal" data-autofocus>Done</button>`;
    } else {
      card.innerHTML = `${html}<button class="fe-btn primary" data-act="closeModal" data-autofocus>Done</button>`;
    }
    modal.dataset.kind = kind;
    modal.classList.remove('hidden');
    card.querySelector('[data-autofocus]')?.focus();
  }
  function closeModal() {
    modal.classList.add('hidden');
    sfx.back();
    render();
    focusFirst();
  }
  async function runValidation() {
    openModal('report', '<h2>Data check</h2><p>Running…</p>');
    const report = validateDatabase();
    // Broken image references: ask the server for every crest and kit file.
    const urls = [...new Set([...DB.clubs, ...DB.national_teams].flatMap((t) => [crestUrlFor(t.id, false), crestUrlFor(t.id, true), ...['home', 'away', 'third'].map((k) => kitUrl(t.id, k))]))];
    let missing = 0;
    await Promise.all(urls.map((u) => fetch(u, { method: 'HEAD' }).then((r) => { if (!r.ok) { missing++; report.errors.push(`Missing asset: ${u}`); } }).catch(() => { missing++; report.errors.push(`Missing asset: ${u}`); })));
    report.stats['Asset files checked'] = urls.length;
    report.stats['Missing asset files'] = missing;
    const card = modal.querySelector('.fe-modal-card');
    card.innerHTML = `<h2>Data check</h2>
      <p class="${report.errors.length ? 'rep-bad' : 'rep-ok'}">${report.errors.length ? `${report.errors.length} error(s)` : 'No errors: no missing references, duplicate IDs or broken images.'} · ${report.warnings.length} warning(s)</p>
      <table class="rep">${Object.entries(report.stats).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      ${report.errors.length ? `<h4>Errors</h4><ul class="rep-list">${report.errors.slice(0, 50).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${report.warnings.length ? `<h4>Warnings</h4><ul class="rep-list">${report.warnings.slice(0, 40).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      <button class="fe-btn primary" data-act="closeModal" data-autofocus>Done</button>`;
    card.querySelector('[data-autofocus]')?.focus();
  }
  const crestUrlFor = (id, parody) => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}assets/clubs/logos/${id}${parody ? '-parody' : ''}.svg`;

  // ---------- VS intro ----------
  function playIntro(done) {
    const fx = api.resolveFixture();
    const kits = api.matchKits(fx.home, fx.away);
    const { home, away } = fx;
    const m = modeInfo(settings.mode, settings.pool);
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    intro.style.setProperty('--hk', kits.home.shirt);
    intro.style.setProperty('--ak', keeperOnly ? kits.away.gk : kits.away.shirt);
    intro.innerHTML = `
      <div class="in-half in-home"><div class="in-crest">${crest(home)}</div><b>${esc(display(home))}</b><span>${esc(sub(home))}</span></div>
      <div class="in-half in-away"><div class="in-crest">${crest(away)}</div><b>${esc(keeperOnly ? 'Goalkeeper' : display(away))}</b><span>${esc(sub(away))}</span></div>
      <div class="in-vs">VS</div>
      <div class="in-bar"><span>${esc(fx.stage || m.comp)}</span><i></i><span>${esc(stadiumFor(home))}</span></div>
      <div class="in-flash"></div>`;
    intro.classList.remove('hidden', 'run', 'out'); void intro.offsetWidth; intro.classList.add('run');
    sfx.whoosh();
    setTimeout(() => sfx.impact(), 650);
    introDone = () => {
      clearTimeout(introTimer); introTimer = null; introDone = null;
      intro.classList.add('out');
      done();
      setTimeout(() => intro.classList.add('hidden'), 520);
      setTimeout(() => intro.classList.remove('out', 'run'), 560);
    };
    introTimer = setTimeout(() => introDone?.(), 3000);
  }

  // ---------- actions ----------
  function chooseMode(mode, pool) {
    sfx.select();
    if (pool) settings.pool = pool;
    if (mode === 'career' && settings.pool === 'nations') settings.pool = 'clubs';
    const prog = api.getProgress();
    const continuing = (mode === 'cup' && prog.cup) || (mode === 'career' && prog.league);
    settings.mode = mode;
    if (!continuing) { if (mode !== 'cup') api.clearCup(); if (mode !== 'career') api.clearLeague(); }
    ensureSelectionsInPool();
    api.persistSettings();
    if (mode === 'tutorial') { kickOff(); return; }
    go(continuing ? 'preview' : 'select');
  }
  /** Keep home/away valid for the current pool (e.g. after switching to nations). */
  function ensureSelectionsInPool() {
    const ids = api.poolTeamIds(settings.pool).filter(api.isPlayable);
    if (!ids.length) return;
    const ranked = ids.slice().sort((a, b) => (api.teamRating(b) ?? 0) - (api.teamRating(a) ?? 0));
    if (!ids.includes(settings.home)) settings.home = ranked[0];
    if (!ids.includes(settings.away) || settings.away === settings.home) settings.away = ranked.find((id) => id !== settings.home) || ranked[0];
  }
  function kickOff() {
    if (!canContinue()) return;
    sfx.select();
    playIntro(() => api.startMatch());
  }
  function applyDbChange() {
    api.refreshDb();
    ensureSelectionsInPool();
    api.persistSettings();
  }
  function cycleOption(key, d = 1) {
    if (key === 'roster' && (api.getProgress().cup || api.getProgress().league)) { sfx.back(); return; }
    const vals = OPTIONS[key].values.map(([v]) => v);
    const i = vals.findIndex((v) => String(v) === String(settings[key]));
    settings[key] = vals[(i + d + vals.length) % vals.length];
    if (DB_OPTIONS.has(key)) applyDbChange(); else api.persistSettings();
    sfx.move();
    rerenderKeepFocus();
  }
  function rerenderKeepFocus() {
    const act = document.activeElement;
    const sig = act && act.dataset ? `${act.dataset.act}|${act.dataset.v}` : null;
    if (!modal.classList.contains('hidden')) {
      const card = modal.querySelector('.fe-modal-card');
      const col = card.querySelector('.set-col');
      if (col) col.innerHTML = settingsRows();
      if (sig) card.querySelector(`[data-act="${sig.split('|')[0]}"][data-v="${sig.split('|')[1]}"]`)?.focus();
      return;
    }
    render();
    if (sig) screenEl(screen)?.querySelector(`[data-nav][data-act="${sig.split('|')[0]}"][data-v="${sig.split('|')[1]}"]`)?.focus();
  }
  function pickTeam(id, side = selSide) {
    if (!api.isPlayable(id)) { sfx.back(); return; }
    const key = side === 0 ? 'home' : 'away';
    if (settings[key] === id) return;
    settings[key] = id;
    settings[side === 0 ? 'homeKit' : 'awayKit'] = side === 0 ? 'home' : 'away';
    if (settings.mode === 'cup') api.clearCup();
    if (settings.mode === 'career') api.clearLeague();
    api.persistSettings();
    sfx.move();
    refreshSelectParts();
    screenEl('select').querySelector('.ts-crest')?.classList.add('spin-r');
  }
  function stepTeam(d) {
    const rows = browseIds().filter((r) => r.playable);
    if (!rows.length) return;
    const cur = selSide === 0 ? settings.home : settings.away;
    const i = rows.findIndex((r) => r.id === cur);
    const next = rows[(i + d + rows.length) % rows.length];
    pickTeam(next.id);
    screenEl('select').querySelector(`.br-main[data-v="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function swapPlayers(t, a, b) {
    const order = [...orderOf(t)];
    [order[a], order[b]] = [order[b], order[a]];
    saveSquad(t, { order });
  }
  const currentManageTeam = () => manageTeams()[manageSide];
  function mgSelect(i) {
    const t = currentManageTeam();
    manageCursor = i;
    if (manageSel === null) { manageSel = i; sfx.select(); } else if (manageSel === i) { manageSel = null; sfx.back(); } else {
      swapPlayers(t, manageSel, i); manageSel = null; sfx.select();
    }
    render();
  }
  function cycleFormation(d) {
    if (settings.mode === 'indoor' && !manageOnlyId) return;
    const t = currentManageTeam();
    const keys = Object.keys(api.formations);
    const i = keys.indexOf(formationOf(t));
    saveSquad(t, { formation: keys[(i + d + keys.length) % keys.length] });
    sfx.move(); render();
  }
  function cycleTactic(d) {
    const t = currentManageTeam();
    const keys = ['defensive', 'balanced', 'attacking'];
    const i = keys.indexOf(tacticOf(t));
    saveSquad(t, { tactic: keys[(i + d + keys.length) % keys.length] });
    sfx.move(); render();
  }
  function readEditor() {
    const card = screenEl('hub').querySelector('.pdb-right');
    const overall = clamp(Number(card.querySelector('[data-edit="overall"]').value) || 1, 1, 99);
    const position = card.querySelector('[data-edit="position"]').value;
    const attributes = {};
    card.querySelectorAll('[data-edit-attr]').forEach((inp) => { attributes[inp.dataset.editAttr] = clamp(Number(inp.value) || 1, 1, 99); });
    return { overall, position, attributes };
  }

  function back() {
    if (!modal.classList.contains('hidden')) { closeModal(); return; }
    sfx.back();
    if (screen === 'hub') go('title');
    else if (screen === 'select') go('hub');
    else if (screen === 'preview') {
      const prog = api.getProgress();
      const continuing = (settings.mode === 'cup' && prog.cup) || (settings.mode === 'career' && prog.league);
      go(continuing ? 'hub' : 'select');
    } else if (screen === 'manage') { manageSel = null; go(manageReturn); }
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || busy || el.disabled) return;
    e.preventDefault(); // never let a click navigate or submit anything
    const { act, v } = el.dataset;
    const d = Number(el.dataset.d || 1);
    switch (act) {
      case 'start': sfx.select(); go('hub'); break;
      case 'recover': settingsSafe(); go('hub'); break;
      case 'tab': hubTab = v; uiPrefs.hubTab = v; saveUi(); pushRoute('hub', true); sfx.move(); render(); break;
      case 'mode': chooseMode(v, el.dataset.pool || null); break;
      case 'clubsTeam': clubsTeam = v; sfx.move(); screenEl('hub').querySelector('.squad-detail').innerHTML = teamDetailHTML(team(v), true); refreshBrowseList(screenEl('hub'), v, 'clubsTeam'); break;
      case 'manageSquad': manageOnlyId = v; manageSide = 0; manageSel = null; manageCursor = 0; manageReturn = 'hub'; sfx.select(); go('manage'); break;
      case 'manageFromSelect': manageOnlyId = null; manageSide = selSide; manageSel = null; manageCursor = 0; manageReturn = 'select'; sfx.select(); go('manage'); break;
      case 'pool': if (browse.pool !== v) { browse.pool = v; browse.league = 'all'; saveUi(); if (screen === 'select') { settings.pool = v; ensureSelectionsInPool(); api.persistSettings(); } sfx.move(); render(); } break;
      case 'sort': browse.sort = v; saveUi(); sfx.move(); rerenderBrowse(); break;
      case 'favOnly': browse.fav = !browse.fav; saveUi(); sfx.move(); rerenderBrowse(); el.classList.toggle('on', browse.fav); break;
      case 'fav': toggleFav(v); el.classList.toggle('on', favorites.has(v)); sfx.move(); if (browse.fav) rerenderBrowse(); break;
      case 'cycle': e.stopPropagation(); cycleOption(v, d); break;
      case 'sounds': uiPrefs.sounds = !uiPrefs.sounds; saveUi(); sfx.select(); rerenderKeepFocus(); break;
      case 'controls': openModal('controls'); break;
      case 'settingsModal': openModal('settings'); break;
      case 'closeModal': closeModal(); break;
      case 'howto': sfx.select(); api.openHowToPlay(); break;
      case 'dev': sfx.select(); api.openDevOptions(); break;
      case 'validate': runValidation(); break;
      case 'export': {
        const blob = new Blob([JSON.stringify(exportUserData(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `futbol-super-league-save-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); sfx.select(); break;
      }
      case 'import': screenEl('hub').querySelector('[data-change="importFile"]')?.click(); break;
      case 'resetSquads': squadPrefs = {}; ls.set('fsl-squads', {}); sfx.select(); render(); break;
      case 'pickTeam': pickTeam(v); break;
      case 'pv3dView': case 'pv3dZoom': case 'pv3dAnim': case 'pv3dPick': case 'pv3dStep':
      case 'pv3dCaptain': case 'pv3dRandom': case 'pv3dMode': case 'pv3dTab':
        viewerAction(act, v); break;
      case 'side': selSide = Number(v); sfx.move(); refreshSelectParts(); break;
      case 'kit': settings[selSide === 0 ? 'homeKit' : 'awayKit'] = v; api.persistSettings(); sfx.move(); refreshSelectParts(); break;
      case 'back': back(); break;
      case 'toPreview': if (canContinue()) { sfx.select(); previewTab = 'preview'; go('preview'); } break;
      case 'pvTab': previewTab = v; sfx.move(); render(); break;
      case 'pvStats': previewTab = 'stats'; sfx.move(); render(); break;
      case 'play': kickOff(); break;
      case 'manage': manageOnlyId = null; manageSide = 0; manageSel = null; manageCursor = 0; manageReturn = 'preview'; sfx.select(); go('manage'); break;
      case 'abandon': if (settings.mode === 'cup') api.clearCup(); if (settings.mode === 'career') api.clearLeague(); sfx.select(); go('select'); break;
      case 'mgRow': mgSelect(Number(v)); break;
      case 'mgSide': manageSide = Number(v); manageSel = null; manageCursor = 0; sfx.move(); render(); break;
      case 'formation': cycleFormation(d); break;
      case 'tactic': cycleTactic(d); break;
      case 'dbPick': {
        dbMember = v; dbPlayer = DB.roster_members.find((r) => r.id === v)?.player_id; sfx.move();
        const hub = screenEl('hub');
        hub.querySelector('.pdb-right').innerHTML = playerEditorHTML();
        hub.querySelectorAll('.pdb-row').forEach((r) => r.classList.toggle('on', r.dataset.v === v));
        mountEditorFigure();
        break;
      }
      case 'saveEdit': {
        const edits = ls.get('fsl-edits', {});
        delete edits[dbMember]; // older saves were keyed by team membership
        edits[dbPlayer] = readEditor();
        ls.set('fsl-edits', edits); api.refreshDb(); sfx.select(); render(); break;
      }
      case 'resetEdit': {
        const edits = ls.get('fsl-edits', {});
        delete edits[dbMember];
        delete edits[dbPlayer];
        ls.set('fsl-edits', edits); api.refreshDb(); sfx.back(); render(); break;
      }
      case 'toggleCustom': {
        const custom = ls.get('fsl-custom', { name: 'Ultimate XI', players: [] });
        const i = custom.players.indexOf(dbPlayer);
        if (i >= 0) custom.players.splice(i, 1); else if (custom.players.length < 18) custom.players.push(dbPlayer);
        ls.set('fsl-custom', custom); api.refreshDb(); sfx.select(); render(); break;
      }
      default: break;
    }
  });
  function rerenderBrowse() {
    const scope = screenEl(screen);
    if (screen === 'select') refreshBrowseList(scope, selSide === 0 ? settings.home : settings.away, 'pickTeam');
    else refreshBrowseList(scope, clubsTeam, 'clubsTeam');
  }
  function settingsSafe() { modal.classList.add('hidden'); }
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.input;
    if (k === 'search') { browse.q = e.target.value; rerenderBrowse(); }
    if (k === 'dbsearch') {
      dbQuery = e.target.value;
      const rows = dbResults();
      const shown = rows.slice(0, 80);
      screenEl('hub').querySelector('.pdb-list').innerHTML = pdbListHTML(shown);
      const count = screenEl('hub').querySelector('.pdb-count');
      if (count) count.textContent = `${rows.length} player${rows.length === 1 ? '' : 's'} in ${eraLabel(settings.roster === 'custom' ? 'modern' : settings.roster)}${rows.length > shown.length ? ` · showing top ${shown.length}` : ''}`;
    }
  });
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.change;
    if (k === 'league') { browse.league = e.target.value; saveUi(); rerenderBrowse(); }
    if (k === 'importFile' && e.target.files?.[0]) {
      e.target.files[0].text().then((txt) => {
        const written = importUserData(txt);
        openModal('report', `<h2>Import complete</h2><p>Restored: ${written.map(esc).join(', ') || 'nothing'}.</p><p>Reloading the menus with your data.</p>`);
        setTimeout(() => location.reload(), 1200); // intentional: rebuild state from the imported data
      }).catch((err) => openModal('report', `<h2>Import failed</h2><p>${esc(err.message)}</p>`));
    }
  });
  root.addEventListener('submit', (e) => e.preventDefault());
  root.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-nav]')) sfx.move(); });
  intro.addEventListener('click', () => introDone?.());

  // ---------- keyboard ----------
  function spatial(dir) {
    const scope = !modal.classList.contains('hidden') ? modal : screenEl(screen);
    const items = [...scope.querySelectorAll('[data-nav], .fe-modal-card .set-row, .fe-modal-card [data-act="closeModal"]')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement;
    if (!items.includes(cur)) { items[0].focus(); return; }
    const a = cur.getBoundingClientRect();
    const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      const dx = bc.x - ac.x, dy = bc.y - ac.y;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    best?.focus();
    best?.scrollIntoView?.({ block: 'nearest' });
  }
  function handleKey(e) {
    if (!root.classList.contains('show')) return false;
    if (introDone) { if (['Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); introDone(); } return true; }
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.code === 'Escape') e.target.blur();
      return true; // typing in a field never triggers menu shortcuts
    }
    if (busy) return true;
    const onButton = tag === 'BUTTON';
    const code = e.code;
    if (screen === 'title') {
      if (!['F1', 'Backquote', 'Tab', 'F5', 'F12'].includes(code) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); sfx.select(); go('hub'); }
      return true;
    }
    if (code === 'Escape' || code === 'Backspace') { e.preventDefault(); back(); return true; }
    if (!modal.classList.contains('hidden')) {
      const row = document.activeElement?.closest?.('.set-row');
      if (row && (code === 'ArrowLeft' || code === 'ArrowRight')) {
        e.preventDefault();
        if (row.dataset.act === 'sounds') { uiPrefs.sounds = !uiPrefs.sounds; saveUi(); rerenderKeepFocus(); } else cycleOption(row.dataset.v, code === 'ArrowLeft' ? -1 : 1);
        return true;
      }
      if (code.startsWith('Arrow')) { e.preventDefault(); spatial(code.slice(5).toLowerCase()); }
      return true;
    }
    if (screen === 'select') {
      if (code === 'ArrowDown' || code === 'KeyS') { e.preventDefault(); stepTeam(1); return true; }
      if (code === 'ArrowUp' || code === 'KeyW') { e.preventDefault(); stepTeam(-1); return true; }
      if ((code === 'KeyQ' || code === 'KeyE') && !modeInfo(settings.mode, settings.pool).single && settings.mode !== 'practice' && settings.mode !== 'tutorial') {
        selSide = 1 - selSide; sfx.move(); refreshSelectParts(); return true;
      }
      if (code === 'Enter' && !onButton) { if (canContinue()) { sfx.select(); previewTab = 'preview'; go('preview'); } return true; }
      return true;
    }
    if (screen === 'manage') {
      const n = squadOf(currentManageTeam()).length;
      if (code === 'ArrowDown' || code === 'KeyS') { e.preventDefault(); manageCursor = (manageCursor + 1) % n; sfx.move(); render(); return true; }
      if (code === 'ArrowUp' || code === 'KeyW') { e.preventDefault(); manageCursor = (manageCursor - 1 + n) % n; sfx.move(); render(); return true; }
      if (code === 'Enter' || code === 'Space') { e.preventDefault(); mgSelect(manageCursor); return true; }
      if (code === 'KeyF') { cycleFormation(1); return true; }
      if (code === 'KeyT') { cycleTactic(1); return true; }
      if (code === 'KeyR') { saveSquad(currentManageTeam(), { order: undefined, formation: '4-3-3', tactic: 'balanced' }); manageSel = null; sfx.back(); render(); return true; }
      if ((code === 'KeyQ' || code === 'KeyE') && manageTeams().length > 1) { manageSide = 1 - manageSide; manageSel = null; manageCursor = 0; sfx.move(); render(); return true; }
      return true;
    }
    if (screen === 'hub' && (code === 'KeyQ' || code === 'KeyE')) {
      const i = HUB_TABS.findIndex(([k]) => k === hubTab);
      hubTab = HUB_TABS[(i + (code === 'KeyE' ? 1 : -1) + HUB_TABS.length) % HUB_TABS.length][0];
      uiPrefs.hubTab = hubTab; saveUi(); pushRoute('hub', true);
      sfx.move(); render(); focusFirst(); return true;
    }
    if (screen === 'preview' && (code === 'KeyQ' || code === 'KeyE')) {
      const tabs = ['preview', 'stats', 'lineups'];
      previewTab = tabs[(tabs.indexOf(previewTab) + (code === 'KeyE' ? 1 : -1) + 3) % 3];
      sfx.move(); rerenderKeepFocus(); return true;
    }
    const row = document.activeElement?.closest?.('.set-row');
    if (row && (code === 'ArrowLeft' || code === 'ArrowRight')) {
      e.preventDefault();
      if (row.dataset.act === 'sounds') { uiPrefs.sounds = !uiPrefs.sounds; saveUi(); rerenderKeepFocus(); } else cycleOption(row.dataset.v, code === 'ArrowLeft' ? -1 : 1);
      return true;
    }
    if (code.startsWith('Arrow')) { e.preventDefault(); spatial(code.slice(5).toLowerCase()); return true; }
    if (code === 'Enter' && !onButton) {
      const el = document.activeElement;
      if (el?.dataset?.act === 'cycle') cycleOption(el.dataset.v, 1);
      else if (el?.dataset?.act === 'sounds') el.click();
      else focusFirst();
      return true;
    }
    return true;
  }

  // ---------- public interface ----------
  return {
    /** First load: restore the screen in the URL (after a reload) or show the title. */
    boot() {
      root.classList.add('show');
      const r = parseRoute();
      if (r.tab) hubTab = r.tab;
      const target = r.screen === 'title' || !canRestore(r.screen) ? 'title' : r.screen;
      go(target, { instant: true, replace: true });
      loadUserImages().then((found) => { if (found && root.classList.contains('show')) { coverKey = ''; render(); updateCover(); } });
    },
    show(name = 'hub') {
      root.classList.add('show');
      go(name, { instant: screen === null || screen === 'title', replace: true });
    },
    hide() { root.classList.remove('show'); screen = null; updateCover(); },
    isActive: () => root.classList.contains('show'),
    refresh() { if (root.classList.contains('show')) render(); },
    handleKey,
    playIntro,
    /** Team data with the user's saved line-up order applied. */
    applySquad(t) {
      const all = [...t.players, ...(t.bench || [])];
      const order = orderOf(t);
      const base = api.formations['4-3-3'];
      return {
        ...t,
        players: order.slice(0, 11).map((i) => all[i]),
        bench: order.slice(11).map((i) => ({ ...all[i], role: all[i].role || base[i]?.role || 'MID' })),
      };
    },
    squadSetup(t) { return { formation: formationOf(t), tactic: tacticOf(t) }; },
    recordResult(homeId, awayId, hs, as, humanSide) {
      if (homeId === awayId) return;
      const all = ls.get('fsl-h2h', {});
      const key = [homeId, awayId].sort().join('|');
      const rec = all[key] || { wins: {}, draws: 0 };
      if (hs === as) rec.draws += 1;
      else { const w = hs > as ? homeId : awayId; rec.wins[w] = (rec.wins[w] || 0) + 1; }
      all[key] = rec;
      ls.set('fsl-h2h', all);
      const results = ls.get('fsl-results', []);
      results.push({ at: new Date().toISOString(), homeId, awayId, hs, as, roster: settings.roster, mode: settings.mode });
      ls.set('fsl-results', results.slice(-200));
      if (humanSide !== null && humanSide !== undefined) {
        const p = profile();
        const mine = humanSide === 0 ? hs : as, theirs = humanSide === 0 ? as : hs;
        p.played += 1; p.gf += mine; p.ga += theirs;
        if (mine > theirs) p.w += 1; else if (mine === theirs) p.d += 1; else p.l += 1;
        ls.set('fsl-profile', p);
      }
    },
  };
  function canRestore(name) {
    if (name === 'hub') return true;
    if (name === 'select' || name === 'manage') return true;
    if (name === 'preview') return canContinue();
    return false;
  }
}
