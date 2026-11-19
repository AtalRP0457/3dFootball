import './style.css';
import { TEAMS, getTeam } from './data/teams.js';
import { createMatch, stepMatch, displayMinute, setControlled } from './game/match.js';
import { FIXED_DT } from './game/constants.js';
import { Input } from './game/input.js';
import { createRenderer } from './render/scene.js';

const $ = (id) => document.getElementById(id);

// ---------- settings ----------
const settings = {
  mode: '1p', // 1p | 2p | cpu | practice | tutorial
  home: '1960',
  away: '1990',
  difficulty: 'normal',
  duration: 240,
  era: 'on',
  assist: 'assisted',
};

// Developer options are remembered between visits (when the browser allows).
const DEV_DEFAULTS = { speed: 75, debug: false };
const dev = { ...DEV_DEFAULTS };
try { Object.assign(dev, JSON.parse(localStorage.getItem('legends-dev') || '{}')); } catch { /* ignore */ }
function saveDev() {
  try { localStorage.setItem('legends-dev', JSON.stringify(dev)); } catch { /* ignore */ }
}

const renderer = createRenderer($('game'));
const input = new Input();
let match = null;
let paused = false;
let goals = [];
let acc = 0;
let fps = 60;
let lastInputs = {};

// ---------- menu ----------
function teamCard(team, side) {
  const el = document.createElement('button');
  el.className = 'team';
  el.dataset.id = team.id;
  el.innerHTML = `
    <span class="kit"><i style="background:${team.kit.shirt}"></i><i style="background:${team.kit.shorts}"></i></span>
    <span class="tn">${team.name}</span>
    <span class="nick">${team.nickname}</span>`;
  el.addEventListener('click', () => { settings[side] = team.id; refreshMenu(); });
  return el;
}

function buildMenu() {
  for (const t of TEAMS) {
    $('homeGrid').appendChild(teamCard(t, 'home'));
    $('awayGrid').appendChild(teamCard(t, 'away'));
  }
  const seg = (id, key, cast = (v) => v) => {
    $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      settings[key] = cast(b.dataset.v);
      refreshMenu();
    }));
  };
  // Step 1: picking a mode moves on to the team screen (tutorial starts at once).
  $('modeSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => chooseMode(b.dataset.v)));
  $('backBtn').addEventListener('click', () => showStep(1));
  seg('diffSeg', 'difficulty');
  seg('lenSeg', 'duration', Number);
  seg('eraSeg', 'era');
  seg('assistSeg', 'assist');
  $('startBtn').addEventListener('click', startMatch);
  setupTutorialPage();
  setupDevPanel();
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('restartBtn').addEventListener('click', startMatch);
  $('quitBtn').addEventListener('click', toMenu);
  $('rematchBtn').addEventListener('click', startMatch);
  $('menuBtn').addEventListener('click', toMenu);
  refreshMenu();
}

let menuStep = 1;
function showStep(n) {
  menuStep = n;
  $('menuStep1').classList.toggle('hidden', n !== 1);
  $('menuStep2').classList.toggle('hidden', n !== 2);
  refreshMenu();
}

function chooseMode(mode) {
  settings.mode = mode;
  if (mode === 'tutorial') { startMatch(); return; }
  showStep(2);
}

const STEP2_TITLES = {
  '1p': 'Pick your team and your opponent',
  '2p': 'Player 1 and player 2: pick your teams',
  practice: 'Pick your team',
  cpu: 'Pick two teams to watch',
};

const ASSIST_HINTS = {
  off: 'Pure manual control.',
  assisted: 'Press roughly towards the ball and your player runs onto it. Bigger tackle range.',
  full: 'Like Assisted, and your player chases a loose ball even with no keys pressed.',
};

function refreshMenu() {
  const segOn = (id, v) => $(id).querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  segOn('modeSeg', settings.mode);
  segOn('diffSeg', settings.difficulty);
  segOn('lenSeg', settings.duration);
  segOn('eraSeg', settings.era);
  segOn('assistSeg', settings.assist);
  $('assistHint').textContent = ASSIST_HINTS[settings.assist];
  for (const side of ['home', 'away']) {
    $(`${side}Grid`).querySelectorAll('.team')
      .forEach((b) => b.classList.toggle('on', b.dataset.id === settings[side]));
    $(`${side}Lineup`).innerHTML = getTeam(settings[side]).players
      .map((p) => `<li><b>${p.number}</b> ${p.name}</li>`).join('');
  }
  const labels = {
    '1p': ['Your team <span class="who p1">P1</span>', 'Opponent <span class="who ai">AI</span>'],
    '2p': ['Player 1 <span class="who p1">P1</span>', 'Player 2 <span class="who p2">P2</span>'],
    cpu: ['Home <span class="who ai">AI</span>', 'Away <span class="who ai">AI</span>'],
    practice: ['Your team <span class="who p1">P1</span>', 'Their keeper <span class="who ai">AI</span>'],
    tutorial: ['Your team <span class="who p1">P1</span>', 'Their keeper <span class="who ai">AI</span>'],
  }[settings.mode];
  $('homeLabel').innerHTML = labels[0];
  $('awayLabel').innerHTML = labels[1];
  const vsAi = settings.mode === '1p' || settings.mode === 'cpu';
  $('diffRow').style.display = vsAi ? '' : 'none';
  $('lenRow').style.display = settings.mode === 'practice' || settings.mode === 'tutorial' ? 'none' : '';
  $('startBtn').textContent = settings.mode === 'tutorial' ? 'START TUTORIAL'
    : settings.mode === 'practice' ? 'START PRACTICE' : 'KICK OFF';
  $('step2Title').textContent = STEP2_TITLES[settings.mode] || 'Pick your teams';
  const diffName = { beginner: 'Beginner', easy: 'Easy', normal: 'Normal', hard: 'Hard' }[settings.difficulty];
  const parts = [];
  if (vsAi) parts.push(diffName);
  parts.push({ off: 'Assist off', assisted: 'Assist on', full: 'Full assist' }[settings.assist]);
  if (settings.mode !== 'practice' && settings.mode !== 'tutorial') parts.push(`${settings.duration / 60} min`);
  $('optSummary').textContent = `(${parts.join(' \u00b7 ')})`;
}

// ---------- "How to play" page ----------
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
  $('tutorialBtn').addEventListener('click', openTutorialPage);
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
  $('devBtn').addEventListener('click', open);
  $('pauseDevBtn').addEventListener('click', open);
  $('devClose').addEventListener('click', () => $('devPanel').classList.add('hidden'));
  $('drillTackleBtn').addEventListener('click', startTackleDrill);
  $('drillPracticeBtn').addEventListener('click', () => { settings.mode = 'practice'; refreshMenu(); startMatch(); });
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
  b.pos.x = 8; b.pos.z = 7; b.pos.y = 0.22;
  b.vel.x = b.vel.y = b.vel.z = 0;
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
  refreshMenu();
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
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.pos.x = victim.pos.x - 0.75; b.pos.z = victim.pos.z; b.pos.y = 0.22;
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
  return ['p1', 'ai'];
}

function startMatch() {
  // Make sure no menu button keeps keyboard focus (Space would "click" it).
  document.activeElement?.blur?.();
  const home = getTeam(settings.home), away = getTeam(settings.away);
  const practice = settings.mode === 'practice' || settings.mode === 'tutorial';
  match = createMatch({
    home, away, controllers: controllers(),
    difficulty: settings.difficulty, duration: settings.duration,
    timeScale: dev.speed / 100,
    assist: settings.assist,
    practice,
  });
  goals = [];
  acc = 0;
  tut = null;
  drill = null;
  if (settings.mode === 'tutorial') startTutorialState();
  renderTutorial();
  renderer.setMatch(match);
  $('game').style.filter = eraFilter(home, away);

  $('homeName').textContent = home.name;
  $('awayName').textContent = practice ? 'PRACTICE' : away.name;
  $('homeChip').style.background = match.teams[0].kit.shirt;
  $('awayChip').style.background = match.teams[1].kit.shirt;
  $('p1panel').style.display = match.teams.some((t) => t.human === 'p1') ? '' : 'none';
  $('p2panel').style.display = match.teams.some((t) => t.human === 'p2') ? '' : 'none';
  $('p1panel').classList.remove('right');
  $('debug').classList.toggle('hidden', !dev.debug);

  $('menu').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('devPanel').classList.add('hidden');
  $('hud').classList.remove('hidden');
  setPaused(false);
  input.enabled = true;
}

function toMenu() {
  match = null;
  tut = null;
  drill = null;
  paused = false;
  input.enabled = false;
  $('game').style.filter = 'none';
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('menu').classList.remove('hidden');
  showStep(1);
  renderTutorial();
}

function setPaused(v) {
  paused = v;
  $('pause').classList.toggle('hidden', !v);
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
    const onButton = e.target && e.target.tagName === 'BUTTON';
    if (!isOpen('menu')) return;
    if (e.code === 'Enter' && !onButton) {
      if (menuStep === 1) chooseMode(settings.mode); else startMatch();
    } else if (e.code === 'Escape' && menuStep === 2) {
      showStep(1);
    }
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (match.phase !== 'fulltime') setPaused(!paused);
  } else if (e.code === 'KeyC') {
    showSub(`Camera: ${renderer.cycleCamera()}`);
  }
});
window.addEventListener('resize', () => renderer.resize());

// ---------- HUD ----------
let subTimer = 0;
function showSub(text, time = 1.6) {
  $('subBanner').textContent = text;
  $('subBanner').classList.add('show');
  subTimer = time;
}

function handleEvents() {
  for (const e of match.events) {
    tutorialEvent(e);
    if (e.type === 'goal') {
      const team = match.teams[e.team];
      goals.push({ team: e.team, name: e.scorer, own: e.ownGoal, minute: Math.max(1, displayMinute(match)) });
      showSub(`${e.ownGoal ? 'Own goal: ' : ''}${e.scorer} (${team.data.name})`, 2.4);
    } else if (e.type === 'woodwork') {
      showSub(e.what === 'bar' ? 'Off the crossbar!' : 'Off the post!', 1.2);
    } else if (e.type === 'save' && Math.random() < 0.6) {
      showSub(e.parry ? 'Great save!' : 'Safe hands', 1.0);
    } else if (e.type === 'tackle' && e.human) {
      const msg = {
        won: 'Ball won!', missed: 'Tackle missed: try again',
        'too far': 'Too far: get closer (wait for the orange ring)',
        keeper: 'Keeper has it in his hands: you can\u2019t tackle him', nothing: 'Nobody in range to tackle',
        'set piece': 'Wait until the restart is taken',
      }[e.result];
      if (msg) showSub(msg, 1.2);
      if (drill) renderTutorial();
    } else if (e.type === 'halftime') {
      showSub('Teams change ends', 2.4);
    } else if (e.type === 'fulltime') {
      showFullTime();
    }
  }
  match.events.length = 0;
}

const KEYS = {
  p1: { move: 'W A S D', pass: 'F', shoot: 'G', sprint: 'L-Shift' },
  p2: { move: 'Arrows', pass: '.', shoot: '/', sprint: 'R-Shift' },
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
      `hold ${k(K.shoot)} <span class="act">Shoot</span>`, `${k(K.sprint)} Sprint`);
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

function updateHud(dt) {
  const [h, a] = match.teams;
  $('score').textContent = match.practice ? `${h.score}` : `${h.score} - ${a.score}`;
  $('clock').textContent = match.practice ? '' : `${displayMinute(match)}'`;
  const banner = $('banner');
  if (match.banner && match.phase !== 'fulltime') {
    banner.textContent = match.banner.text;
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
  if (subTimer > 0) {
    subTimer -= dt;
    if (subTimer <= 0) $('subBanner').classList.remove('show');
  }
  for (const id of ['p1', 'p2']) {
    const team = match.teams.find((t) => t.human === id);
    if (!team) continue;
    const panel = $(`${id}panel`);
    const p = team.controlled;
    panel.querySelector('.pname').textContent = p ? `${p.number}  ${p.name}` : '';
    const n = team.next;
    panel.querySelector('.pnext span').textContent = n ? `${n.number}  ${n.name}` : '-';
    panel.querySelector('.stamina i').style.width = `${(p ? p.stamina : 0) * 100}%`;
    panel.querySelector('.power i').style.width = `${(p ? p.charge : 0) * 100}%`;
    panel.classList.toggle('charging', !!p && p.charge > 0);
    const html = promptsFor(id, team);
    const box = panel.querySelector('.prompts');
    if (box.innerHTML !== html) box.innerHTML = html;
  }
  if (dev.debug) updateDebug();
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
  ];
  $('ftStats').innerHTML = rows.map(([x, y, z]) => `<tr><td>${y}</td><th>${x}</th><td>${z}</td></tr>`).join('');
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
    const blocked = paused || isOpen('tutorial') || isOpen('devPanel');
    if (!blocked) {
      acc += dt;
      const twoPlayer = settings.mode === '2p';
      const scale = dev.speed / 100;
      match.timeScale = scale;
      while (acc >= FIXED_DT) {
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
        if (match.events.length) handleEvents();
      }
    } else {
      input.endStep(); // drop key presses made while paused
    }
    renderer.update(match, blocked ? 0 : dt);
    updateHud(dt);
  } else {
    renderer.renderIdle(dt);
  }
  requestAnimationFrame(frame);
}

buildMenu();
requestAnimationFrame(frame);
