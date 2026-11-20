// FUTBOL SUPER LEAGUE front end: title screen, hub, team select, match
// preview, team management and the pre-match VS intro. It only talks to the
// game through the `api` object passed in from main.js, so the match engine
// is untouched.
import './frontend.css';
import { crestSVG, playerSVG, trophySVG, ballSVG, esc, shade } from './art.js';

// ---------- small helpers ----------
const LS = {
  get(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---------- ratings and positions (display only) ----------
export function playerRating(pd, role) {
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

const MODES = {
  '1p': { title: 'Kick Off', sub: 'Quick match against the computer', comp: 'Exhibition Match', sides: ['Home · P1', 'Away · CPU'] },
  '2p': { title: 'Head to Head', sub: 'Two players on one keyboard or two pads', comp: 'Exhibition Match', sides: ['Player 1', 'Player 2'] },
  cpu: { title: 'Watch Live', sub: 'Sit back while the AI plays both sides', comp: 'Exhibition Match', sides: ['Home · CPU', 'Away · CPU'] },
  cup: { title: 'Legends Cup', sub: '8-team knockout · extra time and penalties', comp: 'Legends Cup', sides: ['Your club · P1', 'Draw opponent'], single: true, trophy: 'cup' },
  career: { title: 'Super League', sub: '10 clubs · 18 matchdays · one champion', comp: 'Super League', sides: ['Your club · P1', 'Matchday opponent'], single: true, trophy: 'league' },
  indoor: { title: 'Indoor Fives', sub: 'Five-a-side, rebound boards, no offside', comp: 'Indoor Fives', sides: ['Home · P1', 'Away · CPU'] },
  penalties: { title: 'Penalty Shootout', sub: 'Pick your spot, read the keeper', comp: 'Penalty Shootout', sides: ['Shooters · P1', 'Keeper · CPU'] },
  practice: { title: 'Training Ground', sub: 'Your XI against their goalkeeper, no clock', comp: 'Training Session', sides: ['Your squad · P1', 'Goalkeeper only'], single: true },
  tutorial: { title: 'Skill School', sub: 'Guided lesson: move, pass, shoot, score', comp: 'Skill School', sides: ['Your squad · P1', 'Goalkeeper only'], single: true },
};

const STADIUMS = {
  1910: 'Victoria Grounds', 1920: 'Estadio Centenario Park', 1930: 'Hohe Warte Arena', 1940: 'Maracanã Velha',
  1950: 'Népstadion Bowl', 1960: 'Estádio do Sol', 1970: 'De Meer Arena', 1980: 'Azteca Heights',
  1990: 'San Siro Lights', 2000: 'Galaxy Bernabéu Park',
};
const stadiumFor = (team) => STADIUMS[team.id] || `${team.nickname} Arena`;

const OPTIONS = {
  difficulty: { label: 'Difficulty', values: [['beginner', 'Amateur'], ['easy', 'Semi-Pro'], ['normal', 'Professional'], ['hard', 'World Class']] },
  duration: { label: 'Match length', values: [[120, '2 minutes'], [240, '4 minutes'], [360, '6 minutes']] },
  assist: { label: 'Control assist', values: [['off', 'Manual'], ['assisted', 'Assisted'], ['full', 'Full assist']] },
  era: { label: 'Era colour grading', values: [['on', 'On'], ['off', 'Off']] },
};
const optionText = (key, v) => (OPTIONS[key].values.find(([x]) => String(x) === String(v)) || OPTIONS[key].values[0])[1];

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

// =====================================================================
export function createFrontend(api) {
  const { settings, teams } = api;
  const uiPrefs = { sounds: true, ...LS.get('fsl-ui', {}) };
  const sfx = new UiSound(uiPrefs);
  let squadPrefs = LS.get('fsl-squads', {});
  let screen = null;
  let hubTab = 'home';
  let manageSide = 0;
  let manageSel = null;
  let manageCursor = 0;
  let previewTab = 'preview';
  let squadsTeam = settings.home;
  let busy = false;
  let introTimer = null;
  let introDone = null;

  // ---------- DOM skeleton ----------
  const root = h(`<div id="frontend" class="fe">
    <div class="fe-bg"><div class="fe-rays"></div><div class="fe-vignette"></div><div class="fe-grain"></div></div>
    <div class="fe-stage">
      <section class="fe-screen" data-screen="title"></section>
      <section class="fe-screen" data-screen="hub"></section>
      <section class="fe-screen" data-screen="select"></section>
      <section class="fe-screen" data-screen="preview"></section>
      <section class="fe-screen" data-screen="manage"></section>
      <div class="fe-modal hidden" id="feModal"><div class="fe-modal-card"></div></div>
    </div>
    <section class="fe-intro hidden" id="feIntro"></section>
    <div class="fe-wipe"><i></i><i></i><i></i></div>
  </div>`);
  document.body.appendChild(root);
  // The VS intro lives outside the menu so it can fade over the live match.
  document.body.appendChild(root.querySelector('#feIntro'));
  const stage = root.querySelector('.fe-stage');
  const screenEl = (name) => root.querySelector(`[data-screen="${name}"]`);
  const modal = root.querySelector('#feModal');
  const intro = document.getElementById('feIntro');
  const wipe = root.querySelector('.fe-wipe');

  // Keep the 1600x900 stage fitted to the window (16:9 like a console UI).
  function fit() {
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.setProperty('--s', String(s));
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------- data helpers ----------
  const teamIndex = (id) => Math.max(0, teams.findIndex((t) => t.id === id));
  const crest = (team) => crestSVG(team, teamIndex(team.id));
  const formationOf = (team) => (squadPrefs[team.id]?.formation) || '4-3-3';
  const tacticOf = (team) => (squadPrefs[team.id]?.tactic) || 'balanced';
  function orderOf(team) {
    const n = team.players.length + (team.bench || []).length;
    const o = squadPrefs[team.id]?.order;
    if (Array.isArray(o) && o.length === n && new Set(o).size === n && o.every((i) => i >= 0 && i < n)) return o;
    return [...Array(n).keys()];
  }
  function squadOf(team) {
    const all = [...team.players, ...(team.bench || [])];
    const order = orderOf(team);
    const slots = api.formations[formationOf(team)] || api.formations['4-3-3'];
    return order.map((i, k) => {
      const pd = all[i];
      const slot = k < 11 ? slots[k] : null;
      const role = slot ? slot.role : (pd.role || api.formations['4-3-3'][i]?.role || 'MID');
      return { pd, src: i, k, slot, role, pos: slot ? slotLabel(slot) : 'SUB', rating: playerRating(pd, role) };
    });
  }
  function teamRatings(team) {
    const xi = squadOf(team).slice(0, 11);
    const by = (r) => xi.filter((p) => p.role === r).map((p) => p.rating);
    const att = Math.round(avg(by('FWD')));
    const mid = Math.round(avg(by('MID')));
    const def = Math.round(avg([...by('DEF'), ...by('GK')]));
    const ovr = Math.round(avg(xi.map((p) => p.rating)));
    return { att, mid, def, ovr, stars: clamp(Math.round(((ovr - 62) / 5) * 2) / 2, 0.5, 5) };
  }
  const starPlayer = (team) => squadOf(team).slice(0, 11).filter((p) => p.role !== 'GK').sort((a, b) => b.rating - a.rating)[0];
  function starsHTML(n) {
    let out = '';
    for (let i = 1; i <= 5; i++) out += `<i class="${n >= i ? 'full' : n >= i - 0.5 ? 'half' : ''}">★</i>`;
    return `<span class="fe-stars" aria-label="${n} stars">${out}</span>`;
  }
  const ratingBar = (label, v) => `<div class="fe-rbar"><b>${v || '–'}</b><span><i style="width:${clamp(((v - 50) / 49) * 100, 4, 100)}%"></i></span><em>${label}</em></div>`;
  const keyCap = (k) => `<kbd class="fe-key">${k}</kbd>`;

  function saveSquad(team, patch) {
    squadPrefs = { ...squadPrefs, [team.id]: { formation: formationOf(team), tactic: tacticOf(team), order: orderOf(team), ...patch } };
    LS.set('fsl-squads', squadPrefs);
  }
  function getH2H(a, b) {
    const rec = LS.get('fsl-h2h', {})[[a, b].sort().join('|')] || { wins: {}, draws: 0 };
    return { a: rec.wins[a] || 0, b: rec.wins[b] || 0, draws: rec.draws || 0 };
  }
  const profile = () => ({ played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, ...LS.get('fsl-profile', {}) });

  // ---------- transitions ----------
  function sweep(swap, { sound = true } = {}) {
    if (busy) return;
    busy = true;
    if (sound) sfx.whoosh();
    wipe.classList.remove('run'); void wipe.offsetWidth; wipe.classList.add('run');
    setTimeout(() => { swap(); }, 330);
    setTimeout(() => { wipe.classList.remove('run'); busy = false; }, 760);
  }
  function activate(name) {
    screen = name;
    root.querySelectorAll('.fe-screen').forEach((el) => el.classList.toggle('active', el.dataset.screen === name));
    render();
    const el = screenEl(name);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    focusFirst();
  }
  function go(name, opts) {
    if (screen === null || opts?.instant) { activate(name); return; }
    sweep(() => activate(name), opts);
  }
  function focusFirst() {
    const el = screenEl(screen)?.querySelector('[data-autofocus]') || screenEl(screen)?.querySelector('[data-nav]');
    el?.focus({ preventScroll: true });
  }

  // ---------- screen renderers ----------
  function render() {
    if (screen === 'title') renderTitle();
    if (screen === 'hub') renderHub();
    if (screen === 'select') renderSelect();
    if (screen === 'preview') renderPreview();
    if (screen === 'manage') renderManage();
  }

  function renderTitle() {
    screenEl('title').innerHTML = `
      <div class="title-wrap">
        <div class="title-trophies a-in" style="--i:0">${trophySVG('league')}${trophySVG('cup')}</div>
        <div class="title-kicker a-in" style="--i:1">FUTBOL</div>
        <h1 class="title-logo a-in" style="--i:2"><span>SUPER LEAGUE</span></h1>
        <div class="title-bar a-in" style="--i:3"></div>
        <p class="title-tag a-in" style="--i:4">The beautiful game. The ultimate competition.</p>
        <button class="title-press a-in" style="--i:6" data-nav data-autofocus data-act="start">Press any key</button>
      </div>
      <div class="title-foot">v0.2 · Legends edition · ten eras of football</div>`;
  }

  // ----- hub -----
  const HUB_TABS = [['home', 'Home'], ['play', 'Play'], ['squads', 'Squads'], ['settings', 'Settings']];
  function renderHub() {
    const pr = profile();
    const progress = api.getProgress();
    screenEl('hub').innerHTML = `
      <header class="hub-top a-in" style="--i:0">
        <div class="hub-brand"><span class="mini-ball">${ballSVG()}</span><b>FUTBOL</b><em>SUPER LEAGUE</em></div>
        <nav class="hub-tabs">${keyCap('Q')}
          ${HUB_TABS.map(([k, label]) => `<button class="hub-tab ${hubTab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${label}</button>`).join('')}
          ${keyCap('E')}</nav>
        <div class="hub-profile">
          <div class="avatar">${crest(api.getTeam(settings.home))}</div>
          <div><b>Manager</b><span>${pr.played} played · ${pr.w}W ${pr.d}D ${pr.l}L</span></div>
        </div>
      </header>
      <div class="hub-body">${hubTab === 'home' ? hubHome(progress) : hubTab === 'play' ? hubPlay() : hubTab === 'squads' ? hubSquads() : hubSettings()}</div>
      <footer class="fe-foot">${keyCap('↑↓←→')} Navigate ${keyCap('Enter')} Select ${keyCap('Q/E')} Switch tab ${keyCap('Esc')} Title screen</footer>`;
  }
  function tile(mode, cls, extra = '', i = 0) {
    const m = MODES[mode];
    return `<button class="tile ${cls} a-in" style="--i:${i}" data-nav data-act="mode" data-v="${mode}">
      <span class="tile-shine"></span>${extra}
      <span class="tile-text"><b>${m.title}</b><small>${m.sub}</small></span></button>`;
  }
  function hubHome(progress) {
    const home = api.getTeam(settings.home);
    const star = starPlayer(home);
    const r = teamRatings(home);
    return `<div class="hub-grid">
      ${tile('1p', 'tile-kick', `<span class="tile-player">${playerSVG(star.pd, home.kit)}</span>
        <span class="tile-team">${crest(home)}<span><em>Your club</em><b>${esc(home.nickname)}</b>${starsHTML(r.stars)}</span></span>`, 1)}
      ${tile('career', 'tile-league', `<span class="tile-trophy">${trophySVG('league')}</span>
        <span class="tile-status ${progress.league ? 'live' : ''}">${esc(progress.league || 'New season')}</span>`, 2)}
      ${tile('cup', 'tile-cup', `<span class="tile-trophy">${trophySVG('cup')}</span>
        <span class="tile-status ${progress.cup ? 'live' : ''}">${esc(progress.cup || 'New tournament')}</span>`, 3)}
      ${tile('practice', 'tile-sm tile-train', '<span class="tile-ico">◎</span>', 4)}
      ${tile('tutorial', 'tile-sm tile-school', '<span class="tile-ico">✦</span>', 5)}
      ${tile('indoor', 'tile-sm tile-indoor', '<span class="tile-ico">▣</span>', 6)}
      ${tile('penalties', 'tile-sm tile-pens', '<span class="tile-ico">◉</span>', 7)}
    </div>`;
  }
  function hubPlay() {
    const order = ['1p', '2p', 'cpu', 'career', 'cup', 'indoor', 'penalties', 'practice', 'tutorial'];
    return `<div class="play-grid">${order.map((m, i) => `
      <button class="mode-card a-in" style="--i:${i}" data-nav data-act="mode" data-v="${m}">
        <span class="tile-shine"></span>
        <span class="mc-num">${String(i + 1).padStart(2, '0')}</span>
        <b>${MODES[m].title}</b><small>${MODES[m].sub}</small>
        <span class="mc-comp">${MODES[m].comp}</span>
      </button>`).join('')}</div>`;
  }
  function hubSquads() {
    const team = api.getTeam(squadsTeam);
    const r = teamRatings(team);
    const sq = squadOf(team);
    return `<div class="squads">
      <div class="squad-list a-in" style="--i:1">${teams.map((t) => {
        const tr = teamRatings(t);
        return `<button class="squad-row ${t.id === team.id ? 'on' : ''}" data-nav data-act="squadTeam" data-v="${t.id}">
          <span class="sr-crest">${crest(t)}</span><span class="sr-name"><b>${esc(t.nickname)}</b><small>${esc(t.name)}s legends</small></span><span class="sr-ovr">${tr.ovr}</span></button>`;
      }).join('')}</div>
      <div class="squad-detail a-in" style="--i:2">
        <div class="sd-head">${crest(team)}<div><h2>${esc(team.nickname)}</h2><p>${esc(stadiumFor(team))} · ${formationOf(team)} · ${tacticOf(team)}</p>${starsHTML(r.stars)}</div>
          <div class="sd-bars">${ratingBar('ATT', r.att)}${ratingBar('MID', r.mid)}${ratingBar('DEF', r.def)}</div></div>
        <div class="sd-xi">${sq.slice(0, 11).map((p) => `<div class="sd-p"><span class="pos ${ROLE_CLASS[p.role]}">${p.pos}</span><b>${esc(p.pd.name)}</b><em>${p.rating}</em></div>`).join('')}</div>
        <div class="sd-bench"><span>Bench</span>${sq.slice(11).map((p) => `${esc(p.pd.name)} <em>${p.rating}</em>`).join(' · ')}</div>
        <button class="fe-btn primary" data-nav data-act="manageSquad" data-v="${team.id}">Manage squad</button>
      </div>
    </div>`;
  }
  function settingsRows() {
    return Object.keys(OPTIONS).map((key) => `
      <div class="set-row" data-nav tabindex="0" data-act="cycle" data-v="${key}">
        <span>${OPTIONS[key].label}</span>
        <span class="set-val"><button tabindex="-1" data-act="cycle" data-v="${key}" data-d="-1">◀</button><b>${optionText(key, settings[key])}</b><button tabindex="-1" data-act="cycle" data-v="${key}" data-d="1">▶</button></span>
      </div>`).join('') + `
      <div class="set-row" data-nav tabindex="0" data-act="sounds">
        <span>Menu sounds</span><span class="set-val"><button tabindex="-1" data-act="sounds">◀</button><b>${uiPrefs.sounds ? 'On' : 'Off'}</b><button tabindex="-1" data-act="sounds">▶</button></span>
      </div>`;
  }
  function hubSettings() {
    return `<div class="settings-pane">
      <div class="set-col a-in" style="--i:1"><h3>Match settings</h3>${settingsRows()}</div>
      <div class="set-col a-in" style="--i:2"><h3>Help & tools</h3>
        <button class="set-link" data-nav data-act="controls"><b>Controller settings</b><small>Keyboard, gamepad and touch layout</small></button>
        <button class="set-link" data-nav data-act="howto"><b>How to play</b><small>Moving, passing, shooting, defending, rules</small></button>
        <button class="set-link" data-nav data-act="dev"><b>Developer options</b><small>Game speed, debug overlay, drills</small></button>
        <button class="set-link" data-nav data-act="resetSquads"><b>Reset squads</b><small>Restore default line-ups and formations</small></button>
      </div>
    </div>`;
  }

  // ----- team select -----
  function sideTeam(side) { return api.getTeam(side === 0 ? settings.home : settings.away); }
  function renderSelect() {
    const m = MODES[settings.mode];
    const fixture = api.resolveFixture();
    const panel = (side) => {
      const fixed = m.single && side === 1;
      const team = fixed ? fixture.away : sideTeam(side);
      const keeperOnly = fixed && (settings.mode === 'practice' || settings.mode === 'tutorial');
      const r = teamRatings(team);
      const star = starPlayer(team);
      return `<div class="sel-panel side${side} a-in" style="--i:${side + 1};--kit:${team.kit.shirt};--kit2:${shade(team.kit.shirt, -0.6)}">
        <div class="sel-label">${esc(m.sides[side])}</div>
        ${keeperOnly ? `<div class="sel-keeper">${playerSVG(team.players[0], team.kit, { keeper: true, flip: true })}<b>Goalkeeper only</b><small>Their keeper defends one goal. No clock, no whistle.</small></div>` : `
        <div class="sel-crest-row">
          ${fixed ? '' : `<button class="sel-arrow" data-act="cycleTeam" data-side="${side}" data-d="-1" aria-label="Previous team">◀</button>`}
          <div class="sel-crest" data-key="${team.id}">${crest(team)}</div>
          ${fixed ? '' : `<button class="sel-arrow" data-act="cycleTeam" data-side="${side}" data-d="1" aria-label="Next team">▶</button>`}
        </div>
        <h2 class="sel-name">${esc(team.nickname)}</h2>
        <div class="sel-sub">${esc(team.name)}s legends · ${esc(stadiumFor(team))}</div>
        ${starsHTML(r.stars)}
        <div class="sel-bars">${ratingBar('ATT', r.att)}${ratingBar('MID', r.mid)}${ratingBar('DEF', r.def)}${ratingBar('OVR', r.ovr)}</div>
        <div class="sel-star">Star player <b>${esc(star.pd.name)}</b> <em>${star.rating}</em></div>
        ${fixed ? `<div class="sel-fixed">${esc(fixture.stage || 'Decided by the fixture list')}</div>` : `<div class="sel-keys">${side === 0 ? `${keyCap('A')} ${keyCap('D')}` : `${keyCap('←')} ${keyCap('→')}`} change team</div>`}`}
      </div>`;
    };
    const strip = (side) => teams.map((t) => `<button class="strip-crest ${t.id === sideTeam(side).id ? 'on' : ''}" data-act="pickTeam" data-side="${side}" data-v="${t.id}" title="${esc(t.nickname)}">${crest(t)}</button>`).join('');
    screenEl('select').innerHTML = `
      <header class="scr-head a-in" style="--i:0"><span class="scr-kicker">${esc(m.comp)}</span><h1>Select teams</h1></header>
      <div class="sel-wrap">${panel(0)}<div class="sel-vs a-in" style="--i:2">VS</div>${panel(1)}</div>
      <div class="sel-strip a-in" style="--i:3"><div>${strip(0)}</div>${m.single ? '' : `<div>${strip(1)}</div>`}</div>
      <footer class="fe-foot">
        <button class="fe-btn ghost" data-act="back">${keyCap('Esc')} Back</button>
        <button class="fe-btn primary" data-nav data-autofocus data-act="toPreview">${keyCap('Enter')} Continue</button>
      </footer>`;
  }

  // ----- match preview -----
  function renderPreview() {
    const m = MODES[settings.mode];
    const fx = api.resolveFixture();
    const { home, away } = fx;
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    const rh = teamRatings(home), ra = teamRatings(away);
    const sh = starPlayer(home), sa = keeperOnly ? { pd: away.players[0], rating: playerRating(away.players[0], 'GK') } : starPlayer(away);
    const h2h = getH2H(home.id, away.id);
    const ctrl = api.controllers();
    const who = (c) => (c === 'ai' ? 'CPU' : c.toUpperCase());
    const minutes = settings.mode === 'penalties' || keeperOnly ? 'Untimed' : `${settings.duration / 60} minutes`;
    let center = '';
    if (previewTab === 'preview') {
      const total = h2h.a + h2h.b + h2h.draws;
      center = `
        <div class="pv-meta">
          <span>${esc(stadiumFor(home))}</span><span>${esc(fx.stage || m.comp)}</span><span>${minutes}</span>
        </div>
        <div class="pv-h2h-title">Overall head to head</div>
        <div class="pv-h2h">
          <div><b class="hc">${h2h.a}</b> Wins</div><div><b>${h2h.draws}</b> Draws</div><div>Wins <b class="ac">${h2h.b}</b></div>
        </div>
        <div class="pv-h2h-bar"><i class="hc" style="flex:${h2h.a || (total ? 0 : 1)}"></i><i style="flex:${h2h.draws || (total ? 0 : 1)}"></i><i class="ac" style="flex:${h2h.b || (total ? 0 : 1)}"></i></div>
        <div class="pv-vs-row">
          <div class="pv-ctrl ${ctrl[0]}">${who(ctrl[0])}</div><div class="pv-vs">VS</div><div class="pv-ctrl ${ctrl[1]}">${who(ctrl[1])}</div>
        </div>
        <div class="pv-conditions">
          <span><em>Difficulty</em>${optionText('difficulty', settings.difficulty)}</span>
          <span><em>Assist</em>${optionText('assist', settings.assist)}</span>
          <span><em>Conditions</em>Clear · Day</span>
          <span><em>Formation</em>${formationOf(home)} v ${keeperOnly ? '—' : formationOf(away)}</span>
        </div>
        <div class="pv-welcome">${fx.continuing ? `Continue your ${esc(m.comp)} run` : `Welcome to ${esc(m.title)}`}</div>`;
    } else if (previewTab === 'stats') {
      const row = (label, a, b) => `<div class="pv-stat"><b>${a}</b><span><i class="hc" style="width:${(a / (a + b || 1)) * 100}%"></i><i class="ac" style="width:${(b / (a + b || 1)) * 100}%"></i></span><em>${label}</em><b>${b}</b></div>`;
      center = `<div class="pv-stats">${row('Overall', rh.ovr, keeperOnly ? 0 : ra.ovr)}${row('Attack', rh.att, keeperOnly ? 0 : ra.att)}${row('Midfield', rh.mid, keeperOnly ? 0 : ra.mid)}${row('Defence', rh.def, keeperOnly ? 0 : ra.def)}${row('Star rating', sh.rating, sa.rating)}</div>`;
    } else {
      const list = (team) => squadOf(team).slice(0, keeperOnly && team === away ? 1 : 11).map((p) => `<li><span class="pos ${ROLE_CLASS[p.role]}">${p.pos}</span>${esc(p.pd.name)}<em>${p.rating}</em></li>`).join('');
      center = `<div class="pv-lineups"><ol>${list(home)}</ol><ol>${list(away)}</ol></div>`;
    }
    screenEl('preview').innerHTML = `
      <div class="pv-tunnel"></div>
      <div class="pv-fig left a-in" style="--i:1">${playerSVG(sh.pd, home.kit)}<div class="pv-figname"><b>${esc(sh.pd.name)}</b><span>${sh.rating} · ${esc(sh.pos || '')}</span></div></div>
      <div class="pv-fig right a-in" style="--i:2">${playerSVG(sa.pd, away.kit, { flip: true, keeper: keeperOnly })}<div class="pv-figname"><b>${esc(sa.pd.name)}</b><span>${sa.rating}${sa.pos ? ` · ${esc(sa.pos)}` : ' · GK'}</span></div></div>
      <div class="pv-center a-in" style="--i:0">
        <nav class="pv-tabs">
          ${[['preview', 'Match preview'], ['stats', 'Team stats'], ['lineups', 'Line-ups']].map(([k, l]) => `<button class="${previewTab === k ? 'on' : ''}" data-act="pvTab" data-v="${k}">${l}</button>`).join('')}
        </nav>
        <div class="pv-crests"><div class="pv-crest">${crest(home)}<b>${esc(home.nickname)}</b></div><div class="pv-crest">${crest(away)}<b>${esc(keeperOnly ? 'Goalkeeper' : away.nickname)}</b></div></div>
        <div class="pv-body">${center}</div>
      </div>
      <nav class="pv-menu a-in" style="--i:3">
        <button class="pv-item primary" data-nav data-autofocus data-act="play"><b>${fx.continuing ? 'Continue' : 'Play match'}</b><span class="pv-ico">${ballSVG()}</span></button>
        <button class="pv-item" data-nav data-act="manage"><b>Team management</b><span class="pv-ico ico-pitch"></span></button>
        <button class="pv-item" data-nav data-act="settingsModal"><b>Game settings</b><span class="pv-ico ico-gear">⚙</span></button>
        <button class="pv-item" data-nav data-act="controls"><b>Controller settings</b><span class="pv-ico ico-pad">✜</span></button>
        ${fx.continuing ? `<button class="pv-item" data-nav data-act="abandon"><b>New ${esc(m.comp)}</b><span class="pv-ico">↺</span></button>` : `<button class="pv-item" data-nav data-act="pvStats"><b>Detailed stats</b><span class="pv-ico">▮▮</span></button>`}
      </nav>
      <footer class="fe-foot">${keyCap('Enter')} Advance ${keyCap('Esc')} Back ${keyCap('Q/E')} Switch tab</footer>`;
  }

  // ----- team management (FIFA 07 style) -----
  let manageOnlyId = null; // set when managing a club from the Squads tab
  function manageTeams() {
    if (manageOnlyId) return [api.getTeam(manageOnlyId)];
    const { home, away } = api.resolveFixture();
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    return keeperOnly ? [home] : [home, away];
  }
  function renderManage() {
    const list = manageTeams();
    manageSide = Math.min(manageSide, list.length - 1);
    const team = list[manageSide];
    const sq = squadOf(team);
    const r = teamRatings(team);
    const indoor = settings.mode === 'indoor' && !manageOnlyId;
    const formation = formationOf(team);
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
      // Vertical pitch: attack is up. x in [-1,1] along length, z across.
      const top = 50 - slot.x * 44, left = 50 + slot.z * 42;
      return `<button class="mg-dot ${ROLE_CLASS[slot.role]} ${manageSel === i ? 'sel' : ''} ${manageCursor === i ? 'cur' : ''}" style="top:${top}%;left:${left}%;--kit:${slot.role === 'GK' ? team.kit.gk : team.kit.shirt}" data-act="mgRow" data-v="${i}">
        <i>${p.pd.number}</i><span>${esc(p.pd.name.split(' ').slice(-1)[0])}</span></button>`;
    }).join('');
    const cur = sq[manageCursor];
    screenEl('manage').innerHTML = `
      <div class="mg-shell">
        <div class="mg-left a-in" style="--i:1">
          <div class="mg-tabs">${list.length > 1 ? keyCap('Q') : ''}${list.map((t, i) => `<button class="${i === manageSide ? 'on' : ''}" data-act="mgSide" data-v="${i}">${esc(t.nickname)}</button>`).join('')}${list.length > 1 ? keyCap('E') : ''}<span>Starting XI</span></div>
          <button class="mg-done" data-act="back" data-nav data-autofocus>Done</button>
          <div class="mg-list" style="--team:${team.kit.shirt}">${rows}</div>
        </div>
        <div class="mg-mid a-in" style="--i:2">
          <div class="mg-crest">${crest(team)}</div>
          <h2>${esc(team.nickname)}</h2>
          ${starsHTML(r.stars)}
          <div class="mg-rates">${ratingBar('OFF', r.att)}${ratingBar('MID', r.mid)}${ratingBar('DEF', r.def)}</div>
          <div class="mg-opt">
            <span>Formation</span>
            ${indoor ? '<b class="mg-fixed">Indoor 1-2-1 (fixed)</b>' : `<div class="set-val"><button data-act="formation" data-d="-1">◀</button><b>${formation}</b><button data-act="formation" data-d="1">▶</button></div>`}
          </div>
          <div class="mg-opt"><span>Tactics</span><div class="set-val"><button data-act="tactic" data-d="-1">◀</button><b>${tacticOf(team)}</b><button data-act="tactic" data-d="1">▶</button></div></div>
          <div class="mg-help">${manageSel === null ? 'Select a player, then select another to swap them.' : `Swap <b>${esc(sq[manageSel].pd.name)}</b> with…`}</div>
        </div>
        <div class="mg-right a-in" style="--i:3">
          <div class="mg-title"><b>Team management</b><span>${esc(team.nickname)} · ${indoor ? 'Indoor' : formation}</span></div>
          <div class="mg-pitch"><div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="half"></i><i class="circle"></i></div>${dots}</div>
        </div>
      </div>
      <aside class="mg-bio" style="--kit:${team.kit.shirt}">
        <div class="bio-fig">${playerSVG(cur.pd, team.kit, { keeper: cur.role === 'GK' })}</div>
        <div class="bio-info"><span class="bio-num">${cur.pd.number}</span><h3>${esc(cur.pd.name)}</h3>
          <p>${cur.pos === 'SUB' ? `Substitute · ${cur.role}` : cur.pos} · ${esc(team.nickname)}</p><div class="bio-ovr">${cur.rating}<small>OVR</small></div>
          ${[['Pace', 'spd'], ['Passing', 'pas'], ['Shooting', 'sho'], ['Tackling', 'tac'], ['Dribbling', 'dri'], ['Goalkeeping', 'gk']].map(([l, k]) => ratingBar(l, cur.pd.stats[k])).join('')}
        </div>
      </aside>
      <footer class="fe-foot">${keyCap('↑↓')} Browse ${keyCap('Enter')} Select / swap ${keyCap('F')} Formation ${keyCap('T')} Tactics ${keyCap('R')} Reset ${keyCap('Esc')} Done</footer>`;
  }

  // ----- modals -----
  function openModal(kind) {
    sfx.select();
    const card = modal.querySelector('.fe-modal-card');
    if (kind === 'controls') {
      const pad = (k) => `<kbd>${k}</kbd>`;
      card.innerHTML = `<h2>Controller settings</h2>
        <div class="ctl-grid">
          <div class="ctl-col"><h4>Player 1 · keyboard</h4>
            <p><span>Move</span>${pad('W')}${pad('A')}${pad('S')}${pad('D')}</p>
            <p><span>Pass / switch</span>${pad('F')} or ${pad('Space')}</p>
            <p><span>Shoot (hold) / tackle</span>${pad('G')}</p>
            <p><span>Sprint</span>${pad('Left Shift')}</p></div>
          <div class="ctl-col"><h4>Player 2 · keyboard</h4>
            <p><span>Move</span>${pad('↑')}${pad('←')}${pad('↓')}${pad('→')}</p>
            <p><span>Pass / switch</span>${pad('.')}</p>
            <p><span>Shoot (hold) / tackle</span>${pad('/')}</p>
            <p><span>Sprint</span>${pad('Right Shift')}</p></div>
          <div class="ctl-col"><h4>Gamepad</h4>
            <p><span>Move</span>${pad('Left stick')}</p>
            <p><span>Pass / switch</span>${pad('A')} / ${pad('✕')}</p>
            <p><span>Shoot / tackle</span>${pad('B')} / ${pad('○')}</p>
            <p><span>Sprint</span>${pad('RT')} ${pad('RB')}</p></div>
          <div class="ctl-col"><h4>In match</h4>
            <p><span>Pause</span>${pad('Esc')} ${pad('P')}</p>
            <p><span>Camera</span>${pad('C')}</p>
            <p><span>Skip replay</span>${pad('R')}</p>
            <p><span>Touch screen</span>Stick + Pass / Shoot / Sprint</p></div>
        </div>
        <button class="fe-btn primary" data-act="closeModal" data-autofocus>Done</button>`;
    } else {
      card.innerHTML = `<h2>Game settings</h2><div class="set-col">${settingsRows()}</div><button class="fe-btn primary" data-act="closeModal" data-autofocus>Done</button>`;
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

  // ---------- VS intro ----------
  function playIntro(done) {
    const { home, away } = api.resolveFixture();
    const m = MODES[settings.mode];
    const keeperOnly = settings.mode === 'practice' || settings.mode === 'tutorial';
    intro.style.setProperty('--hk', home.kit.shirt);
    intro.style.setProperty('--ak', keeperOnly ? away.kit.gk : away.kit.shirt);
    intro.innerHTML = `
      <div class="in-half in-home"><div class="in-crest">${crest(home)}</div><b>${esc(home.nickname)}</b><span>${esc(home.name)}s</span></div>
      <div class="in-half in-away"><div class="in-crest">${crest(away)}</div><b>${esc(keeperOnly ? 'Goalkeeper' : away.nickname)}</b><span>${esc(away.name)}s</span></div>
      <div class="in-vs">VS</div>
      <div class="in-bar"><span>${esc(m.comp)}</span><i></i><span>${esc(stadiumFor(home))}</span></div>
      <div class="in-flash"></div>`;
    intro.classList.remove('hidden', 'run'); void intro.offsetWidth; intro.classList.add('run');
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
  function setMode(mode) {
    settings.mode = mode;
    if (mode !== 'cup') api.clearCup();
    if (mode !== 'career') api.clearLeague();
    api.persistSettings();
  }
  function chooseMode(mode) {
    sfx.select();
    const continuing = (mode === 'cup' && api.getProgress().cup) || (mode === 'career' && api.getProgress().league);
    settings.mode = mode;
    if (!continuing) setMode(mode);
    else api.persistSettings();
    if (mode === 'tutorial') { kickOff(); return; }
    go(continuing ? 'preview' : 'select');
  }
  function kickOff() {
    sfx.select();
    playIntro(() => api.startMatch());
  }
  function cycleOption(key, d = 1) {
    const vals = OPTIONS[key].values.map(([v]) => v);
    const i = vals.findIndex((v) => String(v) === String(settings[key]));
    settings[key] = vals[(i + d + vals.length) % vals.length];
    api.persistSettings();
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
  function cycleTeam(side, d) {
    const key = side === 0 ? 'home' : 'away';
    let i = teamIndex(settings[key]);
    i = (i + d + teams.length) % teams.length;
    settings[key] = teams[i].id;
    if (settings.mode === 'cup') api.clearCup();
    if (settings.mode === 'career') api.clearLeague();
    api.persistSettings();
    sfx.move();
    render();
    const crestEl = screenEl('select').querySelector(`.side${side} .sel-crest`);
    crestEl?.classList.add(d > 0 ? 'spin-r' : 'spin-l');
  }
  function swapPlayers(team, a, b) {
    const order = [...orderOf(team)];
    [order[a], order[b]] = [order[b], order[a]];
    saveSquad(team, { order });
  }
  function currentManageTeam() { return manageTeams()[manageSide]; }
  function mgSelect(i) {
    const team = currentManageTeam();
    manageCursor = i;
    if (manageSel === null) { manageSel = i; sfx.select(); } else if (manageSel === i) { manageSel = null; sfx.back(); } else {
      swapPlayers(team, manageSel, i); manageSel = null; sfx.select();
    }
    render();
  }
  function cycleFormation(d) {
    if (settings.mode === 'indoor' && !manageOnlyId) return;
    const team = currentManageTeam();
    const keys = Object.keys(api.formations);
    const i = keys.indexOf(formationOf(team));
    saveSquad(team, { formation: keys[(i + d + keys.length) % keys.length] });
    sfx.move(); render();
  }
  function cycleTactic(d) {
    const team = currentManageTeam();
    const keys = ['defensive', 'balanced', 'attacking'];
    const i = keys.indexOf(tacticOf(team));
    saveSquad(team, { tactic: keys[(i + d + keys.length) % keys.length] });
    sfx.move(); render();
  }

  function back() {
    if (!modal.classList.contains('hidden')) { closeModal(); return; }
    sfx.back();
    if (screen === 'hub') go('title');
    else if (screen === 'select') go('hub');
    else if (screen === 'preview') {
      const progress = api.getProgress();
      const continuing = (settings.mode === 'cup' && progress.cup) || (settings.mode === 'career' && progress.league);
      go(continuing ? 'hub' : 'select');
    } else if (screen === 'manage') { manageSel = null; go(manageReturn); }
  }
  let manageReturn = 'preview';

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || busy) return;
    const { act, v } = el.dataset;
    const d = Number(el.dataset.d || 1);
    switch (act) {
      case 'start': sfx.select(); go('hub'); break;
      case 'tab': hubTab = v; sfx.move(); render(); break;
      case 'mode': chooseMode(v); break;
      case 'squadTeam': squadsTeam = v; sfx.move(); rerenderKeepFocus(); break;
      case 'manageSquad': {
        manageOnlyId = v;
        manageSide = 0; manageSel = null; manageCursor = 0; manageReturn = 'hub'; sfx.select(); go('manage'); break;
      }
      case 'cycle': e.stopPropagation(); cycleOption(v, d); break;
      case 'sounds': uiPrefs.sounds = !uiPrefs.sounds; LS.set('fsl-ui', uiPrefs); sfx.select(); rerenderKeepFocus(); break;
      case 'controls': openModal('controls'); break;
      case 'settingsModal': openModal('settings'); break;
      case 'closeModal': closeModal(); break;
      case 'howto': sfx.select(); api.openHowToPlay(); break;
      case 'dev': sfx.select(); api.openDevOptions(); break;
      case 'resetSquads': squadPrefs = {}; LS.set('fsl-squads', {}); sfx.select(); render(); break;
      case 'cycleTeam': cycleTeam(Number(el.dataset.side), d); break;
      case 'pickTeam': {
        const side = Number(el.dataset.side);
        const key = side === 0 ? 'home' : 'away';
        if (settings[key] !== v) { settings[key] = v; if (settings.mode === 'cup') api.clearCup(); if (settings.mode === 'career') api.clearLeague(); api.persistSettings(); sfx.move(); render(); }
        break;
      }
      case 'back': back(); break;
      case 'toPreview': sfx.select(); previewTab = 'preview'; go('preview'); break;
      case 'pvTab': previewTab = v; sfx.move(); render(); break;
      case 'pvStats': previewTab = 'stats'; sfx.move(); render(); break;
      case 'play': kickOff(); break;
      case 'manage': manageOnlyId = null; manageSide = 0; manageSel = null; manageCursor = 0; manageReturn = 'preview'; sfx.select(); go('manage'); break;
      case 'abandon': if (settings.mode === 'cup') api.clearCup(); if (settings.mode === 'career') api.clearLeague(); sfx.select(); go('select'); break;
      case 'mgRow': mgSelect(Number(v)); break;
      case 'mgSide': manageSide = Number(v); manageSel = null; manageCursor = 0; sfx.move(); render(); break;
      case 'formation': cycleFormation(d); break;
      case 'tactic': cycleTactic(d); break;
      default: break;
    }
  });
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
  }
  function handleKey(e) {
    if (!root.classList.contains('show')) return false;
    if (introDone) { if (['Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); introDone(); } return true; }
    if (busy) return true;
    const onButton = e.target?.tagName === 'BUTTON';
    const code = e.code;
    if (screen === 'title') {
      if (!['F1', 'Backquote', 'Tab'].includes(code)) { e.preventDefault(); sfx.select(); go('hub'); }
      return true;
    }
    if (code === 'Escape' || code === 'Backspace') { e.preventDefault(); back(); return true; }
    if (!modal.classList.contains('hidden')) {
      const row = document.activeElement?.closest?.('.set-row');
      if (row && (code === 'ArrowLeft' || code === 'ArrowRight')) {
        e.preventDefault();
        if (row.dataset.act === 'sounds') { uiPrefs.sounds = !uiPrefs.sounds; LS.set('fsl-ui', uiPrefs); rerenderKeepFocus(); } else cycleOption(row.dataset.v, code === 'ArrowLeft' ? -1 : 1);
        return true;
      }
      if (code.startsWith('Arrow')) { e.preventDefault(); spatial(code.slice(5).toLowerCase()); }
      return true;
    }
    if (screen === 'select') {
      const single = MODES[settings.mode].single;
      if (code === 'KeyA' || (single && code === 'ArrowLeft')) { cycleTeam(0, -1); return true; }
      if (code === 'KeyD' || (single && code === 'ArrowRight')) { cycleTeam(0, 1); return true; }
      if (!single && code === 'ArrowLeft') { e.preventDefault(); cycleTeam(1, -1); return true; }
      if (!single && code === 'ArrowRight') { e.preventDefault(); cycleTeam(1, 1); return true; }
      if (code === 'Enter' && !onButton) { sfx.select(); previewTab = 'preview'; go('preview'); return true; }
      return true;
    }
    if (screen === 'manage') {
      const n = squadOf(currentManageTeam()).length;
      if (code === 'ArrowDown' || code === 'KeyS') { e.preventDefault(); manageCursor = (manageCursor + 1) % n; sfx.move(); render(); return true; }
      if (code === 'ArrowUp' || code === 'KeyW') { e.preventDefault(); manageCursor = (manageCursor - 1 + n) % n; sfx.move(); render(); return true; }
      if ((code === 'Enter' || code === 'Space') && !onButton) { e.preventDefault(); mgSelect(manageCursor); return true; }
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
      if (row.dataset.act === 'sounds') { uiPrefs.sounds = !uiPrefs.sounds; LS.set('fsl-ui', uiPrefs); rerenderKeepFocus(); } else cycleOption(row.dataset.v, code === 'ArrowLeft' ? -1 : 1);
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
    show(name = 'hub') {
      root.classList.add('show');
      if (name === 'title') { activate('title'); return; }
      go(name, { instant: screen === null || screen === 'title' });
    },
    hide() { root.classList.remove('show'); screen = null; },
    isActive: () => root.classList.contains('show'),
    refresh() { if (root.classList.contains('show')) render(); },
    handleKey,
    playIntro,
    /** Team data with the user's saved line-up order applied. */
    applySquad(team) {
      const all = [...team.players, ...(team.bench || [])];
      const order = orderOf(team);
      const base = api.formations['4-3-3'];
      return {
        ...team,
        players: order.slice(0, 11).map((i) => all[i]),
        bench: order.slice(11).map((i) => ({ ...all[i], role: all[i].role || base[i]?.role || 'MID' })),
      };
    },
    squadSetup(team) { return { formation: formationOf(team), tactic: tacticOf(team) }; },
    recordResult(homeId, awayId, hs, as, humanSide) {
      if (homeId === awayId) return;
      const all = LS.get('fsl-h2h', {});
      const key = [homeId, awayId].sort().join('|');
      const rec = all[key] || { wins: {}, draws: 0 };
      if (hs === as) rec.draws += 1;
      else { const w = hs > as ? homeId : awayId; rec.wins[w] = (rec.wins[w] || 0) + 1; }
      all[key] = rec;
      LS.set('fsl-h2h', all);
      if (humanSide !== null && humanSide !== undefined) {
        const p = profile();
        const mine = humanSide === 0 ? hs : as, theirs = humanSide === 0 ? as : hs;
        p.played += 1; p.gf += mine; p.ga += theirs;
        if (mine > theirs) p.w += 1; else if (mine === theirs) p.d += 1; else p.l += 1;
        LS.set('fsl-profile', p);
      }
    },
  };
}
