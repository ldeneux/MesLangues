// Logique PURE des jeux de mots (mots croisés, mots cachés, lettres mélangées, Boggle, phrases à trous, mahjong).
// Aucun accès réseau ni React : utilisable côté client et testable avec node.

export type Rng = () => number;

// ---------------------------------------------------------
// Outils communs
// ---------------------------------------------------------
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Lettres seules, minuscules, sans accents (« Été » → « ete »). Vide pour les écritures non latines. */
export function normLetters(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

const ARTICLES: Record<string, RegExp> = {
  it: /^(?:(?:il|lo|la|i|gli|le|un|uno|una)\s+|l['’]|un['’])/i,
  es: /^(?:el|la|los|las|un|una|unos|unas)\s+/i,
  en: /^(?:the|a|an|to)\s+/i,
  de: /^(?:der|die|das|den|dem|des|ein|eine|einen|einem)\s+/i,
};

/**
 * Réponse « d'un seul tenant » d'un mot du vocabulaire : article et parenthèses retirés (« il pane » → « pane »).
 * Renvoie null si le mot n'est pas jouable (plusieurs mots, écriture non latine…).
 */
export function jeuAnswer(targetText: string, lang: string): { answer: string; display: string } | null {
  let t = (targetText ?? '').replace(/\([^)]*\)/g, ' ').split('/')[0].trim();
  const art = ARTICLES[lang];
  if (art) t = t.replace(art, '');
  t = t.trim();
  if (!t || /\s/.test(t)) return null;
  const answer = normLetters(t);
  if (answer.length < 2) return null;
  return { answer, display: t };
}

export type JeuWord = { id: string; answer: string; display: string };

/** Mots jouables (dédoublonnés sur la réponse), longueur comprise entre min et max. */
export function toJeuWords<T extends { id: string; target_text: string }>(
  words: T[],
  lang: string,
  min: number,
  max: number
): (JeuWord & { src: T })[] {
  const seen = new Set<string>();
  const out: (JeuWord & { src: T })[] = [];
  for (const w of words) {
    const a = jeuAnswer(w.target_text, lang);
    if (!a || a.answer.length < min || a.answer.length > max || seen.has(a.answer)) continue;
    seen.add(a.answer);
    out.push({ id: w.id, answer: a.answer, display: a.display, src: w });
  }
  return out;
}

// ---------------------------------------------------------
// Mots croisés
// ---------------------------------------------------------
export type CwEntry = {
  id: string;
  number: number;
  dir: 'A' | 'D'; // A = horizontal (across), D = vertical (down)
  r: number;
  c: number;
  len: number;
  answer: string;
  display: string;
};
export type CwGrid = { rows: number; cols: number; cells: (string | null)[][]; entries: CwEntry[] };

type Placed = { word: JeuWord; dir: 'A' | 'D'; r: number; c: number };

const DIRV = { A: [0, 1], D: [1, 0] } as const;

function tryCrossword(pool: JeuWord[], target: number, maxDim: number, rng: Rng): Placed[] {
  const cells = new Map<string, string>();
  const dirs = new Map<string, number>(); // bit 1 = A, bit 2 = D
  const placed: Placed[] = [];
  let minR = 0, maxR = 0, minC = 0, maxC = 0;
  const key = (r: number, c: number) => `${r},${c}`;
  const bit = (d: 'A' | 'D') => (d === 'A' ? 1 : 2);

  function check(w: JeuWord, dir: 'A' | 'D', r0: number, c0: number): number {
    const [dr, dc] = DIRV[dir];
    const len = w.answer.length;
    if (cells.has(key(r0 - dr, c0 - dc)) || cells.has(key(r0 + len * dr, c0 + len * dc))) return -1;
    let cross = 0;
    for (let k = 0; k < len; k++) {
      const r = r0 + k * dr, c = c0 + k * dc;
      const ex = cells.get(key(r, c));
      if (ex !== undefined) {
        if (ex !== w.answer[k] || ((dirs.get(key(r, c)) ?? 0) & bit(dir))) return -1;
        cross++;
      } else if (cells.has(key(r + dc, c + dr)) || cells.has(key(r - dc, c - dr))) {
        return -1;
      }
    }
    const nr0 = Math.min(minR, r0), nr1 = Math.max(maxR, r0 + (len - 1) * dr);
    const nc0 = Math.min(minC, c0), nc1 = Math.max(maxC, c0 + (len - 1) * dc);
    if (nr1 - nr0 + 1 > maxDim || nc1 - nc0 + 1 > maxDim) return -1;
    return cross;
  }

  function put(w: JeuWord, dir: 'A' | 'D', r0: number, c0: number) {
    const [dr, dc] = DIRV[dir];
    for (let k = 0; k < w.answer.length; k++) {
      const r = r0 + k * dr, c = c0 + k * dc;
      cells.set(key(r, c), w.answer[k]);
      dirs.set(key(r, c), (dirs.get(key(r, c)) ?? 0) | bit(dir));
    }
    minR = Math.min(minR, r0); maxR = Math.max(maxR, r0 + (w.answer.length - 1) * dr);
    minC = Math.min(minC, c0); maxC = Math.max(maxC, c0 + (w.answer.length - 1) * dc);
    placed.push({ word: w, dir, r: r0, c: c0 });
  }

  const order = shuffle(pool, rng).sort((a, b) => b.answer.length - a.answer.length + (rng() - 0.5) * 2.5);
  put(order[0], 'A', 0, 0);
  for (let i = 1; i < order.length && placed.length < target; i++) {
    const w = order[i];
    let best: { dir: 'A' | 'D'; r: number; c: number; cross: number }[] = [];
    let bestCross = 0;
    for (const p of placed) {
      const [pdr, pdc] = DIRV[p.dir];
      const nd: 'A' | 'D' = p.dir === 'A' ? 'D' : 'A';
      const [dr, dc] = DIRV[nd];
      for (let a = 0; a < p.word.answer.length; a++) {
        const r = p.r + a * pdr, c = p.c + a * pdc;
        for (let b = 0; b < w.answer.length; b++) {
          if (w.answer[b] !== p.word.answer[a]) continue;
          const r0 = r - b * dr, c0 = c - b * dc;
          const cross = check(w, nd, r0, c0);
          if (cross < 1) continue;
          if (cross > bestCross) { bestCross = cross; best = []; }
          if (cross === bestCross) best.push({ dir: nd, r: r0, c: c0, cross });
        }
      }
    }
    if (best.length > 0) {
      const pick = best[Math.floor(rng() * best.length)];
      put(w, pick.dir, pick.r, pick.c);
    }
  }
  return placed;
}

export function generateCrossword(pool: JeuWord[], target = 10, maxDim = 12, attempts = 80, rng: Rng = Math.random): CwGrid | null {
  if (pool.length < 4) return null;
  let bestPlaced: Placed[] = [];
  let bestScore = -1;
  for (let i = 0; i < attempts; i++) {
    const sub = shuffle(pool, rng).slice(0, Math.max(target * 3, 30));
    const placed = tryCrossword(sub, target, maxDim, rng);
    let r0 = 1e9, r1 = -1e9, c0 = 1e9, c1 = -1e9;
    for (const p of placed) {
      const [dr, dc] = DIRV[p.dir];
      r0 = Math.min(r0, p.r); r1 = Math.max(r1, p.r + (p.word.answer.length - 1) * dr);
      c0 = Math.min(c0, p.c); c1 = Math.max(c1, p.c + (p.word.answer.length - 1) * dc);
    }
    const area = (r1 - r0 + 1) * (c1 - c0 + 1);
    const score = placed.length * 1000 - area;
    if (score > bestScore) { bestScore = score; bestPlaced = placed; }
    if (placed.length >= target && i > 10) break;
  }
  if (bestPlaced.length < Math.min(4, target)) return null;

  let minR = 1e9, minC = 1e9, maxR = -1e9, maxC = -1e9;
  for (const p of bestPlaced) {
    const [dr, dc] = DIRV[p.dir];
    minR = Math.min(minR, p.r); maxR = Math.max(maxR, p.r + (p.word.answer.length - 1) * dr);
    minC = Math.min(minC, p.c); maxC = Math.max(maxC, p.c + (p.word.answer.length - 1) * dc);
  }
  const rows = maxR - minR + 1, cols = maxC - minC + 1;
  const cells: (string | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  const entries: CwEntry[] = bestPlaced.map((p) => {
    const [dr, dc] = DIRV[p.dir];
    for (let k = 0; k < p.word.answer.length; k++) cells[p.r - minR + k * dr][p.c - minC + k * dc] = p.word.answer[k];
    return { id: p.word.id, number: 0, dir: p.dir, r: p.r - minR, c: p.c - minC, len: p.word.answer.length, answer: p.word.answer, display: p.word.display };
  });
  // Numérotation en ordre de lecture ; un même numéro sert au mot horizontal et vertical qui démarrent dans la même case
  const numAt = new Map<string, number>();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (entries.some((e) => e.r === r && e.c === c)) numAt.set(`${r},${c}`, ++n);
    }
  }
  for (const e of entries) e.number = numAt.get(`${e.r},${e.c}`)!;
  entries.sort((a, b) => a.number - b.number || (a.dir === 'A' ? -1 : 1));
  return { rows, cols, cells, entries };
}

/** Cases (r,c) occupées par un mot. */
export function cwCells(e: { r: number; c: number; len: number; dir: 'A' | 'D' }): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < e.len; k++) out.push(e.dir === 'A' ? [e.r, e.c + k] : [e.r + k, e.c]);
  return out;
}

// ---------------------------------------------------------
// Mots cachés
// ---------------------------------------------------------
export type WsPlaced = { id: string; answer: string; display: string; cells: [number, number][] };
export type WsGrid = { size: number; cells: string[][]; placed: WsPlaced[] };

const WS_DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [-1, 1]];

export function generateWordSearch(
  pool: JeuWord[],
  count = 10,
  allowReverse = false,
  rng: Rng = Math.random
): WsGrid | null {
  if (pool.length < 6) return null;
  const chosen = shuffle(pool, rng).slice(0, count).sort((a, b) => b.answer.length - a.answer.length);
  const longest = chosen[0].answer.length;
  const size = Math.min(12, Math.max(9, longest + 1, Math.ceil(Math.sqrt(chosen.reduce((s, w) => s + w.answer.length, 0) * 2.2))));
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const dirs: [number, number][] = allowReverse ? [...WS_DIRS, ...WS_DIRS.map(([a, b]) => [-a, -b] as [number, number])] : WS_DIRS;
  const placed: WsPlaced[] = [];
  for (const w of chosen) {
    if (w.answer.length > size) continue;
    let ok = false;
    for (let t = 0; t < 250 && !ok; t++) {
      const [dr, dc] = dirs[Math.floor(rng() * dirs.length)];
      const r0 = Math.floor(rng() * size), c0 = Math.floor(rng() * size);
      const r1 = r0 + dr * (w.answer.length - 1), c1 = c0 + dc * (w.answer.length - 1);
      if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
      const cells: [number, number][] = [];
      let fits = true;
      for (let k = 0; k < w.answer.length && fits; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        if (grid[r][c] !== null && grid[r][c] !== w.answer[k]) fits = false;
        cells.push([r, c]);
      }
      if (!fits) continue;
      cells.forEach(([r, c], k) => (grid[r][c] = w.answer[k]));
      placed.push({ id: w.id, answer: w.answer, display: w.display, cells });
      ok = true;
    }
  }
  if (placed.length < Math.min(6, chosen.length)) return null;
  const letters = pool.map((w) => w.answer).join('');
  const out = grid.map((row) => row.map((ch) => ch ?? letters[Math.floor(rng() * letters.length)].toUpperCase()));
  placed.forEach((p) => p.cells.forEach(([r, c]) => (out[r][c] = out[r][c].toUpperCase())));
  return { size, cells: out, placed };
}

/** Cases d'une ligne droite (horizontale, verticale ou diagonale) entre deux cases, ou null. */
export function lineCells(a: [number, number], b: [number, number]): [number, number][] | null {
  const dr = b[0] - a[0], dc = b[1] - a[1];
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const n = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr), sc = Math.sign(dc);
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) out.push([a[0] + sr * k, a[1] + sc * k]);
  return out;
}

// ---------------------------------------------------------
// Lettres mélangées
// ---------------------------------------------------------
/** Mélange les lettres d'un mot en garantissant un résultat différent de l'original (null si impossible). */
export function scrambleLetters(answer: string, rng: Rng = Math.random): string[] | null {
  const letters = answer.split('');
  if (new Set(letters).size < 2) return null;
  for (let t = 0; t < 50; t++) {
    const s = shuffle(letters, rng);
    if (s.join('') !== answer) return s;
  }
  return null;
}

/** Réponses acceptées pour un mélange : le mot lui-même et tout autre mot du vocabulaire qui est un anagramme. */
export function anagramAnswers(answer: string, all: JeuWord[]): Set<string> {
  const key = answer.split('').sort().join('');
  const out = new Set<string>([answer]);
  for (const w of all) if (w.answer.length === answer.length && w.answer.split('').sort().join('') === key) out.add(w.answer);
  return out;
}

// ---------------------------------------------------------
// Boggle
// ---------------------------------------------------------
export type BoggleGrid = { size: number; letters: string[]; found: Map<string, JeuWord> };

function neighbors(i: number, size: number): number[] {
  const r = Math.floor(i / size), c = i % size, out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
  }
  return out;
}

/** Vrai si le mot se lit dans la grille (cases voisines, sans réutiliser une case). */
export function boggleHas(letters: string[], size: number, word: string): boolean {
  const used = new Array(letters.length).fill(false);
  const go = (i: number, k: number): boolean => {
    if (letters[i] !== word[k]) return false;
    if (k === word.length - 1) return true;
    used[i] = true;
    for (const n of neighbors(i, size)) if (!used[n] && go(n, k + 1)) { used[i] = false; return true; }
    used[i] = false;
    return false;
  };
  for (let i = 0; i < letters.length; i++) if (go(i, 0)) return true;
  return false;
}

export function generateBoggle(pool: JeuWord[], size = 4, minFound = 5, rng: Rng = Math.random): BoggleGrid | null {
  const usable = pool.filter((w) => w.answer.length >= 3 && w.answer.length <= size * size - 2);
  if (usable.length < minFound + 2) return null;
  const freq = usable.map((w) => w.answer).join('');
  let best: BoggleGrid | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const letters: (string | null)[] = Array(size * size).fill(null);
    const targets = shuffle(usable.filter((w) => w.answer.length <= size + 2), rng).slice(0, size + 2);
    for (const w of targets) {
      const used = new Set<number>();
      const go = (i: number, k: number): number[] | null => {
        if (letters[i] !== null && letters[i] !== w.answer[k]) return null;
        used.add(i);
        if (k === w.answer.length - 1) return [i];
        for (const n of shuffle(neighbors(i, size), rng)) {
          if (used.has(n)) continue;
          const rest = go(n, k + 1);
          if (rest) return [i, ...rest];
        }
        used.delete(i);
        return null;
      };
      for (const start of shuffle(Array.from({ length: size * size }, (_, i) => i), rng)) {
        used.clear();
        const path = go(start, 0);
        if (path) { path.forEach((cell, k) => (letters[cell] = w.answer[k])); break; }
      }
    }
    const full = letters.map((l) => l ?? freq[Math.floor(rng() * freq.length)]);
    const found = new Map<string, JeuWord>();
    for (const w of usable) if (boggleHas(full, size, w.answer)) found.set(w.answer, w);
    if (!best || found.size > best.found.size) best = { size, letters: full, found };
    if (found.size >= minFound + 2) break;
  }
  return best && best.found.size >= minFound ? best : null;
}

export function boggleScore(len: number): number {
  return len <= 4 ? 1 : len === 5 ? 2 : len === 6 ? 3 : 5;
}

// ---------------------------------------------------------
// Mahjong solitaire (kanji ↔ hiragana)
// ---------------------------------------------------------
export type MjPos = { r: number; c: number; z: number };

export function mjLayout(big: boolean): MjPos[] {
  const out: MjPos[] = [];
  const rows = 4, cols = big ? 6 : 5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ r, c, z: 0 });
  if (big) for (let r = 1; r <= 2; r++) for (let c = 1; c <= 4; c++) out.push({ r, c, z: 1 });
  return out;
}

/**
 * Construit une partie TOUJOURS finissable : les paires sont posées en partant de la fin (ordre inverse des retraits).
 * Une paire n'est posée que si ses deux cases sont portées (case du dessous déjà occupée) et libres au moment du retrait
 * (rien dessus, un côté dégagé). Renvoie les paires d'indices de positions, dans l'ordre de pose.
 */
export function buildSolvableLayout(positions: MjPos[], rng: Rng = Math.random, attempts = 800): [number, number][] | null {
  const idx = new Map(positions.map((p, i) => [`${p.r},${p.c},${p.z}`, i]));
  const at = (r: number, c: number, z: number) => idx.get(`${r},${c},${z}`);
  for (let t = 0; t < attempts; t++) {
    const occ = new Set<number>();
    const pairs: [number, number][] = [];
    const eligible = (i: number, extra: number | null): boolean => {
      if (occ.has(i) || i === extra) return false;
      const p = positions[i];
      if (p.z > 0) {
        const below = at(p.r, p.c, p.z - 1);
        if (below === undefined || (!occ.has(below) && below !== extra)) return false;
      }
      const l = at(p.r, p.c - 1, p.z), r = at(p.r, p.c + 1, p.z);
      const lo = l !== undefined && (occ.has(l) || l === extra);
      const ro = r !== undefined && (occ.has(r) || r === extra);
      if (lo && ro) return false;
      // Forme : dans une rangée d'un étage, les tuiles posées forment toujours un bloc continu (une case ne se retrouve jamais
      // coincée entre deux tuiles), donc on ne démarre qu'une seule « graine » par rangée et on l'agrandit par un bout.
      if (!lo && !ro) {
        for (let k = 0; k < positions.length; k++) {
          const q = positions[k];
          if (q.r === p.r && q.z === p.z && (occ.has(k) || k === extra)) return false;
        }
      }
      return true;
    };
    let ok = true;
    while (occ.size < positions.length) {
      const all = positions.map((_, i) => i);
      const firsts = shuffle(all.filter((i) => eligible(i, null)), rng);
      let done = false;
      for (const a of firsts) {
        const seconds = shuffle(all.filter((j) => j !== a && eligible(j, a)), rng);
        for (const b of seconds) {
          if (positions[a].r === positions[b].r && positions[a].c === positions[b].c) continue; // une tuile ne peut pas être sous sa partenaire
          // les deux cases doivent rester libres l'une avec l'autre
          const check = (i: number, other: number) => {
            const p = positions[i];
            const l = at(p.r, p.c - 1, p.z), r = at(p.r, p.c + 1, p.z);
            const lo = l !== undefined && (occ.has(l) || l === other);
            const ro = r !== undefined && (occ.has(r) || r === other);
            return !(lo && ro);
          };
          if (check(a, b) && check(b, a)) {
            occ.add(a); occ.add(b); pairs.push([a, b]); done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done) { ok = false; break; }
    }
    if (ok) return pairs;
  }
  return null;
}

export type MjTile = { id: number; r: number; c: number; z: number; wordId: string; kind: 'kanji' | 'kana'; label: string };

export function isTileFree(t: MjTile, tiles: MjTile[]): boolean {
  let left = false, right = false;
  for (const o of tiles) {
    if (o.id === t.id) continue;
    if (o.z === t.z + 1 && o.r === t.r && o.c === t.c) return false;
    if (o.z === t.z && o.r === t.r && o.c === t.c - 1) left = true;
    if (o.z === t.z && o.r === t.r && o.c === t.c + 1) right = true;
  }
  return !(left && right);
}

export function mjFindPair(tiles: MjTile[]): [MjTile, MjTile] | null {
  const free = tiles.filter((t) => isTileFree(t, tiles));
  for (const a of free) for (const b of free) if (a.id < b.id && a.wordId === b.wordId) return [a, b];
  return null;
}

/** Choisit des mots dont les lectures sont toutes différentes (pas d'homophones dans une même partie). */
export function pickDistinctReadings<T extends { reading: string }>(words: T[], n: number, rng: Rng = Math.random): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const w of shuffle(words, rng)) {
    if (seen.has(w.reading)) continue;
    seen.add(w.reading);
    out.push(w);
    if (out.length === n) break;
  }
  return out;
}

export function buildMahjong(
  words: { id: string; kanji: string; reading: string }[],
  big: boolean,
  rng: Rng = Math.random
): MjTile[] | null {
  const positions = mjLayout(big);
  const pairsNeeded = positions.length / 2;
  const chosen = pickDistinctReadings(words, pairsNeeded, rng);
  if (chosen.length < pairsNeeded) return null;
  const pairs = buildSolvableLayout(positions, rng);
  if (!pairs) return null;
  const tiles: MjTile[] = [];
  pairs.forEach(([a, b], k) => {
    const w = chosen[k];
    const flip = rng() < 0.5;
    const pa = positions[a], pb = positions[b];
    tiles.push({ id: a, ...pa, wordId: w.id, kind: flip ? 'kanji' : 'kana', label: flip ? w.kanji : w.reading });
    tiles.push({ id: b, ...pb, wordId: w.id, kind: flip ? 'kana' : 'kanji', label: flip ? w.reading : w.kanji });
  });
  return tiles;
}

// ---------------------------------------------------------
// Phrases à trous
// ---------------------------------------------------------
export type ClozeWord = { id: string; target_text: string; theme_code: string; word_type: string };
export type ClozeItem = {
  phraseId: string;
  translation_fr: string;
  audio_url: string | null;
  before: string;
  after: string;
  expected: string; // forme exacte telle qu'écrite dans la phrase
  word: ClozeWord;
  choices: string[]; // vide en saisie libre (calculé à la demande par makeChoices)
};

export type ClozePhrase = { id: string; target_text: string; translation_fr: string; audio_url: string | null };

/** Retrouve, dans chaque phrase, un mot du vocabulaire à masquer. Un seul trou par phrase. */
export function buildClozeItems(
  phrases: ClozePhrase[],
  pool: ClozeWord[],
  lang: string,
  rng: Rng = Math.random
): { items: ClozeItem[]; coveredWordIds: Set<string> } {
  const items: ClozeItem[] = [];
  const covered = new Set<string>();
  if (lang === 'ja') {
    const cands = pool.filter((w) => w.target_text.length >= 2 || /\p{Script=Han}/u.test(w.target_text)).sort((a, b) => b.target_text.length - a.target_text.length);
    for (const p of phrases) {
      const hits = cands.filter((w) => p.target_text.includes(w.target_text));
      if (hits.length === 0) continue;
      hits.forEach((h) => covered.add(h.id));
      const w = hits[Math.floor(rng() * Math.min(hits.length, 3))];
      const i = p.target_text.indexOf(w.target_text);
      items.push({ phraseId: p.id, translation_fr: p.translation_fr, audio_url: p.audio_url, before: p.target_text.slice(0, i), after: p.target_text.slice(i + w.target_text.length), expected: w.target_text, word: w, choices: [] });
    }
    return { items, coveredWordIds: covered };
  }
  const byAnswer = new Map<string, ClozeWord[]>();
  for (const w of pool) {
    const a = jeuAnswer(w.target_text, lang);
    if (!a || a.answer.length < 3) continue;
    const list = byAnswer.get(a.answer) ?? [];
    list.push(w);
    byAnswer.set(a.answer, list);
  }
  for (const p of phrases) {
    const toks = Array.from(p.target_text.matchAll(/\p{L}+/gu)).filter((m) => byAnswer.has(normLetters(m[0])));
    if (toks.length === 0) continue;
    toks.forEach((m) => byAnswer.get(normLetters(m[0]))!.forEach((w) => covered.add(w.id)));
    const m = toks[Math.floor(rng() * toks.length)];
    const word = byAnswer.get(normLetters(m[0]))![0];
    const i = m.index!;
    items.push({ phraseId: p.id, translation_fr: p.translation_fr, audio_url: p.audio_url, before: p.target_text.slice(0, i), after: p.target_text.slice(i + m[0].length), expected: m[0], word, choices: [] });
  }
  return { items, coveredWordIds: covered };
}

function capitalizeLike(model: string, s: string): string {
  return model.charAt(0) !== model.charAt(0).toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** 4 propositions : la bonne réponse + 3 mots du même thème et de la même catégorie grammaticale si possible. */
export function makeChoices(item: ClozeItem, allWords: ClozeWord[], lang: string, rng: Rng = Math.random): string[] {
  const labelOf = (w: ClozeWord) => (lang === 'ja' ? w.target_text : (jeuAnswer(w.target_text, lang)?.display ?? ''));
  const good = normLetters(item.expected) || item.expected;
  const keyOf = (s: string) => (lang === 'ja' ? s : normLetters(s));
  const others = allWords.filter((w) => w.id !== item.word.id && labelOf(w) && keyOf(labelOf(w)) !== keyOf(item.expected) && (lang === 'ja' || (jeuAnswer(w.target_text, lang)?.answer.length ?? 0) >= 3));
  const tiers = [
    others.filter((w) => w.theme_code === item.word.theme_code && w.word_type === item.word.word_type),
    others.filter((w) => w.word_type === item.word.word_type),
    others,
  ];
  const picked: string[] = [];
  const seen = new Set<string>([keyOf(item.expected)]);
  for (const tier of tiers) {
    for (const w of shuffle(tier, rng)) {
      const label = labelOf(w);
      if (seen.has(keyOf(label))) continue;
      seen.add(keyOf(label));
      picked.push(lang === 'ja' ? label : capitalizeLike(item.expected, label.toLowerCase() === label ? label : label));
      if (picked.length === 3) break;
    }
    if (picked.length === 3) break;
  }
  void good;
  return shuffle([item.expected, ...picked], rng);
}
