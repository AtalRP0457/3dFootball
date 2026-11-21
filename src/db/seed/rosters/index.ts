// Registry of roster seed files, grouped by roster profile (era).
// Add a file here to add squads; the validator checks every entry.
import type { RosterSource } from '../../../types/db.ts';
import modernEng from './modern-eng.ts';
import modernEspIta from './modern-esp-ita.ts';
import fifa07 from './fifa07.ts';
import nationsEurope from './modern-nations-europe.ts';
import nationsWorld from './modern-nations-world.ts';
import modernGerFra from './modern-ger-fra.ts';
import modernEuropeRest from './modern-europe-rest.ts';
import modernWorldClubs from './modern-world-clubs.ts';
import { fifa14, fifa18 } from './fifa14-18.ts';
import legends from './legends.ts';

const merge = (...parts: RosterSource[]): RosterSource => Object.assign({}, ...parts);

export const ROSTER_SOURCES: Record<string, RosterSource> = {
  modern: merge(modernEng, modernEspIta, modernGerFra, modernEuropeRest, modernWorldClubs, nationsEurope, nationsWorld),
  fifa18,
  fifa14,
  fifa07,
  legends,
};
