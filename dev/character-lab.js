// Dev-only page: inspect any squad's players full screen with the same
// viewer, identity and character code as the game. Open /dev/character-lab.html
// ?team=bay&i=4&anim=idle&view=front&zoom=0
import { sharedPlayerViewer, VIEWER_ANIMS } from '../src/render/playerViewer.js';
import { buildTeam, kitFor } from '../src/db/teams.ts';

const q = new URLSearchParams(location.search);
const team = buildTeam(q.get('team') || 'bay', q.get('kit') || 'home');
let i = Number(q.get('i') ?? team.players.findIndex((p) => p.captain));
const viewer = sharedPlayerViewer();
viewer.mount(document.getElementById('stage'));

function show() {
  const pd = team.players[i];
  viewer.key = null;
  viewer.show({ identity: pd.identity, kit: kitFor(team.id, q.get('kit') || 'home'), keeper: pd.position === 'GK', crestUrl: team.crest, teamKey: `lab|${team.id}` });
  viewer.setAnim(q.get('anim') || (pd.position === 'GK' ? 'gkReady' : 'idle'));
  const id = pd.identity;
  document.getElementById('info').textContent = `${pd.name} #${pd.number} ${pd.position}${pd.captain ? ' (C)' : ''}\n${id.heightCm} cm ${id.weightKg} kg age ${id.age}\n${id.bodyType} · hair ${id.hair.style}/${id.hair.color} · ${id.facialHair}\nboots ${id.boots.name} · skin ${id.skinTone}`;
}
const ui = document.getElementById('ui');
const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ui.appendChild(b); };
btn('◀', () => { i = (i - 1 + team.players.length) % team.players.length; show(); });
btn('▶', () => { i = (i + 1) % team.players.length; show(); });
for (const v of ['front', 'side', 'back']) btn(v, () => viewer.view(v));
btn('+', () => viewer.zoom(-1));
btn('−', () => viewer.zoom(1));
for (const [k, l] of VIEWER_ANIMS) btn(l, () => viewer.setAnim(k));
show();
if (q.get('view')) viewer.view(q.get('view'));
for (let z = 0; z < Number(q.get('zoom') || 0); z++) viewer.zoom(-1);
window.lab = { viewer, team, show, set: (n) => { i = n; show(); } };
