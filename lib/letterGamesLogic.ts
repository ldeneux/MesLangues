// Logique PURE des jeux « Le mot le plus long » et « Scrabble » (aucun accès réseau ni React : testable avec node).
// Le dictionnaire = les mots du vocabulaire de la langue (toutes les langues y sont représentées par un « answer » :
// lettres latines sans accent, ou hiragana pour le japonais).
import type { Rng } from './wordGamesLogic';

export type LetterEntry = { id: string; answer: string; display: string; fr: string };

function shuffleArr<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Les lettres sont comptées par « caractère » (un hiragana = une tuile).
export function chars(s: string): string[] {
  return Array.from(s);
}

export function countLetters(letters: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of letters) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
}

/** Le mot peut-il être écrit avec ces lettres (chaque lettre utilisée au plus autant de fois qu'elle est disponible) ? */
export function canBuild(word: string, available: Map<string, number>): boolean {
  const need = new Map<string, number>();
  for (const c of chars(word)) {
    const n = (need.get(c) ?? 0) + 1;
    if (n > (available.get(c) ?? 0)) return false;
    need.set(c, n);
  }
  return true;
}

/** Fréquence de chaque lettre dans l'ensemble du dictionnaire (une occurrence = une lettre d'un mot). */
export function letterFrequencies(entries: LetterEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) for (const c of chars(e.answer)) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------
// Le mot le plus long
// ---------------------------------------------------------
/**
 * Tire `n` lettres en garantissant qu'un mot assez long existe : on part des lettres d'un mot du dictionnaire (6 à 9 lettres
 * quand c'est possible), on complète au hasard avec les lettres les plus courantes, puis on mélange.
 */
export function makeLetters(entries: LetterEntry[], n: number, rng: Rng = Math.random): string[] {
  if (entries.length === 0) return [];
  const byLen = new Map<number, LetterEntry[]>();
  for (const e of entries) {
    const l = chars(e.answer).length;
    if (l <= n - 1) byLen.set(l, [...(byLen.get(l) ?? []), e]);
  }
  // plus grande longueur (≤ 9) qui compte au moins 5 mots : les langues à mots courts (japonais) restent jouables
  let top = 0;
  for (const [len, list] of byLen) if (list.length >= 5 && len > top && len <= 9) top = len;
  if (top === 0) top = Math.max(...Array.from(byLen.keys()), 2);
  const lo = Math.max(2, top - 2);
  const seeds: LetterEntry[] = [];
  for (let l = lo; l <= top; l++) seeds.push(...(byLen.get(l) ?? []));
  const seed = seeds.length ? seeds[Math.floor(rng() * seeds.length)] : entries[Math.floor(rng() * entries.length)];
  const letters = chars(seed.answer).slice(0, n);

  const freq = letterFrequencies(entries);
  const pool = Array.from(freq.entries());
  const total = pool.reduce((s, [, f]) => s + f, 0);
  while (letters.length < n) {
    let x = rng() * total;
    let pick = pool[0][0];
    for (const [ch, f] of pool) {
      x -= f;
      if (x <= 0) {
        pick = ch;
        break;
      }
    }
    letters.push(pick);
  }
  return shuffleArr(letters, rng);
}

/** Tous les mots du dictionnaire qu'on peut écrire avec ces lettres, du plus long au plus court (puis alphabétique). */
export function wordsFrom(entries: LetterEntry[], letters: string[], minLen = 2): LetterEntry[] {
  const avail = countLetters(letters);
  return entries
    .filter((e) => chars(e.answer).length >= minLen && canBuild(e.answer, avail))
    .sort((a, b) => chars(b.answer).length - chars(a.answer).length || a.answer.localeCompare(b.answer));
}

// ---------------------------------------------------------
// Scrabble
// ---------------------------------------------------------
export const BOARD = 15;
export const CENTER = 7;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;

// T = mot triple, D = mot double, t = lettre triple, d = lettre double (plateau classique, symétrique)
const LAYOUT = [
  'T..d...T...d..T',
  '.D...t...t...D.',
  '..D...d.d...D..',
  'd..D...d...D..d',
  '....D.....D....',
  '.t...t...t...t.',
  '..d...d.d...d..',
  'T..d...D...d..T',
  '..d...d.d...d..',
  '.t...t...t...t.',
  '....D.....D....',
  'd..D...d...D..d',
  '..D...d.d...D..',
  '.D...t...t...D.',
  'T..d...T...d..T',
];

export type Premium = 'TW' | 'DW' | 'TL' | 'DL' | null;

export function premiumAt(r: number, c: number): Premium {
  const ch = LAYOUT[r]?.[c];
  return ch === 'T' ? 'TW' : ch === 'D' ? 'DW' : ch === 't' ? 'TL' : ch === 'd' ? 'DL' : null;
}

export type Board = (string | null)[][];
export type Placed = { r: number; c: number; ch: string };

export function emptyBoard(): Board {
  return Array.from({ length: BOARD }, () => Array<string | null>(BOARD).fill(null));
}

/**
 * Sac de tuiles et valeur des lettres, déduits du dictionnaire de la langue : plus une lettre est fréquente dans les mots,
 * plus elle a de tuiles et moins elle rapporte (le principe du Scrabble, sans table figée par langue).
 */
export function buildBag(entries: LetterEntry[], totalTiles = 98): { bag: string[]; values: Record<string, number> } {
  const freq = letterFrequencies(entries);
  const letters = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  const sum = letters.reduce((s, [, f]) => s + f, 0) || 1;

  // nombre de tuiles par lettre (au moins 1), ajusté pour tomber exactement sur totalTiles
  const counts = new Map<string, number>(letters.map(([ch, f]) => [ch, Math.max(1, Math.round((f / sum) * totalTiles))]));
  let diff = totalTiles - Array.from(counts.values()).reduce((s, n) => s + n, 0);
  const order = letters.map(([ch]) => ch);
  for (let i = 0; diff !== 0 && i < 10000; i++) {
    const ch = order[i % Math.min(order.length, 8)]; // on ajuste sur les lettres les plus courantes
    if (diff > 0) {
      counts.set(ch, counts.get(ch)! + 1);
      diff--;
    } else if (counts.get(ch)! > 1) {
      counts.set(ch, counts.get(ch)! - 1);
      diff++;
    }
  }

  // valeur selon la part cumulée de fréquence : les lettres qui couvrent la première moitié des mots valent 1, etc.
  const values: Record<string, number> = {};
  let cum = 0;
  for (const [ch, f] of letters) {
    const share = cum / sum;
    values[ch] = share < 0.5 ? 1 : share < 0.7 ? 2 : share < 0.82 ? 3 : share < 0.9 ? 4 : share < 0.95 ? 6 : share < 0.98 ? 8 : 10;
    cum += f;
  }

  const bag: string[] = [];
  for (const [ch, n] of counts) for (let i = 0; i < n; i++) bag.push(ch);
  return { bag, values };
}

export type MoveWord = { answer: string; points: number };
export type MoveResult = { ok: true; words: MoveWord[]; total: number; bingo: boolean } | { ok: false; error: string };

/**
 * Vérifie et note un coup : lettres alignées et sans trou, premier mot sur la case centrale, ensuite accolé aux lettres déjà posées,
 * et TOUS les mots formés (le mot principal et les mots croisés) doivent être dans le dictionnaire.
 */
export function evaluateMove(board: Board, placed: Placed[], keys: Set<string>, values: Record<string, number>): MoveResult {
  if (placed.length === 0) return { ok: false, error: 'Place au moins une lettre.' };

  const rows = new Set(placed.map((p) => p.r));
  const cols = new Set(placed.map((p) => p.c));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'Les lettres doivent être sur une même ligne ou une même colonne.' };

  const tmp: Board = board.map((row) => row.slice());
  const isNew = new Set<string>();
  for (const p of placed) {
    tmp[p.r][p.c] = p.ch;
    isNew.add(`${p.r},${p.c}`);
  }

  // pas de trou entre les lettres posées (des lettres déjà sur le plateau peuvent combler l'espace)
  if (placed.length > 1) {
    const horizontal = rows.size === 1;
    const [r0, r1] = [Math.min(...placed.map((p) => p.r)), Math.max(...placed.map((p) => p.r))];
    const [c0, c1] = [Math.min(...placed.map((p) => p.c)), Math.max(...placed.map((p) => p.c))];
    for (let k = horizontal ? c0 : r0; k <= (horizontal ? c1 : r1); k++) {
      if (tmp[horizontal ? r0 : k][horizontal ? k : c0] === null) return { ok: false, error: 'Il ne doit pas y avoir de trou entre les lettres.' };
    }
  }

  const boardEmpty = board.every((row) => row.every((x) => x === null));
  if (boardEmpty) {
    if (!placed.some((p) => p.r === CENTER && p.c === CENTER)) return { ok: false, error: 'Le premier mot doit passer par la case centrale ★.' };
    if (placed.length < 2) return { ok: false, error: 'Un mot a au moins 2 lettres.' };
  } else {
    const touches = placed.some((p) =>
      [
        [p.r - 1, p.c],
        [p.r + 1, p.c],
        [p.r, p.c - 1],
        [p.r, p.c + 1],
      ].some(([r, c]) => r >= 0 && r < BOARD && c >= 0 && c < BOARD && board[r][c] !== null)
    );
    if (!touches) return { ok: false, error: 'Le mot doit toucher des lettres déjà posées.' };
  }

  // mots formés : pour chaque lettre posée, le mot horizontal et le mot vertical (2 lettres ou plus), sans doublon
  const seen = new Set<string>();
  const words: { cells: [number, number][]; text: string }[] = [];
  const collect = (r: number, c: number, dr: number, dc: number) => {
    let r0 = r;
    let c0 = c;
    while (r0 - dr >= 0 && c0 - dc >= 0 && tmp[r0 - dr][c0 - dc] !== null) {
      r0 -= dr;
      c0 -= dc;
    }
    const cells: [number, number][] = [];
    let rr = r0;
    let cc = c0;
    while (rr < BOARD && cc < BOARD && tmp[rr][cc] !== null) {
      cells.push([rr, cc]);
      rr += dr;
      cc += dc;
    }
    if (cells.length < 2) return;
    const key = `${r0},${c0},${dr}${dc}`;
    if (seen.has(key)) return;
    seen.add(key);
    words.push({ cells, text: cells.map(([a, b]) => tmp[a][b]).join('') });
  };
  for (const p of placed) {
    collect(p.r, p.c, 0, 1);
    collect(p.r, p.c, 1, 0);
  }
  if (words.length === 0) return { ok: false, error: 'Forme un mot de 2 lettres au moins.' };

  for (const w of words) {
    if (!keys.has(w.text)) return { ok: false, error: `« ${w.text.toUpperCase()} » n'est pas dans la base de mots.` };
  }

  const scored: MoveWord[] = words.map((w) => {
    let sum = 0;
    let mult = 1;
    for (const [r, c] of w.cells) {
      let v = values[tmp[r][c]!] ?? 0;
      if (isNew.has(`${r},${c}`)) {
        const prem = premiumAt(r, c);
        if (prem === 'DL') v *= 2;
        else if (prem === 'TL') v *= 3;
        else if (prem === 'DW') mult *= 2;
        else if (prem === 'TW') mult *= 3;
      }
      sum += v;
    }
    return { answer: w.text, points: sum * mult };
  });
  const bingo = placed.length === RACK_SIZE;
  return { ok: true, words: scored, total: scored.reduce((s, w) => s + w.points, 0) + (bingo ? BINGO_BONUS : 0), bingo };
}

// ---------------------------------------------------------
// Motus
// ---------------------------------------------------------
export type MotusMark = 'good' | 'present' | 'absent'; // bien placée (rouge), mal placée (jaune), absente (bleu)

/** Notation d'une proposition : d'abord les lettres bien placées, puis les mal placées (chaque lettre du mot secret ne compte qu'une fois). */
export function motusMarks(guess: string, secret: string): MotusMark[] {
  const g = chars(guess);
  const s = chars(secret);
  const res: MotusMark[] = g.map(() => 'absent');
  const left = new Map<string, number>();
  g.forEach((ch, i) => {
    if (ch === s[i]) res[i] = 'good';
    else left.set(s[i], (left.get(s[i]) ?? 0) + 1);
  });
  g.forEach((ch, i) => {
    if (res[i] !== 'good' && (left.get(ch) ?? 0) > 0) {
      res[i] = 'present';
      left.set(ch, left.get(ch)! - 1);
    }
  });
  return res;
}
