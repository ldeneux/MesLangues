'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { grammarTopicsFor, THEMES, type GrammarTopicMeta } from './constants';
import { getGrammarTopic, type GrammarTopic } from './grammar';
import type { ConjugationVerb } from './conjugation';
import { planLessons, dedupeWords, wordKey, grammarExampleIndex, CONJUGATION_RECAP_EVERY, type PlanWord, type PlannedLesson, type ReviewItem } from './lessonPlan';
import { synthesizeAndStore } from './tts';
import { imageFileName, imageBareKey } from './imageName';
import { resolveImage, nearImage } from './imageIndex';
import type { KanjiItem } from './kanji';
import { pickSentences, countGoodSentences, validateGenerated, SENTENCES_PER_LESSON, type MatchWordSpec, type MatchSpan, type SentenceCandidate } from './lessonMatch';

// ---------------------------------------------------------
// Mode Leçons : plan identique pour tous les profils (table `lessons`),
// seule la progression « leçon terminée » est propre à chaque profil.
// Les erreurs sont renvoyées dans { ok: false, error } (jamais levées) :
// en production Next.js masquerait le message d'une erreur levée.
// ---------------------------------------------------------
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const MIGRATION_HINT = "exécute les migrations 020, 021 et 022 dans le SQL Editor de Supabase.";

function explain(message: string): string {
  if (message.includes('usage_score') || message.includes('kanji_chars')) return `Une colonne des leçons n'existe pas encore (usage_score ou kanji_chars) — ${MIGRATION_HINT}`;
  if (message.includes('lesson_sentences')) return `La table des phrases de leçon n'existe pas encore — exécute la migration 026 dans le SQL Editor de Supabase.`;
  if (message.includes('lessons') || message.includes('lesson_progress')) return `Les tables de leçons n'existent pas encore — ${MIGRATION_HINT}`;
  return message;
}

export type LessonWord = {
  id: string;
  text: string;
  fr: string;
  audio_url: string | null;
  word_type: string;
  theme_code: string;
  image: string | null; // nom du fichier image (sans extension) s'il existe dans public/image_webp, sinon null
};

export type LessonSetup = {
  nouns: number;
  adjectives: number;
  fillers: number; // adverbes + expressions
  verbs: number;
  total: number; // mots de vocabulaire du niveau
  unranked: number; // mots pas encore classés par utilité
  duplicates: number; // doublons exacts dans la base (ignorés par les leçons)
};

export type LessonSummary = {
  id: string;
  number: number;
  theme_code: string;
  wordCount: number;
  done: boolean;
  completed_at: string | null;
};

export type LessonsOverview = {
  setup: LessonSetup;
  lessons: LessonSummary[];
  verbAudioMissing: number; // verbes de la langue sans audio de l'infinitif
  images: ImageStatus;
};

type WordRow = { id: string; theme_code: string; word_type: string; target_text: string; usage_score: number | null };

// La lecture Supabase est plafonnée à 1000 lignes : on pagine.
async function fetchAllWords(languageCode: string, levelCode: string): Promise<WordRow[]> {
  const rows: WordRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('vocabulary_words')
      .select('id, theme_code, word_type, target_text, usage_score')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as WordRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function fetchVerbs(languageCode: string): Promise<{ id: string; frequency_rank: number; infinitive: string }[]> {
  let query = supabaseAdmin.from('conjugation_verbs').select('id, frequency_rank, infinitive').eq('language_code', languageCode);
  // Japonais : on ignore les anciens verbes au format européen (sans ja_data)
  if (languageCode === 'ja') query = query.not('ja_data', 'is', null);
  const { data, error } = await query.order('frequency_rank');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; frequency_rank: number; infinitive: string }[];
}

// Fiches de grammaire utilisables à ce niveau (japonais : fiches du niveau ; autres langues : toutes).
function lessonGrammarTopics(languageCode: string, levelCode: string): GrammarTopicMeta[] {
  const all = grammarTopicsFor(languageCode) as readonly GrammarTopicMeta[];
  const atLevel = all.filter((t) => t.level === levelCode);
  return (atLevel.length > 0 ? atLevel : all).slice();
}

function toPlanWords(words: WordRow[]): PlanWord[] {
  return words.map((w) => ({ id: w.id, theme_code: w.theme_code, word_type: w.word_type, score: w.usage_score, text: w.target_text }));
}

function countSetup(words: WordRow[], verbCount: number): LessonSetup {
  const unique = dedupeWords(toPlanWords(words));
  return {
    nouns: unique.filter((w) => w.word_type === 'nom').length,
    adjectives: unique.filter((w) => w.word_type === 'adjectif').length,
    fillers: unique.filter((w) => w.word_type === 'adverbe' || w.word_type === 'expression').length,
    verbs: verbCount,
    total: unique.length,
    unranked: words.filter((w) => w.usage_score == null).length,
    duplicates: words.length - unique.length,
  };
}

// ---------------------------------------------------------
// Vue d'ensemble : état de préparation + liste des leçons
// ---------------------------------------------------------
export async function getLessonsOverview(profileId: string, languageCode: string, levelCode: string): Promise<Result<LessonsOverview>> {
  try {
    const [words, verbs] = await Promise.all([fetchAllWords(languageCode, levelCode), fetchVerbs(languageCode)]);
    const setup = countSetup(words, verbs.length);

    const { data: lessonRows, error } = await supabaseAdmin
      .from('lessons')
      .select('id, number, theme_code, noun_ids, adjective_ids, other_ids, verb_ids')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .order('number');
    if (error) throw new Error(error.message);

    const { data: progress, error: pErr } = await supabaseAdmin
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('profile_id', profileId);
    if (pErr) throw new Error(pErr.message);
    const doneMap = new Map((progress ?? []).map((p: any) => [p.lesson_id as string, p.completed_at as string]));

    const lessons: LessonSummary[] = (lessonRows ?? []).map((l: any) => ({
      id: l.id,
      number: l.number,
      theme_code: l.theme_code,
      wordCount: (l.noun_ids?.length ?? 0) + (l.adjective_ids?.length ?? 0) + (l.other_ids?.length ?? 0) + (l.verb_ids?.length ?? 0),
      done: doneMap.has(l.id),
      completed_at: doneMap.get(l.id) ?? null,
    }));

    const verbAudioMissing = await countVerbsWithoutAudio(languageCode);
    const images = await imageStatus(languageCode, levelCode);
    return { ok: true, data: { setup, lessons, verbAudioMissing, images } };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur de chargement des leçons.') };
  }
}

// ---------------------------------------------------------
// Étape 1 : classer les mots par utilité (Gemini, par lots, reprenable)
// ---------------------------------------------------------
const RANK_BATCH = 70; // mots par appel Gemini
const RANK_PARALLEL = 3; // appels en parallèle par pas (< 60 s)

export type RankStepResult = { remaining: number; scoredThisStep: number };

async function countUnranked(languageCode: string, levelCode: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('vocabulary_words')
    .select('*', { count: 'exact', head: true })
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .is('usage_score', null);
  if (error) throw new Error(`${error.message || 'erreur de comptage'} (HTTP ${(error as any).status ?? '?'})`);
  return count ?? 0;
}

export async function rankVocabularyStep(languageCode: string, levelCode: string): Promise<Result<RankStepResult>> {
  try {
    const { data: todo, error } = await supabaseAdmin
      .from('vocabulary_words')
      .select('id, target_text, translation_fr, word_type')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .is('usage_score', null)
      .order('id')
      .limit(RANK_BATCH * RANK_PARALLEL);
    if (error) throw new Error(error.message);
    if (!todo || todo.length === 0) return { ok: true, data: { remaining: 0, scoredThisStep: 0 } };

    const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
    const system = `Tu es linguiste et professeur de ${langName} pour débutants francophones.
On te donne une liste numérotée de mots ${langName} avec leur traduction française.
Pour CHAQUE mot, donne un score d'utilité de 1 à 100 pour un débutant complet :
100 = indispensable dès les premiers jours (bonjour, eau, maison, manger, grand…) ;
50 = utile mais pas urgent ; 1 = rare, spécialisé ou facultatif.
Utilise toute l'échelle et départage les mots proches. Ne saute aucun numéro.
Réponds UNIQUEMENT par un tableau JSON de paires [numéro, score], par exemple [[0,92],[1,35]].`;

    const batches: (typeof todo)[] = [];
    for (let i = 0; i < todo.length; i += RANK_BATCH) batches.push(todo.slice(i, i + RANK_BATCH));

    const scored: { id: string; score: number }[] = [];
    await Promise.all(
      batches.map(async (batch) => {
        const user = batch.map((w, i) => `${i}|${w.target_text}|${w.translation_fr} (${w.word_type})`).join('\n');
        let parsed: unknown;
        try {
          parsed = JSON.parse(await callGemini(system, user));
        } catch {
          return; // lot ignoré : ses mots restent à classer au pas suivant
        }
        if (!Array.isArray(parsed)) return;
        for (const pair of parsed as unknown[]) {
          let idx: unknown;
          let sc: unknown;
          if (Array.isArray(pair)) [idx, sc] = pair;
          else if (pair && typeof pair === 'object') {
            idx = (pair as any).i ?? (pair as any).n ?? (pair as any).numero;
            sc = (pair as any).s ?? (pair as any).score;
          }
          if (typeof idx !== 'number' || typeof sc !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= batch.length) continue;
          if (!Number.isFinite(sc) || sc < 1 || sc > 100) continue;
          scored.push({ id: batch[idx].id, score: Math.round(sc) });
        }
      })
    );

    // Gemini n'a rien donné de valable : s'il ne reste que quelques mots, on leur met un score moyen ; sinon erreur.
    if (scored.length === 0) {
      if (todo.length <= 10) {
        for (const w of todo) await supabaseAdmin.from('vocabulary_words').update({ usage_score: 30 }).eq('id', w.id);
        return { ok: true, data: { remaining: 0, scoredThisStep: todo.length } };
      }
      return { ok: false, error: "Gemini n'a renvoyé aucun classement exploitable. Réessaie dans un instant." };
    }

    // Écriture par groupes de 15 mises à jour simultanées
    for (let i = 0; i < scored.length; i += 15) {
      const slice = scored.slice(i, i + 15);
      const results = await Promise.all(
        slice.map((s) => supabaseAdmin.from('vocabulary_words').update({ usage_score: s.score }).eq('id', s.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    }

    return { ok: true, data: { remaining: await countUnranked(languageCode, levelCode), scoredThisStep: scored.length } };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur pendant le classement des mots.') };
  }
}

// Textes (mots) enseignés dans les leçons des autres niveaux de la langue : pour ne pas les répéter.
async function textsLearnedAtOtherLevels(languageCode: string, levelCode: string): Promise<string[]> {
  const { data: other, error } = await supabaseAdmin
    .from('lessons')
    .select('level_code, noun_ids, adjective_ids, other_ids, phrase_ids')
    .eq('language_code', languageCode)
    .neq('level_code', levelCode);
  if (error) throw new Error(error.message);
  if (!other || other.length === 0) return [];

  const idsByLevel = new Map<string, Set<string>>();
  for (const l of other as any[]) {
    if (!idsByLevel.has(l.level_code)) idsByLevel.set(l.level_code, new Set());
    const set = idsByLevel.get(l.level_code)!;
    for (const id of [...(l.noun_ids ?? []), ...(l.adjective_ids ?? []), ...(l.other_ids ?? []), ...(l.phrase_ids ?? [])]) set.add(id);
  }
  const texts: string[] = [];
  for (const [lvl, ids] of idsByLevel) {
    const rows = await fetchAllWords(languageCode, lvl);
    for (const r of rows) if (ids.has(r.id)) texts.push(r.target_text);
  }
  return texts;
}

// ---------------------------------------------------------
// Étape 2 : créer le plan de leçons (aucun coût)
// ---------------------------------------------------------
export async function buildLessonPlan(
  languageCode: string,
  levelCode: string,
  replace = false
): Promise<Result<{ count: number; warnings: string[] }>> {
  try {
    const { count: existing, error: exErr } = await supabaseAdmin
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('language_code', languageCode)
      .eq('level_code', levelCode);
    if (exErr) throw new Error(exErr.message);
    if ((existing ?? 0) > 0 && !replace) return { ok: false, error: 'Un plan de leçons existe déjà pour cette langue et ce niveau.' };

    const words = await fetchAllWords(languageCode, levelCode);
    if (words.length === 0) return { ok: false, error: 'Aucun vocabulaire téléchargé pour ce niveau : va dans Packs.' };
    const unranked = words.filter((w) => w.usage_score == null).length;
    if (unranked > words.length * 0.1) {
      return { ok: false, error: `${unranked} mots ne sont pas encore classés par utilité : lance d'abord « Classer les mots par utilité ».` };
    }

    // Verbes : on exclut ceux déjà utilisés par les leçons d'un autre niveau de la même langue.
    const allVerbs = await fetchVerbs(languageCode);
    const { data: otherLessons, error: olErr } = await supabaseAdmin
      .from('lessons')
      .select('verb_ids')
      .eq('language_code', languageCode)
      .neq('level_code', levelCode);
    if (olErr) throw new Error(olErr.message);
    const usedVerbs = new Set<string>();
    for (const l of otherLessons ?? []) for (const id of (l as any).verb_ids ?? []) usedVerbs.add(id);
    const verbs = allVerbs.filter((v) => !usedVerbs.has(v.id));

    const topics = lessonGrammarTopics(languageCode, levelCode);
    const planWords: PlanWord[] = toPlanWords(words);

    // Mots déjà appris dans les leçons d'un autre niveau de la même langue : on ne les remet pas.
    const excludeTexts = await textsLearnedAtOtherLevels(languageCode, levelCode);

    // Japonais : kanji du module Kanji (ce niveau), sauf ceux déjà enseignés à un autre niveau.
    let kanjiAvailable: string[] = [];
    if (languageCode === 'ja') {
      const { data: kRows, error: kErr } = await supabaseAdmin.from('kanji').select('char, position').eq('level_code', levelCode).order('position');
      if (kErr && !kErr.message.includes('kanji')) throw new Error(kErr.message);
      const taughtElsewhere = new Set<string>();
      const { data: kl, error: klErr } = await supabaseAdmin.from('lessons').select('kanji_chars').eq('language_code', 'ja').neq('level_code', levelCode);
      if (klErr) throw new Error(klErr.message);
      for (const l of kl ?? []) for (const c of (l as any).kanji_chars ?? []) taughtElsewhere.add(c);
      kanjiAvailable = (kRows ?? []).map((k: any) => k.char as string).filter((c) => !taughtElsewhere.has(c));
    }

    const plan = planLessons({
      languageCode,
      levelCode,
      words: planWords,
      verbs: verbs.map((v) => ({ id: v.id, frequency_rank: v.frequency_rank, text: v.infinitive })),
      grammarTopicCodes: topics.map((t) => t.code),
      excludeTexts,
      kanjiAvailable,
    });
    if (!plan.ok) return { ok: false, error: (plan as { error: string }).error };
    const { lessons, warnings } = plan as { ok: true; lessons: PlannedLesson[]; warnings: string[] };

    if (existing && existing > 0) {
      const { error: delErr } = await supabaseAdmin.from('lessons').delete().eq('language_code', languageCode).eq('level_code', levelCode);
      if (delErr) throw new Error(delErr.message);
    }

    const rows = lessons.map((l) => ({
      language_code: languageCode,
      level_code: levelCode,
      number: l.number,
      theme_code: l.theme_code,
      noun_ids: l.noun_ids,
      adjective_ids: l.adjective_ids,
      other_ids: l.other_ids,
      verb_ids: l.verb_ids,
      phrase_ids: l.phrase_ids,
      review: l.review,
      kanji_chars: l.kanji_chars,
      grammar_topic_code: l.grammar_topic_code,
    }));
    const { error: insErr } = await supabaseAdmin.from('lessons').insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, data: { count: rows.length, warnings } };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur pendant la création du plan.') };
  }
}

export async function deleteLessonPlan(languageCode: string, levelCode: string): Promise<Result<true>> {
  try {
    const { error } = await supabaseAdmin.from('lessons').delete().eq('language_code', languageCode).eq('level_code', levelCode);
    if (error) throw new Error(error.message);
    return { ok: true, data: true };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Suppression impossible.') };
  }
}

// ---------------------------------------------------------
// Lecture d'une leçon
// ---------------------------------------------------------
export type LessonSentence = {
  id: string;
  text: string;
  fr: string;
  audio_url: string | null;
  source: 'pack' | 'generated'; // phrase d'un pack ou phrase écrite pour la leçon
  spans: MatchSpan[]; // où se trouvent les mots de la leçon dans le texte (pour les mettre en évidence)
};

export type LessonContent = {
  id: string;
  number: number;
  total: number;
  theme_code: string;
  nouns: LessonWord[];
  adjectives: LessonWord[];
  others: LessonWord[];
  phrases: LessonWord[];
  verbs: ConjugationVerb[];
  kanji: KanjiItem[]; // japonais : kanji à apprendre dans la leçon
  conjugationRecap: ConjugationVerb[]; // toutes les 5 leçons : verbes des 5 dernières leçons
  sentences: LessonSentence[]; // jusqu'à 3 phrases qui contiennent des mots de la leçon
  review: { kind: 'word' | 'verb'; word?: LessonWord; verb?: ConjugationVerb }[];
  grammar: {
    code: string;
    label: string;
    topic: GrammarTopic | null;
    exampleIndex: number;
  } | null;
  done: boolean;
};

export async function getLesson(profileId: string, languageCode: string, levelCode: string, number: number): Promise<Result<LessonContent>> {
  try {
    const { data: l, error } = await supabaseAdmin
      .from('lessons')
      .select('*')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .eq('number', number)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return { ok: false, error: `La leçon ${number} n'existe pas.` };

    const { count: total } = await supabaseAdmin
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('language_code', languageCode)
      .eq('level_code', levelCode);

    const review: ReviewItem[] = Array.isArray(l.review) ? l.review : [];
    const wordIds: string[] = [
      ...(l.noun_ids ?? []),
      ...(l.adjective_ids ?? []),
      ...(l.other_ids ?? []),
      ...(l.phrase_ids ?? []),
      ...review.filter((r) => r.k === 'w').map((r) => r.id),
    ];
    const verbIds: string[] = [...(l.verb_ids ?? []), ...review.filter((r) => r.k === 'v').map((r) => r.id)];

    const { data: wordRows, error: wErr } = wordIds.length
      ? await supabaseAdmin.from('vocabulary_words').select('id, theme_code, word_type, target_text, translation_fr, audio_url').in('id', wordIds)
      : { data: [], error: null };
    if (wErr) throw new Error(wErr.message);
    // Nom d'image enregistré en base : requête à part, pour que la leçon reste lisible même si la migration 024 n'est pas exécutée.
    const dbImageById = new Map<string, string>();
    if (wordIds.length > 0) {
      const { data: imRows, error: imErr } = await supabaseAdmin.from('vocabulary_words').select('id, image').in('id', wordIds);
      if (!imErr) for (const r of imRows ?? []) if ((r as any).image) dbImageById.set((r as any).id, (r as any).image);
    }

    const wordMap = new Map<string, LessonWord>(
      (wordRows ?? []).map((w: any) => [
        w.id,
        {
          id: w.id,
          text: w.target_text,
          fr: w.translation_fr,
          audio_url: w.audio_url,
          word_type: w.word_type,
          theme_code: w.theme_code,
          image: resolveImage(dbImageById.get(w.id), w.translation_fr),
        },
      ])
    );

    const verbColumns =
      languageCode === 'ja'
        ? 'id, infinitive, translation_fr, frequency_rank, theme_code, tenses, tense_audio, ja_data'
        : 'id, infinitive, translation_fr, frequency_rank, theme_code, tenses, tense_audio';
    const { data: verbRows, error: vErr } = verbIds.length
      ? await supabaseAdmin.from('conjugation_verbs').select(verbColumns).in('id', verbIds)
      : { data: [], error: null };
    if (vErr) throw new Error(vErr.message);
    const verbMap = new Map<string, ConjugationVerb>((verbRows ?? []).map((v: any) => [v.id, v as ConjugationVerb]));

    // Japonais : kanji de la leçon (fiches du module Kanji)
    let kanji: KanjiItem[] = [];
    const kChars: string[] = Array.isArray(l.kanji_chars) ? l.kanji_chars : [];
    if (languageCode === 'ja' && kChars.length > 0) {
      const { data: kRows } = await supabaseAdmin
        .from('kanji')
        .select('id, char, level_code, position, meaning_fr, onyomi, kunyomi, examples')
        .in('char', kChars);
      const byChar = new Map<string, KanjiItem>(
        (kRows ?? []).map((k: any) => [
          k.char,
          {
            ...k,
            onyomi: Array.isArray(k.onyomi) ? k.onyomi : [],
            kunyomi: Array.isArray(k.kunyomi) ? k.kunyomi : [],
            examples: Array.isArray(k.examples) ? k.examples : [],
          } as KanjiItem,
        ])
      );
      kanji = kChars.map((c) => byChar.get(c)).filter((k): k is KanjiItem => !!k);
    }

    // Fiche de conjugaison récapitulative : toutes les 5 leçons, les verbes des 5 dernières leçons
    let conjugationRecap: ConjugationVerb[] = [];
    if (number % CONJUGATION_RECAP_EVERY === 0) {
      const { data: prev, error: pErr } = await supabaseAdmin
        .from('lessons')
        .select('number, verb_ids')
        .eq('language_code', languageCode)
        .eq('level_code', levelCode)
        .gte('number', number - CONJUGATION_RECAP_EVERY + 1)
        .lte('number', number)
        .order('number');
      if (pErr) throw new Error(pErr.message);
      const recapIds: string[] = (prev ?? []).flatMap((p: any) => p.verb_ids ?? []);
      if (recapIds.length > 0) {
        const { data: rv, error: rvErr } = await supabaseAdmin.from('conjugation_verbs').select(verbColumns).in('id', recapIds);
        if (rvErr) throw new Error(rvErr.message);
        const rvMap = new Map<string, ConjugationVerb>((rv ?? []).map((v: any) => [v.id, v as ConjugationVerb]));
        conjugationRecap = recapIds.map((id) => rvMap.get(id)).filter((v): v is ConjugationVerb => !!v);
      }
    }

    const pickWords = (ids: string[]) => ids.map((id) => wordMap.get(id)).filter((w): w is LessonWord => !!w);

    const reviewItems = review
      .map((r) => {
        if (r.k === 'w') {
          const word = wordMap.get(r.id);
          return word ? { kind: 'word' as const, word } : null;
        }
        const verb = verbMap.get(r.id);
        return verb ? { kind: 'verb' as const, verb } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    // Fiche de grammaire + exemple du jour (identique pour tous, différent à chaque passage sur la même fiche)
    let grammar: LessonContent['grammar'] = null;
    if (l.grammar_topic_code) {
      const topics = lessonGrammarTopics(languageCode, levelCode);
      const meta = topics.find((t) => t.code === l.grammar_topic_code);
      const topic = await getGrammarTopic(languageCode, l.grammar_topic_code);
      const exampleIndex = grammarExampleIndex(number, topics.length, topic?.examples.length ?? 0);
      grammar = { code: l.grammar_topic_code, label: meta?.label ?? l.grammar_topic_code, topic, exampleIndex };
    }

    // Phrases d'exemple : phrases des packs + phrases générées pour la leçon, les 3 qui contiennent le plus de mots de la leçon.
    // Choisies à l'ouverture : un nouveau pack de phrases enrichit donc les leçons sans rien recréer.
    let sentences: LessonSentence[] = [];
    try {
      const nouns = pickWords(l.noun_ids ?? []);
      const adjectives = pickWords(l.adjective_ids ?? []);
      const others = pickWords(l.other_ids ?? []);
      const phrasesWords = pickWords(l.phrase_ids ?? []);
      const verbsOfLesson: ConjugationVerb[] = (l.verb_ids ?? []).map((id: string) => verbMap.get(id)).filter((v: ConjugationVerb | undefined): v is ConjugationVerb => !!v);
      const specs = buildSpecs(nouns, adjectives, others, phrasesWords, verbsOfLesson, reviewItems);
      const [base, generated] = await Promise.all([loadPackPhrases(languageCode, levelCode), loadGeneratedSentences([l.id])]);
      const candidates: SentenceCandidate[] = [
        ...generated.map((g) => ({ id: g.id, text: g.target_text, fr: g.translation_fr, audio_url: g.audio_url, source: 'generated' as const, theme: null })),
        ...base.map((b) => ({ id: b.id, text: b.target_text, fr: b.translation_fr, audio_url: b.audio_url, source: 'pack' as const, theme: b.theme_code })),
      ];
      sentences = pickSentences(languageCode, specs, l.theme_code, candidates).map((p) => ({
        id: p.id,
        text: p.text,
        fr: p.fr,
        audio_url: p.audio_url,
        source: p.source,
        spans: p.match.spans,
      }));
    } catch {
      sentences = []; // les phrases sont un bonus : une erreur ici ne doit jamais empêcher d'ouvrir la leçon
    }

    const { data: prog } = await supabaseAdmin
      .from('lesson_progress')
      .select('lesson_id')
      .eq('profile_id', profileId)
      .eq('lesson_id', l.id)
      .maybeSingle();

    return {
      ok: true,
      data: {
        id: l.id,
        number: l.number,
        total: total ?? number,
        theme_code: l.theme_code,
        nouns: pickWords(l.noun_ids ?? []),
        adjectives: pickWords(l.adjective_ids ?? []),
        others: pickWords(l.other_ids ?? []),
        phrases: pickWords(l.phrase_ids ?? []),
        verbs: (l.verb_ids ?? []).map((id: string) => verbMap.get(id)).filter((v: ConjugationVerb | undefined): v is ConjugationVerb => !!v),
        kanji,
        conjugationRecap,
        sentences,
        review: reviewItems,
        grammar,
        done: !!prog,
      },
    };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur de chargement de la leçon.') };
  }
}

// ---------------------------------------------------------
// Phrases d'exemple (phrases des packs + phrases générées pour la leçon)
// ---------------------------------------------------------
type PhraseRow = { id: string; target_text: string; translation_fr: string; audio_url: string | null; theme_code: string | null };
type GeneratedRow = { id: string; lesson_id: string; position: number; target_text: string; translation_fr: string; audio_url: string | null };

const PHRASE_CACHE_MS = 5 * 60 * 1000;
const phraseCache = new Map<string, { at: number; rows: PhraseRow[] }>();

/** Phrases des packs prêts de la langue et du niveau (mises en cache 5 minutes : une leçon ou un PDF en lit plusieurs d'affilée). */
async function loadPackPhrases(languageCode: string, levelCode: string): Promise<PhraseRow[]> {
  const key = `${languageCode}|${levelCode}`;
  const hit = phraseCache.get(key);
  if (hit && Date.now() - hit.at < PHRASE_CACHE_MS) return hit.rows;

  const { data: packs, error } = await supabaseAdmin
    .from('packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  if (error) throw new Error(error.message);
  const ids = (packs ?? []).map((p: any) => p.id as string);
  const rows: PhraseRow[] = [];
  if (ids.length > 0) {
    for (let from = 0; ; from += 1000) {
      const { data, error: pErr } = await supabaseAdmin
        .from('phrases')
        .select('id, target_text, translation_fr, audio_url, theme_code')
        .in('pack_id', ids)
        .order('id')
        .range(from, from + 999);
      if (pErr) throw new Error(pErr.message);
      rows.push(...((data ?? []) as PhraseRow[]));
      if (!data || data.length < 1000) break;
    }
  }
  phraseCache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Phrases générées pour des leçons ; renvoie une liste vide si la migration 026 n'est pas exécutée. */
async function loadGeneratedSentences(lessonIds: string[]): Promise<GeneratedRow[]> {
  const out: GeneratedRow[] = [];
  for (let i = 0; i < lessonIds.length; i += 40) {
    const { data, error } = await supabaseAdmin
      .from('lesson_sentences')
      .select('id, lesson_id, position, target_text, translation_fr, audio_url')
      .in('lesson_id', lessonIds.slice(i, i + 40))
      .order('position');
    if (error) return out;
    out.push(...((data ?? []) as GeneratedRow[]));
  }
  return out;
}

const matchTypeOf = (wordType: string): MatchWordSpec['type'] => (wordType === 'nom' ? 'nom' : wordType === 'adjectif' ? 'adjectif' : 'autre');

function verbSpec(v: { id: string; infinitive: string; ja_data?: { reading?: string; group?: string } | null }, weight: number): MatchWordSpec {
  return { id: v.id, text: v.infinitive, type: 'verbe', weight, reading: v.ja_data?.reading, group: v.ja_data?.group };
}

/** Mots de la leçon (poids 1) et mots de révision (poids 0,5) à chercher dans les phrases. */
function buildSpecs(
  nouns: LessonWord[],
  adjectives: LessonWord[],
  others: LessonWord[],
  phrasesWords: LessonWord[],
  verbs: ConjugationVerb[],
  review: LessonContent['review']
): MatchWordSpec[] {
  const specs: MatchWordSpec[] = [];
  const seen = new Set<string>();
  const add = (sp: MatchWordSpec) => {
    if (seen.has(sp.id)) return;
    seen.add(sp.id);
    specs.push(sp);
  };
  for (const w of nouns) add({ id: w.id, text: w.text, type: 'nom', weight: 1 });
  for (const w of adjectives) add({ id: w.id, text: w.text, type: 'adjectif', weight: 1 });
  for (const w of others) add({ id: w.id, text: w.text, type: 'autre', weight: 1 });
  for (const w of phrasesWords) add({ id: w.id, text: w.text, type: 'autre', weight: 1 });
  for (const v of verbs) add(verbSpec(v, 1));
  for (const r of review) {
    if (r.word) add({ id: r.word.id, text: r.word.text, type: matchTypeOf(r.word.word_type), weight: 0.5 });
    else if (r.verb) add(verbSpec(r.verb, 0.5));
  }
  return specs;
}

type LevelLesson = { id: string; number: number; theme: string; specs: MatchWordSpec[]; words: { id: string; text: string; fr: string }[] };

/** Leçons d'un niveau avec leurs mots à chercher (une seule série de requêtes pour tout le niveau). */
async function loadLevelLessons(languageCode: string, levelCode: string): Promise<LevelLesson[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('lessons')
    .select('id, number, theme_code, noun_ids, adjective_ids, other_ids, verb_ids, phrase_ids, review')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('number');
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const words = new Map<string, { text: string; type: string; fr: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error: wErr } = await supabaseAdmin
      .from('vocabulary_words')
      .select('id, target_text, word_type, translation_fr')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .order('id')
      .range(from, from + 999);
    if (wErr) throw new Error(wErr.message);
    for (const w of (data ?? []) as any[]) words.set(w.id, { text: w.target_text, type: w.word_type, fr: w.translation_fr });
    if (!data || data.length < 1000) break;
  }
  const { data: vrows, error: vErr } = await supabaseAdmin
    .from('conjugation_verbs')
    .select(languageCode === 'ja' ? 'id, infinitive, translation_fr, ja_data' : 'id, infinitive, translation_fr')
    .eq('language_code', languageCode);
  if (vErr) throw new Error(vErr.message);
  const verbs = new Map<string, any>((vrows ?? []).map((v: any) => [v.id, v]));

  return (rows as any[]).map((l) => {
    const specs: MatchWordSpec[] = [];
    const list: { id: string; text: string; fr: string }[] = [];
    const seen = new Set<string>();
    const addWord = (id: string, type: MatchWordSpec['type'], weight: number) => {
      const w = words.get(id);
      if (!w || seen.has(id)) return;
      seen.add(id);
      specs.push({ id, text: w.text, type, weight });
      if (weight >= 1) list.push({ id, text: w.text, fr: w.fr });
    };
    const addVerb = (id: string, weight: number) => {
      const v = verbs.get(id);
      if (!v || seen.has(id)) return;
      seen.add(id);
      specs.push(verbSpec(v, weight));
      if (weight >= 1) list.push({ id, text: v.infinitive, fr: v.translation_fr });
    };
    for (const id of l.noun_ids ?? []) addWord(id, 'nom', 1);
    for (const id of l.adjective_ids ?? []) addWord(id, 'adjectif', 1);
    for (const id of [...(l.other_ids ?? []), ...(l.phrase_ids ?? [])]) addWord(id, 'autre', 1);
    for (const id of l.verb_ids ?? []) addVerb(id, 1);
    for (const r of (l.review ?? []) as ReviewItem[]) {
      if (r.k === 'w') addWord(r.id, matchTypeOf(words.get(r.id)?.type ?? ''), 0.5);
      else addVerb(r.id, 0.5);
    }
    return { id: l.id, number: l.number, theme: l.theme_code, specs, words: list };
  });
}

export type SentenceCoverage = {
  lessons: number;
  basePhrases: number; // phrases des packs prêts
  generated: number; // phrases déjà générées pour les leçons
  fullLessons: number; // leçons qui ont déjà 3 bonnes phrases (au moins 2 mots de la leçon)
  withOne: number; // leçons qui ont au moins une phrase avec un mot de la leçon
  needLessons: number; // leçons à compléter
  needSentences: number; // phrases à générer pour que chaque leçon en ait 3 bonnes
};

async function levelNeeds(languageCode: string, levelCode: string) {
  const [lessons, base] = await Promise.all([loadLevelLessons(languageCode, levelCode), loadPackPhrases(languageCode, levelCode)]);
  const generated = await loadGeneratedSentences(lessons.map((l) => l.id));
  const byLesson = new Map<string, GeneratedRow[]>();
  for (const g of generated) byLesson.set(g.lesson_id, [...(byLesson.get(g.lesson_id) ?? []), g]);
  const rows = lessons.map((l) => {
    const gen = byLesson.get(l.id) ?? [];
    const cands = [...gen.map((g) => ({ text: g.target_text })), ...base.map((b) => ({ text: b.target_text }))];
    const good = countGoodSentences(languageCode, l.specs, cands);
    return { lesson: l, gen, good, need: Math.max(0, SENTENCES_PER_LESSON - good) };
  });
  return { rows, base, generatedCount: generated.length };
}

/** Combien de leçons ont déjà 3 bonnes phrases avec les packs actuels, et combien de phrases il faudrait générer (calcul gratuit). */
export async function getSentenceCoverage(languageCode: string, levelCode: string): Promise<Result<SentenceCoverage>> {
  try {
    const { rows, base, generatedCount } = await levelNeeds(languageCode, levelCode);
    let withOne = 0;
    for (const r of rows) {
      const cands = [...r.gen.map((g) => ({ id: g.id, text: g.target_text, fr: '', audio_url: null, source: 'generated' as const })), ...base.map((b) => ({ id: b.id, text: b.target_text, fr: '', audio_url: null, source: 'pack' as const }))];
      if (pickSentences(languageCode, r.lesson.specs, r.lesson.theme, cands, 1).length > 0) withOne++;
    }
    return {
      ok: true,
      data: {
        lessons: rows.length,
        basePhrases: base.length,
        generated: generatedCount,
        fullLessons: rows.filter((r) => r.need === 0).length,
        withOne,
        needLessons: rows.filter((r) => r.need > 0).length,
        needSentences: rows.reduce((sum, r) => sum + r.need, 0),
      },
    };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur pendant le calcul de la couverture des phrases.') };
  }
}

export type SentenceStepResult = {
  remainingLessons: number; // leçons encore à compléter (hors celles qui ont échoué)
  lessonNumber: number | null; // leçon traitée à ce pas
  added: number; // phrases ajoutées à ce pas
  failedLesson: number | null; // leçon que Gemini n'a pas su compléter (à ignorer ensuite)
  audioMissing: number; // phrases ajoutées sans audio (échec de la synthèse vocale)
};

/** Génère les phrases manquantes de la prochaine leçon incomplète (une leçon par pas). Coût : voir estimateLessonSentencesCost. */
export async function generateSentencesStep(languageCode: string, levelCode: string, skip: number[]): Promise<Result<SentenceStepResult>> {
  try {
    const { rows } = await levelNeeds(languageCode, levelCode);
    const todo = rows.filter((r) => r.need > 0 && !skip.includes(r.lesson.number));
    if (todo.length === 0) return { ok: true, data: { remainingLessons: 0, lessonNumber: null, added: 0, failedLesson: null, audioMissing: 0 } };

    const target = todo[0];
    const { lesson, gen } = target;
    const mainSpecs = lesson.specs.filter((sp) => sp.weight >= 1);
    const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
    const themeLabel = THEMES.find((t) => t.code === lesson.theme)?.label ?? lesson.theme;
    const existing = gen.map((g) => g.target_text);
    const accepted: { target: string; fr: string }[] = [];

    const system = `Tu écris des phrases d'exemple pour un cours de ${langName} (niveau ${levelCode} du CECRL) destiné à des francophones débutants.
Règles : phrases naturelles et courtes (${languageCode === 'ja' ? '10 à 25 signes' : '5 à 9 mots'}), utiles dans la vie quotidienne, au niveau ${levelCode}.
Chaque phrase doit contenir AU MOINS 2 des mots de la liste (forme du dictionnaire ou accordée : pluriel, féminin, verbe conjugué), si possible 3.
Les phrases doivent être différentes les unes des autres.${languageCode === 'ja' ? '\nÉcris en japonais naturel avec kanji et kana, sans rōmaji ni furigana.' : ''}
Réponds UNIQUEMENT par un tableau JSON : [{"target":"phrase en ${langName}","fr":"traduction française"}].`;
    const wordList = lesson.words.map((w) => `- ${w.text} = ${w.fr}`).join('\n');

    for (let attempt = 0; attempt < 2 && accepted.length < target.need; attempt++) {
      const missing = target.need - accepted.length;
      const avoid = [...existing, ...accepted.map((a) => a.target)];
      const user = `Thème de la leçon : ${themeLabel}\nMots de la leçon :\n${wordList}\n${avoid.length ? `Phrases déjà écrites (à ne pas répéter) :\n${avoid.map((x) => `- ${x}`).join('\n')}\n` : ''}Écris ${missing + (attempt === 0 ? 1 : 2)} phrases.`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await callGemini(system, user));
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed as any[]) {
        const text = typeof item?.target === 'string' ? item.target.trim() : '';
        const fr = typeof item?.fr === 'string' ? item.fr.trim() : '';
        if (!text || !fr || avoid.includes(text) || accepted.some((a) => a.target === text)) continue;
        if (!validateGenerated(languageCode, mainSpecs, text)) continue; // contrôle par le code : au moins 2 mots de la leçon
        accepted.push({ target: text, fr });
        if (accepted.length >= target.need) break;
      }
    }

    if (accepted.length === 0) {
      return { ok: true, data: { remainingLessons: todo.length - 1, lessonNumber: lesson.number, added: 0, failedLesson: lesson.number, audioMissing: 0 } };
    }

    let position = gen.reduce((m, g) => Math.max(m, g.position), 0);
    let audioMissing = 0;
    const toInsert: { lesson_id: string; position: number; target_text: string; translation_fr: string; audio_url: string | null }[] = [];
    for (const a of accepted) {
      position++;
      let audioUrl: string | null = null;
      try {
        const out = await synthesizeAndStore(a.target, languageCode, `${languageCode}/lessons/${lesson.id}/s${position}.mp3`);
        audioUrl = out.audioUrl;
      } catch {
        audioMissing++;
      }
      toInsert.push({ lesson_id: lesson.id, position, target_text: a.target, translation_fr: a.fr, audio_url: audioUrl });
    }
    const { error: insErr } = await supabaseAdmin.from('lesson_sentences').insert(toInsert);
    if (insErr) throw new Error(insErr.message);

    const stillNeeded = accepted.length < target.need; // Gemini n'a pas tout fourni : la leçon reste incomplète
    return {
      ok: true,
      data: { remainingLessons: todo.length - 1 + (stillNeeded ? 0 : 0), lessonNumber: lesson.number, added: accepted.length, failedLesson: stillNeeded ? lesson.number : null, audioMissing },
    };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur pendant la génération des phrases.') };
  }
}

// ---------------------------------------------------------
// Progression
// ---------------------------------------------------------
export async function completeLesson(profileId: string, lessonId: string): Promise<Result<true>> {
  try {
    const { error } = await supabaseAdmin
      .from('lesson_progress')
      .upsert({ profile_id: profileId, lesson_id: lessonId, completed_at: new Date().toISOString() }, { onConflict: 'profile_id,lesson_id' });
    if (error) throw new Error(error.message);
    return { ok: true, data: true };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Enregistrement impossible.') };
  }
}

// ---------------------------------------------------------
// Audio de l'infinitif des verbes (Google TTS, ≈ 9 caractères par verbe), stocké dans tense_audio.infinitive
// ---------------------------------------------------------
async function countVerbsWithoutAudio(languageCode: string): Promise<number> {
  let query = supabaseAdmin.from('conjugation_verbs').select('id, tense_audio').eq('language_code', languageCode);
  if (languageCode === 'ja') query = query.not('ja_data', 'is', null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).filter((v: any) => !v.tense_audio?.infinitive).length;
}

const VERB_AUDIO_BATCH = 8;

export async function addVerbAudioStep(languageCode: string): Promise<Result<{ remaining: number }>> {
  try {
    const columns = languageCode === 'ja' ? 'id, infinitive, tense_audio, ja_data' : 'id, infinitive, tense_audio';
    let query = supabaseAdmin.from('conjugation_verbs').select(columns).eq('language_code', languageCode);
    if (languageCode === 'ja') query = query.not('ja_data', 'is', null);
    const { data, error } = await query.order('frequency_rank');
    if (error) throw new Error(error.message);

    const missing = ((data ?? []) as any[]).filter((v) => !v.tense_audio?.infinitive);
    if (missing.length === 0) return { ok: true, data: { remaining: 0 } };

    const batch = missing.slice(0, VERB_AUDIO_BATCH);
    let done = 0;
    let firstError = '';
    for (let i = 0; i < batch.length; i += 4) {
      const results = await Promise.allSettled(
        batch.slice(i, i + 4).map(async (v) => {
          // Japonais : on fait lire la prononciation en kana (évite les kanji à lectures multiples)
          const spoken = languageCode === 'ja' ? v.ja_data?.reading || v.infinitive : v.infinitive;
          const { audioUrl } = await synthesizeAndStore(spoken, languageCode, `${languageCode}/conjugation/${v.id}/infinitive.mp3`);
          const { error: upErr } = await supabaseAdmin
            .from('conjugation_verbs')
            .update({ tense_audio: { ...(v.tense_audio ?? {}), infinitive: audioUrl } })
            .eq('id', v.id);
          if (upErr) throw new Error(upErr.message);
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') done++;
        else if (!firstError) firstError = (r.reason as Error)?.message ?? String(r.reason);
      }
    }
    if (done === 0) return { ok: false, error: `Aucun audio généré : ${firstError || 'raison inconnue'}` };
    return { ok: true, data: { remaining: missing.length - done } };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? "Erreur pendant la génération de l'audio des verbes.") };
  }
}

// ---------------------------------------------------------
// Images des mots : fichiers .webp déposés dans public/image_webp (nom = slug de la traduction française, voir
// lib/imageName.ts). La base ne garde que le NOM de l'image ; la liste des fichiers présents (lib/imageManifest.json)
// est régénérée à chaque déploiement par scripts/make-image-manifest.mjs.
// ---------------------------------------------------------
export type ImageStatus = {
  ready: boolean; // false : la migration 024 n'a pas été exécutée
  words: number; // mots du niveau
  namesPending: number; // mots dont le nom d'image n'est pas encore enregistré en base
  distinct: number; // images différentes nécessaires (une image est partagée entre toutes les langues)
  available: number; // images présentes dans public/image_webp
  missing: number; // images encore à fournir
};

async function imageStatus(languageCode: string, levelCode: string): Promise<ImageStatus> {
  try {
    let words = 0;
    let namesPending = 0;
    const groups = new Map<string, boolean>(); // mot français (clé) → a une image ?
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from('vocabulary_words')
        .select('translation_fr, image')
        .eq('language_code', languageCode)
        .eq('level_code', levelCode)
        .order('id')
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { translation_fr: string; image: string | null }[]) {
        words++;
        if (!r.image) namesPending++;
        const k = imageBareKey(r.translation_fr);
        if (!k) continue;
        groups.set(k, (groups.get(k) ?? false) || resolveImage(r.image, r.translation_fr) !== null);
      }
      if (!data || data.length < 1000) break;
    }
    let available = 0;
    for (const ok of groups.values()) if (ok) available++;
    return { ready: true, words, namesPending, distinct: groups.size, available, missing: groups.size - available };
  } catch (e: any) {
    if (String(e?.message ?? '').includes('image')) return { ready: false, words: 0, namesPending: 0, distinct: 0, available: 0, missing: 0 };
    throw e;
  }
}

const IMAGE_NAMES_BATCH = 600;

/** Enregistre en base le nom d'image des mots qui n'en ont pas encore (calcul par code, gratuit). Par pas, reprenable. */
export async function fillImageNamesStep(languageCode: string, levelCode: string): Promise<Result<{ remaining: number }>> {
  try {
    const { data: todo, error } = await supabaseAdmin
      .from('vocabulary_words')
      .select('id, translation_fr')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .is('image', null)
      .order('id')
      .limit(IMAGE_NAMES_BATCH);
    if (error) throw new Error(error.message);
    if (!todo || todo.length === 0) return { ok: true, data: { remaining: 0 } };

    const translations = Array.from(new Set((todo as { translation_fr: string }[]).map((w) => w.translation_fr)));
    for (let i = 0; i < translations.length; i += 15) {
      const outs = await Promise.all(
        translations.slice(i, i + 15).map((tr) =>
          supabaseAdmin
            .from('vocabulary_words')
            .update({ image: imageFileName(tr) }) // le mot français lui-même ; '' si rien d'exploitable : traité, pas d'image
            .eq('language_code', languageCode)
            .eq('level_code', levelCode)
            .eq('translation_fr', tr)
            .is('image', null)
        )
      );
      const failed = outs.find((o) => o.error);
      if (failed?.error) throw new Error(failed.error.message);
    }

    const { count, error: cErr } = await supabaseAdmin
      .from('vocabulary_words')
      .select('*', { count: 'exact', head: true })
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .is('image', null);
    if (cErr) throw new Error(cErr.message);
    return { ok: true, data: { remaining: count ?? 0 } };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur pendant le calcul des noms d\'images.') };
  }
}

export type MissingImage = { name: string; fr: string; near: string | null }; // near : fichier existant aux accents différents (non utilisé)

/** Images à fournir (aucun fichier trouvé), une par mot français. `name` = nom de fichier à créer (sans .webp). Sans paramètres : toutes les langues et tous les niveaux. */
export async function listMissingImages(languageCode: string | null, levelCode: string | null): Promise<Result<MissingImage[]>> {
  try {
    const found = new Map<string, boolean>();
    const names = new Map<string, MissingImage>();
    for (let from = 0; ; from += 1000) {
      let q = supabaseAdmin.from('vocabulary_words').select('translation_fr, image').order('id').range(from, from + 999);
      if (languageCode) q = q.eq('language_code', languageCode);
      if (levelCode) q = q.eq('level_code', levelCode);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { translation_fr: string; image: string | null }[]) {
        const k = imageBareKey(r.translation_fr);
        if (!k) continue;
        if (resolveImage(r.image, r.translation_fr) !== null) found.set(k, true);
        else if (!names.has(k)) names.set(k, { name: imageFileName(r.translation_fr), fr: r.translation_fr, near: nearImage(r.translation_fr) });
      }
      if (!data || data.length < 1000) break;
    }
    const list = Array.from(names.entries()).filter(([k]) => !found.get(k)).map(([, m]) => m);
    return { ok: true, data: list.sort((a, b) => a.name.localeCompare(b.name, 'fr')) };
  } catch (e: any) {
    return { ok: false, error: explain(e?.message ?? 'Erreur pendant la recherche des images manquantes.') };
  }
}
