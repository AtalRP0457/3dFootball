// Parody identities for players. Hand-written names for famous players, and a
// deterministic pun generator for everyone else. The parody name is a DISPLAY
// alias only: player IDs, ratings and roster links never change.

export const PARODY_PLAYERS = {
  'Lionel Messi': 'Messigician', 'Cristiano Ronaldo': 'Arrogontaldo', 'Kylian Mbappé': 'Mbappuccino',
  'Erling Haaland': 'Haalandinho the Goal Machine', Neymar: 'Neymarvellous', 'Zinedine Zidane': 'Zizou Wizard',
  Ronaldinho: 'Ronaldinho Magic', 'Ronaldo Nazário': 'Il Fenomenal', 'Vinícius Júnior': 'Vini Vidi Vici',
  'Jude Bellingham': 'Hey Jude Bellringham', 'Kevin De Bruyne': 'Kevin De Bruiser', 'Mohamed Salah': 'Mo Salad',
  'Harry Kane': 'Harry Hurricane', 'Robert Lewandowski': 'Robot Lewangoalski', 'Luka Modrić': 'Luka Modrickery',
  'Toni Kroos': 'Toni Kroossword', 'Virgil van Dijk': 'Virgil van Dyke-Wall', 'Rodri': 'Rodrizzler',
  'Lamine Yamal': 'Lamine Yamazing', 'Pedri': 'Pedriibbler', 'Antoine Griezmann': 'Antoine Griezmango',
  'Karim Benzema': 'Karim Benzemachine', 'Luis Suárez': 'Luis Snackrez', 'Sergio Ramos': 'Sergio Ramboss',
  'Gerard Piqué': 'Gerard Pique-nic', 'Xavi': 'Xavi-gator', 'Andrés Iniesta': 'Andrés Ini-Fiesta',
  'Carles Puyol': 'Carles Puyolhair', 'Samuel Eto’o': 'Samuel Eto-woo', "Samuel Eto'o": 'Samuel Eto-woo',
  'Sergio Busquets': 'Sergio Busquiet', 'Iker Casillas': 'Iker Castlehands', 'Raúl': 'Raúl the Ruler',
  'Roberto Carlos': 'Roberto Curvelos', 'Wayne Rooney': 'Wayne Roonaldo', 'David Beckham': 'David Bendham',
  'Ryan Giggs': 'Ryan Wiggles', 'Paul Scholes': 'Paul Scorches', 'Roy Keane': 'Roy Keen-As-Mustard',
  'Rio Ferdinand': 'Rio Ferdinandance', 'Eric Cantona': 'Eric Collarup Cantona', 'Ruud van Nistelrooy': 'Ruud van Nistelgoaly',
  'Steven Gerrard': 'Stevie Gee-Whizz', 'Fernando Torres': 'Fernando Torreador', 'Xabi Alonso': 'Xabi Alonsonic',
  'Sadio Mané': 'Sadio Many-Goals', 'Thierry Henry': 'Thierry Va-Va-Voom', 'Frank Lampard': 'Frank Lamppost',
  'Didier Drogba': 'Didier Drog-Bah', 'John Terry': 'John Tearful', 'Petr Čech': 'Petr Checkmate',
  'Zlatan Ibrahimović': 'Zlatan Ibra-Himself', 'Paolo Maldini': 'Paolo Maldini-Legend', 'Andrea Pirlo': 'Andrea Pirlo-Pasta',
  'Gianluigi Buffon': 'Gigi Buffet', 'Kaká': 'Ka-Ching', 'Andriy Shevchenko': 'Andriy Shevchenkgoal',
  'Manuel Neuer': 'Manuel Neuer-Sweeper', 'Thomas Müller': 'Thomas Mülltasking', 'Philipp Lahm': 'Philipp Lahmborghini',
  'Bastian Schweinsteiger': 'Bastian Schweinsteigerbomb', 'Arjen Robben': 'Arjen Robbin-Inside', 'Franck Ribéry': 'Franck Ribbery',
  'Mesut Özil': 'Mesut Assistil', 'Gareth Bale': 'Gareth Golf-Bale', 'Eden Hazard': 'Eden Hazardous',
  'Son Heung-min': 'Son Heung-Minute-Winner', 'Bukayo Saka': 'Bukayo Sakalicious', 'Martin Ødegaard': 'Martin Ødegood',
  'Declan Rice': 'Declan Fried-Rice', 'Phil Foden': 'Phil Food-en', 'Cole Palmer': 'Cold Palmer',
  'Bruno Fernandes': 'Bruno Ferhandes', 'Marcus Rashford': 'Marcus Dashford', 'Trent Alexander-Arnold': 'Trent Alexander-Arnoldinho',
  'Alisson Becker': 'Alisson Blocker', 'Thibaut Courtois': 'Thibaut Courtwall', 'Federico Valverde': 'Fede Valverdict',
  'Lautaro Martínez': 'Lautaro Martimeza', 'Victor Osimhen': 'Victor Osimask', 'Rafael Leão': 'Rafael Le-Wow',
  'Khvicha Kvaratskhelia': 'Kvaradona', 'Florian Wirtz': 'Florian Wizard-Wirtz', 'Jamal Musiala': 'Jamal Musicalala',
  'Ousmane Dembélé': 'Ousmane Dembeléleleé', 'Achraf Hakimi': 'Achraf Hakimissile', 'Gianluigi Donnarumma': 'Gigi Donnadrama',
  'Antonio Rüdiger': 'Antonio Rüdigger', 'Éder Militão': 'Éder Military', 'Alexander Isak': 'Alexander Isnack',
  'Ollie Watkins': 'Ollie Watts-Kins', 'Emiliano Martínez': 'Dibu Dance-tínez', 'Paulo Dybala': 'Paulo Dybalala',
  'Romelu Lukaku': 'Romelu Lukakoff', 'Diego Maradona': 'Diego Maradonut', 'Pelé': 'Pelé-Perfect',
  'Johan Cruyff': 'Johan Cruyff-Turn', 'Franz Beckenbauer': 'Franz Kaiserbauer', 'Ferenc Puskás': 'Ferenc Puskaboom',
  'Michel Platini': 'Michel Plat-in-it', 'Marco van Basten': 'Marco van Bicycle-Kick', 'Lothar Matthäus': 'Lothar Matt-House',
  'Ronaldo': 'Il Fenomenal', 'Rivaldo': 'Rivaldon’t', 'Romário': 'Romário-Mário', 'Cafu': 'Ca-Foo',
  'Fabio Cannavaro': 'Fabio Cannavaroom', 'Alessandro Nesta': 'Alessandro Nestea', 'Dani Alves': 'Dani Alvesome',
  'Luis Figo': 'Luis Fig-Roll', 'Patrick Vieira': 'Patrick Vieiruler', 'Dennis Bergkamp': 'Dennis Iceberg-kamp',
  'Edwin van der Sar': 'Edwin van der Star', 'Ashley Cole': 'Ashley Coal', 'Gianfranco Zola': 'Gianfranco Zolanoid',
  'Clarence Seedorf': 'Clarence Seedorfin', 'Mats Hummels': 'Mats Hummus', 'Marco Reus': 'Marco Reus-able',
  'Robert Pirès': 'Robert Pie-res', 'Toni Kroos ': 'Toni Kroossword',
};

const ROLE_PATTERNS = {
  GK: ['Gloves {s}', '{s} the Wall', 'Safe-Hands {s}', 'Captain Catch {s}'],
  DEF: ['Iron {s}', '{s}-Block', 'No-Entry {s}', '{s} the Bouncer', 'Big Slide {s}'],
  MID: ['{s}tronome', 'Maestro {s}', '{s} the Engine', 'Professor {s}', '{s}-Spinner'],
  FWD: ['{s}inho', 'Goalden {s}', '{s} the Finisher', 'Turbo {s}', '{s}-Rocket'],
};
const BIO = {
  GK: ['Has never met a penalty he did not dive the wrong way for, then save anyway.', 'Spends warm-ups shouting at the crossbar for motivation.', 'Claims to have caught a pigeon mid-match once. Witnesses disagree.'],
  DEF: ['Treats every through ball as a personal insult.', 'Has a slide tackle named after him in three languages.', 'Famously cleared a ball so far it landed in the next fixture.'],
  MID: ['Passes the ball before he even receives it.', 'Has more touches per game than a smartphone.', 'Can find a team-mate through a closed door.'],
  FWD: ['Celebrates goals he has not scored yet, just to save time.', 'Allergic to defending, immune to offside flags (allegedly).', 'Has a celebration for every day of the week.'],
};

function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function surnameOf(name) {
  const parts = name.replace(/[.]/g, '').split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0];
  const particles = new Set(['van', 'de', 'der', 'da', 'di', 'dos', 'del', 'la', 'le', 'von', 'ter', 'den']);
  let i = parts.length - 1;
  while (i > 0 && particles.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(' ');
}

/** Build a parody alias table for a set of players: { playerId: {name, bio, inspiration} } */
export function buildParodyAliases(players) {
  const used = new Set(Object.values(PARODY_PLAYERS));
  const out = {};
  for (const p of players) {
    const role = p.group;
    const bios = BIO[role] || BIO.MID;
    const bio = bios[hash(p.id) % bios.length];
    let name = PARODY_PLAYERS[p.name];
    if (!name) {
      const s = surnameOf(p.name);
      const pats = ROLE_PATTERNS[role] || ROLE_PATTERNS.MID;
      const start = hash(p.id) % pats.length;
      for (let k = 0; k < pats.length && !name; k++) {
        const cand = pats[(start + k) % pats.length].replace('{s}', s);
        if (!used.has(cand)) name = cand;
      }
      let n = 2;
      while (!name || used.has(name)) { name = `${pats[start].replace('{s}', s)} ${['II', 'III', 'IV', 'V', 'VI'][n - 2] || n}`; n++; if (!used.has(name)) break; }
    }
    used.add(name);
    out[p.id] = { name, bio, inspiration: p.name };
  }
  return out;
}
