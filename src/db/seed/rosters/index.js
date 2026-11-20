// Registry of roster seed files, grouped by roster profile (era).
// Add a file here to add squads; the validator checks every entry.
import modernEng from './modern-eng.js';
import modernEspIta from './modern-esp-ita.js';
import fifa07 from './fifa07.js';
import nationsEurope from './modern-nations-europe.js';
import nationsWorld from './modern-nations-world.js';
import modernGerFra from './modern-ger-fra.js';
import modernEuropeRest from './modern-europe-rest.js';
import modernWorldClubs from './modern-world-clubs.js';
import { fifa14, fifa18 } from './fifa14-18.js';
import legends from './legends.js';

const merge = (...parts) => Object.assign({}, ...parts);

export const ROSTER_SOURCES = {
  modern: merge(modernEng, modernEspIta, modernGerFra, modernEuropeRest, modernWorldClubs, nationsEurope, nationsWorld),
  fifa18,
  fifa14,
  fifa07,
  legends,
};
