import './style.css';
import { buildTeam, configure as configureDb, isPlayable, poolTeamIds, teamRating, resolveKitClash, DECADE_TEAMS } from './db/teams.js';
import { teamRecord, ERAS } from './db/index.js';
import { migrate, ls } from './state/store.js';
import { createMatch, stepMatch, displayMinute, setControlled, makeSubstitution, cancelPendingSubstitution, setTeamTactic, setTeamFormation, setupKickoff } from './game/match.ts';
import { FIXED_DT, FORMATIONS, INDOOR_FORMATION, BALL_R, DRIBBLE_OFFSET } from './game/constants.ts';
import { createFrontend } from './ui/frontend.js';
import { Input } from './game/input.ts';
import { createRenderer } from './render/scene.js';
import { MatchAudio } from './render/audio.js';
import { stopBall } from './game/physics/ballPhysics.ts';

const $ = (id) => document.getElementById(id);

// ---------- settings chosen in the menu ----------
const DEFAULT_SETTINGS = {
  mode: '1p', // 1p | 2p | cpu | cup | career | penalties | indoor | practice | tutorial
  pool: 'clubs', // clubs | nations | decades
  roster: 'modern', // roster profile (see ERAS in src/db/index.js)
  clubIdentity: 'authentic', // authentic | parody | mixed
  playerIdentity: 'real', // real | parody
  home: 'fcb',
  away: 'rma',
  homeKit: 'home',
  awayKit: 'away',
  difficulty: 'normal',
  duration: 240,
  era: 'on', // era colour grading for the decade teams
  assist: 'assisted',
  dribbleStyle: 'sticky',
};
const SETTINGS_KEY = 'legends-settings';
const dataMigration = migrate();
const knownTeam = (id) => !!id && (id === 'custom' || !!teamRecord(id) || DECADE_TEAMS.some((t) => t.id === id));
const getTeam = (id) => buildTeam(id);
const settings = loadSettings();
function applyDbPrefs() {
  configureDb({
    era: settings.roster, clubIdentity: settings.clubIdentity, playerIdentity: settings.playerIdentity,
    edits: ls.get('fsl-edits', {}), custom: ls.get('fsl-custom', null), officialLogos: officialLogos || {},
  });
}
let officialLogos = {};
applyDbPrefs();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    const pick = (key, allowed) => (saved && allowed.includes(saved[key]) ? { [key]: saved[key] } : {});
    return {
      ...DEFAULT_SETTINGS,
      ...pick('pool', ['clubs', 'nations', 'decades']),
      ...pick('roster', ERAS.map((e) => e.id)),
      ...pick('clubIdentity', ['authentic', 'parody', 'mixed']),
      ...pick('playerIdentity', ['real', 'parody']),
      ...pick('homeKit', ['home', 'away', 'third']),
      ...pick('awayKit', ['home', 'away', 'third']),
      ...pick('assist', ['off', 'assisted', 'full']),
      ...(saved && ['1p', '2p', 'cpu', 'cup', 'career', 'penalties', 'practice', 'indoor'].includes(saved.mode) ? { mode: saved.mode } : {}),
      ...(saved && knownTeam(saved.home) ? { home: saved.home } : {}),
      ...(saved && knownTeam(saved.away) ? { away: saved.away } : {}),
      ...(saved && ['beginner', 'easy', 'normal', 'hard'].includes(saved.difficulty) ? { difficulty: saved.difficulty } : {}),
      ...(saved && [120, 240, 360].includes(Number(saved.duration)) ? { duration: Number(saved.duration) } : {}),
      ...(saved && ['on', 'off'].includes(saved.era) ? { era: saved.era } : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

// Developer options are remembered between visits (when the browser allows).
const DEV_DEFAULTS = { speed: 75, debug: false };
const dev = { ...DEV_DEFAULTS };
try { Object.assign(dev, JSON.parse(localStorage.getItem('legends-dev') || '{}')); } catch { /* ignore */ }
function saveDev() {
  try { localStorage.setItem('legends-dev', JSON.stringify(dev)); } catch { /* ignore */ }
}

const renderer = createRenderer($('game'));
const input = new Input();
const touchInput = { mx: 0, mz: 0, sprint: false, passPressed: false, shootHeld: false, shootPressed: false };
const audio = new MatchAudio();
let match = null;
let cup = loadCup();
let cupShootout = null;
let cupShootoutOutcome = null;
if (cup && !cup.champion) {
  settings.mode = 'cup';
  settings.home = cup.userTeam.id;
  settings.away = cup.matches[0].away.id;
}
let league = loadLeague();
if (league && !league.complete) {
  settings.mode = 'career';
  settings.home = league.userTeam.id;
  const nextFixture = league.schedule[league.round][0];
  settings.away = nextFixture.home.id === league.userTeam.id ? nextFixture.away.id : nextFixture.home.id;
}
let paused = false;
let goals = [];
let acc = 0;
const REPLAY_FPS = 20;
const REPLAY_FRAMES = REPLAY_FPS * 9;
let replayBuffer = [];
let replayFrames = null;
let replayElapsed = 0; // replay position in frames (fractional)
let replayInfo = null; // { shooterId, scorerId, dir, shotIdx, goalIdx }
let pendingReplay = null; // goal scored: replay after the celebration
let replayFrameCount = 0; // absolute index of frames pushed to the buffer
let replayCaptureElapsed = 0;
let fps = 60;
let lastInputs = {};

// ---------- menu ----------
function refreshSubstitutionMenu() {
  if (!match) return;
  const selector = $('subsTeam');
  const managerTeams = match.teams.filter((team) => team.human);
  const current = Number(selector.value);
  selector.replaceChildren(...managerTeams.map((team) => {
    const option = document.createElement('option');
    option.value = String(team.index);
    option.textContent = `${team.human.toUpperCase()} · ${team.data.name}`;
    return option;
  }));
  if (managerTeams.some((team) => team.index === current)) selector.value = String(current);
  const team = managerTeams.find((item) => item.index === Number(selector.value));
  if (!team) {
    $('subsStatus').textContent = 'No human-controlled team is available for management.';
    $('subsOut').replaceChildren();
    $('subsIn').replaceChildren();
    $('subsConfirm').disabled = true;
    return;
  }
  $('tacticSelect').value = team.tactic;
  $('formationSelect').value = team.formation;

  const active = match.players.filter((p) => p.team === team.index && p.onPitch && !p.sentOff);
  $('subsOut').replaceChildren(...active.map((player) => {
    const option = document.createElement('option');
    option.value = String(player.id);
    option.textContent = `${player.number} · ${player.name} (${player.role})`;
    return option;
  }));
  refreshBenchOptions();
}

function refreshBenchOptions() {
  if (!match) return;
  const teamIdx = Number($('subsTeam').value);
  const outgoingId = $('subsOut').value;
  const outgoing = outgoingId === '' ? null : match.players[Number(outgoingId)];
  const reserves = match.players.filter((p) => p.team === teamIdx && !p.onPitch && !p.sentOff && !p.subbedOff && outgoing);
  $('subsIn').replaceChildren(...reserves.map((player) => {
    const option = document.createElement('option');
    option.value = String(player.id);
    option.textContent = `${player.number} · ${player.name} (${player.role} reserve)`;
    return option;
  }));
  refreshSubstitutionStatus();
}

function refreshSubstitutionStatus() {
  if (!match) return;
  const team = match.teams[Number($('subsTeam').value)];
  const outgoingId = $('subsOut').value, incomingId = $('subsIn').value;
  const outgoing = outgoingId === '' ? null : match.players[Number(outgoingId)];
  const incoming = incomingId === '' ? null : match.players[Number(incomingId)];
  const hasOption = !!outgoing && !!incoming;
  $('subsStatus').textContent = team?.pendingSubstitution
    ? `${team.substitutions}/3 used. Change queued for the next stoppage.`
    : team
      ? `${team.substitutions}/3 used. Applies now at a stoppage or queues until the next one.`
    : 'Choose a team.';
  $('subsConfirm').disabled = !team || !hasOption || team.substitutions >= 3 || !!team.pendingSubstitution;
  $('subsCancel').disabled = !team?.pendingSubstitution;
}

function setupTouchControls() {
  const publish = (patch) => {
    Object.assign(touchInput, patch);
    input.setTouch(touchInput);
  };
  const stick = $('touchStick');
  const knob = $('touchStickKnob');
  let stickPointer = null;
  const moveStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    const rect = stick.getBoundingClientRect();
    const max = rect.width * 0.34;
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > max ? max / distance : 1;
    const dx = rawX * scale, dy = rawY * scale;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    publish({ mx: dx / max, mz: dy / max });
  };
  const releaseStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    knob.style.transform = 'translate(0, 0)';
    publish({ mx: 0, mz: 0 });
  };
  stick.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  stick.addEventListener('pointermove', moveStick);
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  const bindHeld = (id, field, onPress = {}) => {
    const button = $(id);
    const release = () => publish({ [field]: false });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      publish({ ...onPress, [field]: true });
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  };
  bindHeld('touchSprint', 'sprint');
  bindHeld('touchShoot', 'shootHeld', { shootPressed: true });
  $('touchPass').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    publish({ passPressed: true });
  });
  window.addEventListener('blur', resetTouchControls);
}

function resetTouchControls() {
  Object.assign(touchInput, { mx: 0, mz: 0, sprint: false, passPressed: false, shootHeld: false, shootPressed: false });
  input.setTouch(touchInput);
  const knob = $('touchStickKnob');
  if (knob) knob.style.transform = 'translate(0, 0)';
}

function buildMenu() {
  $('shootoutAim').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    if (!cupShootout) return;
    cupShootout.aim = Number(button.dataset.aim);
    $('shootoutAim').querySelectorAll('button').forEach((item) => item.classList.toggle('on', item === button));
  }));
  $('shootoutKick').addEventListener('click', takeCupShootoutAction);
  $('shootoutNext').addEventListener('click', () => {
    if (!cupShootout) return;
    if (cupShootout.phase === 'complete') { finishCupShootout(); return; }
    cupShootout.phase = 'human-shot';
    $('shootoutStatus').textContent = `Your turn: ${cupShootout.shooters[0][cupShootout.taken[0] % cupShootout.shooters[0].length].name}`;
    $('shootoutAim').querySelectorAll('button').forEach((button) => {
      button.textContent = ['Left', 'Center', 'Right'][Number(button.dataset.aim) + 1];
    });
    $('shootoutKick').textContent = 'Take penalty';
    $('shootoutKick').classList.remove('hidden');
    $('shootoutNext').classList.add('hidden');
  });
  $('shootoutMenu').addEventListener('click', toMenu);
  $('audioToggle').addEventListener('click', () => {
    $('audioToggle').textContent = audio.toggle() ? 'Sound: On' : 'Sound: Off';
  });
  $('touchPause').addEventListener('click', () => {
    if (match && match.phase !== 'fulltime') setPaused(!paused);
  });
  $('touchCamera').addEventListener('click', () => {
    if (match) showSub(`Camera: ${renderer.cycleCamera()}`);
  });
  $('replaySkip').addEventListener('click', finishReplay);
  setupTutorialPage();
  setupDevPanel();
  setupTouchControls();
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('subsBtn').addEventListener('click', () => {
    $('subsPanel').classList.remove('hidden');
    $('subsBtn').classList.add('hidden');
    refreshSubstitutionMenu();
  });
  $('subsClose').addEventListener('click', () => {
    $('subsPanel').classList.add('hidden');
    $('subsBtn').classList.remove('hidden');
  });
  $('subsTeam').addEventListener('change', refreshSubstitutionMenu);
  $('tacticSelect').addEventListener('change', () => {
    if (setTeamTactic(match, Number($('subsTeam').value), $('tacticSelect').value)) handleEvents();
  });
  $('formationSelect').addEventListener('change', () => {
    if (setTeamFormation(match, Number($('subsTeam').value), $('formationSelect').value)) handleEvents();
  });
  $('subsOut').addEventListener('change', refreshBenchOptions);
  $('subsIn').addEventListener('change', refreshSubstitutionStatus);
  $('subsConfirm').addEventListener('click', () => {
    const teamIdx = Number($('subsTeam').value);
    const outgoingId = Number($('subsOut').value);
    const incomingId = Number($('subsIn').value);
    if (!makeSubstitution(match, teamIdx, outgoingId, incomingId)) {
      $('subsStatus').textContent = 'This change is no longer available.';
      return;
    }
    handleEvents();
    refreshSubstitutionMenu();
  });
  $('subsCancel').addEventListener('click', () => {
    if (cancelPendingSubstitution(match, Number($('subsTeam').value))) handleEvents();
    refreshSubstitutionMenu();
  });
  $('restartBtn').addEventListener('click', startMatch);
  $('quitBtn').addEventListener('click', toMenu);
  $('rematchBtn').addEventListener('click', () => {
    if (settings.mode === 'cup' && cup?.champion) clearCup();
    if (settings.mode === 'career' && league?.complete) clearLeague();
    startMatch();
  });
  $('menuBtn').addEventListener('click', toMenu);
}

function clearCup() {
  cup = null;
  try { localStorage.removeItem('legends-decades-cup'); } catch {}
}

// A tournament keeps the roster profile and pool it started with.
function restoreRosterFor(saved) {
  const active = !(saved.championId || saved.complete);
  if (!active) return;
  if (saved.roster && saved.roster !== settings.roster) { settings.roster = saved.roster; applyDbPrefs(); }
  if (saved.pool) settings.pool = saved.pool;
}

function loadCup() {
  try {
    const saved = JSON.parse(localStorage.getItem('legends-decades-cup') || 'null');
    if (!saved) return null;
    restoreRosterFor(saved);
    const teamById = (id) => (knownTeam(id) ? getTeam(id) : null);
    const restoreFixture = (fixture) => {
      const home = teamById(fixture.homeId), away = teamById(fixture.awayId);
      if (!home || !away) return null;
      return {
        home, away, winner: teamById(fixture.winnerId),
        homeScore: fixture.homeScore, awayScore: fixture.awayScore,
        homePenalties: Number.isInteger(fixture.homePenalties) ? fixture.homePenalties : null,
        awayPenalties: Number.isInteger(fixture.awayPenalties) ? fixture.awayPenalties : null,
        shootout: !!fixture.shootout, round: fixture.round,
      };
    };
    const matches = (saved.matches || []).map(restoreFixture);
    const history = (saved.history || []).map(restoreFixture);
    const userTeam = teamById(saved.userTeamId);
    if (!userTeam || matches.some((fixture) => !fixture) || history.some((fixture) => !fixture)) return null;
    if (!matches.length && !saved.championId) return null;
    return {
      userTeam, round: saved.round || 0, lastUserRound: saved.lastUserRound || 0,
      matches, history, champion: teamById(saved.championId), eliminated: !!saved.eliminated,
    };
  } catch {
    return null;
  }
}

function persistCup() {
  try {
    if (!cup) { localStorage.removeItem('legends-decades-cup'); return; }
    const serializeFixture = (fixture) => ({
      homeId: fixture.home.id,
      awayId: fixture.away.id,
      winnerId: fixture.winner?.id || null,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      homePenalties: fixture.homePenalties,
      awayPenalties: fixture.awayPenalties,
      shootout: fixture.shootout,
      round: fixture.round,
    });
    localStorage.setItem('legends-decades-cup', JSON.stringify({
      userTeamId: cup.userTeam.id,
      round: cup.round,
      lastUserRound: cup.lastUserRound,
      matches: cup.matches.map(serializeFixture),
      history: cup.history.map(serializeFixture),
      championId: cup.champion?.id || null,
      eliminated: cup.eliminated,
      roster: settings.roster,
      pool: settings.pool,
    }));
  } catch {}
}

function clearLeague() {
  league = null;
  try { localStorage.removeItem('legends-career-season'); } catch {}
}

function loadLeague() {
  try {
    const saved = JSON.parse(localStorage.getItem('legends-career-season') || 'null');
    if (!saved) return null;
    restoreRosterFor(saved);
    const teamById = (id) => (knownTeam(id) ? getTeam(id) : null);
    const restoreFixture = (fixture) => {
      const home = teamById(fixture.homeId), away = teamById(fixture.awayId);
      if (!home || !away) return null;
      return {
        home, away, played: !!fixture.played,
        homeScore: fixture.homeScore, awayScore: fixture.awayScore,
      };
    };
    const schedule = (saved.schedule || []).map((round) => round.map(restoreFixture));
    const history = (saved.history || []).map(restoreFixture);
    const userTeam = teamById(saved.userTeamId);
    if (!userTeam || schedule.length !== 18 || schedule.some((round) => round.length !== 5 || round.some((f) => !f))) return null;
    if (history.some((fixture) => !fixture)) return null;
    const round = Number.isInteger(saved.round) ? saved.round : 0;
    if (round < 0 || round > schedule.length || (!saved.complete && round === schedule.length)) return null;
    return {
      userTeam, round, schedule, history,
      complete: !!saved.complete, champion: teamById(saved.championId),
    };
  } catch {
    return null;
  }
}

function persistLeague() {
  try {
    if (!league) { localStorage.removeItem('legends-career-season'); return; }
    const serializeFixture = (fixture) => ({
      homeId: fixture.home.id,
      awayId: fixture.away.id,
      played: fixture.played,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    });
    localStorage.setItem('legends-career-season', JSON.stringify({
      userTeamId: league.userTeam.id,
      round: league.round,
      schedule: league.schedule.map((round) => round.map(serializeFixture)),
      history: league.history.map(serializeFixture),
      complete: league.complete,
      championId: league.champion?.id || null,
      roster: settings.roster,
      pool: settings.pool,
    }));
  } catch {}
}

let tutStep = 0;
const TUT_STEPS = 6;
function showTutStep(i) {
  tutStep = Math.max(0, Math.min(TUT_STEPS - 1, i));
  document.querySelectorAll('.tut-step').forEach((el) => {
    el.classList.toggle('hidden', Number(el.dataset.step) !== tutStep);
  });
  $('tutTabs').querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', Number(b.dataset.step) === tutStep));
  $('tutPrev').disabled = tutStep === 0;
  $('tutNext').textContent = tutStep === TUT_STEPS - 1 ? 'Done' : 'Next →';
}
function openTutorialPage() {
  showTutStep(0);
  $('tutorial').classList.remove('hidden');
}
function closeTutorialPage() {
  $('tutorial').classList.add('hidden');
}
function setupTutorialPage() {
  $('pauseTutorialBtn').addEventListener('click', openTutorialPage);
  $('tutClose').addEventListener('click', closeTutorialPage);
  $('tutPrev').addEventListener('click', () => showTutStep(tutStep - 1));
  $('tutNext').addEventListener('click', () => {
    if (tutStep === TUT_STEPS - 1) closeTutorialPage(); else showTutStep(tutStep + 1);
  });
  $('tutTabs').querySelectorAll('button')
    .forEach((b) => b.addEventListener('click', () => showTutStep(Number(b.dataset.step))));
}
const isOpen = (id) => !$(id).classList.contains('hidden');

// ---------- developer options ----------
let openDevOptions = () => {};
function setupDevPanel() {
  const sync = () => {
    $('speedRange').value = dev.speed;
    $('speedVal').textContent = `${dev.speed}%`;
    $('debugCheck').checked = dev.debug;
    if (match) match.timeScale = dev.speed / 100;
    $('debug').classList.toggle('hidden', !dev.debug);
  };
  $('speedRange').addEventListener('input', (e) => { dev.speed = Number(e.target.value); saveDev(); sync(); });
  $('debugCheck').addEventListener('change', (e) => { dev.debug = e.target.checked; saveDev(); sync(); });
  $('devReset').addEventListener('click', () => { Object.assign(dev, DEV_DEFAULTS); saveDev(); sync(); });
  const open = () => { sync(); $('devPanel').classList.remove('hidden'); };
  openDevOptions = open;
  $('pauseDevBtn').addEventListener('click', open);
  $('devClose').addEventListener('click', () => $('devPanel').classList.add('hidden'));
  $('drillTackleBtn').addEventListener('click', startTackleDrill);
  $('drillPracticeBtn').addEventListener('click', () => { settings.mode = 'practice'; persistSettings(); startMatch(); });
  sync();
}

// ---------- era look ----------
function eraFilter(home, away) {
  if (settings.era !== 'on') return 'none';
  const year = Math.min(Number(home.id), Number(away.id));
  // Kept mild so the coloured player rings stay readable.
  if (year < 1950) return 'sepia(0.4) contrast(1.08)';
  if (year < 1970) return 'grayscale(0.45) contrast(1.1)';
  if (year < 1980) return 'saturate(1.3) contrast(1.05)';
  return 'none';
}

// ---------- interactive tutorial ----------
const TUTORIAL = [
  { title: 'Move', keys: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', text: 'Run around with W A S D. Your player has the green ring.' },
  { title: 'Sprint', keys: 'hold <kbd>Left Shift</kbd> + <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', text: 'Hold Left Shift while moving to sprint. Watch the green stamina bar.' },
  { title: 'Get the ball', keys: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> towards the ball', text: 'Run to the loose ball. Press roughly towards it and assist steers you onto it.' },
  { title: 'Pass', keys: 'steer, then <kbd>F</kbd>', text: 'Steer until the teammate you want has the YELLOW ring, then press F. You take over the receiver.' },
  { title: 'Shoot', keys: 'hold <kbd>G</kbd>, release', text: 'Get near the goal, hold G to build power (about half is accurate) and release to shoot.' },
  { title: 'Change player', keys: '<kbd>F</kbd> without the ball', text: 'When you don’t have the ball, press F to switch to the YELLOW player.' },
  { title: 'Score a goal', keys: 'pass, run, shoot', text: 'Put it all together and score!' },
];
let tut = null;

function startTutorialState() {
  tut = { step: 0, moved: 0, sprinted: 0, done: false };
  // Begin in open play with a loose ball, so you can move straight away.
  const b = match.ball;
  match.phase = 'play';
  match.banner = null;
  for (const p of match.players) p.mustPass = false;
  b.owner = null;
  b.pos.x = 8; b.pos.z = 7; b.pos.y = BALL_R;
  stopBall(b);
  renderTutorial();
}

function tutAdvance() {
  tut.step += 1;
  if (tut.step >= TUTORIAL.length) {
    tut.done = true;
    showSub('Tutorial complete! Keep practising, or press Esc for the menu.', 4);
  } else {
    showSub(`✔ Nice! Next: ${TUTORIAL[tut.step].title}`, 1.8);
  }
  renderTutorial();
}

function renderTutorial() {
  const box = $('tutChecklist');
  box.classList.toggle('hidden', !tut && !drill);
  if (drill) { renderDrill(); return; }
  if (!tut) return;
  $('tcTitle').textContent = 'TUTORIAL';
  const cur = TUTORIAL[Math.min(tut.step, TUTORIAL.length - 1)];
  $('tcStep').textContent = tut.done ? 'All done!' : `${tut.step + 1}. ${cur.title}`;
  $('tcKeys').innerHTML = tut.done ? 'Free practice.' : `${cur.keys}<div class="hint-text">${cur.text}</div>`;
  $('tcList').innerHTML = TUTORIAL.map((s, i) => {
    const cls = i < tut.step || tut.done ? 'done' : i === tut.step ? 'now' : '';
    return `<li class="${cls}">${s.title}</li>`;
  }).join('');
}

function tutorialTick(dt, inp) {
  if (!tut || tut.done || !match) return;
  const team = match.teams[0];
  const p = team.controlled;
  const moving = inp && Math.hypot(inp.mx, inp.mz) > 0.2;
  if (tut.step === 0 && moving) { tut.moved += dt; if (tut.moved > 1.5) tutAdvance(); }
  else if (tut.step === 1 && moving && inp.sprint) { tut.sprinted += dt; if (tut.sprinted > 1.0) tutAdvance(); }
  else if (tut.step === 2 && p && match.ball.owner === p) tutAdvance();
}

function tutorialEvent(e) {
  if (!tut || tut.done) return;
  const s = tut.step;
  if (s === 2 && e.type === 'control' && match.players.find((p) => p.id === e.player)?.human) tutAdvance();
  else if (s === 3 && e.type === 'pass' && e.human) tutAdvance();
  else if (s === 4 && e.type === 'shot' && e.human) tutAdvance();
  else if (s === 5 && e.type === 'manualSwitch' && e.team === 0) tutAdvance();
  else if (s === 6 && e.type === 'goal' && e.team === 0) tutAdvance();
}

// ---------- tackle drill (Developer options -> Checks) ----------
// An opponent dribbles at your defender again and again. Every tackle is
// counted, so you can see that tackling works and how often it succeeds.
let drill = null;

function startTackleDrill() {
  const saved = { mode: settings.mode, difficulty: settings.difficulty };
  settings.mode = '1p';
  settings.difficulty = 'beginner';
  startMatch();
  Object.assign(settings, saved);
  match.duration = Infinity; // no clock, no halftime
  drill = { timer: 0, resetIn: 0, rounds: 0 };
  setupDrillRound();
}

function setupDrillRound() {
  const b = match.ball;
  const me = match.teams[0];
  const mine = match.players.find((p) => p.team === 0 && p.role === 'DEF');
  const victim = match.players.find((p) => p.team === 1 && p.role === 'MID');
  match.phase = 'play';
  match.banner = null;
  match.restart = null;
  for (const p of match.players) {
    p.mustPass = false; p.throwIn = false; p.stun = 0; p.kickCd = 0; p.tackleCd = 0;
    p.vel.x = p.vel.z = 0; p.charge = 0; p.drillNoPass = false; p.drillPassive = false;
  }
  // Your other outfield players wait at the back so only you tackle.
  let slot = 0;
  for (const p of match.players) {
    if (p.team !== 0 || p.role === 'GK' || p === mine) continue;
    p.drillPassive = true;
    p.pos.x = -27; p.pos.z = [-15, 15, -9, 9][slot++ % 4];
  }
  const z = (Math.random() - 0.5) * 8;
  mine.pos.x = -14; mine.pos.z = z; mine.face.x = 1; mine.face.z = 0;
  victim.pos.x = -4; victim.pos.z = z + (Math.random() - 0.5) * 3;
  victim.face.x = -1; victim.face.z = 0;
  victim.drillNoPass = true;
  b.owner = victim; b.lastTouch = victim; b.intended = null; b.shotLive = false;
  stopBall(b);
  b.pos.x = victim.pos.x - DRIBBLE_OFFSET; b.pos.z = victim.pos.z; b.pos.y = BALL_R;
  setControlled(match, me, mine);
  me.seenOpponentOwner = victim; // don't auto-switch away from your defender
  drill.timer = 0;
  drill.resetIn = 0;
  drill.rounds += 1;
  renderTutorial();
}

function drillTick(dt) {
  if (!drill || !match) return;
  const b = match.ball;
  if (drill.resetIn > 0) {
    drill.resetIn -= dt;
    if (drill.resetIn <= 0) setupDrillRound();
    return;
  }
  drill.timer += dt;
  const roundOver = (b.owner && b.owner.team === 0) // you won it
    || match.phase !== 'play' // went out / goal
    || (!b.owner && drill.timer > 2 && match.teams[0].tackles.last !== null)
    || drill.timer > 8;
  if (roundOver) {
    if (drill.timer > 8) showSub('Round over: get closer and press G', 1.4);
    drill.resetIn = 1.3;
  }
}

function renderDrill() {
  const t = match ? match.teams[0].tackles : { tries: 0, won: 0, last: null };
  $('tcTitle').textContent = 'TACKLE DRILL';
  const pct = t.tries ? Math.round((100 * t.won) / t.tries) : 0;
  $('tcStep').innerHTML = `<span id="drillStats">Won ${t.won} / ${t.tries}</span> <span class="hint-text">${t.tries ? `(${pct}%)` : ''}</span>`;
  $('tcKeys').innerHTML = `Run at him with ${k('W A S D')}. When his ring <span class="tackle-flash">flashes orange</span>, press ${k('G')}.`
    + `<div class="hint-text">Esc → Main menu to stop. Assist: ${match ? match.assistName : ''}.</div>`;
  const labels = {
    won: '✔ Won the ball', missed: '✖ Missed (he kept it)', 'too far': '→ Too far away, get closer',
    keeper: 'Keeper holding it: can’t tackle', 'set piece': 'Restart not taken yet', nothing: 'Nobody to tackle', poke: 'Poked the loose ball',
  };
  $('tcList').innerHTML = `<li>Round ${drill ? drill.rounds : 0}</li><li>Last: ${t.last ? labels[t.last] : '-'}</li>`;
}

// ---------- match flow ----------
function controllers() {
  if (settings.mode === '2p') return ['p1', 'p2'];
  if (settings.mode === 'cpu') return ['ai', 'ai'];
  if (settings.mode === 'career' && league) {
    const fixture = league.schedule[league.round][0];
    return fixture.home.id === league.userTeam.id ? ['p1', 'ai'] : ['ai', 'p1'];
  }
  return ['p1', 'ai'];
}

function simulateAiMatch(fixture, duration = 30) {
  const cpuMatch = createMatch({
    home: fixture.home,
    away: fixture.away,
    controllers: ['ai', 'ai'],
    difficulty: settings.difficulty,
    duration: Math.min(duration, settings.duration),
  });
  let steps = 0;
  const maxSteps = Math.ceil(cpuMatch.duration * 60 * 3);
  while (cpuMatch.phase !== 'fulltime' && steps < maxSteps) {
    stepMatch(cpuMatch, {}, FIXED_DT);
    steps++;
  }
  fixture.homeScore = cpuMatch.teams[0].score;
  fixture.awayScore = cpuMatch.teams[1].score;
}

function poolByRating() {
  return poolTeamIds(settings.pool).filter(isPlayable)
    .sort((x, y) => (teamRating(y) ?? 0) - (teamRating(x) ?? 0));
}
function competitionTeams(size) {
  const ids = poolByRating();
  const user = ids.includes(settings.home) ? settings.home : ids[0];
  const preferred = ids.includes(settings.away) && settings.away !== user ? settings.away : ids.find((id) => id !== user);
  const rest = ids.filter((id) => id !== user && id !== preferred).slice(0, size - 2);
  return { user: getTeam(user), preferred: getTeam(preferred), rest: rest.map(getTeam) };
}

function createLeague() {
  const { user: userTeam, preferred, rest } = competitionTeams(10);
  const rotation = [userTeam, ...rest, preferred];
  const firstHalf = [];
  for (let round = 0; round < rotation.length - 1; round++) {
    const fixtures = [];
    for (let i = 0; i < rotation.length / 2; i++) {
      const a = rotation[i], b = rotation[rotation.length - 1 - i];
      const home = (round + i) % 2 === 0 ? a : b;
      const away = home === a ? b : a;
      fixtures.push({ home, away, played: false });
    }
    firstHalf.push(fixtures);
    rotation.splice(1, 0, rotation.pop());
  }
  const secondHalf = firstHalf.map((round) => round.map((fixture) => ({
    home: fixture.away, away: fixture.home, played: false,
  })));
  return { userTeam, round: 0, schedule: [...firstHalf, ...secondHalf], history: [], complete: false, champion: null };
}

function createCup() {
  const { user: home, preferred: away, rest } = competitionTeams(8);
  const participants = [home, away, ...rest];
  const matches = [];
  for (let i = 0; i < participants.length; i += 2) {
    matches.push({ home: participants[i], away: participants[i + 1], winner: null });
  }
  return { userTeam: home, round: 0, lastUserRound: 0, matches, history: [], champion: null, eliminated: false };
}

function shootoutWinner(home, away) {
  const shooters = (team) => team.players
    .filter((p, index) => index !== 0)
    .sort((a, b) => b.stats.sho - a.stats.sho)
    .slice(0, 5);
  const homeShooters = shooters(home), awayShooters = shooters(away);
  const homeKeeper = home.players[0].stats.gk;
  const awayKeeper = away.players[0].stats.gk;
  const scores = [0, 0];
  const take = (team, keeper, i, side) => {
    const player = team[i % team.length];
    const chance = Math.max(0.52, Math.min(0.93, 0.76 + (player.stats.sho - 75) * 0.003 - (keeper - 75) * 0.002));
    if (Math.random() < chance) scores[side]++;
  };
  for (let i = 0; i < 5; i++) {
    take(homeShooters, awayKeeper, i, 0);
    take(awayShooters, homeKeeper, i, 1);
    const remaining = 4 - i;
    if (scores[0] > scores[1] + remaining) return { winner: home, homeScore: scores[0], awayScore: scores[1] };
    if (scores[1] > scores[0] + remaining) return { winner: away, homeScore: scores[0], awayScore: scores[1] };
  }
  for (let i = 5; scores[0] === scores[1]; i++) {
    take(homeShooters, awayKeeper, i, 0);
    take(awayShooters, homeKeeper, i, 1);
  }
  return {
    winner: scores[0] > scores[1] ? home : away,
    homeScore: scores[0], awayScore: scores[1],
  };
}

function decideCupFixture(fixture) {
  fixture.shootout = fixture.homeScore === fixture.awayScore;
  if (fixture.shootout) {
    const result = shootoutWinner(fixture.home, fixture.away);
    fixture.winner = result.winner;
    fixture.homePenalties = result.homeScore;
    fixture.awayPenalties = result.awayScore;
  } else {
    fixture.winner = fixture.homeScore > fixture.awayScore ? fixture.home : fixture.away;
    fixture.homePenalties = null;
    fixture.awayPenalties = null;
  }
}

function beginCupShootout() {
  const teams = match.teams.map((team) => team.data);
  const shooters = teams.map((team) => team.players
    .filter((player, index) => index !== 0)
    .sort((a, b) => b.stats.sho - a.stats.sho));
  cupShootout = { teams, shooters, scores: [0, 0], taken: [0, 0], phase: 'human-shot', aim: 0 };
  cupShootoutOutcome = null;
  $('shootoutTeams').textContent = `${teams[0].name}  ·  ${teams[1].name}`;
  $('shootoutScore').textContent = '0 — 0';
  $('shootoutStatus').textContent = `Your turn: ${shooters[0][0].name}`;
  $('shootoutAim').querySelectorAll('button').forEach((button) => {
    button.textContent = ['Left', 'Center', 'Right'][Number(button.dataset.aim) + 1];
    button.classList.toggle('on', button.dataset.aim === '0');
  });
  $('shootoutKick').textContent = 'Take penalty';
  $('shootoutKick').classList.remove('hidden');
  $('shootoutNext').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('shootout').classList.remove('hidden');
}

function takeCupShootoutAction() {
  if (!cupShootout) return;
  const s = cupShootout;
  const humanTeam = match.teams[0];
  const keeper = match.teams[1].data.players[0].stats.gk;
  if (s.phase === 'human-shot') {
    const shooter = s.shooters[0][s.taken[0] % s.shooters[0].length];
    const keeperAim = Math.floor(Math.random() * 3) - 1;
    const chance = Math.max(0.3, Math.min(0.97, 0.9 - (keeperAim === s.aim ? 0.42 : 0)
      + (shooter.stats.sho - 75) * 0.0025 - (keeper - 75) * 0.0015));
    const goal = Math.random() < chance;
    if (goal) s.scores[0]++;
    s.taken[0]++;
    s.lastShot = goal ? `${shooter.name} scores!` : `${shooter.name} misses or is saved.`;
    s.phase = 'human-dive';
    const rival = s.shooters[1][s.taken[1] % s.shooters[1].length];
    $('shootoutStatus').textContent = `${s.lastShot} Now dive against ${rival.name}.`;
    $('shootoutAim').querySelectorAll('button').forEach((button) => {
      button.textContent = ['Dive Left', 'Dive Center', 'Dive Right'][Number(button.dataset.aim) + 1];
    });
    $('shootoutKick').textContent = 'Dive';
  } else if (s.phase === 'human-dive') {
    const shooter = s.shooters[1][s.taken[1] % s.shooters[1].length];
    const rivalAim = Math.floor(Math.random() * 3) - 1;
    const keeperSkill = humanTeam.data.players[0].stats.gk;
    const chance = Math.max(0.3, Math.min(0.97, 0.9 - (rivalAim === s.aim ? 0.42 : 0)
      + (shooter.stats.sho - 75) * 0.0025 - (keeperSkill - 75) * 0.0015));
    const goal = Math.random() < chance;
    if (goal) s.scores[1]++;
    s.taken[1]++;
    s.lastShot = goal ? `${shooter.name} scores.` : `${shooter.name} is denied!`;
    $('shootoutScore').textContent = `${s.scores[0]} — ${s.scores[1]}`;
    const bothCompletedFive = s.taken[0] >= 5 && s.taken[1] >= 5;
    // Once both teams have taken five, continue in pairs until one team leads.
    const resolved = bothCompletedFive
      ? s.scores[0] !== s.scores[1]
      : s.scores[0] > s.scores[1] + (5 - s.taken[1])
        || s.scores[1] > s.scores[0] + (5 - s.taken[0]);
    if (resolved) {
      const winner = s.scores[0] > s.scores[1] ? s.teams[0] : s.teams[1];
      cupShootoutOutcome = { winner, homeScore: s.scores[0], awayScore: s.scores[1] };
      s.phase = 'complete';
      $('shootoutStatus').textContent = `${s.lastShot} ${winner.name} win on penalties.`;
      $('shootoutKick').classList.add('hidden');
      $('shootoutNext').textContent = 'Continue';
      $('shootoutNext').classList.remove('hidden');
    } else {
      s.phase = 'next';
      $('shootoutStatus').textContent = `${s.lastShot} ${s.taken[0]} of 5 taken.`;
      $('shootoutKick').classList.add('hidden');
      $('shootoutNext').textContent = s.taken[0] >= 5 ? 'Sudden death: next pair' : 'Next kick';
      $('shootoutNext').classList.remove('hidden');
    }
  }
}

function finishCupShootout() {
  $('shootout').classList.add('hidden');
  cupShootout = null;
  if (settings.mode === 'penalties') {
    $('ftTitle').textContent = 'Shootout complete';
    $('ftScore').textContent = `${cupShootoutOutcome.winner.name} win ${cupShootoutOutcome.homeScore}–${cupShootoutOutcome.awayScore} on penalties`;
    $('ftCupNote').classList.add('hidden');
    $('ftCupResults').classList.add('hidden');
    $('ftScorers').classList.add('hidden');
    $('ftStats').classList.add('hidden');
    $('rematchBtn').textContent = 'Play again';
    $('fulltime').classList.remove('hidden');
    cupShootoutOutcome = null;
    return;
  }
  $('ftTitle').textContent = 'Full time';
  showFullTime();
}

function simulateCupFixture(fixture, round) {
  if (fixture.winner) return;
  simulateAiMatch(fixture);
  decideCupFixture(fixture);
  fixture.round = round;
  cup.history.push(fixture);
}

function leagueStandings() {
  const leagueTeams = league.schedule[0].flatMap((f) => [f.home, f.away]);
  const table = leagueTeams.map((team) => ({ team, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }));
  const byId = new Map(table.map((row) => [row.team.id, row]));
  for (const fixture of league.history) {
    const home = byId.get(fixture.home.id), away = byId.get(fixture.away.id);
    if (!fixture.played || fixture.homeScore == null || fixture.awayScore == null) continue;
    home.played++; away.played++;
    home.gf += fixture.homeScore; home.ga += fixture.awayScore;
    away.gf += fixture.awayScore; away.ga += fixture.homeScore;
    if (fixture.homeScore > fixture.awayScore) { home.wins++; home.points += 3; away.losses++; }
    else if (fixture.homeScore < fixture.awayScore) { away.wins++; away.points += 3; home.losses++; }
    else { home.draws++; away.draws++; home.points++; away.points++; }
  }
  return table.sort((a, b) => b.points - a.points
    || (b.gf - b.ga) - (a.gf - a.ga)
    || b.gf - a.gf || b.wins - a.wins
    || a.team.name.localeCompare(b.team.name));
}

function simulateLeagueFixture(fixture) {
  if (fixture.played) return;
  simulateAiMatch(fixture);
  fixture.played = true;
  league.history.push(fixture);
}

function advanceLeagueAfterUserMatch() {
  if (!league || league.complete || !match) return;
  const fixtures = league.schedule[league.round];
  const userFixture = fixtures[0];
  if (userFixture.played) return;
  userFixture.homeScore = match.teams[0].score;
  userFixture.awayScore = match.teams[1].score;
  userFixture.played = true;
  league.history.push(userFixture);
  for (const fixture of fixtures.slice(1)) simulateLeagueFixture(fixture);
  league.round++;
  if (league.round >= league.schedule.length) {
    league.complete = true;
    league.champion = leagueStandings()[0].team;
  }
  persistLeague();
}

function advanceCupAfterUserMatch() {
  if (!cup || cup.champion || !match) return;
  const fixture = cup.matches[0];
  if (fixture.winner) return;
  fixture.homeScore = match.teams[0].score;
  fixture.awayScore = match.teams[1].score;
  if (fixture.homeScore === fixture.awayScore && cupShootoutOutcome) {
    fixture.shootout = true;
    fixture.winner = cupShootoutOutcome.winner;
    fixture.homePenalties = cupShootoutOutcome.homeScore;
    fixture.awayPenalties = cupShootoutOutcome.awayScore;
  } else {
    decideCupFixture(fixture);
  }
  cupShootoutOutcome = null;
  fixture.round = cup.round;
  cup.lastUserRound = cup.round;
  cup.history.push(fixture);

  for (const cpuFixture of cup.matches.slice(1)) simulateCupFixture(cpuFixture, cup.round);
  let winners = cup.matches.map((item) => item.winner);
  if (fixture.winner !== cup.userTeam) {
    cup.eliminated = true;
    while (winners.length > 1) {
      const next = [];
      for (let i = 0; i < winners.length; i += 2) {
        next.push({ home: winners[i], away: winners[i + 1], winner: null });
      }
      next.forEach((item) => simulateCupFixture(item, cup.round + 1));
      winners = next.map((item) => item.winner);
      cup.round++;
    }
    cup.champion = winners[0];
    cup.matches = [];
    return;
  }

  if (winners.length === 1) {
    cup.champion = winners[0];
    cup.matches = [];
    return;
  }
  cup.round++;
  cup.matches = [];
  for (let i = 0; i < winners.length; i += 2) {
    cup.matches.push({ home: winners[i], away: winners[i + 1], winner: null });
  }
  for (const cpuFixture of cup.matches.slice(1)) simulateCupFixture(cpuFixture, cup.round);
}

function startMatch() {
  // Make sure no menu button keeps keyboard focus (Space would "click" it).
  document.activeElement?.blur?.();
  resetTouchControls();
  cupShootout = null;
  cupShootoutOutcome = null;
  audio.unlock();
  audio.setInMatch(true);
  let home, away;
  if (settings.mode === 'cup') {
    if (!cup || cup.champion) cup = createCup();
    persistCup();
    home = cup.matches[0].home;
    away = cup.matches[0].away;
  } else if (settings.mode === 'career') {
    clearCup();
    if (!league || league.complete) league = createLeague();
    persistLeague();
    home = league.schedule[league.round][0].home;
    away = league.schedule[league.round][0].away;
  } else {
    clearCup();
    clearLeague();
    home = getTeam(settings.home);
    away = getTeam(settings.away);
  }
  // Kits chosen on the team select screen; a clash moves the away side to
  // its next kit before kickoff (the preview shows the same result).
  const kits = matchKits(home, away);
  home = { ...home, kit: kits.home };
  away = { ...away, kit: kits.away };
  // Line-ups, formations and tactics saved in Team Management.
  home = frontend.applySquad(home);
  away = frontend.applySquad(away);
  const practice = settings.mode === 'practice' || settings.mode === 'tutorial';
  match = createMatch({
    home, away, controllers: controllers(),
    difficulty: practice ? 'easy' : settings.difficulty,
    duration: settings.duration, practice, indoor: settings.mode === 'indoor',
    extraTime: settings.mode === 'cup', extraTimeDuration: Math.max(30, Math.round(settings.duration / 4)),
    timeScale: dev.speed / 100,
    assist: settings.assist,
    dribbleStyle: settings.dribbleStyle,
  });
  [home, away].forEach((team, i) => {
    const setup = frontend.squadSetup(team);
    if (!match.indoor) setTeamFormation(match, i, setup.formation);
    setTeamTactic(match, i, setup.tactic);
  });
  setupKickoff(match, 0); // line up in the chosen shape
  match.events.length = 0;
  goals = [];
  acc = 0;
  replayBuffer = [];
  replayFrames = null;
  replayInfo = null;
  pendingReplay = null;
  goalCard = null;
  replayElapsed = replayCaptureElapsed = 0;
  $('replaySkip').classList.add('hidden');
  const touchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const hasTouchPlayer = match.teams.some((team) => team.human === 'p1');
  $('touchControls').classList.toggle('hidden', !touchDevice || !hasTouchPlayer);
  tut = null;
  drill = null;
  if (settings.mode === 'tutorial') startTutorialState();
  renderTutorial();
  renderer.setMatch(match);
  $('game').style.filter = eraFilter(home, away);

  $('homeName').textContent = shortCode(home);
  $('awayName').textContent = practice ? 'PRC' : shortCode(away);
  for (const [chip, team, data, i] of [['homeChip', match.teams[0], home, 0], ['awayChip', match.teams[1], away, 1]]) {
    const k = team.kit;
    $(chip).style.background = `linear-gradient(90deg, ${k.shirt} 0 50%, ${k.secondary && k.secondary !== k.shirt ? k.secondary : k.shorts} 50% 100%)`;
    const crestImg = $(`teamPanel${i}`).querySelector('.tp-crest');
    crestImg.src = data.crest || '';
    crestImg.classList.toggle('hidden', !data.crest);
    $(`teamPanel${i}`).style.setProperty('--team', k.shirt);
  }
  $('teamPanel1').classList.toggle('hidden', !!practice);
  try { history.pushState({ screen: 'match' }, '', '#/match'); } catch { /* sandboxed frames */ }
  $('subsBtn').classList.toggle('hidden', !match.teams.some((t) => t.human));
  $('formationRow').classList.toggle('hidden', !!match.indoor);
  $('subsPanel').classList.add('hidden');
  $('debug').classList.toggle('hidden', !dev.debug);

  frontend.hide();
  $('fulltime').classList.add('hidden');
  $('shootout').classList.add('hidden');
  $('subsBtn').classList.add('hidden');
  $('devPanel').classList.add('hidden');
  $('hud').classList.remove('hidden');
  setPaused(false);
  input.enabled = true;
  $('game').focus?.();
  if (settings.mode === 'penalties') {
    match.phase = 'fulltime';
    beginCupShootout();
  }
}

function matchKits(home, away) {
  const homeType = home.id === settings.home ? settings.homeKit : 'home';
  const awayType = away.id === settings.away ? settings.awayKit : 'away';
  return resolveKitClash(home.id, homeType, away.id, awayType);
}

function toMenu() {
  resetTouchControls();
  audio.setInMatch(false);
  match = null;
  replayFrames = null;
  replayInfo = null;
  pendingReplay = null;
  goalCard = null;
  replayBuffer = [];
  $('replaySkip').classList.add('hidden');
  $('touchControls').classList.add('hidden');
  tut = null;
  drill = null;
  paused = false;
  input.enabled = false;
  $('game').style.filter = 'none';
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('subsPanel').classList.add('hidden');
  $('subsBtn').classList.remove('hidden');
  $('fulltime').classList.add('hidden');
  $('shootout').classList.add('hidden');
  frontend.show('hub');
  renderTutorial();
}

function setPaused(v) {
  paused = v;
  $('pause').classList.toggle('hidden', !v);
  if (!v) {
    $('subsPanel').classList.add('hidden');
    $('subsBtn').classList.toggle('hidden', !match?.teams.some((team) => team.human));
  }
}

window.addEventListener('keydown', (e) => {
  if (isOpen('tutorial')) {
    if (e.code === 'Escape') closeTutorialPage();
    else if (e.code === 'ArrowRight') showTutStep(tutStep + 1);
    else if (e.code === 'ArrowLeft') showTutStep(tutStep - 1);
    return;
  }
  if (isOpen('devPanel')) {
    if (e.code === 'Escape') $('devPanel').classList.add('hidden');
    return;
  }
  if (e.code === 'F1' || e.code === 'Backquote') {
    e.preventDefault();
    dev.debug = !dev.debug; saveDev();
    $('debug').classList.toggle('hidden', !dev.debug);
    $('debugCheck').checked = dev.debug;
    return;
  }
  if (!match) {
    frontend.handleKey(e);
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (match.phase !== 'fulltime') setPaused(!paused);
  } else if (e.code === 'KeyR' && replayFrames) {
    finishReplay();
  } else if (e.code === 'KeyC') {
    showSub(`Camera: ${renderer.cycleCamera()}`);
  }
});
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('popstate', () => {
  if (!match) return; // the front end handles menu history itself
  if (match.phase !== 'fulltime') setPaused(true);
  try { history.pushState({ screen: 'match' }, '', '#/match'); } catch { /* ignore */ }
});

// ---------- HUD ----------
let subTimer = 0;
function showSub(text, time = 1.6) {
  $('subBanner').textContent = text;
  $('subBanner').classList.add('show');
  subTimer = time;
}

function snapshotForRender(state) {
  const players = state.players.map((p) => ({
    ...p,
    pos: { ...p.pos },
    vel: { ...p.vel },
    face: { ...p.face },
    acc: p.acc ? { ...p.acc } : undefined,
    prevPos: null,
  }));
  const playerById = (player) => player ? players[player.id] : null;
  const teams = state.teams.map((team) => ({
    ...team,
    controlled: playerById(team.controlled),
    next: playerById(team.next),
  }));
  return {
    ...state,
    players,
    teams,
    ball: {
      ...state.ball,
      pos: { ...state.ball.pos },
      vel: { ...state.ball.vel },
      spin: state.ball.spin ? { ...state.ball.spin } : undefined,
      prevPos: null,
      owner: playerById(state.ball.owner),
    },
  };
}

function captureReplayFrame(force = false) {
  if (!match) return;
  replayCaptureElapsed += FIXED_DT;
  if (!force && replayCaptureElapsed < 1 / REPLAY_FPS) return;
  if (!force) replayCaptureElapsed -= 1 / REPLAY_FPS;
  replayBuffer.push(snapshotForRender(match));
  replayFrameCount++;
  if (replayBuffer.length > REPLAY_FRAMES) replayBuffer.shift();
}

/** Remember the goal; the replay runs once the live celebration has played. */
function queueGoalReplay(e) {
  pendingReplay = {
    goalAbs: replayFrameCount,
    scorerId: e.scorerId,
    shotId: match.ball.shotId,
    shooterId: match.ball.shooter?.id ?? e.scorerId,
    dir: match.teams[e.team].dir,
  };
}

function beginGoalReplay(info) {
  if (replayFrames || replayBuffer.length < REPLAY_FPS) return;
  captureReplayFrame(true);
  const firstAbs = replayFrameCount - replayBuffer.length;
  const startAbs = Math.max(firstAbs, info.goalAbs - Math.round(REPLAY_FPS * 3.6));
  const endAbs = Math.min(replayFrameCount, info.goalAbs + Math.round(REPLAY_FPS * 1.6));
  replayFrames = replayBuffer.slice(startAbs - firstAbs, endAbs - firstAbs);
  if (replayFrames.length < 2) { replayFrames = null; return; }
  const shotIdx = replayFrames.findIndex((f) => f.ball.shotId === info.shotId && !f.ball.owner);
  replayInfo = {
    shooterId: info.shooterId, scorerId: info.scorerId, dir: info.dir,
    shotIdx: shotIdx >= 0 && info.shotId > 0 ? shotIdx : null,
    goalIdx: info.goalAbs - startAbs,
  };
  replayElapsed = 0;
  $('replaySkip').classList.remove('hidden');
  $('replayTag').classList.remove('hidden');
}

/** Playback rate: slow motion around the strike and as the ball goes in. */
function replayRate(pos) {
  const bump = (centre, before, after) => {
    if (centre == null) return 0;
    const d = pos - centre;
    const w = d < 0 ? before : after;
    return Math.max(0, 1 - Math.abs(d) / (w * REPLAY_FPS)) ** 0.6;
  };
  const slow = Math.max(bump(replayInfo?.shotIdx, 0.45, 0.6), bump(replayInfo?.goalIdx, 0.5, 0.25));
  return 1 - 0.68 * slow;
}

/** Blend two replay snapshots (positions interpolate in the renderer). */
function replayView(pos) {
  const i = Math.min(replayFrames.length - 2, Math.floor(pos));
  const a = replayFrames[i], b = replayFrames[i + 1];
  b.players.forEach((p, k) => { p.prevPos = a.players[k]?.pos || null; });
  b.ball.prevPos = a.ball.pos;
  return { state: b, alpha: Math.min(1, Math.max(0, pos - i)) };
}

function finishReplay() {
  replayFrames = null;
  replayInfo = null;
  pendingReplay = null;
  goalCard = null;
  replayInfo = null;
  replayElapsed = 0;
  $('replaySkip').classList.add('hidden');
  $('replayTag').classList.add('hidden');
}

function handleEvents() {
  for (const e of match.events) {
    audio.playEvent(e);
    tutorialEvent(e);
    if (e.type === 'goal') {
      const team = match.teams[e.team];
      goals.push({ team: e.team, name: e.scorer, own: e.ownGoal, minute: Math.max(1, displayMinute(match)) });
      showGoalCard(team, e);
      queueGoalReplay(e);
    } else if (e.type === 'offside') {
      showSub(`Offside · ${match.players[e.player].name}`, 1.6);
    } else if (e.type === 'doubleTouch') {
      showSub('Indirect free kick · double touch', 1.6);
    } else if (e.type === 'throwInGoal') {
      showSub(e.ownGoalEnd
        ? 'A throw-in cannot be an own goal — corner awarded'
        : 'A throw-in cannot score directly — goal kick awarded', 2.0);
    } else if (e.type === 'directRestartOwnGoal') {
      showSub('A restart cannot go directly into your own goal — corner awarded', 2.0);
    } else if (e.type === 'freeKickDirectGoal') {
      showSub(e.ownGoalEnd
        ? 'A free kick cannot score directly into your own goal — corner awarded'
        : 'Indirect free kick needs another touch — goal kick awarded', 2.0);
    } else if (e.type === 'foul') {
      if (e.penalty) showSub('Penalty', 1.8);
    } else if (e.type === 'card') {
      const player = match.players[e.player];
      showSub(e.secondYellow ? `Second yellow — ${player.name} sent off` : `${e.color === 'red' ? 'Red' : 'Yellow'} card — ${player.name}`, 2.2);
    } else if (e.type === 'substitution') {
      const incoming = match.players[e.incoming], outgoing = match.players[e.outgoing];
      showSub(`${incoming.name} replaces ${outgoing.name}`, 2.0);
    } else if (e.type === 'substitutionQueued') {
      const incoming = match.players[e.incoming], outgoing = match.players[e.outgoing];
      showSub(`${incoming.name} will replace ${outgoing.name} at the next stoppage`, 2.4);
    } else if (e.type === 'substitutionCancelled') {
      showSub('Queued substitution cancelled', 1.8);
    } else if (e.type === 'injury') {
      showSub(`${match.players[e.player].name} is injured`, 2.2);
    } else if (e.type === 'tactic') {
      // (tactics changes are the user's own choice: no on-pitch message)
    } else if (e.type === 'formation') {
      // (formation changes: no on-pitch message)
    } else if (e.type === 'extraTime') {
      showSub('Extra time — golden chance to settle the tie', 2.4);
    } else if (e.type === 'tackle' && e.human) {
      const msg = {
        won: 'Ball won!', missed: 'Tackle missed: try again',
        'too far': 'Too far: get closer (wait for the orange ring)',
        keeper: 'Keeper has it in his hands: you can\u2019t tackle him', nothing: 'Nobody in range to tackle',
        'set piece': 'Wait until the restart is taken',
      }[e.result];
      // Tackle feedback only in the tackling drill / tutorial.
      if (msg && (drill || tut)) showSub(msg, 1.2);
      if (drill) renderTutorial();
    } else if (e.type === 'halftime') {
      // (half time is shown on the scoreboard)
    } else if (e.type === 'fulltime') {
      if (settings.mode === 'cup' && cup && match.teams[0].score === match.teams[1].score) beginCupShootout();
      else showFullTime();
    }
  }
  match.events.length = 0;
}

const KEYS = {
  p1: { move: 'W A S D', pass: 'F', shoot: 'G', sprint: 'L-Shift', loft: 'V', through: 'R', finesse: 'H', chip: 'T' },
  p2: { move: 'Arrows', pass: '.', shoot: '/', sprint: 'R-Shift', loft: ',', through: ';', finesse: "'", chip: ']' },
};
const k = (t) => `<kbd>${t}</kbd>`;

/** On-screen hints that change with the situation. */
function promptsFor(id, team) {
  const K = KEYS[id];
  const p = team.controlled;
  const b = match.ball;
  if (!p) return '';
  const nextName = team.next ? team.next.name.split(' ').slice(-1)[0] : '';
  const items = [];
  if (match.phase === 'halftime' || match.phase === 'goal') return '';
  if (b.owner === p && p.mustPass) {
    items.push(`${k(K.move)} aim`, `${k(K.pass)} <span class="act">${p.throwIn ? 'Throw' : 'Pass'}</span> → ${nextName}`);
  } else if (b.owner === p) {
    items.push(`${k(K.pass)} <span class="act">Pass</span> → ${nextName}`,
      `${k(K.through)} Through ${k(K.loft)} Lob`,
      `hold ${k(K.shoot)} <span class="act">Shoot</span> ${k(K.finesse)} Curl ${k(K.chip)} Chip`, `${k(K.sprint)} Sprint`);
  } else if (b.owner && b.owner.team !== team.index && (b.owner.holding || b.owner.mustPass)) {
    items.push(b.owner.holding ? '<span class="act">Keeper has it in his hands: get back into position</span>'
      : '<span class="act">Wait for the restart</span>', `${k(K.pass)} Switch \u2192 ${nextName}`);
  } else if (b.owner && b.owner.team !== team.index) {
    items.push(team.tackleTarget ? `${k(K.shoot)} <span class="act">TACKLE NOW!</span>` : `${k(K.shoot)} Tackle (get close)`,
      `${k(K.pass)} Switch → ${nextName}`, `${k(K.sprint)} Sprint`);
  } else if (b.owner) {
    items.push(`${k(K.move)} Get open`, `${k(K.pass)} Switch → ${nextName}`);
  } else {
    items.push(`${k(K.move)} <span class="act">Run to the ball</span>${match.assistName !== 'off' ? ' (assist on)' : ''}`,
      `${k(K.pass)} Switch → ${nextName}`);
  }
  return items.map((t) => `<span>${t}</span>`).join('');
}

const shortCode = (t) => String(t.short || t.code || t.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'TEAM';

/** Match clock as a 90-minute broadcast clock (mm:ss). */
function broadcastClock(state) {
  if (!Number.isFinite(state.duration)) return '00:00';
  const reg = state.regulationDuration || state.duration;
  const total = Math.max(0, (state.clock / reg) * 90 * 60);
  const m = Math.floor(total / 60), sec = Math.floor(total % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Big centre card for goals / half time / full time; restarts get nothing. */
const BANNERS_SHOWN = new Set(['GOAL!', 'HALF TIME', 'FULL TIME', 'EXTRA TIME', 'PENALTY']);
let goalCard = null;
function showGoalCard(team, e) {
  goalCard = { text: e.ownGoal ? 'OWN GOAL' : 'GOAL', name: e.scorer || '', team: shortCode(team.data), color: team.kit.shirt, t: 3.2 };
}

/** The player each team "has": your controlled player, or for the computer the man on the ball / nearest to it. */
function activePlayer(team) {
  if (team.controlled && !team.controlled.sentOff) return team.controlled;
  const b = match.ball;
  if (b.owner && b.owner.team === team.index) return b.owner;
  let best = null, bd = Infinity;
  for (const p of match.players) {
    if (p.team !== team.index || !p.onPitch || p.sentOff) continue;
    const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function updateHud(dt) {
  const [h, a] = match.teams;
  $('scoreHome').textContent = h.score;
  $('scoreAway').textContent = match.practice ? '–' : a.score;
  $('clock').textContent = match.practice ? 'TRAINING'
    : match.phase === 'halftime' ? 'HT' : match.phase === 'fulltime' ? 'FT' : broadcastClock(match);
  const banner = $('banner');
  if (goalCard && goalCard.t > 0) {
    goalCard.t -= dt;
    const html = `<span class="gc-word">${goalCard.text}</span><span class="gc-name"><i style="background:${goalCard.color}"></i>${goalCard.team} · ${goalCard.name}</span>`;
    if (banner.innerHTML !== html) banner.innerHTML = html;
    banner.classList.add('show', 'goal');
  } else if (match.banner && match.phase !== 'fulltime' && BANNERS_SHOWN.has(match.banner.text) && match.banner.text !== 'GOAL!') {
    if (banner.textContent !== match.banner.text) banner.textContent = match.banner.text;
    banner.classList.remove('goal');
    banner.classList.add('show');
  } else {
    banner.classList.remove('show', 'goal');
  }
  if (subTimer > 0) {
    subTimer -= dt;
    if (subTimer <= 0) $('subBanner').classList.remove('show');
  }
  for (const team of match.teams) {
    const panel = $(`teamPanel${team.index}`);
    const p = activePlayer(team);
    const last = (p?.name || '').split(' ');
    const surname = (last.length > 1 ? last.slice(1).join(' ') : last[0]).toUpperCase();
    panel.querySelector('.tp-num').textContent = p ? p.number : '';
    panel.querySelector('.tp-pname').textContent = p ? surname : '';
    panel.querySelector('.tp-tag').textContent = team.human ? team.human.toUpperCase() : '';
    panel.querySelector('.tp-stamina').style.width = `${(p ? p.stamina : 0) * 100}%`;
    panel.querySelector('.tp-power').style.width = `${(p && p.charge ? p.charge : 0) * 100}%`;
    panel.classList.toggle('charging', !!p && p.charge > 0);
    panel.classList.toggle('human', !!team.human);
  }
  drawRadar();
  if (dev.debug) updateDebug();
}

/** Mini-map of the whole pitch: circles for the home side, triangles for the away side. */
function drawRadar() {
  const cv = $('radar');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height, pad = 8;
  const sx = (W - pad * 2) / 105, sz = (H - pad * 2) / 68;
  const X = (x) => pad + (x + 52.5) * sx, Y = (z) => pad + (z + 34) * sz;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(28, 74, 36, 0.62)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1.5;
  g.strokeRect(X(-52.5), Y(-34), 105 * sx, 68 * sz);
  g.beginPath(); g.moveTo(X(0), Y(-34)); g.lineTo(X(0), Y(34)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), 9.15 * sx, 0, Math.PI * 2); g.stroke();
  for (const s of [-1, 1]) {
    g.strokeRect(Math.min(X(s * 52.5), X(s * (52.5 - 16.5))), Y(-20.16), 16.5 * sx, 40.32 * sz);
    g.strokeRect(Math.min(X(s * 52.5), X(s * (52.5 - 5.5))), Y(-9.16), 5.5 * sx, 18.32 * sz);
  }
  for (const p of match.players) {
    if (!p.onPitch || p.sentOff) continue;
    const team = match.teams[p.team];
    const x = X(p.pos.x), y = Y(p.pos.z);
    const controlled = team.controlled === p && team.human;
    g.fillStyle = controlled ? (team.human === 'p1' ? '#22d3ee' : '#f43f5e') : team.kit.shirt;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.lineWidth = 1;
    g.beginPath();
    const r = controlled ? 5.5 : 4;
    if (p.team === 0) g.arc(x, y, r, 0, Math.PI * 2);
    else { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); }
    g.fill(); g.stroke();
  }
  const b = match.ball.pos;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(X(b.x), Y(b.z), 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#000'; g.stroke();
}

function updateDebug() {
  const b = match.ball;
  const f = (v) => v.toFixed(1);
  const lines = [];
  lines.push(`fps ${fps.toFixed(0)}   speed ${dev.speed}%   assist ${match.assistName}`);
  lines.push(`phase ${match.phase}   clock ${f(match.clock)}s`);
  lines.push(`keys down: ${[...input.down].join(' ') || '-'}`);
  const r = input.lastRaw;
  lines.push(`last key: ${r ? `code=${r.code || '∅'} key=${r.key} keyCode=${r.keyCode} → ${r.mapped}` : '-'}`);
  for (const id of ['p1', 'p2']) {
    const team = match.teams.find((t) => t.human === id);
    if (!team) continue;
    const i = lastInputs[id] || {};
    const p = team.controlled;
    lines.push(`${id}: move(${f(i.mx || 0)}, ${f(i.mz || 0)})${i.sprint ? ' sprint' : ''}${i.shootHeld ? ' shoot' : ''}`);
    lines.push(`   you: ${p ? p.name : '-'}${p && p.assisting ? ` [assist: ${p.assisting}]` : ''}`);
    lines.push(`   next: ${team.next ? team.next.name : '-'}   in tackle range: ${team.tackleTarget ? team.tackleTarget.name : 'no'}`);
    lines.push(`   tackles won ${team.tackles.won}/${team.tackles.tries}  last: ${team.tackles.last || '-'}  cooldown ${p ? f(p.tackleCd) : '-'}`);
  }
  const bs = Math.hypot(b.vel.x, b.vel.z);
  lines.push(`ball (${f(b.pos.x)}, ${f(b.pos.y)}, ${f(b.pos.z)}) ${f(bs)} m/s  owner: ${b.owner ? b.owner.name : '-'}`);
  lines.push('AI:');
  for (const p of match.players) {
    if (p.human) continue;
    lines.push(`  ${match.teams[p.team].data.name} ${p.name.split(' ').slice(-1)[0]}: ${p.aiState || '-'}`);
  }
  $('debug').textContent = lines.join('\n');
}

function showFullTime() {
  if (match && !match.practice && settings.mode !== 'penalties' && !drill) {
    const humanSide = match.teams.findIndex((t) => t.human === 'p1');
    frontend.recordResult(match.teams[0].data.id, match.teams[1].data.id, match.teams[0].score, match.teams[1].score, humanSide < 0 ? null : humanSide);
  }
  $('ftTitle').textContent = 'Full time';
  $('ftScorers').classList.remove('hidden');
  $('ftStats').classList.remove('hidden');
  const [h, a] = match.teams;
  $('ftScore').innerHTML = `<span>${h.data.name}</span> <b>${h.score} - ${a.score}</b> <span>${a.data.name}</span>`;
  $('ftScorers').innerHTML = goals
    .map((g) => `<li class="${g.team === 0 ? 'l' : 'r'}">${g.name}${g.own ? ' (og)' : ''} ${g.minute}'</li>`)
    .join('');
  const total = h.possessionTime + a.possessionTime || 1;
  const rows = [
    ['Possession', `${Math.round((100 * h.possessionTime) / total)}%`, `${Math.round((100 * a.possessionTime) / total)}%`],
    ['Shots', h.shots, a.shots],
    ['On target', h.onTarget, a.onTarget],
    ['Cards', `${h.yellowCards}Y / ${h.redCards}R`, `${a.yellowCards}Y / ${a.redCards}R`],
    ['Injuries', h.injuries, a.injuries],
    ['Subs', h.substitutions, a.substitutions],
  ];
  $('ftStats').innerHTML = rows.map(([k, x, y]) => `<tr><td>${x}</td><th>${k}</th><td>${y}</td></tr>`).join('');
  if (settings.mode === 'cup' && cup) {
    advanceCupAfterUserMatch();
    persistCup();
    const roundNames = ['Quarter-final', 'Semi-final', 'Final'];
    const completedRound = cup.lastUserRound;
    const userFixture = cup.history.find((fixture) => fixture.round === completedRound
      && (fixture.home.id === cup.userTeam.id || fixture.away.id === cup.userTeam.id));
    const hasPenaltyScore = Number.isInteger(userFixture?.homePenalties)
      && Number.isInteger(userFixture?.awayPenalties);
    const penaltiesText = userFixture?.shootout
      ? ` ${hasPenaltyScore ? `Penalties ${userFixture.homePenalties}–${userFixture.awayPenalties}` : 'Decided on penalties'} (${userFixture.winner.name} advance).`
      : '';
    $('ftCupNote').textContent = cup.champion
      ? `${cup.eliminated ? 'Eliminated. ' : ''}Decades Cup champion: ${cup.champion.name}.${penaltiesText}`
      : `${roundNames[completedRound] || `Round ${completedRound + 1}`} complete.${penaltiesText} Next: ${cup.matches[0].home.name} vs ${cup.matches[0].away.name}`;
    $('ftCupNote').classList.remove('hidden');
    const results = $('ftCupResults');
    results.replaceChildren(...cup.history.map((fixture) => {
      const item = document.createElement('li');
      const round = roundNames[fixture.round] || `Round ${fixture.round + 1}`;
      const hasPenaltyScore = Number.isInteger(fixture.homePenalties) && Number.isInteger(fixture.awayPenalties);
      const tieBreak = fixture.shootout
        ? hasPenaltyScore ? ` (penalties ${fixture.homePenalties}–${fixture.awayPenalties})` : ' (penalties)'
        : '';
      item.textContent = `${round}: ${fixture.home.name} ${fixture.homeScore}–${fixture.awayScore} ${fixture.away.name}${tieBreak}`;
      return item;
    }));
    results.classList.remove('hidden');
    $('rematchBtn').textContent = cup.champion ? 'Start New Cup' : 'Next Cup Match';
  } else if (settings.mode === 'career' && league) {
    const completedMatchday = league.round + 1;
    advanceLeagueAfterUserMatch();
    const table = leagueStandings();
    const userPlace = table.findIndex((row) => row.team.id === league.userTeam.id) + 1;
    $('ftCupNote').textContent = league.complete
      ? `Season complete. ${league.champion.name} win the league${league.champion.id === league.userTeam.id ? ' — champions!' : '.'}`
      : `Matchday ${completedMatchday} of ${league.schedule.length}. ${league.userTeam.name} are ${userPlace}${userPlace === 1 ? 'st' : userPlace === 2 ? 'nd' : userPlace === 3 ? 'rd' : 'th'}. Next: ${league.schedule[league.round][0].away.id === league.userTeam.id ? league.schedule[league.round][0].home.name : league.schedule[league.round][0].away.name}`;
    $('ftCupNote').classList.remove('hidden');
    const results = $('ftCupResults');
    results.replaceChildren(...table.map((row, index) => {
      const item = document.createElement('li');
      const goalDifference = row.gf - row.ga;
      const sign = goalDifference > 0 ? '+' : '';
      item.textContent = `${index + 1}. ${row.team.name} — ${row.points} pts, ${row.wins}-${row.draws}-${row.losses}, GD ${sign}${goalDifference}`;
      if (row.team.id === league.userTeam.id) item.classList.add('user-row');
      return item;
    }));
    results.classList.remove('hidden');
    $('rematchBtn').textContent = league.complete ? 'Start New Season' : 'Next Matchday';
  } else {
    $('ftCupNote').classList.add('hidden');
    $('ftCupResults').classList.add('hidden');
    $('ftCupResults').replaceChildren();
    $('rematchBtn').textContent = 'Rematch';
  }
  $('fulltime').classList.remove('hidden');
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  if (match) {
    input.pollPads();
    if (input.padStartPressed() && match.phase !== 'fulltime') { setPaused(!paused); input.endStep(); }
    const blocked = paused || !!replayFrames || isOpen('tutorial') || isOpen('devPanel');
    if (!blocked) {
      acc += dt;
      const twoPlayer = settings.mode === '2p';
      const scale = dev.speed / 100;
      match.timeScale = scale;
      while (acc >= FIXED_DT && !replayFrames) {
        const inputs = {
          p1: input.sample('p1', twoPlayer ? [0] : [0, 1, 2, 3]),
          p2: input.sample('p2', [1]),
        };
        lastInputs = inputs;
        input.endStep();
        // Slow motion: each step advances the game by a smaller slice of time.
        stepMatch(match, inputs, FIXED_DT * scale);
        tutorialTick(FIXED_DT, inputs.p1);
        drillTick(FIXED_DT);
        acc -= FIXED_DT;
        if (match.phase !== 'fulltime') captureReplayFrame();
        if (match.events.length) handleEvents();
      }
    } else {
      input.endStep(); // drop key presses while paused or watching a replay
    }
    // The goal replay starts once the live celebration has played out.
    if (pendingReplay) {
      if (match.phase !== 'goal') pendingReplay = null;
      else if (match.phaseTimer <= 1.0 && !replayFrames) { beginGoalReplay(pendingReplay); pendingReplay = null; }
    }
    let renderState = match;
    let alpha = !blocked ? Math.min(1, acc / FIXED_DT) : 1;
    let renderDt = blocked && !replayFrames ? 0 : dt;
    let view = null;
    if (replayFrames) {
      const rate = paused ? 0 : replayRate(replayElapsed);
      replayElapsed += dt * REPLAY_FPS * rate;
      if (replayElapsed >= replayFrames.length - 1) finishReplay();
      else {
        const rv = replayView(replayElapsed);
        renderState = rv.state; alpha = rv.alpha; renderDt = dt * rate;
        view = { replay: { ...replayInfo, t: replayElapsed / REPLAY_FPS, fps: REPLAY_FPS }, realDt: dt };
      }
    }
    // Interpolate between the last two physics steps (or replay snapshots).
    renderer.update(renderState, renderDt, alpha, view);
    updateHud(dt);
  } else {
    renderer.renderIdle(dt);
  }
  requestAnimationFrame(frame);
}

// ---------- front end (menus) ----------
const CUP_ROUNDS = ['Quarter-final', 'Semi-final', 'Final'];
function resolveFixture() {
  if (settings.mode === 'cup') {
    const active = !!(cup && !cup.champion);
    const c = active ? cup : createCup();
    return { home: c.matches[0].home, away: c.matches[0].away, stage: CUP_ROUNDS[c.round] || `Round ${c.round + 1}`, continuing: active };
  }
  if (settings.mode === 'career') {
    const active = !!(league && !league.complete);
    const l = active ? league : createLeague();
    const f = l.schedule[l.round][0];
    return { home: f.home, away: f.away, stage: `Matchday ${l.round + 1} of ${l.schedule.length}`, continuing: active };
  }
  return { home: getTeam(settings.home), away: getTeam(settings.away), continuing: false };
}
function getProgress() {
  const out = { cup: null, league: null };
  if (cup && !cup.champion) {
    const f = cup.matches[0];
    const opp = f.home.id === cup.userTeam.id ? f.away : f.home;
    out.cup = `${CUP_ROUNDS[cup.round] || 'Next round'} · v ${opp.nickname}`;
  }
  if (league && !league.complete) {
    const place = leagueStandings().findIndex((row) => row.team.id === league.userTeam.id) + 1;
    out.league = `Matchday ${league.round + 1}/${league.schedule.length} · ${place}${['st', 'nd', 'rd'][place - 1] || 'th'} place`;
  }
  return out;
}
const frontend = createFrontend({
  settings, getTeam, persistSettings, clearCup, clearLeague,
  poolTeamIds, isPlayable, teamRating, matchKits, eras: ERAS, dataMigration,
  refreshDb() {
    applyDbPrefs();
    // Re-resolve tournament teams so identity changes show everywhere without
    // touching progress (fixtures keep the same team IDs).
    const fresh = (t) => (t ? getTeam(t.id) : t);
    for (const comp of [cup, league]) {
      if (!comp) continue;
      comp.userTeam = fresh(comp.userTeam);
      if (comp.champion) comp.champion = fresh(comp.champion);
      for (const f of [...(comp.matches || []), ...(comp.history || []), ...(comp.schedule || []).flat()]) {
        f.home = fresh(f.home); f.away = fresh(f.away); if (f.winner) f.winner = fresh(f.winner);
      }
    }
  },
  formations: FORMATIONS, indoorFormation: INDOOR_FORMATION,
  resolveFixture, getProgress, startMatch,
  controllers() {
    if (settings.mode === 'career' && !(league && !league.complete)) {
      return resolveFixture().home.id === settings.home ? ['p1', 'ai'] : ['ai', 'p1'];
    }
    return controllers();
  },
  openHowToPlay: () => openTutorialPage(),
  openDevOptions: () => openDevOptions(),
});

buildMenu();
frontend.boot();
// Licensed club logos (if the user has added any) replace the original art.
fetch(`${import.meta.env.BASE_URL}assets/clubs/logos/official/manifest.json`)
  .then((r) => (r.ok ? r.json() : {}))
  .then((map) => {
    if (map && typeof map === 'object' && Object.keys(map).length) { officialLogos = map; applyDbPrefs(); frontend.refresh(); }
  })
  .catch(() => {});
requestAnimationFrame(frame);

// Dev-only handle for debugging in the browser console (stripped from builds).
if (import.meta.env.DEV) {
  window.__legends = {
    get match() { return match; },
    renderer,
  };
}
