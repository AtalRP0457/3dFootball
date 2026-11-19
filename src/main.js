import './style.css';
import { TEAMS, getTeam } from './data/teams.js';
import { createMatch, stepMatch, displayMinute, makeSubstitution, cancelPendingSubstitution, setTeamTactic, setTeamFormation } from './game/match.js';
import { FIXED_DT } from './game/constants.js';
import { Input } from './game/input.js';
import { createRenderer } from './render/scene.js';
import { MatchAudio } from './render/audio.js';

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
const audio = new MatchAudio();
let match = null;
let cup = loadCup();
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
const REPLAY_FRAMES = REPLAY_FPS * 6;
let replayBuffer = [];
let replayFrames = null;
let replayElapsed = 0;
let replayCaptureElapsed = 0;

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

function teamCard(team, side) {
  const el = document.createElement('button');
  el.className = 'team';
  el.dataset.id = team.id;
  el.innerHTML = `
    <span class="kit"><i style="background:${team.kit.shirt}"></i><i style="background:${team.kit.shorts}"></i></span>
    <span class="tn">${team.name}</span>
    <span class="nick">${team.nickname}</span>`;
  el.addEventListener('click', () => {
    settings[side] = team.id;
    if (settings.mode === 'cup') clearCup();
    if (settings.mode === 'career') clearLeague();
    refreshMenu();
  });
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
      if (key === 'mode' && settings.mode !== 'cup') clearCup();
      if (key === 'mode' && settings.mode !== 'career') clearLeague();
      refreshMenu();
    }));
  };
  seg('modeSeg', 'mode');
  seg('diffSeg', 'difficulty');
  seg('lenSeg', 'duration', Number);
  seg('eraSeg', 'era');
  $('startBtn').addEventListener('click', startMatch);
  $('audioToggle').addEventListener('click', () => {
    $('audioToggle').textContent = audio.toggle() ? 'Sound: On' : 'Sound: Off';
  });
  $('replaySkip').addEventListener('click', finishReplay);
  setupTutorial();
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
  refreshMenu();
}

function clearCup() {
  cup = null;
  try { localStorage.removeItem('legends-decades-cup'); } catch {}
}

function loadCup() {
  try {
    const saved = JSON.parse(localStorage.getItem('legends-decades-cup') || 'null');
    if (!saved) return null;
    const teamById = (id) => TEAMS.find((team) => team.id === id) || null;
    const restoreFixture = (fixture) => {
      const home = teamById(fixture.homeId), away = teamById(fixture.awayId);
      if (!home || !away) return null;
      return {
        home, away, winner: teamById(fixture.winnerId),
        homeScore: fixture.homeScore, awayScore: fixture.awayScore,
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
    const teamById = (id) => TEAMS.find((team) => team.id === id) || null;
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
    }));
  } catch {}
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
    cup: ['Cup team <span class="who p1">P1</span>', 'Opening opponent <span class="who ai">AI</span>'],
    career: ['Career team <span class="who p1">P1</span>', 'First opponent <span class="who ai">AI</span>'],
  }[settings.mode];
  $('homeLabel').innerHTML = labels[0];
  const careerFixture = settings.mode === 'career' && league && !league.complete
    ? league.schedule[league.round][0]
    : null;
  const careerOpponent = careerFixture && (careerFixture.home.id === league.userTeam.id ? careerFixture.away : careerFixture.home);
  $('awayLabel').innerHTML = careerOpponent
    ? `${careerOpponent.name} <span class="who ai">AI</span>`
    : labels[1];
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

function createLeague() {
  const userTeam = getTeam(settings.home);
  let preferred = getTeam(settings.away);
  if (preferred.id === userTeam.id) {
    const index = TEAMS.findIndex((team) => team.id === userTeam.id);
    preferred = TEAMS[(index + 1) % TEAMS.length];
  }
  const rotation = [
    userTeam,
    ...TEAMS.filter((team) => team.id !== userTeam.id && team.id !== preferred.id),
    preferred,
  ];
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
  const home = getTeam(settings.home);
  const away = getTeam(settings.away);
  const participants = [home];
  if (away.id !== home.id) participants.push(away);
  let next = (TEAMS.findIndex((team) => team.id === away.id) + 1) % TEAMS.length;
  while (participants.length < 8) {
    const team = TEAMS[next];
    if (!participants.some((entry) => entry.id === team.id)) participants.push(team);
    next = (next + 1) % TEAMS.length;
  }
  if (participants[1].id === home.id) participants.splice(1, 1, TEAMS[next]);
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
    if (scores[0] > scores[1] + remaining) return home;
    if (scores[1] > scores[0] + remaining) return away;
  }
  for (let i = 5; i < 15 && scores[0] === scores[1]; i++) {
    take(homeShooters, awayKeeper, i, 0);
    take(awayShooters, homeKeeper, i, 1);
  }
  return scores[0] === scores[1] ? (Math.random() < 0.5 ? home : away) : scores[0] > scores[1] ? home : away;
}

function simulateCupFixture(fixture, round) {
  if (fixture.winner) return;
  simulateAiMatch(fixture);
  fixture.shootout = fixture.homeScore === fixture.awayScore;
  fixture.winner = fixture.shootout
    ? shootoutWinner(fixture.home, fixture.away)
    : fixture.homeScore > fixture.awayScore ? fixture.home : fixture.away;
  fixture.round = round;
  cup.history.push(fixture);
}

function leagueStandings() {
  const table = TEAMS.map((team) => ({ team, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }));
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
  fixture.shootout = fixture.homeScore === fixture.awayScore;
  fixture.winner = fixture.shootout
    ? shootoutWinner(fixture.home, fixture.away)
    : fixture.homeScore > fixture.awayScore ? fixture.home : fixture.away;
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
  match = createMatch({
    home, away, controllers: controllers(),
    difficulty: settings.difficulty, duration: settings.duration,
  });
  goals = [];
  acc = 0;
  replayBuffer = [];
  replayFrames = null;
  replayElapsed = replayCaptureElapsed = 0;
  $('replaySkip').classList.add('hidden');
  renderer.setMatch(match);
  $('game').style.filter = eraFilter(home, away);

  $('homeName').textContent = home.name;
  $('awayName').textContent = away.name;
  $('homeChip').style.background = match.teams[0].kit.shirt;
  $('awayChip').style.background = match.teams[1].kit.shirt;
  $('p1panel').style.display = match.teams.some((t) => t.human === 'p1') ? '' : 'none';
  $('p2panel').style.display = match.teams.some((t) => t.human === 'p2') ? '' : 'none';
  $('subsBtn').classList.toggle('hidden', !match.teams.some((t) => t.human));
  $('subsPanel').classList.add('hidden');
  // P1 panel sits on the side of the team P1 controls.
  const p1Team = match.teams.find((t) => t.human === 'p1');
  $('p1panel').classList.toggle('right', !!p1Team && p1Team.index === 1);

  $('menu').classList.add('hidden');
  $('fulltime').classList.add('hidden');
  $('subsBtn').classList.add('hidden');
  $('hud').classList.remove('hidden');
  setPaused(false);
  input.enabled = true;
  $('game').focus?.();
}

function toMenu() {
  audio.setInMatch(false);
  match = null;
  replayFrames = null;
  replayBuffer = [];
  $('replaySkip').classList.add('hidden');
  paused = false;
  input.enabled = false;
  $('game').style.filter = 'none';
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('subsPanel').classList.add('hidden');
  $('subsBtn').classList.remove('hidden');
  $('fulltime').classList.add('hidden');
  $('menu').classList.remove('hidden');
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
  } else if (e.code === 'KeyR' && replayFrames) {
    finishReplay();
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

function snapshotForRender(state) {
  const players = state.players.map((p) => ({
    ...p,
    pos: { ...p.pos },
    vel: { ...p.vel },
    face: { ...p.face },
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
  if (replayBuffer.length > REPLAY_FRAMES) replayBuffer.shift();
}

function beginGoalReplay() {
  if (replayFrames || replayBuffer.length < REPLAY_FPS) return;
  captureReplayFrame(true);
  replayFrames = replayBuffer.slice(-REPLAY_FPS * 4);
  replayElapsed = 0;
  $('replaySkip').classList.remove('hidden');
  showSub('GOAL REPLAY · press R to skip', 4.2);
}

function finishReplay() {
  replayFrames = null;
  replayElapsed = 0;
  $('replaySkip').classList.add('hidden');
}

function handleEvents() {
  for (const e of match.events) {
    audio.playEvent(e);
    if (e.type === 'goal') {
      const team = match.teams[e.team];
      goals.push({ team: e.team, name: e.scorer, own: e.ownGoal, minute: Math.max(1, displayMinute(match)) });
      showSub(`${e.ownGoal ? 'Own goal: ' : ''}${e.scorer} (${team.data.name})`, 2.4);
      beginGoalReplay();
    } else if (e.type === 'woodwork') {
      showSub(e.what === 'bar' ? 'Off the crossbar!' : 'Off the post!', 1.2);
    } else if (e.type === 'save' && Math.random() < 0.6) {
      showSub(e.parry ? 'Great save!' : 'Safe hands', 1.0);
    } else if (e.type === 'offside') {
      showSub(`${match.players[e.player].name} offside`, 1.5);
    } else if (e.type === 'foul') {
      showSub(e.penalty ? 'Foul — penalty awarded' : 'Foul — free kick', 1.8);
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
      showSub(`${match.teams[e.team].data.name}: ${e.tactic} tactics`, 1.8);
    } else if (e.type === 'formation') {
      showSub(`${match.teams[e.team].data.name}: ${e.formation}`, 1.8);
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
    panel.querySelector('.pname').textContent = p ? `${p.number}  ${p.name}${p.injured ? ' · INJ' : ''}` : '';
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
    $('ftCupNote').textContent = cup.champion
      ? `${cup.eliminated ? 'Eliminated. ' : ''}Decades Cup champion: ${cup.champion.name}`
      : `${roundNames[completedRound] || `Round ${completedRound + 1}`} complete. Next: ${cup.matches[0].home.name} vs ${cup.matches[0].away.name}`;
    $('ftCupNote').classList.remove('hidden');
    const results = $('ftCupResults');
    results.replaceChildren(...cup.history.map((fixture) => {
      const item = document.createElement('li');
      const round = roundNames[fixture.round] || `Round ${fixture.round + 1}`;
      const tieBreak = fixture.shootout ? ' (penalties)' : '';
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

  if (match) {
    input.pollPads();
    if (input.padStartPressed() && match.phase !== 'fulltime') { setPaused(!paused); input.endStep(); }
    if (!paused && !replayFrames) {
      acc += dt;
      const onePlayer = settings.mode === '1p';
      while (acc >= FIXED_DT && !replayFrames) {
        const inputs = {
          p1: input.sample(onePlayer ? ['p1', 'p2'] : ['p1'], onePlayer ? [0, 1, 2, 3] : [0]),
          p2: input.sample(['p2'], [1]),
        };
        input.endStep();
        stepMatch(match, inputs, FIXED_DT);
        acc -= FIXED_DT;
        if (match.phase !== 'fulltime') captureReplayFrame();
        if (match.events.length) handleEvents();
      }
    } else {
      input.endStep(); // drop key presses while paused or watching a replay
    }
    let renderState = match;
    if (!paused && replayFrames) {
      replayElapsed += dt;
      const frameIndex = Math.floor(replayElapsed * REPLAY_FPS);
      if (frameIndex >= replayFrames.length) finishReplay();
      else renderState = replayFrames[frameIndex];
    }
    renderer.update(renderState, paused ? 0 : dt);
    updateHud(dt);
  } else {
    renderer.renderIdle(dt);
  }
  requestAnimationFrame(frame);
}

buildMenu();
requestAnimationFrame(frame);
