// Original crest and kit artwork generator. Produces standalone SVG strings
// (used by scripts/generate-assets.mjs to write files, and at runtime as a
// fallback). The designs are club-INSPIRED originals, not official badges.
import type { FlagSpec, SeedClub, SeedNation } from '../types/db.ts';
import type { Kit } from '../types/game.ts';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `#${[f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const ink = (hex: string): string => (lum(hex) > 0.6 ? '#101828' : '#ffffff');
function hash(s: unknown): number { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ---------- outer shapes (viewBox 0 0 200 220) ----------
const SHAPES: Record<string, string> = {
  shield: 'M100 8 L184 30 C186 96 170 160 100 212 C30 160 14 96 16 30 Z',
  crest: 'M20 14 L180 14 L180 104 C180 160 140 194 100 212 C60 194 20 160 20 104 Z',
  round: 'M100 10 A100 100 0 0 1 100 210 A100 100 0 0 1 100 10 Z',
  oval: 'M100 6 C160 6 186 56 186 110 C186 170 150 214 100 214 C50 214 14 170 14 110 C14 56 40 6 100 6 Z',
  diamond: 'M100 6 L194 110 L100 214 L6 110 Z',
};

// ---------- field patterns ----------
function pattern(kind: string, c1: string, c2: string): string {
  switch (kind) {
    case 'stripes': return [0, 1, 2, 3, 4].map((i) => `<rect x="${i * 44 - 8}" y="0" width="22" height="230" fill="${c2}"/>`).join('');
    case 'pinstripes': return [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${i * 24}" y="0" width="7" height="230" fill="${c2}"/>`).join('');
    case 'hoops': return [0, 1, 2, 3, 4].map((i) => `<rect x="0" y="${30 + i * 44}" width="200" height="22" fill="${c2}"/>`).join('');
    case 'halves': return `<rect x="100" y="0" width="100" height="230" fill="${c2}"/>`;
    case 'quarters': return `<rect x="100" y="0" width="100" height="110" fill="${c2}"/><rect x="0" y="110" width="100" height="120" fill="${c2}"/>`;
    case 'sash': return `<path d="M-10 40 L40 -10 L220 170 L170 220 Z" fill="${c2}"/>`;
    case 'band': return `<rect x="0" y="92" width="200" height="38" fill="${c2}"/>`;
    case 'cross': return `<rect x="88" y="0" width="24" height="230" fill="${c2}"/><rect x="0" y="98" width="200" height="24" fill="${c2}"/>`;
    case 'chevron': return `<path d="M0 90 L100 150 L200 90 L200 128 L100 188 L0 128 Z" fill="${c2}"/>`;
    case 'diamonds': {
      let out = '';
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        if ((x + y) % 2) continue;
        out += `<path d="M${x * 20 - 10} ${y * 20} l10 -10 l10 10 l-10 10z" fill="${c2}"/>`;
      }
      return out;
    }
    default: return '';
  }
}

// ---------- emblems (drawn in a 100x100 box) ----------
const EMBLEMS: Record<string, string | null> = {
  ball: `<circle cx="50" cy="50" r="40" fill="#fff" stroke="#111" stroke-width="3"/><path d="M50 26 L66 38 L60 58 L40 58 L34 38 Z" fill="#111"/><path d="M50 26 V12 M66 38 L82 32 M60 58 L70 76 M40 58 L30 76 M34 38 L18 32" stroke="#111" stroke-width="3"/>`,
  crown: `<path d="M12 72 L18 30 L36 50 L50 20 L64 50 L82 30 L88 72 Z" fill="currentColor"/><rect x="12" y="74" width="76" height="12" rx="3" fill="currentColor"/><circle cx="18" cy="28" r="5" fill="currentColor"/><circle cx="50" cy="16" r="6" fill="currentColor"/><circle cx="82" cy="28" r="5" fill="currentColor"/>`,
  devil: `<path d="M30 30 L20 8 L40 24 Z M70 30 L80 8 L60 24 Z" fill="currentColor"/><path d="M50 22 C72 22 80 40 76 58 C72 74 60 86 50 92 C40 86 28 74 24 58 C20 40 28 22 50 22 Z" fill="currentColor"/><path d="M74 60 C90 66 92 82 84 92 L80 84 C84 78 82 72 72 68 Z" fill="currentColor"/><path d="M38 46 L46 50 M62 46 L54 50" stroke="#000" stroke-width="4" opacity=".5"/>`,
  ship: `<path d="M14 62 L86 62 L74 82 L26 82 Z" fill="currentColor"/><path d="M48 14 L48 60 L20 58 Z" fill="currentColor"/><path d="M54 20 L54 60 L80 58 Z" fill="currentColor" opacity=".8"/><path d="M8 88 Q20 82 32 88 T56 88 T80 88 T96 88" stroke="currentColor" stroke-width="4" fill="none"/>`,
  bird: `<path d="M30 80 C30 60 36 42 50 34 C46 26 52 16 62 18 C70 20 72 28 68 34 L80 36 L70 42 C74 58 68 76 56 84 Z" fill="currentColor"/><path d="M50 46 C36 40 22 42 12 52 C26 54 36 58 44 64 Z" fill="currentColor"/><path d="M40 84 L34 96 M54 84 L58 96" stroke="currentColor" stroke-width="4"/>`,
  cannon: `<path d="M10 52 L74 30 C82 28 88 34 86 42 C84 48 80 50 76 51 L18 64 Z" fill="currentColor"/><circle cx="34" cy="70" r="14" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="34" cy="70" r="4" fill="currentColor"/><path d="M48 74 L84 74" stroke="currentColor" stroke-width="6"/><path d="M8 44 L4 60" stroke="currentColor" stroke-width="6"/>`,
  lion: `<path d="M50 14 C70 14 84 28 84 48 C84 70 68 88 50 88 C32 88 16 70 16 48 C16 28 30 14 50 14 Z" fill="currentColor"/><path d="M50 30 C62 30 68 40 68 52 C68 64 60 72 50 72 C40 72 32 64 32 52 C32 40 38 30 50 30 Z" fill="#000" opacity=".35"/><path d="M42 50 L46 52 M58 50 L54 52 M44 62 Q50 66 56 62" stroke="#fff" stroke-width="3" fill="none"/>`,
  cockerel: `<circle cx="50" cy="86" r="10" fill="currentColor"/><path d="M40 76 C30 60 32 40 46 32 C44 22 50 14 58 16 L60 24 L68 26 L60 32 C66 44 64 62 56 76 Z" fill="currentColor"/><path d="M46 40 C30 30 18 34 10 46 C24 44 34 50 40 60" fill="currentColor"/><path d="M56 16 L54 6 L60 12 L64 4 L64 16" fill="currentColor"/>`,
  castle: `<path d="M14 88 L14 40 L24 40 L24 30 L34 30 L34 40 L44 40 L44 22 L56 22 L56 40 L66 40 L66 30 L76 30 L76 40 L86 40 L86 88 Z" fill="currentColor"/><path d="M42 88 L42 66 C42 58 58 58 58 66 L58 88 Z" fill="#000" opacity=".4"/>`,
  tower: `<path d="M50 6 L58 30 L58 46 L66 46 L72 92 L28 92 L34 46 L42 46 L42 30 Z" fill="currentColor"/><path d="M40 92 C40 74 60 74 60 92" fill="#000" opacity=".35"/><rect x="30" y="58" width="40" height="5" fill="#000" opacity=".3"/>`,
  hammers: `<path d="M20 84 L70 22" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M80 84 L30 22" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><rect x="56" y="10" width="26" height="16" rx="3" transform="rotate(38 69 18)" fill="currentColor"/><rect x="18" y="10" width="26" height="16" rx="3" transform="rotate(-38 31 18)" fill="currentColor"/>`,
  seagull: `<path d="M6 54 C24 36 40 38 50 52 C60 38 76 36 94 54 C76 46 62 50 50 64 C38 50 24 46 6 54 Z" fill="currentColor"/>`,
  bee: `<ellipse cx="50" cy="56" rx="22" ry="30" fill="currentColor"/><path d="M30 46 H70 M28 60 H72 M32 74 H68" stroke="#000" stroke-width="6" opacity=".55"/><ellipse cx="28" cy="34" rx="16" ry="10" fill="#fff" opacity=".8"/><ellipse cx="72" cy="34" rx="16" ry="10" fill="#fff" opacity=".8"/>`,
  eagle: `<path d="M50 30 C56 22 64 22 66 28 L74 30 L66 34 C68 44 62 54 54 58 L60 86 L50 78 L40 86 L46 58 C38 54 32 44 34 34 Z" fill="currentColor"/><path d="M40 44 C26 30 12 30 4 36 C14 42 22 52 34 56 Z M60 44 C74 30 88 30 96 36 C86 42 78 52 66 56 Z" fill="currentColor"/>`,
  cottage: `<path d="M14 50 L50 20 L86 50 L80 50 L80 86 L20 86 L20 50 Z" fill="currentColor"/><rect x="42" y="60" width="16" height="26" fill="#000" opacity=".4"/><rect x="26" y="56" width="10" height="10" fill="#000" opacity=".3"/><rect x="64" y="56" width="10" height="10" fill="#000" opacity=".3"/>`,
  wolf: `<path d="M24 18 L40 36 L60 36 L76 18 L78 48 C78 70 64 88 50 92 C36 88 22 70 22 48 Z" fill="currentColor"/><path d="M36 56 L44 54 M64 56 L56 54" stroke="#000" stroke-width="4" opacity=".55"/><path d="M44 74 L50 80 L56 74" fill="#000" opacity=".45"/>`,
  tree: `<path d="M50 10 C70 10 84 26 82 44 C90 52 86 68 72 70 C66 78 34 78 28 70 C14 68 10 52 18 44 C16 26 30 10 50 10 Z" fill="currentColor"/><rect x="44" y="64" width="12" height="28" fill="currentColor"/><path d="M20 92 H80" stroke="currentColor" stroke-width="5"/>`,
  cherry: `<circle cx="34" cy="68" r="18" fill="currentColor"/><circle cx="68" cy="72" r="16" fill="currentColor"/><path d="M34 50 C40 30 54 18 62 12 M68 56 C66 40 62 24 62 12" stroke="currentColor" stroke-width="4" fill="none"/><path d="M62 12 C74 10 84 18 86 26 C74 28 66 22 62 12 Z" fill="currentColor"/>`,
  fox: `<path d="M14 16 L38 40 L62 40 L86 16 L80 52 L50 90 L20 52 Z" fill="currentColor"/><path d="M26 52 L50 82 L74 52 L50 62 Z" fill="#fff" opacity=".7"/><circle cx="38" cy="50" r="3" fill="#000"/><circle cx="62" cy="50" r="3" fill="#000"/>`,
  anchor: `<circle cx="50" cy="18" r="8" fill="none" stroke="currentColor" stroke-width="5"/><path d="M50 26 V86 M32 40 H68" stroke="currentColor" stroke-width="7"/><path d="M14 60 C18 82 34 90 50 90 C66 90 82 82 86 60 L78 66 M14 60 L22 66" stroke="currentColor" stroke-width="7" fill="none"/>`,
  horse: `<path d="M30 90 L36 58 C28 52 26 40 32 32 L46 18 L52 8 L56 20 C70 24 78 36 74 50 L70 56 L60 50 L56 60 L62 90 Z" fill="currentColor"/>`,
  bear: `<circle cx="28" cy="28" r="10" fill="currentColor"/><circle cx="72" cy="28" r="10" fill="currentColor"/><path d="M50 22 C72 22 84 38 84 56 C84 76 70 90 50 90 C30 90 16 76 16 56 C16 38 28 22 50 22 Z" fill="currentColor"/><ellipse cx="50" cy="66" rx="14" ry="10" fill="#fff" opacity=".6"/><circle cx="50" cy="62" r="4" fill="#000"/>`,
  bat: `<path d="M50 34 C54 28 60 28 62 34 C74 22 90 24 96 36 C86 38 82 48 84 58 C76 52 68 54 64 62 C58 56 54 58 50 66 C46 58 42 56 36 62 C32 54 24 52 16 58 C18 48 14 38 4 36 C10 24 26 22 38 34 C40 28 46 28 50 34 Z" fill="currentColor"/>`,
  submarine: `<path d="M10 60 C10 48 22 44 34 44 L70 44 C84 44 92 52 92 60 C92 68 84 74 70 74 L30 74 C18 74 10 70 10 60 Z" fill="currentColor"/><path d="M42 44 L46 28 L62 28 L64 44 Z" fill="currentColor"/><circle cx="34" cy="59" r="5" fill="#000" opacity=".4"/><circle cx="52" cy="59" r="5" fill="#000" opacity=".4"/><circle cx="70" cy="59" r="5" fill="#000" opacity=".4"/>`,
  star: `<path d="M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z" fill="currentColor"/>`,
  chain: `<rect x="12" y="38" width="36" height="24" rx="12" fill="none" stroke="currentColor" stroke-width="7"/><rect x="52" y="38" width="36" height="24" rx="12" fill="none" stroke="currentColor" stroke-width="7"/><path d="M38 50 H62" stroke="currentColor" stroke-width="7"/>`,
  cross: `<path d="M38 8 H62 V38 H92 V62 H62 V92 H38 V62 H8 V38 H38 Z" fill="currentColor"/>`,
  jmark: `<path d="M56 8 L72 8 L72 66 C72 84 60 94 44 94 C30 94 20 86 18 72 L34 70 C36 76 40 80 46 80 C52 80 56 74 56 66 Z" fill="currentColor"/><rect x="28" y="8" width="8" height="40" fill="currentColor" opacity=".6"/>`,
  goddess: `<circle cx="50" cy="26" r="13" fill="currentColor"/><path d="M28 92 C30 62 38 44 50 44 C62 44 70 62 72 92 Z" fill="currentColor"/><path d="M32 18 C40 6 60 6 68 18" stroke="currentColor" stroke-width="4" fill="none"/>`,
  lily: `<path d="M50 6 C60 20 62 40 54 58 L46 58 C38 40 40 20 50 6 Z" fill="currentColor"/><path d="M44 58 C30 54 16 40 18 22 C30 30 40 42 46 54 Z M56 58 C70 54 84 40 82 22 C70 30 60 42 54 54 Z" fill="currentColor"/><rect x="28" y="60" width="44" height="8" fill="currentColor"/><path d="M42 68 L36 92 L50 82 L64 92 L58 68 Z" fill="currentColor"/>`,
  bull: `<path d="M14 24 C18 36 26 40 34 40 L66 40 C74 40 82 36 86 24 C90 40 82 50 74 52 L70 76 C68 86 60 92 50 92 C40 92 32 86 30 76 L26 52 C18 50 10 40 14 24 Z" fill="currentColor"/><ellipse cx="50" cy="80" rx="12" ry="7" fill="#000" opacity=".4"/>`,
  zebra: `<path d="M24 92 L30 50 C24 40 26 26 36 18 L50 10 L52 22 C66 28 72 40 68 54 L64 92 Z" fill="currentColor"/><path d="M34 34 L58 30 M30 46 L64 44 M30 60 L66 58 M30 74 L66 72" stroke="#000" stroke-width="5" opacity=".7"/>`,
  griffin: `<path d="M30 90 L34 60 C24 52 22 38 30 28 L44 22 L48 10 L54 22 L66 24 L60 30 C70 40 70 56 60 64 L66 90 Z" fill="currentColor"/><path d="M58 40 C74 26 90 30 96 40 C82 42 76 52 66 58 Z" fill="currentColor"/>`,
  stag: `<path d="M38 50 C38 70 44 88 50 92 C56 88 62 70 62 50 C62 40 56 34 50 34 C44 34 38 40 38 50 Z" fill="currentColor"/><path d="M42 34 L34 18 L22 12 M34 18 L28 26 M58 34 L66 18 L78 12 M66 18 L72 26" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  dog: `<path d="M22 40 C16 20 30 14 38 26 L62 26 C70 14 84 20 78 40 L78 62 C78 80 66 90 50 90 C34 90 22 80 22 62 Z" fill="currentColor"/><ellipse cx="50" cy="70" rx="10" ry="7" fill="#000" opacity=".5"/>`,
  lamp: `<path d="M38 22 L62 22 L68 40 L32 40 Z" fill="currentColor"/><path d="M34 42 L66 42 L60 84 L40 84 Z" fill="currentColor"/><circle cx="50" cy="62" r="9" fill="#fff" opacity=".85"/><path d="M50 8 V22 M42 90 H58" stroke="currentColor" stroke-width="5"/>`,
  ermine: `<path d="M50 10 L58 34 L74 30 L64 50 L80 64 L58 66 L50 92 L42 66 L20 64 L36 50 L26 30 L42 34 Z" fill="currentColor"/>`,
  stork: `<path d="M44 92 L46 60 C34 56 30 44 36 36 C40 30 48 30 52 34 L80 16 L56 40 C62 50 58 60 52 62 L54 92" fill="currentColor" stroke="currentColor" stroke-width="3"/>`,
  dragon: `<path d="M20 80 C30 50 50 46 58 30 C60 20 70 14 80 18 L74 26 L84 30 L72 34 C68 50 54 60 44 70 C56 70 70 76 74 88 C60 84 44 86 20 80 Z" fill="currentColor"/><path d="M40 50 C26 30 12 34 6 44 C18 46 26 54 34 62 Z" fill="currentColor"/>`,
  warrior: `<path d="M50 10 C68 10 80 26 80 46 C80 70 66 88 50 90 C38 88 30 78 28 66 L18 62 L28 56 C26 50 26 46 28 40 C32 22 40 10 50 10 Z" fill="currentColor"/><path d="M40 20 C54 30 70 30 76 26" stroke="#000" stroke-width="4" opacity=".45" fill="none"/><circle cx="42" cy="46" r="4" fill="#000" opacity=".5"/>`,
  clover: `<circle cx="50" cy="30" r="17" fill="currentColor"/><circle cx="31" cy="54" r="17" fill="currentColor"/><circle cx="69" cy="54" r="17" fill="currentColor"/><path d="M50 56 C52 72 56 84 64 94" stroke="currentColor" stroke-width="6" fill="none"/>`,
  oak: `<path d="M50 8 C62 14 66 24 62 32 C74 32 78 44 70 52 C80 58 76 72 64 72 L56 72 L56 92 L44 92 L44 72 L36 72 C24 72 20 58 30 52 C22 44 26 32 38 32 C34 24 38 14 50 8 Z" fill="currentColor"/>`,
  laurel: `<path d="M50 90 C20 80 10 50 20 20 M50 90 C80 80 90 50 80 20" stroke="currentColor" stroke-width="4" fill="none"/>${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="${24 - i * 1.5 + i * 0.5}" cy="${30 + i * 13}" rx="9" ry="4" transform="rotate(-40 ${24 - i} ${30 + i * 13})" fill="currentColor"/><ellipse cx="${76 + i}" cy="${30 + i * 13}" rx="9" ry="4" transform="rotate(40 ${76 + i} ${30 + i * 13})" fill="currentColor"/>`).join('')}<path d="M50 30 L56 46 L50 62 L44 46 Z" fill="currentColor"/>`,
  heron: `<path d="M56 92 L54 60 C40 58 30 46 32 34 C34 26 42 22 50 24 C56 14 66 10 74 12 L62 22 C70 32 70 46 62 56 L64 92" fill="currentColor"/><path d="M74 12 L92 8 L76 16 Z" fill="currentColor"/>`,
  crescent: `<path d="M60 12 C36 14 20 32 20 52 C20 74 38 90 60 90 C46 82 38 68 38 52 C38 34 46 20 60 12 Z" fill="currentColor"/><path d="M70 40 L73 49 L82 49 L75 55 L78 64 L70 58 L62 64 L65 55 L58 49 L67 49 Z" fill="currentColor"/>`,
  checks: (() => { let o = ''; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if ((x + y) % 2 === 0) o += `<rect x="${12 + x * 15}" y="${12 + y * 15}" width="15" height="15" fill="currentColor"/>`; return `${o}<rect x="12" y="12" width="75" height="75" fill="none" stroke="currentColor" stroke-width="3"/>`; })(),
  shield: `<path d="M50 8 L86 20 C86 54 74 78 50 92 C26 78 14 54 14 20 Z" fill="currentColor"/>${[0, 1, 2, 3, 4].map((i) => `<circle cx="${50 + [0, -14, 14, 0, 0][i]}" cy="${[30, 46, 46, 46, 62][i]}" r="5" fill="#000" opacity=".4"/>`).join('')}`,
  sun: `<circle cx="50" cy="50" r="18" fill="currentColor"/>${[...Array(16)].map((_, i) => { const a = (i * Math.PI) / 8; return `<path d="M${50 + Math.cos(a) * 22} ${50 + Math.sin(a) * 22} L${50 + Math.cos(a) * 40} ${50 + Math.sin(a) * 40}" stroke="currentColor" stroke-width="${i % 2 ? 3 : 6}"/>`; }).join('')}`,
  condor: `<path d="M50 34 C54 28 60 28 62 34 L94 30 C86 40 78 46 66 50 L58 52 L60 70 L50 84 L40 70 L42 52 L34 50 C22 46 14 40 6 30 L38 34 C40 28 46 28 50 34 Z" fill="currentColor"/>`,
  vicuna: `<path d="M30 92 L32 56 C24 50 24 40 30 34 L34 14 L42 26 L50 30 C60 30 70 36 72 48 L74 92 L64 92 L62 64 L42 64 L40 92 Z" fill="currentColor"/>`,
  maple: `<path d="M50 6 L58 26 L72 18 L68 40 L88 34 L80 52 L92 58 L66 68 L70 80 L54 74 L54 94 L46 94 L46 74 L30 80 L34 68 L8 58 L20 52 L12 34 L32 40 L28 18 L42 26 Z" fill="currentColor"/>`,
  crow: `<path d="M18 60 C24 40 40 30 56 30 L64 20 L66 32 C76 36 82 46 80 56 L94 62 L78 64 C74 76 62 82 50 82 L46 94 L42 82 L34 94 L34 80 C26 76 20 70 18 60 Z" fill="currentColor"/><circle cx="66" cy="44" r="3" fill="#fff"/>`,
  tiger: `<path d="M18 24 L34 32 L66 32 L82 24 L80 50 C80 74 66 90 50 90 C34 90 20 74 20 50 Z" fill="currentColor"/><path d="M50 32 V46 M30 48 L40 52 M70 48 L60 52 M26 62 L38 62 M74 62 L62 62" stroke="#000" stroke-width="4" opacity=".6"/>`,
  palm: `<path d="M48 92 C50 70 50 50 50 36" stroke="currentColor" stroke-width="7" fill="none"/><path d="M50 36 C36 20 18 22 8 32 C24 30 36 34 46 42 Z M50 36 C64 20 82 22 92 32 C76 30 64 34 54 42 Z M50 36 C44 18 52 8 60 6 C56 18 56 28 52 38 Z" fill="currentColor"/><path d="M18 74 L82 74 M30 68 L70 80 M70 68 L30 80" stroke="currentColor" stroke-width="4"/>`,
  cheetah: `<path d="M10 62 C20 44 40 40 60 44 L72 30 L76 42 C86 46 92 54 90 62 L70 64 L64 86 L56 86 L56 66 L34 66 L28 86 L20 86 L22 66 Z" fill="currentColor"/>`,
  kangaroo: `<path d="M26 90 L34 64 C22 56 22 40 32 32 C38 26 48 26 52 30 L60 12 L64 26 C72 32 72 44 66 52 L72 64 L96 82 L66 72 L58 90 Z" fill="currentColor"/>`,
  rhododendron: `${[0, 1, 2, 3, 4].map((i) => { const a = (i * 2 * Math.PI) / 5 - Math.PI / 2; return `<ellipse cx="${50 + Math.cos(a) * 20}" cy="${46 + Math.sin(a) * 20}" rx="16" ry="12" transform="rotate(${(i * 72) + 90} ${50 + Math.cos(a) * 20} ${46 + Math.sin(a) * 20})" fill="currentColor"/>`; }).join('')}<circle cx="50" cy="46" r="8" fill="#fff" opacity=".8"/><path d="M50 66 V94" stroke="currentColor" stroke-width="4"/>`,
  falcon: `<path d="M50 20 C58 20 64 26 64 34 L74 38 L64 40 C66 50 62 60 56 64 L58 92 L50 84 L42 92 L44 64 C34 58 30 46 34 34 C36 26 42 20 50 20 Z" fill="currentColor"/><path d="M40 46 C24 40 12 46 6 58 C20 56 30 58 40 62 Z M60 46 C76 40 88 46 94 58 C80 56 70 58 60 62 Z" fill="currentColor"/>`,
  elephant: `<path d="M24 40 C24 24 38 16 52 16 C70 16 82 28 82 46 L82 72 L72 72 L72 60 L60 60 L60 72 L50 72 L50 60 C46 66 40 70 36 70 C34 80 30 88 22 90 C26 80 26 70 24 60 C14 58 8 48 12 38 Z" fill="currentColor"/><circle cx="40" cy="36" r="3" fill="#000"/>`,
  trident: `<path d="M50 6 V94 M26 20 V46 C26 58 36 62 50 62 C64 62 74 58 74 46 V20" stroke="currentColor" stroke-width="7" fill="none"/><path d="M50 6 L44 18 L56 18 Z M26 20 L20 32 L32 32 Z M74 20 L68 32 L80 32 Z" fill="currentColor"/>`,
  harp: `<path d="M24 92 L30 20 C46 12 60 18 70 30 C78 40 86 46 92 46 L84 92 Z" fill="none" stroke="currentColor" stroke-width="6"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${38 + i * 8} ${24 + i * 3} L${36 + i * 8} 90" stroke="currentColor" stroke-width="2.5"/>`).join('')}`,
  monogram: null, // drawn as stylised letters
};

function emblemSVG(name: string, color: string, mono?: string): string {
  if (name === 'monogram' || !EMBLEMS[name]) {
    const t = esc((mono || '?').slice(0, 4));
    const size = t.length > 3 ? 30 : t.length > 2 ? 38 : t.length > 1 ? 50 : 66;
    return `<text x="50" y="${50 + size * 0.36}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${size}" letter-spacing="1" fill="${color}" stroke="${shade(color, -0.6)}" stroke-width="1.2">${t}</text>`;
  }
  return `<g style="color:${color}" fill="${color}">${EMBLEMS[name]}</g>`;
}

/**
 * Club crest SVG. spec = club.crest, colors = [primary, secondary, accent].
 * parody adds a wobble, a cheeky monogram and a little "®-free" seal.
 */
export function clubCrestSVG(club: SeedClub, { parody = false } = {}): string {
  const spec = club.crest;
  const id = `c${hash(club.id + (parody ? 'p' : ''))}`;
  const [c1, c2, c3] = club.colors;
  const PARODY_SHAPE: Record<string, string> = { shield: 'oval', round: 'crest', oval: 'diamond', crest: 'round', diamond: 'shield' };
  const shapeName = parody ? (PARODY_SHAPE[spec.shape] || 'shield') : spec.shape;
  const outline = SHAPES[shapeName] || SHAPES.shield;
  const field1 = lum(c1) > 0.92 && lum(c2) > 0.6 ? shade(c1, -0.08) : c1;
  const emblemColor = lum(c3) > 0.35 && Math.abs(lum(c3) - lum(c1)) > 0.2 ? c3 : (lum(c1) > 0.6 ? '#101828' : '#ffffff');
  const mono = parody ? club.parody.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 3).toUpperCase() : spec.mono;
  const medallion = spec.shape === 'round' || shapeName === 'round';
  const ribbon = esc((parody ? club.parody : club.short).toUpperCase());
  const rsize = ribbon.length > 16 ? 12 : ribbon.length > 11 ? 14 : 17;
  const emblem = emblemSVG(parody && spec.emblem === 'monogram' ? 'star' : spec.emblem, emblemColor, mono);
  const wobble = parody ? ' transform="rotate(-6 100 110)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="200" height="220">
<defs>
<linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d0"/><stop offset=".4" stop-color="#d9ab3a"/><stop offset=".75" stop-color="#8f6312"/><stop offset="1" stop-color="#f0cf6a"/></linearGradient>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<clipPath id="${id}c"><path d="${outline}"/></clipPath>
</defs>
<g${wobble}>
<path d="${outline}" fill="url(#${id}r)" transform="translate(100 110) scale(1.07) translate(-100 -110)"/>
<g clip-path="url(#${id}c)">
<rect width="200" height="230" fill="${field1}"/>
${pattern(spec.pattern, c1, c2)}
${spec.cross ? `<rect x="0" y="0" width="100" height="70" fill="#ffffff"/><rect x="42" y="0" width="16" height="70" fill="#d0103a"/><rect x="0" y="27" width="100" height="16" fill="#d0103a"/><rect x="100" y="0" width="100" height="70" fill="#f4c400"/>${[0, 1, 2, 3].map((i) => `<rect x="${108 + i * 22}" y="0" width="11" height="70" fill="#d0103a"/>`).join('')}<rect x="0" y="66" width="200" height="6" fill="${c3}"/>` : ''}
<rect width="200" height="230" fill="url(#${id}g)"/>
</g>
<path d="${outline}" fill="none" stroke="#0b1224" stroke-opacity=".6" stroke-width="3"/>
<circle cx="100" cy="${spec.cross ? 140 : 112}" r="${medallion ? 60 : 56}" fill="${shade(c1, -0.55)}" opacity=".9" stroke="url(#${id}r)" stroke-width="5"/>
<g transform="translate(${100 - (medallion ? 46 : 44)} ${(spec.cross ? 140 : 112) - (medallion ? 46 : 44)}) scale(${medallion ? 0.92 : 0.88})">${emblem}</g>
${medallion ? `<path id="${id}arc" d="M38 112 A62 62 0 0 1 162 112" fill="none"/><text font-family="Arial Narrow, Arial, sans-serif" font-weight="800" font-size="${rsize}" letter-spacing="2" fill="${ink(c1)}"><textPath href="#${id}arc" startOffset="50%" text-anchor="middle">${ribbon}</textPath></text>` : ''}
${parody ? `<g transform="translate(150 178) rotate(14)"><circle r="20" fill="#ffd400" stroke="#101828" stroke-width="3"/><text y="5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="11" fill="#101828">LOL</text></g>` : ''}
</g>
</svg>`;
}

// ---------- national team crest: flag field + emblem ----------
function flagSVG(flag: FlagSpec, w = 200, h = 230): string {
  const [layout, a, b, c] = flag;
  switch (layout) {
    case 'v3': return `<rect width="${w / 3}" height="${h}" fill="${a}"/><rect x="${w / 3}" width="${w / 3}" height="${h}" fill="${b}"/><rect x="${(2 * w) / 3}" width="${w / 3}" height="${h}" fill="${c}"/>`;
    case 'v3star': return `${flagSVG(['v3', a, b, c])}<path d="M100 92 l8 22 h23 l-19 14 7 22 -19 -14 -19 14 7 -22 -19 -14 h23z" fill="${a}"/>`;
    case 'h3': case 'h3w': {
      const mid = layout === 'h3w' ? h / 2 : h / 3;
      return `<rect width="${w}" height="${h}" fill="${b}"/><rect width="${w}" height="${layout === 'h3w' ? h / 4 : h / 3}" fill="${a}"/><rect y="${layout === 'h3w' ? (3 * h) / 4 : (2 * h) / 3}" width="${w}" height="${h / 3}" fill="${c}"/>${mid ? '' : ''}`;
    }
    case 'h3star': return `${flagSVG(['h3', a, b, c])}<path d="M100 92 l8 22 h23 l-19 14 7 22 -19 -14 -19 14 7 -22 -19 -14 h23z" fill="#000"/>`;
    case 'h2': return `<rect width="${w}" height="${h / 2}" fill="${a}"/><rect y="${h / 2}" width="${w}" height="${h / 2}" fill="${b}"/>`;
    case 'v2': return `<rect width="${w * 0.4}" height="${h}" fill="${a}"/><rect x="${w * 0.4}" width="${w * 0.6}" height="${h}" fill="${b}"/>`;
    case 'v2crescent': return `<rect width="${w / 2}" height="${h}" fill="${a}"/><rect x="${w / 2}" width="${w / 2}" height="${h}" fill="${b}"/>`;
    case 'nordic': return `<rect width="${w}" height="${h}" fill="${a}"/><rect x="58" width="26" height="${h}" fill="${b}"/><rect y="${h / 2 - 13}" width="${w}" height="26" fill="${b}"/>`;
    case 'nordic2': return `<rect width="${w}" height="${h}" fill="${a}"/><rect x="52" width="38" height="${h}" fill="${b}"/><rect y="${h / 2 - 19}" width="${w}" height="38" fill="${b}"/><rect x="61" width="20" height="${h}" fill="${c}"/><rect y="${h / 2 - 10}" width="${w}" height="20" fill="${c}"/>`;
    case 'cross-st': return `<rect width="${w}" height="${h}" fill="${a}"/><rect x="${w / 2 - 15}" width="30" height="${h}" fill="${b}"/><rect y="${h / 2 - 15}" width="${w}" height="30" fill="${b}"/>`;
    case 'swiss': return `<rect width="${w}" height="${h}" fill="${a}"/><rect x="88" y="62" width="24" height="96" fill="${b}"/><rect x="52" y="98" width="96" height="24" fill="${b}"/>`;
    case 'saltire': return `<rect width="${w}" height="${h}" fill="${a}"/><path d="M0 0 L${w} ${h} M${w} 0 L0 ${h}" stroke="${b}" stroke-width="28"/>`;
    case 'crescent': return `<rect width="${w}" height="${h}" fill="${a}"/><circle cx="92" cy="110" r="40" fill="${b}"/><circle cx="104" cy="110" r="32" fill="${a}"/>`;
    case 'circle': return `<rect width="${w}" height="${h}" fill="${a}"/><circle cx="100" cy="110" r="44" fill="${b}"/>`;
    case 'star': return `<rect width="${w}" height="${h}" fill="${a}"/><path d="M100 70 l12 34 h36 l-29 21 11 34 -30 -21 -30 21 11 -34 -29 -21 h36z" fill="none" stroke="${b}" stroke-width="7"/>`;
    case 'brazil': return `<rect width="${w}" height="${h}" fill="${a}"/><path d="M100 30 L186 110 L100 190 L14 110 Z" fill="${b}"/><circle cx="100" cy="110" r="40" fill="${c}"/>`;
    case 'colombia': return `<rect width="${w}" height="${h / 2}" fill="${a}"/><rect y="${h / 2}" width="${w}" height="${h / 4}" fill="${b}"/><rect y="${(3 * h) / 4}" width="${w}" height="${h / 4}" fill="${c}"/>`;
    case 'chile': return `<rect width="${w}" height="${h / 2}" fill="${a}"/><rect y="${h / 2}" width="${w}" height="${h / 2}" fill="${b}"/><rect width="80" height="${h / 2}" fill="${c}"/><path d="M40 40 l6 18 h18 l-15 11 6 18 -15 -11 -15 11 6 -18 -15 -11 h18z" fill="#fff"/>`;
    case 'stripesH': return [...Array(9)].map((_, i) => `<rect y="${(i * h) / 9}" width="${w}" height="${h / 9}" fill="${i % 2 ? b : a}"/>`).join('');
    case 'usa': return `${[...Array(13)].map((_, i) => `<rect y="${(i * h) / 13}" width="${w}" height="${h / 13}" fill="${i % 2 ? b : a}"/>`).join('')}<rect width="90" height="${(7 * h) / 13}" fill="${c}"/>`;
    case 'canada': return `<rect width="${w}" height="${h}" fill="${b}"/><rect width="50" height="${h}" fill="${a}"/><rect x="150" width="50" height="${h}" fill="${a}"/>`;
    case 'h5': return `<rect width="${w}" height="${h}" fill="${a}"/><rect y="${h / 6}" width="${w}" height="${(2 * h) / 3}" fill="${b}"/><rect y="${h / 3}" width="${w}" height="${h / 3}" fill="${c}"/>`;
    case 'korea': return `<rect width="${w}" height="${h}" fill="${a}"/><path d="M100 70 A40 40 0 0 1 100 150 A20 20 0 0 1 100 110 A20 20 0 0 0 100 70 Z" fill="${b}"/><path d="M100 150 A40 40 0 0 1 100 70 A20 20 0 0 0 100 110 A20 20 0 0 1 100 150 Z" fill="${c}"/>`;
    case 'czech': return `<rect width="${w}" height="${h / 2}" fill="${a}"/><rect y="${h / 2}" width="${w}" height="${h / 2}" fill="${b}"/><path d="M0 0 L100 ${h / 2} L0 ${h} Z" fill="${c}"/>`;
    case 'greece': return [...Array(9)].map((_, i) => `<rect y="${(i * h) / 9}" width="${w}" height="${h / 9}" fill="${i % 2 ? b : a}"/>`).join('') + `<rect width="90" height="${(5 * h) / 9}" fill="${a}"/><rect x="36" width="18" height="${(5 * h) / 9}" fill="${b}"/><rect y="${(2 * h) / 9}" width="90" height="${h / 9}" fill="${b}"/>`;
    case 'southern': return `<rect width="${w}" height="${h}" fill="${a}"/><rect width="90" height="80" fill="${a}"/><path d="M0 0 L90 80 M90 0 L0 80" stroke="${b}" stroke-width="10"/><path d="M45 0 V80 M0 40 H90" stroke="${c}" stroke-width="12"/>${[[140, 60], [160, 120], [120, 150], [150, 180]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${b}"/>`).join('')}`;
    case 'nepal': return `<rect width="${w}" height="${h}" fill="#f4f6fb"/><path d="M40 10 L160 100 L80 100 L160 210 L40 210 Z" fill="${c ? b : b}" /><path d="M48 24 L140 94 L66 94 L140 200 L48 200 Z" fill="${a}"/><circle cx="72" cy="72" r="12" fill="#fff"/><circle cx="72" cy="160" r="14" fill="#fff"/>`;
    case 'qatar': return `<rect width="${w}" height="${h}" fill="${b}"/><path d="M0 0 H60 L80 13 L60 26 L80 38 L60 51 L80 64 L60 77 L80 90 L60 102 L80 115 L60 128 L80 141 L60 154 L80 166 L60 179 L80 192 L60 205 L80 218 L60 230 H0 Z" fill="${a}"/>`;
    default: return `<rect width="${w}" height="${h}" fill="${a}"/>`;
  }
}

export function nationCrestSVG(nation: SeedNation, { parody = false } = {}): string {
  const id = `n${hash(nation.id + (parody ? 'p' : ''))}`;
  const outline = parody ? SHAPES.round : SHAPES.crest;
  const emblemColor = '#ffffff';
  const label = esc((parody ? nation.parody : nation.name).toUpperCase());
  const lsize = label.length > 18 ? 11 : label.length > 12 ? 13 : 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="200" height="220">
<defs>
<linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d0"/><stop offset=".4" stop-color="#d9ab3a"/><stop offset=".75" stop-color="#8f6312"/><stop offset="1" stop-color="#f0cf6a"/></linearGradient>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
<clipPath id="${id}c"><path d="${outline}"/></clipPath>
</defs>
<path d="${outline}" fill="url(#${id}r)" transform="translate(100 110) scale(1.07) translate(-100 -110)"/>
<g clip-path="url(#${id}c)">${flagSVG(nation.flag)}<rect width="200" height="230" fill="url(#${id}g)"/>
<rect x="0" y="172" width="200" height="34" fill="#0b1224" opacity=".82"/></g>
<path d="${outline}" fill="none" stroke="#0b1224" stroke-opacity=".6" stroke-width="3"/>
<circle cx="100" cy="98" r="44" fill="#0b1224" opacity=".72" stroke="url(#${id}r)" stroke-width="4"/>
<g transform="translate(66 64) scale(.68)">${emblemSVG(nation.emblem, emblemColor, nation.code)}</g>
<text x="100" y="${195}" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="800" font-size="${lsize}" letter-spacing="1.5" fill="#f5d36b">${label}</text>
${parody ? `<g transform="translate(152 40) rotate(14)"><circle r="18" fill="#ffd400" stroke="#101828" stroke-width="3"/><text y="4" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="10" fill="#101828">LOL</text></g>` : ''}
</svg>`;
}

// ---------- kit (shirt) artwork ----------
export function kitSVG(kit: Pick<Kit, 'shirt' | 'shorts' | 'socks'> & { design?: string; secondary?: string }): string {
  const { design, shirt, secondary, shorts, socks } = kit;
  const id = `k${hash(JSON.stringify(kit))}`;
  const body = 'M60 18 L80 10 C88 24 112 24 120 10 L140 18 L178 40 L164 76 L146 68 L146 170 L54 170 L54 68 L36 76 L22 40 Z';
  let deco = '';
  if (design === 'stripes') deco = [0, 1, 2, 3].map((i) => `<rect x="${62 + i * 22}" y="0" width="11" height="200" fill="${secondary}"/>`).join('');
  if (design === 'pinstripes') deco = [...Array(10)].map((_, i) => `<rect x="${56 + i * 10}" y="0" width="3" height="200" fill="${secondary}"/>`).join('');
  if (design === 'hoops') deco = [0, 1, 2, 3].map((i) => `<rect x="0" y="${44 + i * 32}" width="200" height="16" fill="${secondary}"/>`).join('');
  if (design === 'halves') deco = `<rect x="100" y="0" width="100" height="200" fill="${secondary}"/>`;
  if (design === 'quarters') deco = [...Array(6)].map((_, y) => [...Array(6)].map((__, x) => ((x + y) % 2 ? `<rect x="${40 + x * 20}" y="${20 + y * 26}" width="20" height="26" fill="${secondary}"/>` : '')).join('')).join('');
  if (design === 'sash') deco = `<path d="M40 30 L70 14 L170 160 L140 176 Z" fill="${secondary}"/>`;
  if (design === 'band') deco = `<rect x="0" y="74" width="200" height="30" fill="${secondary}"/>`;
  if (design === 'chevron') deco = `<path d="M40 60 L100 100 L160 60 L160 82 L100 122 L40 82 Z" fill="${secondary}"/>`;
  if (design === 'side') deco = `<rect x="54" y="60" width="12" height="110" fill="${secondary}"/><rect x="134" y="60" width="12" height="110" fill="${secondary}"/>`;
  const sleeves = design === 'sleeves' ? secondary : shirt;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
<defs><clipPath id="${id}"><path d="${body}"/></clipPath>
<linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
<g clip-path="url(#${id})"><rect width="200" height="200" fill="${shirt}"/>${deco}
<path d="M22 40 L60 18 L54 68 L36 76 Z M178 40 L140 18 L146 68 L164 76 Z" fill="${sleeves}"/>
<rect width="200" height="200" fill="url(#${id}l)"/></g>
<path d="${body}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
<path d="M80 10 C88 24 112 24 120 10" fill="none" stroke="${secondary}" stroke-width="5"/>
<path d="M64 176 L136 176 L140 222 L104 222 L100 200 L96 222 L60 222 Z" fill="${shorts}" stroke="#000" stroke-opacity=".3"/>
<rect x="68" y="228" width="22" height="28" rx="3" fill="${socks}"/><rect x="110" y="228" width="22" height="28" rx="3" fill="${socks}"/>
</svg>`;
}

export const EMBLEM_NAMES = Object.keys(EMBLEMS);
