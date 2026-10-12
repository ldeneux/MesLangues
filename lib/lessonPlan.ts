import { normalizeForCompare } from './textUtils';

// Planificateur de leçons — module PUR (pas de base de données, pas de 'use server').
// Entrée : les mots et verbes déjà en base ; sortie : le plan de N leçons, identique pour tous les profils.

export const LESSON_TARGET_COUNT = 40; // nombre de leçons visé par langue et niveau
export const LESSON_WORDS = 20; // mots nouveaux par leçon (noms + adjectifs + verbes)
export const LESSON_VERBS = 3; // verbes par leçon
export const LESSON_PHRASES = 3; // adverbes / expressions utiles, en plus des 20 mots
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

// Poids des thèmes (même valeurs que THEMES dans constants.ts) : sert à répartir les leçons entre thèmes.
const THEME_WEIGHT: Record<string, number> = {
  food_restaurant: 11,
  greetings: 10,
  transport: 9,
  shopping: 8,
  numbers_time: 8,
  directions: 7,
  work_school: 7,
  family: 6,
  housing: 6,
  health: 6,
  emotions: 6,
  leisure: 5,
  technology: 5,
  emergencies: 3,
  weather: 3,
};

export type PlanWord = { id: string; theme_code: string; word_type: string; score: number | null; text: string };
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

/**
 * Répartit `total` leçons entre les thèmes : au prorata des poids, au moins 1 leçon par thème
 * (si total >= nombre de thèmes), dans l'ordre LESSON_THEME_ORDER. Retourne un thème par leçon.
 */
export function lessonThemes(total: number): string[] {
  const order = LESSON_THEME_ORDER.slice();
  if (total <= order.length) return order.slice(0, total);

  const weightSum = order.reduce((s, t) => s + (THEME_WEIGHT[t] ?? 5), 0);
  const raw = order.map((t) => ({ t, exact: ((THEME_WEIGHT[t] ?? 5) / weightSum) * total }));
  const counts = raw.map((r) => Math.max(1, Math.floor(r.exact)));
  let diff = total - counts.reduce((s, c) => s + c, 0);

  // plus grands restes d'abord pour ajouter ; plus grands thèmes d'abord pour retirer
  const byRemainder = raw.map((r, i) => ({ i, rem: r.exact - Math.floor(r.exact) })).sort((a, b) => b.rem - a.rem);
  let k = 0;
  while (diff > 0) {
    counts[byRemainder[k % byRemainder.length].i]++;
    diff--;
    k++;
  }
  while (diff < 0) {
    let big = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[big]) big = i;
    if (counts[big] <= 1) break;
    counts[big]--;
    diff++;
  }

  const result: string[] = [];
  order.forEach((t, i) => {
    for (let n = 0; n < counts[i]; n++) result.push(t);
  });
  return result;
}

type Pool = { byTheme: Map<string, PlanWord[]>; all: PlanWord[] };

function makePool(words: PlanWord[]): Pool {
  const sorted = words.slice().sort(byUsage);
  const byTheme = new Map<string, PlanWord[]>();
  for (const w of sorted) {
    if (!byTheme.has(w.theme_code)) byTheme.set(w.theme_code, []);
    byTheme.get(w.theme_code)!.push(w);
  }
  return { byTheme, all: sorted };
}

// Prend `n` mots non encore utilisés : d'abord ceux du thème (par utilité), puis les plus utiles de tous les thèmes.
function take(pool: Pool, theme: string, n: number, used: Set<string>): string[] {
  const out: string[] = [];
  if (n <= 0) return out;
  for (const w of pool.byTheme.get(theme) ?? []) {
    if (out.length >= n) break;
    if (!used.has(w.id)) {
      used.add(w.id);
      out.push(w.id);
    }
  }
  if (out.length < n) {
    for (const w of pool.all) {
      if (out.length >= n) break;
      if (!used.has(w.id)) {
        used.add(w.id);
        out.push(w.id);
      }
    }
  }
  return out;
}

export function planLessons(input: {
  languageCode: string;
  levelCode: string;
  words: PlanWord[];
  verbs: PlanVerb[]; // verbes encore disponibles (déjà privés de ceux utilisés aux niveaux inférieurs)
  grammarTopicCodes: string[]; // fiches de grammaire utilisables à ce niveau, dans l'ordre
  excludeTexts?: string[]; // mots déjà appris à un autre niveau (écriture exacte)
  kanjiAvailable?: string[]; // japonais : kanji disponibles dans le module Kanji, déjà privés de ceux d'autres niveaux
  targetCount?: number;
}): PlanResult {
  const { languageCode, levelCode, verbs, grammarTopicCodes } = input;
  const exclude = new Set((input.excludeTexts ?? []).map(wordKey));
  const target = input.targetCount ?? LESSON_TARGET_COUNT;
  const warnings: string[] = [];

  const words = dedupeWords(input.words, exclude);
  const duplicates = input.words.length - words.length;
  if (duplicates > 0) warnings.push(`${duplicates} doublons ou mots déjà appris à un autre niveau ont été ignorés.`);

  const nouns = words.filter((w) => w.word_type === 'nom');
  const adjectives = words.filter((w) => w.word_type === 'adjectif');
  const fillers = words.filter((w) => w.word_type !== 'nom' && w.word_type !== 'adjectif'); // adverbes + expressions

  const verbsSorted = verbs.slice().sort((a, b) => a.frequency_rank - b.frequency_rank);

  // Chaque leçon tire 17 mots du vocabulaire (+ 3 verbes). Le nombre de leçons est limité par les verbes et les mots.
  const perLessonFromVocab = LESSON_WORDS - LESSON_VERBS;
  const totalVocab = nouns.length + adjectives.length + fillers.length;
  const maxByVerbs = Math.floor(verbsSorted.length / LESSON_VERBS);
  const maxByWords = Math.floor(totalVocab / perLessonFromVocab);
  const total = Math.min(target, maxByVerbs, maxByWords);
  if (total < 1) {
    return {
      ok: false,
      error: `Pas assez de contenu pour une leçon (${nouns.length} noms, ${adjectives.length} adjectifs, ${verbsSorted.length} verbes). Télécharge d'abord les packs de vocabulaire et de conjugaison.`,
    };
  }
  if (total < target) {
    const byVerbs = maxByVerbs <= maxByWords;
    warnings.push(
      byVerbs
        ? `${total} leçons au lieu de ${target} : il n'y a que ${verbsSorted.length} verbes disponibles (3 par leçon).`
        : `${total} leçons au lieu de ${target} : il n'y a que ${totalVocab} mots de vocabulaire (17 par leçon).`
    );
  }

  // Si noms + adjectifs ne suffisent pas, les adverbes/expressions complètent les leçons ;
  // ce qui reste en plus alimente la carte « mots et expressions utiles » (jusqu'à 3 par leçon, en commençant par les premières leçons).
  const fillersNeeded = Math.max(0, perLessonFromVocab * total - (nouns.length + adjectives.length));
  let phraseBudget = Math.max(0, fillers.length - fillersNeeded);
  if (fillersNeeded > 0) warnings.push(`${fillersNeeded} adverbes/expressions complètent les noms et adjectifs manquants.`);

  const nounPool = makePool(nouns);
  const adjPool = makePool(adjectives);
  const fillerPool = makePool(fillers);

  const used = new Set<string>();
  const themes = lessonThemes(total);
  const A = adjectives.length;
  const lessons: PlannedLesson[] = [];

  for (let i = 0; i < total; i++) {
    const theme = themes[i];

    // Mots et expressions utiles : réservés d'abord, dans la limite du budget disponible.
    const phrase_ids = take(fillerPool, theme, Math.min(LESSON_PHRASES, phraseBudget), used);
    phraseBudget -= phrase_ids.length;

    // Adjectifs : répartis régulièrement sur toutes les leçons, au plus 6 par leçon.
    const adjCount = Math.min(6, Math.round(((i + 1) * A) / total) - Math.round((i * A) / total));
    const verb_ids = verbsSorted.slice(i * LESSON_VERBS, (i + 1) * LESSON_VERBS).map((v) => v.id);
    const adjective_ids = take(adjPool, theme, adjCount, used);

    // Noms : de quoi compléter jusqu'à 20 mots.
    const nounTarget = LESSON_WORDS - verb_ids.length - adjective_ids.length;
    const noun_ids = take(nounPool, theme, nounTarget, used);

    // Stock de noms épuisé : complément par des adverbes/expressions, puis par des adjectifs restants.
    const missing = nounTarget - noun_ids.length;
    const other_ids = missing > 0 ? take(fillerPool, theme, missing, used) : [];
    const stillMissing = missing - other_ids.length;
    if (stillMissing > 0) adjective_ids.push(...take(adjPool, theme, stillMissing, used));

    lessons.push({
      number: i + 1,
      theme_code: theme,
      noun_ids,
      adjective_ids,
      other_ids,
      verb_ids,
      phrase_ids,
      review: [],
      kanji_chars: [],
      grammar_topic_code: grammarTopicCodes.length > 0 ? grammarTopicCodes[i % grammarTopicCodes.length] : null,
    });
  }

  // Japonais : kanji à apprendre, ceux qui apparaissent dans les mots (ordre d'apparition), au plus LESSON_KANJI par leçon ;
  // ce qui dépasse est reporté à la leçon suivante.
  if (input.kanjiAvailable && input.kanjiAvailable.length > 0) {
    const avail = new Set(input.kanjiAvailable);
    const textById = new Map<string, string>();
    for (const w of words) textById.set(w.id, w.text);
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
