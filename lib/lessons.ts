'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { grammarTopicsFor, type GrammarTopicMeta } from './constants';
import { getGrammarTopic, type GrammarTopic } from './grammar';
import type { ConjugationVerb } from './conjugation';
import { planLessons, grammarExampleIndex, type PlanWord, type PlannedLesson, type ReviewItem } from './lessonPlan';

// ---------------------------------------------------------
// Mode Leçons : plan identique pour tous les profils (table `lessons`),
// seule la progression « leçon terminée » est propre à chaque profil.
// Les erreurs sont renvoyées dans { ok: false, error } (jamais levées) :
// en production Next.js masquerait le message d'une erreur levée.
// ---------------------------------------------------------
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const MIGRATION_HINT = "exécute la migration 020 dans le SQL Editor de Supabase.";

function explain(message: string): string {
  if (message.includes('usage_score')) return `La colonne "usage_score" n'existe pas encore — ${MIGRATION_HINT}`;
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
};

export type LessonSetup = {
  nouns: number;
  adjectives: number;
  fillers: number; // adverbes + expressions
  verbs: number;
  total: number; // mots de vocabulaire du niveau
  unranked: number; // mots pas encore classés par utilité
};

export type LessonSummary = {
  id: string;
  number: number;
  theme_code: string;
  wordCount: number;
  done: boolean;
  completed_at: string | null;
};

export type LessonsOverview = { setup: LessonSetup; lessons: LessonSummary[] };

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

async function fetchVerbs(languageCode: string): Promise<{ id: string; frequency_rank: number }[]> {
  let query = supabaseAdmin.from('conjugation_verbs').select('id, frequency_rank').eq('language_code', languageCode);
  // Japonais : on ignore les anciens verbes au format européen (sans ja_data)
  if (languageCode === 'ja') query = query.not('ja_data', 'is', null);
  const { data, error } = await query.order('frequency_rank');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; frequency_rank: number }[];
}

// Fiches de grammaire utilisables à ce niveau (japonais : fiches du niveau ; autres langues : toutes).
function lessonGrammarTopics(languageCode: string, levelCode: string): GrammarTopicMeta[] {
  const all = grammarTopicsFor(languageCode) as readonly GrammarTopicMeta[];
  const atLevel = all.filter((t) => t.level === levelCode);
  return (atLevel.length > 0 ? atLevel : all).slice();
}

function countSetup(words: WordRow[], verbCount: number): LessonSetup {
  return {
    nouns: words.filter((w) => w.word_type === 'nom').length,
    adjectives: words.filter((w) => w.word_type === 'adjectif').length,
    fillers: words.filter((w) => w.word_type === 'adverbe' || w.word_type === 'expression').length,
    verbs: verbCount,
    total: words.length,
    unranked: words.filter((w) => w.usage_score == null).length,
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

    return { ok: true, data: { setup, lessons } };
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
    const planWords: PlanWord[] = words.map((w) => ({
      id: w.id,
      theme_code: w.theme_code,
      word_type: w.word_type,
      score: w.usage_score,
      text: w.target_text,
    }));

    const plan = planLessons({
      languageCode,
      levelCode,
      words: planWords,
      verbs,
      grammarTopicCodes: topics.map((t) => t.code),
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
    const wordMap = new Map<string, LessonWord>(
      (wordRows ?? []).map((w: any) => [
        w.id,
        { id: w.id, text: w.target_text, fr: w.translation_fr, audio_url: w.audio_url, word_type: w.word_type, theme_code: w.theme_code },
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
