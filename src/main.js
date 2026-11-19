import './style.css';
import { TEAMS, getTeam } from './data/teams.js';
import { createMatch, stepMatch, displayMinute } from './game/match.js';
import { FIXED_DT } from './game/constants.js';
import { Input } from './game/input.js';
import { createRenderer } from './render/scene.js';

const $ = (id) => document.getElementById(id);

// ---------- settings chosen in the menu ----------
const settings = {
  mode: '1p',
  home: '1960',
  away: '1990',
  difficulty: 'normal',
  duration: 240,
  era: 'on',
};

const renderer = createRenderer($('game'));
const input = new Input();
let match = null;
let paused = false;
let goals = [];
let acc = 0;

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
  seg('modeSeg', 'mode');
  seg('diffSeg', 'difficulty');
  seg('lenSeg', 'duration', Number);
  seg('eraSeg', 'era');
  $('startBtn').addEventListener('click', startMatch);
  setupTutorial();
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('restartBtn').addEventListener('click', startMatch);
  $('quitBtn').addEventListener('click', toMenu);
  $('rematchBtn').addEventListener('click', startMatch);
  $('menuBtn').addEventListener('click', toMenu);
  refreshMenu();
}

function refreshMenu() {
  const segOn = (id, v) => $(id).querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  segOn('modeSeg', settings.mode);
  segOn('diffSeg', settings.difficulty);
  segOn('lenSeg', settings.duration);
  segOn('eraSeg', settings.era);
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
  }[settings.mode];
  $('homeLabel').innerHTML = labels[0];
  $('awayLabel').innerHTML = labels[1];
  $('diffRow').style.display = settings.mode === '2p' ? 'none' : '';
}

// ---------- tutorial page ----------
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
  $('tutNext').textContent = tutStep === TUT_STEPS - 1 ? 'Done' : 'Next \u2192';
}
function openTutorial() {
  showTutStep(0);
  $('tutorial').classList.remove('hidden');
}
function closeTutorial() {
  $('tutorial').classList.add('hidden');
}
function setupTutorial() {
  $('tutorialBtn').addEventListener('click', openTutorial);
  $('pauseTutorialBtn').addEventListener('click', openTutorial);
  $('tutClose').addEventListener('click', closeTutorial);
  $('tutPrev').addEventListener('click', () => showTutStep(tutStep - 1));
  $('tutNext').addEventListener('click', () => {
    if (tutStep === TUT_STEPS - 1) closeTutorial(); else showTutStep(tutStep + 1);
  });
  $('tutTabs').querySelectorAll('button')
    .forEach((b) => b.addEventListener('click', () => showTutStep(Number(b.dataset.step))));
}
const tutorialOpen = () => !$('tutorial').classList.contains('hidden');

// ---------- era look ----------
function eraFilter(home, away) {
  if (settings.era !== 'on') return 'none';
  const year = Math.min(Number(home.id), Number(away.id));
  // Kept mild so the green / yellow / red player rings stay readable.
  if (year < 1950) return 'sepia(0.4) contrast(1.08)';
  if (year < 1970) return 'grayscale(0.45) contrast(1.1)';
  if (year < 1980) return 'saturate(1.3) contrast(1.05)';
  return 'none';
}

// ---------- match flow ----------
function controllers() {
  if (settings.mode === '2p') return ['p1', 'p2'];
  if (settings.mode === 'cpu') return ['ai', 'ai'];
  return ['p1', 'ai'];
}

function startMatch() {
  const home = getTeam(settings.home), away = getTeam(settings.away);
  match = createMatch({
    home, away, controllers: controllers(),
    difficulty: settings.difficulty, duration: settings.duration,
  });
  goals = [];
  acc = 0;
  renderer.setMatch(match);
  $('game').style.filter = eraFilter(home, away);

  $('homeName').textContent = home.name;
  $('awayName').textContent = away.name;
  $('homeChip').style.background = match.teams[0].kit.shirt;
  $('awayChip').style.background = match.teams[1].kit.shirt;
  $('p1panel').style.display = match.teams.some((t) => t.human === 'p1') ? '' : 'none';
  $('p2panel').style.display = match.teams.some((t) => t.human === 'p2') ? '' : 'none';
  // P1 panel sits on the side of the team P1 controls.
  const p1Team = match.teams.find((t) => t.human === 'p1');
  $('p1panel').classList.toggle('right', !!p1Team && p1Team.index === 1);

  $('menu').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('hud').classList.remove('hidden');
  setPaused(false);
  input.enabled = true;
  $('game').focus?.();
}

function toMenu() {
  match = null;
  paused = false;
  input.enabled = false;
  $('game').style.filter = 'none';
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('menu').classList.remove('hidden');
}

function setPaused(v) {
  paused = v;
  $('pause').classList.toggle('hidden', !v);
}

window.addEventListener('keydown', (e) => {
  if (tutorialOpen()) {
    if (e.code === 'Escape') closeTutorial();
    else if (e.code === 'ArrowRight') showTutStep(tutStep + 1);
    else if (e.code === 'ArrowLeft') showTutStep(tutStep - 1);
    return;
  }
  if (!match) {
    const onButton = e.target && e.target.tagName === 'BUTTON';
    if (e.code === 'Enter' && !onButton && !$('menu').classList.contains('hidden')) startMatch();
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
    if (e.type === 'goal') {
      const team = match.teams[e.team];
      goals.push({ team: e.team, name: e.scorer, own: e.ownGoal, minute: Math.max(1, displayMinute(match)) });
      showSub(`${e.ownGoal ? 'Own goal: ' : ''}${e.scorer} (${team.data.name})`, 2.4);
    } else if (e.type === 'woodwork') {
      showSub(e.what === 'bar' ? 'Off the crossbar!' : 'Off the post!', 1.2);
    } else if (e.type === 'save' && Math.random() < 0.6) {
      showSub(e.parry ? 'Great save!' : 'Safe hands', 1.0);
    } else if (e.type === 'fulltime') {
      showFullTime();
    }
  }
  match.events.length = 0;
}

function updateHud(dt) {
  const [h, a] = match.teams;
  $('score').textContent = `${h.score} - ${a.score}`;
  $('clock').textContent = `${displayMinute(match)}'`;
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
  }
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
  $('ftStats').innerHTML = rows.map(([k, x, y]) => `<tr><td>${x}</td><th>${k}</th><td>${y}</td></tr>`).join('');
  $('fulltime').classList.remove('hidden');
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (match) {
    input.pollPads();
    if (input.padStartPressed() && match.phase !== 'fulltime') { setPaused(!paused); input.endStep(); }
    if (!paused) {
      acc += dt;
      const onePlayer = settings.mode === '1p';
      while (acc >= FIXED_DT) {
        const inputs = {
          p1: input.sample(onePlayer ? ['p1', 'p2'] : ['p1'], onePlayer ? [0, 1, 2, 3] : [0]),
          p2: input.sample(['p2'], [1]),
        };
        input.endStep();
        stepMatch(match, inputs, FIXED_DT);
        acc -= FIXED_DT;
        if (match.events.length) handleEvents();
      }
    } else {
      input.endStep(); // drop key presses made while paused
    }
    renderer.update(match, paused ? 0 : dt);
    updateHud(dt);
  } else {
    renderer.renderIdle(dt);
  }
  requestAnimationFrame(frame);
}

buildMenu();
requestAnimationFrame(frame);
