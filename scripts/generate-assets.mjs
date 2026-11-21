// Generates original crest and kit SVGs into public/assets.
// Run: npm run assets   (also runs automatically before builds)
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUBS } from '../src/db/seed/clubs.ts';
import { NATIONS } from '../src/db/seed/nations.ts';
import { DB } from '../src/db/index.ts';
import { clubCrestSVG, nationCrestSVG, kitSVG } from '../src/db/crests.ts';
import { TEAMS as DECADES } from '../src/data/teams.ts';
import { crestSVG } from '../src/ui/art.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const logos = join(root, 'clubs', 'logos');
const kits = join(root, 'kits');
for (const d of [logos, join(logos, 'official'), kits]) mkdirSync(d, { recursive: true });
let count = { logos: 0, kits: 0 };
const write = (path, svg, kind) => { writeFileSync(path, svg.trim() + '\n'); count[kind]++; };

for (const c of CLUBS) {
  write(join(logos, `${c.id}.svg`), clubCrestSVG(c), 'logos');
  write(join(logos, `${c.id}-parody.svg`), clubCrestSVG(c, { parody: true }), 'logos');
}
for (const n of NATIONS) {
  write(join(logos, `${n.id}.svg`), nationCrestSVG(n), 'logos');
  write(join(logos, `${n.id}-parody.svg`), nationCrestSVG(n, { parody: true }), 'logos');
}
DECADES.forEach((t, i) => {
  const svg = crestSVG(t, i).replace('<svg class="crest"', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="220"');
  write(join(logos, `decade-${t.id}.svg`), svg, 'logos');
});
write(join(logos, 'custom.svg'), clubCrestSVG({ id: 'custom', short: 'Ultimate XI', parody: 'Ultimate XI', colors: ['#0a1633', '#f3c34a', '#f3c34a'], crest: { shape: 'shield', pattern: 'chevron', emblem: 'star', mono: 'UXI' } }), 'logos');
for (const k of DB.kits) {
  write(join(kits, `${k.team_id}-${k.type}.svg`), kitSVG({ design: k.design, shirt: k.primary, secondary: k.secondary, shorts: k.shorts, socks: k.socks }), 'kits');
}
const manifest = join(logos, 'official', 'manifest.json');
if (!existsSync(manifest)) writeFileSync(manifest, '{}\n');
console.log(`Generated ${count.logos} crest files and ${count.kits} kit files in public/assets`);
