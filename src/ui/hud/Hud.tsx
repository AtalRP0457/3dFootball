// In-match HUD in React: broadcast scoreboard, active player of each team,
// radar, goal card, notices and the replay tag. Styling lives in style.css
// (class names unchanged from the DOM version).

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { hudStore } from './hudStore.ts';
import type { HudTeam } from './hudStore.ts';
import type { MatchState } from '../../types/game.ts';

function useHud() {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get);
}

function Scoreboard({ clock, home, away }: { clock: string; home: HudTeam; away: HudTeam }) {
  const stripe = (t: HudTeam) => `linear-gradient(90deg, ${t.colors[0]} 0 50%, ${t.colors[1]} 50% 100%)`;
  return (
    <div id="scoreboard" className="sb" aria-label="Scoreboard">
      <span id="clock" className="sb-clock">{clock}</span>
      <span className="sb-team home"><i className="sb-stripe" style={{ background: stripe(home) }} /><b>{home.code}</b></span>
      <span className="sb-score"><b>{home.score}</b><i /><b>{away.score}</b></span>
      <span className="sb-team away"><b>{away.code}</b><i className="sb-stripe" style={{ background: stripe(away) }} /></span>
    </div>
  );
}

function TeamPanel({ team, side }: { team: HudTeam; side: 'left' | 'right' }) {
  if (team.hidden) return null;
  const a = team.active;
  const crest = team.crest ? <img className="tp-crest" src={team.crest} alt="" /> : null;
  const name = (
    <div className="tp-name">
      {side === 'right' && a?.human ? <em className="tp-tag">{a.human}</em> : null}
      <b className="tp-num">{a?.number ?? ''}</b>
      <span className="tp-pname">{a?.surname ?? ''}</span>
      {side === 'left' && a?.human ? <em className="tp-tag">{a.human}</em> : null}
    </div>
  );
  return (
    <div className={`tpanel ${side}${a && a.charge > 0 ? ' charging' : ''}`} style={{ ['--team' as string]: team.colors[0] }}>
      {side === 'left' ? crest : null}
      <div className="tp-body">
        {name}
        <div className="tp-bars">
          <i className="tp-stamina" style={{ width: `${(a?.stamina ?? 0) * 100}%` }} />
          <i className="tp-power" style={{ width: `${(a?.charge ?? 0) * 100}%` }} />
        </div>
      </div>
      {side === 'right' ? crest : null}
    </div>
  );
}

/** Mini-map of the whole pitch: circles for the home side, triangles for the away side. */
function Radar() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const m = hudStore.match();
      const cv = ref.current;
      if (!m || !cv) return;
      drawRadar(cv, m);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas id="radar" ref={ref} width={300} height={196} aria-label="Radar" />;
}

function drawRadar(cv: HTMLCanvasElement, m: MatchState) {
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width, H = cv.height, pad = 8;
  const sx = (W - pad * 2) / 105, sz = (H - pad * 2) / 68;
  const X = (x: number) => pad + (x + 52.5) * sx, Y = (z: number) => pad + (z + 34) * sz;
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
  for (const p of m.players) {
    if (!p.onPitch || p.sentOff) continue;
    const team = m.teams[p.team];
    const x = X(p.pos.x), y = Y(p.pos.z);
    const controlled = team.controlled === p && !!team.human;
    g.fillStyle = controlled ? (team.human === 'p1' ? '#22d3ee' : '#f43f5e') : team.kit.shirt;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.lineWidth = 1;
    g.beginPath();
    const r = controlled ? 5.5 : 4;
    if (p.team === 0) g.arc(x, y, r, 0, Math.PI * 2);
    else { g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); }
    g.fill(); g.stroke();
  }
  const b = m.ball.pos;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(X(b.x), Y(b.z), 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#000'; g.stroke();
}

export function Hud() {
  const s = useHud();
  if (!s.visible) return null;
  const [home, away] = s.teams;
  return (
    <>
      <Scoreboard clock={s.clock} home={home} away={away} />
      <TeamPanel team={home} side="left" />
      <TeamPanel team={away} side="right" />
      {/* The radar shows the live match, so it is hidden while a replay plays. */}
      {s.replay ? <div id="replayTag">REPLAY</div> : <Radar />}
      {s.goalCard ? (
        <div id="banner" className="show goal">
          <span className="gc-word">{s.goalCard.word}</span>
          <span className="gc-name"><i style={{ background: s.goalCard.color }} />{s.goalCard.team} · {s.goalCard.name}</span>
        </div>
      ) : s.banner ? <div id="banner" className="show">{s.banner}</div> : null}
      {s.notice ? <div id="subBanner" className="show">{s.notice}</div> : null}
    </>
  );
}

/** Mount the HUD into the page (called once by the game). */
export function mountHud(el: HTMLElement): void {
  createRoot(el).render(<Hud />);
}
