import { normalizeForCompare } from './textUtils';
import { EXTRA_VOCAB_THEMES } from './constants';

// Planificateur de leçons — module PUR (pas de base de données, pas de 'use server').
// Entrée : les mots et verbes déjà en base ; sortie : le plan de N leçons, identique pour tous les profils.

// Plan de leçons : TOUJOURS 60 leçons « obligatoires » (les mots des packs attendus du niveau : 4 packs en A1/A2, 5 en B1/B2,
// répartis par nature sur les 60 leçons — plus il y a de mots, plus les leçons en contiennent), puis des leçons
// « optionnelles » (numéros 61 et suivants) avec les mots des packs optionnels actifs.
export const LESSON_MAIN_COUNT = 60;
export const LESSON_VERBS = 2; // 120 verbes par niveau / 60 leçons
export const LESSON_OPTIONAL_MIN_SIZE = 15; // taille minimale d'une leçon optionnelle (mots)
export const LESSON_REVIEW = 6; // mots de révision, en plus des 20 mots
export const LESSON_REVIEW_WINDOW = 3; // la révision pioche dans les 3 leçons précédentes
export const LESSON_KANJI = 4; // kanji à apprendre par leçon (japonais)
export const CONJUGATION_RECAP_EVERY = 5; // une fiche de conjugaison récapitulative toutes les 5 leçons

// Thèmes du plus indispensable au moins indispensable pour un débutant complet.
export const LESSON_THEME_ORDER = [
  'greetings',
  'numbers_time',
  'food_restaurant',
  'family',
  'transport',
  'shopping',
  'directions',
  'emotions',
  'work_school',
  'housing',
  'health',
  'leisure',
  'weather',
  'technology',
  'emergencies',
] as const;

export type PlanWord = { id: string; theme_code: string; word_type: string; score: number | null; text: string; optional?: boolean }; // optional : mot d'un pack optionnel (numéro au-dessus des packs attendus)
export type PlanVerb = { id: string; frequency_rank: number; text?: string };
export type ReviewItem = { k: 'w' | 'v'; id: string };

export type PlannedLesson = {
  number: number;
  theme_code: string;
  noun_ids: string[];
  adjective_ids: string[];
  other_ids: string[];
  verb_ids: string[];
  phrase_ids: string[];
  review: ReviewItem[];
  kanji_chars: string[];
  grammar_topic_code: string | null;
};

export type PlanResult = { ok: true; lessons: PlannedLesson[]; warnings: string[] } | { ok: false; error: string };

// --- petit générateur pseudo-aléatoire reproductible (mulberry32) ---
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Du plus utile au moins utile ; sans score on tombe à 50 (milieu), puis ordre alphabétique stable.
function byUsage(a: PlanWord, b: PlanWord): number {
  const sa = a.score ?? 50;
  const sb = b.score ?? 50;
  if (sb !== sa) return sb - sa;
  return a.text.localeCompare(b.text);
}

/** Clé de comparaison d'un mot : casse, accents et apostrophes typographiques (’ ‘ ´) ignorés. */
export function wordKey(text: string): string {
  return normalizeForCompare((text ?? '').replace(/[\u2019\u2018\u00B4`]/g, "'"));
}

/**
 * Retire les doublons (même mot écrit à l'identique, parfois sous deux thèmes ou deux niveaux dans la base)
 * et les mots à ignorer (déjà appris à un autre niveau). On garde, pour chaque mot, l'exemplaire le plus utile.
 */
export function dedupeWords(words: PlanWord[], exclude: Set<string> = new Set()): PlanWord[] {
  const best = new Map<string, PlanWord>();
  for (const w of words) {
    const key = wordKey(w.text);
    if (!key || exclude.has(key)) continue;
    const cur = best.get(key);
    if (!cur) {
      best.set(key, w);
      continue;
    }
    const cmp = byUsage(w, cur);
    if (cmp < 0 || (cmp === 0 && w.id < cur.id)) best.set(key, w);
  }
  return Array.from(best.values());
}

// Ordre des thèmes : les 15 thèmes principaux (du plus indispensable au moins indispensable), puis les thèmes supplémentaires.
const THEME_ORDER: readonly string[] = [...LESSON_THEME_ORDER, ...EXTRA_VOCAB_THEMES.map((t) => t.code)];

function themeRank(code: string): number {
  const i = THEME_ORDER.indexOf(code);
  return i < 0 ? THEME_ORDER.length : i; // thème inconnu : à la fin
}

function sortThemes(codes: string[]): string[] {
  return codes.slice().sort((a, b) => themeRank(a) - themeRank(b) || a.localeCompare(b));
}

/** Découpe `items` en `parts` tranches de tailles presque égales (les premiers éléments vont aux premières tranches). */
function splitEvenly<T>(items: T[], parts: number): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < parts; k++) out.push(items.slice(Math.round((k * items.length) / parts), Math.round(((k + 1) * items.length) / parts)));
  return out;
}

/**
 * Répartit `total` leçons entre les thèmes au prorata de leur nombre de mots (au moins 1 leçon par thème),
 * méthode du plus grand reste. Retourne le nombre de leçons de chaque thème.
 */
export function allocateLessons(wordsByTheme: Map<string, number>, total: number): Map<string, number> {
  const themes = sortThemes(Array.from(wordsByTheme.keys()).filter((t) => (wordsByTheme.get(t) ?? 0) > 0));
  const sum = themes.reduce((s, t) => s + wordsByTheme.get(t)!, 0);
  const result = new Map<string, number>();
  if (themes.length === 0 || sum === 0) return result;
  const exact = new Map(themes.map((t) => [t, (wordsByTheme.get(t)! / sum) * total]));
  for (const t of themes) result.set(t, Math.max(1, Math.floor(exact.get(t)!)));
  let diff = total - Array.from(result.values()).reduce((s, c) => s + c, 0);
  while (diff > 0) {
    // le thème le plus « sous-doté » par rapport à son poids reçoit une leçon de plus
    const t = themes.reduce((best, cur) => (exact.get(cur)! - result.get(cur)! > exact.get(best)! - result.get(best)! ? cur : best), themes[0]);
    result.set(t, result.get(t)! + 1);
    diff--;
  }
  while (diff < 0) {
    const cands = themes.filter((t) => result.get(t)! > 1);
    if (cands.length === 0) break; // plus de thèmes que de leçons : on garde 1 leçon par thème
    const t = cands.reduce((best, cur) => (result.get(cur)! - exact.get(cur)! > result.get(best)! - exact.get(best)! ? cur : best), cands[0]);
    result.set(t, result.get(t)! - 1);
    diff++;
  }
  return result;
}

type NatureBuckets = { nouns: PlanWord[]; adjectives: PlanWord[]; fillers: PlanWord[] };

function bucketByNature(words: PlanWord[]): NatureBuckets {
  const sorted = words.slice().sort(byUsage);
  return {
    nouns: sorted.filter((w) => w.word_type === 'nom'),
    adjectives: sorted.filter((w) => w.word_type === 'adjectif'),
    fillers: sorted.filter((w) => w.word_type !== 'nom' && w.word_type !== 'adjectif'), // adverbes + expressions
  };
}

/** Répartit les mots d'UN thème sur `lessonCount` leçons, nature par nature (noms, adjectifs, adverbes/expressions). */
function spreadByNature(words: PlanWord[], lessonCount: number): { noun_ids: string[]; adjective_ids: string[]; other_ids: string[] }[] {
  const b = bucketByNature(words);
  const n = splitEvenly(b.nouns, lessonCount);
  const a = splitEvenly(b.adjectives, lessonCount);
  const f = splitEvenly(b.fillers, lessonCount);
  return n.map((_, k) => ({
    noun_ids: n[k].map((w) => w.id),
    adjective_ids: a[k].map((w) => w.id),
    other_ids: f[k].map((w) => w.id),
  }));
}

function groupByTheme(words: PlanWord[]): Map<string, PlanWord[]> {
  const m = new Map<string, PlanWord[]>();
  for (const w of words) {
    if (!m.has(w.theme_code)) m.set(w.theme_code, []);
    m.get(w.theme_code)!.push(w);
  }
  return m;
}

export function planLessons(input: {
  languageCode: string;
  levelCode: string;
  words: PlanWord[];
  verbs: PlanVerb[]; // verbes encore disponibles (déjà privés de ceux utilisés aux niveaux inférieurs)
  grammarTopicCodes: string[]; // fiches de grammaire utilisables à ce niveau, dans l'ordre
  excludeTexts?: string[]; // mots déjà appris à un autre niveau (écriture exacte)
  kanjiAvailable?: string[]; // japonais : kanji disponibles dans le module Kanji, déjà privés de ceux d'autres niveaux
}): PlanResult {
  const { languageCode, levelCode, verbs, grammarTopicCodes } = input;
  const exclude = new Set((input.excludeTexts ?? []).map(wordKey));
  const warnings: string[] = [];

  // Doublons et mots déjà appris ailleurs : ignorés. Un mot présent dans un pack attendu ET un pack optionnel reste dans l'attendu.
  const mandatoryWords = dedupeWords(input.words.filter((w) => !w.optional), exclude);
  const mandatoryKeys = new Set(mandatoryWords.map((w) => wordKey(w.text)));
  const optionalWords = dedupeWords(input.words.filter((w) => w.optional), new Set([...exclude, ...mandatoryKeys]));
  const duplicates = input.words.length - mandatoryWords.length - optionalWords.length;
  if (duplicates > 0) warnings.push(`${duplicates} doublons ou mots déjà appris à un autre niveau ont été ignorés.`);

  if (mandatoryWords.length < LESSON_MAIN_COUNT) {
    return {
      ok: false,
      error: `Pas assez de mots dans les packs attendus et actifs (${mandatoryWords.length} ; il en faut au moins ${LESSON_MAIN_COUNT} pour ${LESSON_MAIN_COUNT} leçons). Télécharge les packs de vocabulaire du niveau, ou active-les dans « Packs ».`,
    };
  }

  const verbsSorted = verbs.slice().sort((a, b) => a.frequency_rank - b.frequency_rank);
  const lessons: PlannedLesson[] = [];
  const blank = (number: number, theme_code: string): PlannedLesson => ({
    number,
    theme_code,
    noun_ids: [],
    adjective_ids: [],
    other_ids: [],
    verb_ids: [],
    phrase_ids: [],
    review: [],
    kanji_chars: [],
    grammar_topic_code: grammarTopicCodes.length > 0 ? grammarTopicCodes[(number - 1) % grammarTopicCodes.length] : null,
  });

  // --- 1) Les 60 leçons obligatoires : un thème après l'autre, mots répartis par nature, 2 verbes par leçon ---
  const byTheme = groupByTheme(mandatoryWords);
  const counts = allocateLessons(new Map(Array.from(byTheme.entries()).map(([t, ws]) => [t, ws.length])), LESSON_MAIN_COUNT);
  for (const theme of sortThemes(Array.from(counts.keys()))) {
    const parts = spreadByNature(byTheme.get(theme)!, counts.get(theme)!);
    for (const part of parts) {
      const l = blank(lessons.length + 1, theme);
      l.noun_ids = part.noun_ids;
      l.adjective_ids = part.adjective_ids;
      l.other_ids = part.other_ids;
      lessons.push(l);
    }
  }
  lessons.forEach((l, i) => (l.verb_ids = verbsSorted.slice(i * LESSON_VERBS, (i + 1) * LESSON_VERBS).map((v) => v.id)));
  const verbsUsed = Math.min(verbsSorted.length, lessons.length * LESSON_VERBS);
  if (verbsUsed < lessons.length * LESSON_VERBS) {
    warnings.push(`Seulement ${verbsSorted.length} verbes disponibles pour ${lessons.length} leçons (${LESSON_VERBS} par leçon) : les dernières leçons n'ont pas tous leurs verbes.`);
  }
  const mainSize = Math.ceil(mandatoryWords.length / lessons.length);
  warnings.push(`${lessons.length} leçons obligatoires (${mandatoryWords.length} mots, environ ${mainSize} par leçon).`);

  // --- 2) Leçons optionnelles (61 et suivantes) : mots des packs optionnels actifs, thème par thème ---
  if (optionalWords.length > 0) {
    const size = Math.max(LESSON_OPTIONAL_MIN_SIZE, mainSize); // même taille que les leçons obligatoires
    const optByTheme = groupByTheme(optionalWords);
    const small: PlanWord[] = []; // thèmes trop petits pour une leçon à eux seuls : regroupés
    const startOptional = lessons.length;
    for (const theme of sortThemes(Array.from(optByTheme.keys()))) {
      const ws = optByTheme.get(theme)!;
      if (ws.length < Math.ceil(size / 2)) {
        small.push(...ws);
        continue;
      }
      const parts = spreadByNature(ws, Math.max(1, Math.round(ws.length / size)));
      for (const part of parts) {
        const l = blank(lessons.length + 1, theme);
        l.noun_ids = part.noun_ids;
        l.adjective_ids = part.adjective_ids;
        l.other_ids = part.other_ids;
        lessons.push(l);
      }
    }
    if (small.length > 0) {
      small.sort((a, b) => themeRank(a.theme_code) - themeRank(b.theme_code));
      const chunks = splitEvenly(small, Math.max(1, Math.round(small.length / size)));
      for (const chunk of chunks) {
        const tally = new Map<string, number>();
        for (const w of chunk) tally.set(w.theme_code, (tally.get(w.theme_code) ?? 0) + 1);
        const main = Array.from(tally.entries()).sort((a, b) => b[1] - a[1] || themeRank(a[0]) - themeRank(b[0]))[0][0];
        const part = spreadByNature(chunk, 1)[0];
        const l = blank(lessons.length + 1, main);
        l.noun_ids = part.noun_ids;
        l.adjective_ids = part.adjective_ids;
        l.other_ids = part.other_ids;
        lessons.push(l);
      }
    }
    warnings.push(`${lessons.length - startOptional} leçons optionnelles (${optionalWords.length} mots des packs optionnels actifs).`);
  }

  // Japonais : kanji à apprendre, ceux qui apparaissent dans les mots (ordre d'apparition), au plus LESSON_KANJI par leçon ;
  // ce qui dépasse est reporté à la leçon suivante.
  if (input.kanjiAvailable && input.kanjiAvailable.length > 0) {
    const avail = new Set(input.kanjiAvailable);
    const textById = new Map<string, string>();
    for (const w of [...mandatoryWords, ...optionalWords]) textById.set(w.id, w.text);
    for (const v of verbsSorted) if (v.text) textById.set(v.id, v.text);
    const taught = new Set<string>();
    const pending: string[] = [];
    for (const l of lessons) {
      for (const id of [...l.noun_ids, ...l.adjective_ids, ...l.other_ids, ...l.verb_ids, ...l.phrase_ids]) {
        for (const ch of textById.get(id) ?? '') {
          if (avail.has(ch) && !taught.has(ch) && !pending.includes(ch)) pending.push(ch);
        }
      }
      l.kanji_chars = pending.splice(0, LESSON_KANJI);
      for (const ch of l.kanji_chars) taught.add(ch);
    }
  }

  // Révision : 6 éléments tirés (au hasard reproductible) des 3 leçons précédentes.
  for (let i = 1; i < lessons.length; i++) {
    const pool: ReviewItem[] = [];
    for (let j = Math.max(0, i - LESSON_REVIEW_WINDOW); j < i; j++) {
      const l = lessons[j];
      for (const id of [...l.noun_ids, ...l.adjective_ids, ...l.other_ids]) pool.push({ k: 'w', id });
      for (const id of l.verb_ids) pool.push({ k: 'v', id });
    }
    const rand = rng(hashString(`${languageCode}|${levelCode}|${lessons[i].number}`));
    lessons[i].review = shuffled(pool, rand).slice(0, LESSON_REVIEW);
  }

  // Contrôle final : aucun mot en double d'une leçon à l'autre.
  const seen = new Set<string>();
  for (const l of lessons) {
    for (const id of [...l.noun_ids, ...l.adjective_ids, ...l.other_ids, ...l.phrase_ids, ...l.verb_ids]) {
      if (seen.has(id)) return { ok: false, error: 'Plan invalide : un mot apparaît dans deux leçons.' };
      seen.add(id);
    }
  }

  return { ok: true, lessons, warnings };
}

/** Indice de l'exemple de grammaire à montrer : la n-ième visite d'une fiche montre son n-ième exemple. */
export function grammarExampleIndex(lessonNumber: number, topicCount: number, exampleCount: number): number {
  if (exampleCount <= 0 || topicCount <= 0) return 0;
  return Math.floor((lessonNumber - 1) / topicCount) % exampleCount;
}
