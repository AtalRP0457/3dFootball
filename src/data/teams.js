// Ten decade teams of legends. Order of players follows FORMATION:
// GK, DEF, DEF, MID, FWD.
// Stats (0-99): spd = pace, pas = passing, sho = shooting,
// tac = tackling, dri = dribbling, gk = goalkeeping.
// Edit freely: add players, change ratings or kits. Adding a team here is
// enough for it to appear in the menu.

const p = (name, number, spd, pas, sho, tac, dri, gk = 20) => ({
  name, number, stats: { spd, pas, sho, tac, dri, gk },
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

export function getTeam(id) {
  return TEAMS.find((t) => t.id === id) || TEAMS[0];
}
