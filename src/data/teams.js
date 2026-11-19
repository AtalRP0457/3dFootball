// Ten decade squads of legends. `players` starts with the 11-player 4-3-3
// lineup; `bench` contains the reserves available for in-match substitutions.
// Stats (0-99): spd = pace, pas = passing, sho = shooting,
// tac = tackling, dri = dribbling, gk = goalkeeping.
// Edit freely: add players, change ratings or kits. Adding a team here is
// enough for it to appear in the menu.

const p = (name, number, spd, pas, sho, tac, dri, gk = 20) => ({
  name, number, stats: { spd, pas, sho, tac, dri, gk },
});
const extra = (role, name, number, spd, pas, sho, tac, dri) => ({
  ...p(name, number, spd, pas, sho, tac, dri), role,
});
const reserve = (role, name, number, spd, pas, sho, tac, dri, gk = 20) => ({
  ...p(name, number, spd, pas, sho, tac, dri, gk), role,
});

export const TEAMS = [
  {
    id: '1910', name: '1910', nickname: 'The Pioneers',
    kit: { shirt: '#f2efe6', shorts: '#1d1d1d', socks: '#1d1d1d', gk: '#3c6e3c' },
    players: [
      p('Leigh Roose', 1, 60, 55, 30, 40, 45, 80),
      p('Bob Crompton', 2, 68, 66, 45, 82, 60),
      p('Jesse Pennington', 3, 70, 64, 40, 80, 58),
      p('Imre Schlosser', 8, 76, 78, 82, 50, 80),
      p('Vivian Woodward', 9, 78, 76, 85, 40, 82),
    ],
  },
  {
    id: '1920', name: '1920', nickname: 'Golden Twenties',
    kit: { shirt: '#6db3e8', shorts: '#111111', socks: '#111111', gk: '#c8c8c8' },
    players: [
      p('Ricardo Zamora', 1, 62, 55, 30, 40, 45, 86),
      p('José Nasazzi', 2, 72, 70, 45, 85, 64),
      p('José Andrade', 5, 78, 76, 55, 80, 78),
      p('Héctor Scarone', 10, 78, 84, 84, 50, 84),
      p('Dixie Dean', 9, 79, 68, 88, 42, 76),
    ],
  },
  {
    id: '1930', name: '1930', nickname: 'Wunderteam',
    kit: { shirt: '#c8102e', shorts: '#ffffff', socks: '#c8102e', gk: '#222222' },
    players: [
      p('František Plánička', 1, 62, 55, 30, 40, 45, 86),
      p('Luis Monti', 5, 72, 74, 60, 86, 70),
      p('Eddie Hapgood', 3, 73, 70, 42, 84, 62),
      p('Matthias Sindelar', 10, 80, 88, 82, 45, 89),
      p('Giuseppe Meazza', 9, 82, 80, 90, 45, 87),
    ],
  },
  {
    id: '1940', name: '1940', nickname: 'Post-War Kings',
    kit: { shirt: '#7a1f2b', shorts: '#ffffff', socks: '#7a1f2b', gk: '#d9a400' },
    players: [
      p('Frank Swift', 1, 63, 60, 30, 40, 45, 86),
      p('Domingos da Guia', 3, 74, 76, 45, 87, 75),
      p('Billy Wright', 5, 74, 74, 50, 86, 66),
      p('Valentino Mazzola', 10, 82, 86, 86, 60, 86),
      p('Stanley Matthews', 7, 86, 84, 76, 40, 92),
    ],
  },
  {
    id: '1950', name: '1950', nickname: 'Magic Magyars',
    kit: { shirt: '#9b111e', shorts: '#ffffff', socks: '#2e7d32', gk: '#555555' },
    players: [
      p('Gyula Grosics', 1, 66, 62, 30, 40, 50, 87),
      p('Nílton Santos', 6, 78, 78, 55, 87, 76),
      p('Djalma Santos', 2, 80, 74, 50, 88, 70),
      p('Alfredo Di Stéfano', 9, 84, 90, 88, 66, 90),
      p('Ferenc Puskás', 10, 80, 86, 94, 40, 90),
    ],
  },
  {
    id: '1960', name: '1960', nickname: 'Samba & Steel',
    kit: { shirt: '#ffd700', shorts: '#1f4fa3', socks: '#ffffff', gk: '#111111' },
    players: [
      p('Lev Yashin', 1, 66, 62, 30, 42, 50, 93),
      p('Bobby Moore', 6, 74, 82, 52, 91, 70),
      p('Giacinto Facchetti', 3, 84, 76, 66, 86, 74),
      p('Eusébio', 13, 90, 80, 92, 40, 88),
      p('Pelé', 10, 90, 90, 95, 45, 95),
    ],
  },
  {
    id: '1970', name: '1970', nickname: 'Total Football',
    kit: { shirt: '#ff7a00', shorts: '#ffffff', socks: '#ff7a00', gk: '#1b1b1b' },
    players: [
      p('Sepp Maier', 1, 66, 64, 30, 40, 50, 90),
      p('Franz Beckenbauer', 5, 82, 90, 70, 92, 86),
      p('Carlos Alberto', 4, 84, 80, 68, 86, 78),
      p('Johan Cruyff', 14, 90, 92, 88, 50, 95),
      p('Gerd Müller', 13, 80, 70, 95, 35, 82),
    ],
  },
  {
    id: '1980', name: '1980', nickname: 'Hand of God',
    kit: { shirt: '#6cace4', shorts: '#0b1f4b', socks: '#ffffff', gk: '#2f9e44' },
    players: [
      p('Peter Shilton', 1, 66, 64, 30, 40, 50, 90),
      p('Franco Baresi', 6, 80, 82, 55, 94, 76),
      p('Paolo Maldini', 3, 84, 80, 58, 93, 78),
      p('Diego Maradona', 10, 90, 92, 90, 40, 97),
      p('Marco van Basten', 9, 84, 80, 94, 40, 88),
    ],
  },
  {
    id: '1990', name: '1990', nickname: 'Il Fenomeno',
    kit: { shirt: '#1e3a8a', shorts: '#ffffff', socks: '#1e3a8a', gk: '#e11d48' },
    players: [
      p('Peter Schmeichel', 1, 68, 66, 30, 42, 50, 92),
      p('Marcel Desailly', 8, 84, 78, 55, 91, 74),
      p('Roberto Carlos', 6, 92, 82, 85, 84, 84),
      p('Roberto Baggio', 10, 84, 90, 90, 40, 93),
      p('Ronaldo', 9, 95, 80, 95, 35, 96),
    ],
  },
  {
    id: '2000', name: '2000', nickname: 'Galácticos',
    kit: { shirt: '#ffffff', shorts: '#ffffff', socks: '#5b2d8e', gk: '#16a34a' },
    players: [
      p('Gianluigi Buffon', 1, 68, 66, 30, 42, 50, 93),
      p('Fabio Cannavaro', 5, 84, 76, 50, 93, 74),
      p('Carles Puyol', 3, 84, 74, 50, 91, 70),
      p('Zinedine Zidane', 10, 82, 94, 88, 55, 96),
      p('Thierry Henry', 14, 94, 84, 93, 40, 92),
    ],
  },
];

// Six additional outfield players complete the 4-3-3 starting XI. The first
// five entries above retain the prototype's GK/DEF/DEF/MID/FWD ordering;
// extras are appended as DEF/DEF/MID/MID/FWD/FWD.
const supportingPlayers = {
  '1910': [
    extra('DEF', 'Charlie Roberts', 4, 72, 68, 42, 84, 62), extra('DEF', 'Frank Barson', 5, 68, 58, 38, 86, 48),
    extra('MID', 'Billy Meredith', 11, 82, 86, 72, 48, 90), extra('MID', 'Arthur Grimsdell', 6, 72, 70, 58, 76, 66),
    extra('FWD', 'Steve Bloomer', 10, 82, 78, 91, 38, 84), extra('FWD', 'Jimmy Quinn', 11, 76, 68, 86, 42, 72),
  ],
  '1920': [
    extra('DEF', 'Eraldo Monzeglio', 3, 75, 70, 42, 84, 62), extra('DEF', 'Jock Rutherford', 4, 70, 65, 48, 78, 58),
    extra('MID', 'Alex James', 8, 68, 90, 70, 54, 88), extra('MID', 'José Leandro Andrade', 6, 82, 78, 60, 82, 82),
    extra('FWD', 'Manuel Seoane', 11, 78, 72, 90, 42, 80), extra('FWD', 'Pedro Cea', 7, 76, 82, 84, 50, 84),
  ],
  '1930': [
    extra('DEF', 'Domingos da Guia', 4, 76, 78, 46, 89, 76), extra('DEF', 'Víctor Lindberg', 2, 72, 66, 40, 80, 58),
    extra('MID', 'Giovanni Ferrari', 8, 76, 82, 75, 54, 80), extra('MID', 'Raimundo Orsi', 6, 82, 78, 82, 48, 82),
    extra('FWD', 'Guillermo Stábile', 9, 80, 72, 92, 38, 78), extra('FWD', 'Oldřich Nejedlý', 11, 76, 70, 88, 42, 74),
  ],
  '1940': [
    extra('DEF', 'Nílton Santos', 6, 80, 82, 58, 89, 78), extra('DEF', 'Obdulio Varela', 4, 70, 75, 48, 90, 68),
    extra('MID', 'Adolfo Pedernera', 8, 78, 88, 82, 50, 86), extra('MID', 'Zizinho', 10, 80, 84, 86, 48, 90),
    extra('FWD', 'Gyula Zsengellér', 9, 78, 76, 91, 40, 80), extra('FWD', 'Tom Finney', 11, 84, 82, 85, 46, 88),
  ],
  '1950': [
    extra('DEF', 'José Santamaría', 3, 74, 72, 42, 90, 60), extra('DEF', 'Obdulio Varela', 4, 70, 75, 48, 90, 68),
    extra('MID', 'Didi', 8, 78, 91, 80, 52, 90), extra('MID', 'Raymond Kopa', 7, 84, 86, 80, 42, 92),
    extra('FWD', 'Garrincha', 11, 92, 82, 86, 40, 96), extra('FWD', 'Nándor Hidegkuti', 10, 76, 84, 88, 46, 86),
  ],
  '1960': [
    extra('DEF', 'Elías Figueroa', 4, 78, 76, 50, 92, 72), extra('DEF', 'Ruud Krol', 3, 82, 82, 56, 89, 80),
    extra('MID', 'Bobby Charlton', 8, 82, 84, 90, 52, 86), extra('MID', 'Gianni Rivera', 10, 76, 91, 78, 46, 92),
    extra('FWD', 'Jairzinho', 11, 90, 78, 90, 42, 90), extra('FWD', 'Tostão', 9, 82, 86, 88, 44, 92),
  ],
  '1970': [
    extra('DEF', 'Ruud Krol', 3, 82, 82, 56, 89, 80), extra('DEF', 'Carlos Alberto', 4, 86, 82, 72, 88, 82),
    extra('MID', 'Günter Netzer', 8, 76, 92, 78, 50, 88), extra('MID', 'Rivellino', 10, 82, 88, 86, 48, 93),
    extra('FWD', 'Mario Kempes', 9, 86, 78, 92, 48, 84), extra('FWD', 'Kevin Keegan', 11, 84, 76, 88, 50, 86),
  ],
  '1980': [
    extra('DEF', 'Gaetano Scirea', 4, 78, 84, 50, 91, 78), extra('DEF', 'Claudio Gentile', 2, 78, 70, 42, 94, 60),
    extra('MID', 'Lothar Matthäus', 8, 86, 84, 82, 88, 78), extra('MID', 'Michel Platini', 10, 78, 94, 91, 48, 94),
    extra('FWD', 'Gary Lineker', 11, 82, 70, 92, 38, 80), extra('FWD', 'Romário', 7, 88, 76, 94, 34, 94),
  ],
  '1990': [
    extra('DEF', 'Cafu', 2, 92, 82, 62, 86, 84), extra('DEF', 'Lilian Thuram', 4, 84, 72, 46, 92, 68),
    extra('MID', 'Luis Figo', 7, 84, 90, 82, 48, 93), extra('MID', 'Rivaldo', 10, 84, 88, 92, 44, 94),
    extra('FWD', 'Dennis Bergkamp', 11, 78, 92, 90, 40, 96), extra('FWD', 'Hristo Stoichkov', 9, 86, 78, 93, 52, 89),
  ],
  '2000': [
    extra('DEF', 'Rio Ferdinand', 4, 84, 78, 46, 90, 72), extra('DEF', 'Alessandro Nesta', 2, 80, 78, 42, 94, 70),
    extra('MID', 'Xavi', 6, 74, 96, 66, 66, 93), extra('MID', 'Ronaldinho', 11, 88, 92, 91, 42, 97),
    extra('FWD', 'Cristiano Ronaldo', 7, 94, 82, 94, 46, 94), extra('FWD', 'Samuel Eto’o', 9, 92, 78, 92, 42, 90),
  ],
};

for (const team of TEAMS) team.players.push(...(supportingPlayers[team.id] || []));

// Four named bench options per team give each side a reserve keeper and three
// outfield choices. Matches allow three substitutions, as in the game's era.
const benchPlayers = {
  '1910': [reserve('GK', 'Sam Hardy', 12, 65, 58, 30, 42, 48, 84), reserve('DEF', 'Colin Veitch', 13, 75, 70, 50, 82, 68), reserve('MID', 'Billy Gillespie', 14, 76, 82, 75, 50, 82), reserve('FWD', 'George Wall', 15, 80, 74, 86, 42, 84)],
  '1920': [reserve('GK', 'Elisha Scott', 12, 63, 58, 30, 42, 48, 87), reserve('DEF', 'George Male', 13, 73, 70, 48, 83, 64), reserve('MID', 'Jimmy Gordon', 14, 76, 78, 70, 54, 80), reserve('FWD', 'Hughie Gallacher', 15, 82, 76, 90, 42, 86)],
  '1930': [reserve('GK', 'Alex Thepot', 12, 64, 59, 30, 42, 48, 86), reserve('DEF', 'Ernst Ocwirk', 13, 74, 80, 58, 84, 76), reserve('MID', 'Giovanni Ferrari', 14, 78, 84, 77, 54, 82), reserve('FWD', 'Guillermo Stábile', 15, 82, 75, 92, 40, 80)],
  '1940': [reserve('GK', 'Bert Trautmann', 12, 67, 60, 30, 44, 50, 88), reserve('DEF', 'Tarcisio Burgnich', 13, 75, 72, 46, 88, 68), reserve('MID', 'Wilf Mannion', 14, 80, 84, 82, 52, 88), reserve('FWD', 'Gunnar Nordahl', 15, 78, 73, 93, 44, 82)],
  '1950': [reserve('GK', 'Lev Yashin', 12, 68, 65, 30, 44, 52, 93), reserve('DEF', 'Bellini', 13, 74, 70, 42, 86, 62), reserve('MID', 'Omar Sívori', 14, 82, 88, 86, 46, 93), reserve('FWD', 'Just Fontaine', 15, 82, 78, 94, 40, 86)],
  '1960': [reserve('GK', 'Gordon Banks', 12, 68, 65, 30, 44, 52, 92), reserve('DEF', 'Elías Figueroa', 13, 78, 78, 52, 92, 74), reserve('MID', 'Denis Law', 14, 84, 76, 91, 44, 88), reserve('FWD', 'Jimmy Greaves', 15, 84, 78, 95, 38, 90)],
  '1970': [reserve('GK', 'Dino Zoff', 12, 67, 66, 30, 44, 50, 93), reserve('DEF', 'Paul Breitner', 13, 82, 84, 70, 85, 82), reserve('MID', 'Günter Netzer', 14, 77, 92, 78, 50, 88), reserve('FWD', 'Mario Kempes', 15, 87, 78, 93, 48, 86)],
  '1980': [reserve('GK', 'Rinat Dasayev', 12, 68, 64, 30, 43, 50, 91), reserve('DEF', 'Gaetano Scirea', 13, 79, 84, 50, 91, 78), reserve('MID', 'Bryan Robson', 14, 84, 80, 82, 82, 78), reserve('FWD', 'Jean-Pierre Papin', 15, 86, 75, 93, 40, 86)],
  '1990': [reserve('GK', 'Oliver Kahn', 12, 70, 65, 30, 45, 52, 94), reserve('DEF', 'Jaap Stam', 13, 82, 68, 42, 93, 64), reserve('MID', 'David Beckham', 14, 78, 94, 82, 52, 92), reserve('FWD', 'George Weah', 15, 92, 82, 95, 46, 92)],
  '2000': [reserve('GK', 'Iker Casillas', 12, 72, 68, 30, 44, 54, 94), reserve('DEF', 'John Terry', 13, 74, 72, 54, 94, 66), reserve('MID', 'Steven Gerrard', 14, 86, 88, 86, 82, 86), reserve('FWD', 'Andriy Shevchenko', 15, 88, 80, 94, 42, 90)],
};

for (const team of TEAMS) team.bench = benchPlayers[team.id] || [];

export function getTeam(id) {
  return TEAMS.find((t) => t.id === id) || TEAMS[0];
}
