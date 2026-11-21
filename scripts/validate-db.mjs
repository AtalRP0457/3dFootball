// Validates the football database and the generated asset files, and writes
// reports/db-validation.md. Exit code 1 if there are errors.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB } from '../src/db/index.ts';
import { validateDatabase } from '../src/db/validate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = validateDatabase();
let checked = 0;
for (const l of DB.club_logos) { checked++; if (!existsSync(join(root, 'public', l.path))) report.errors.push(`Missing logo file: public/${l.path}`); }
for (const k of DB.kits) { checked++; if (!existsSync(join(root, 'public', 'assets', 'kits', `${k.team_id}-${k.type}.svg`))) report.errors.push(`Missing kit file for ${k.id}`); }
report.stats['Asset files checked'] = checked;

const lines = [
  '# Database validation report', '', `Generated: ${new Date().toISOString()}`, '',
  `**${report.errors.length} errors · ${report.warnings.length} warnings**`, '', '| Item | Value |', '| --- | --- |',
  ...Object.entries(report.stats).map(([k, v]) => `| ${k} | ${v} |`), '',
  '## Errors', '', ...(report.errors.length ? report.errors.map((e) => `- ${e}`) : ['None.']), '',
  '## Warnings', '', ...(report.warnings.length ? report.warnings.map((e) => `- ${e}`) : ['None.']), '',
];
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports', 'db-validation.md'), lines.join('\n'));
console.log(Object.entries(report.stats).map(([k, v]) => `${k}: ${v}`).join('\n'));
console.log(`\n${report.errors.length} errors, ${report.warnings.length} warnings (see reports/db-validation.md)`);
for (const e of report.errors.slice(0, 30)) console.log('ERROR', e);
process.exit(report.errors.length ? 1 : 0);
