'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { LEVEL_CUMULATIVE_TARGET, CONJUGATION_TARGET, GRAMMAR_TOPICS, type LevelCode } from './constants';

const MASTERY_MIN_ATTEMPTS = 1;
const MASTERY_MIN_RATE = 0.9;
const QUIZ_MASTERY_RATE = 0.8; // seuil pour grammaire/écoute (quiz agrégés, pas item par item)

function isMastered(success: number, fail: number): boolean {
  const total = success + fail;
  return total >= MASTERY_MIN_ATTEMPTS && success / total >= MASTERY_MIN_RATE;
}

// ---------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------
export type ScoreBucket = { range: string; count: number };

export type VocabularyDomainScore = {
  masteredCount: number;
  practicedCount: number;
  neverPracticedCount: number;
  totalWords: number;
  levelTarget: number;
  buckets: ScoreBucket[]; // par tranche de 20%, mots pratiqués uniquement
  percentOfTarget: number; // masteredCount / levelTarget, plafonné à 100
};

export async function getVocabularyDomainScore(
  profileId: string,
  languageCode: string,
  levelCode: LevelCode
): Promise<VocabularyDomainScore> {
  const { data: packs } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  const packIds = (packs ?? []).map((p) => p.id);

  const { data: words } =
    packIds.length > 0
      ? await supabaseAdmin.from('vocabulary_words').select('id').in('pack_id', packIds)
      : { data: [] as { id: string }[] };
  const totalWords = words?.length ?? 0;
  const wordIds = new Set((words ?? []).map((w) => w.id));

  const { data: progress } = await supabaseAdmin
    .from('vocabulary_progress')
    .select('word_id, success_count, fail_count')
    .eq('profile_id', profileId);

  const relevant = (progress ?? []).filter((p) => wordIds.has(p.word_id) && p.success_count + p.fail_count > 0);

  const buckets: ScoreBucket[] = [
    { range: '0-20%', count: 0 },
    { range: '20-40%', count: 0 },
    { range: '40-60%', count: 0 },
    { range: '60-80%', count: 0 },
    { range: '80-100%', count: 0 },
  ];

  let masteredCount = 0;
  for (const p of relevant) {
    const rate = p.success_count / (p.success_count + p.fail_count);
    const idx = Math.min(4, Math.floor(rate * 5));
    buckets[idx].count++;
    if (isMastered(p.success_count, p.fail_count)) masteredCount++;
  }

  const levelTarget = LEVEL_CUMULATIVE_TARGET[levelCode] ?? 700;

  return {
    masteredCount,
    practicedCount: relevant.length,
    neverPracticedCount: Math.max(0, totalWords - relevant.length),
    totalWords,
    levelTarget,
    buckets,
    percentOfTarget: Math.min(100, Math.round((masteredCount / levelTarget) * 100)),
  };
}

// ---------------------------------------------------------
// Conjugaison (par langue, pas par niveau — les verbes ne sont pas
// scindés par niveau CECRL dans le modèle actuel)
// ---------------------------------------------------------
export type ConjugationDomainScore = {
  masteredCount: number;
  practicedCount: number;
  totalVerbs: number;
  target: number;
  percentOfTarget: number;
};

export async function getConjugationDomainScore(profileId: string, languageCode: string): Promise<ConjugationDomainScore> {
  const { data: verbs } = await supabaseAdmin.from('conjugation_verbs').select('id').eq('language_code', languageCode);
  const totalVerbs = verbs?.length ?? 0;
  const verbIds = new Set((verbs ?? []).map((v) => v.id));

  const { data: progress } = await supabaseAdmin
    .from('conjugation_progress')
    .select('verb_id, success_count, fail_count')
    .eq('profile_id', profileId);

  const relevant = (progress ?? []).filter((p) => verbIds.has(p.verb_id) && p.success_count + p.fail_count > 0);
  const masteredCount = relevant.filter((p) => isMastered(p.success_count, p.fail_count)).length;

  return {
    masteredCount,
    practicedCount: relevant.length,
    totalVerbs,
    target: CONJUGATION_TARGET,
    percentOfTarget: Math.min(100, Math.round((masteredCount / CONJUGATION_TARGET) * 100)),
  };
}

// ---------------------------------------------------------
// Grammaire (moyenne de la dernière tentative par fiche, fiches jamais
// tentées exclues — pas de biais vers le bas)
// ---------------------------------------------------------
export type GrammarDomainScore = {
  topicsMastered: number;
  topicsAttempted: number;
  totalTopics: number;
  percentOfTarget: number; // topicsMastered / totalTopics
};

export async function getGrammarDomainScore(profileId: string, languageCode: string): Promise<GrammarDomainScore> {
  const { data } = await supabaseAdmin
    .from('grammar_results')
    .select('topic_code, correct_count, total_count, created_at')
    .eq('profile_id', profileId)
    .eq('language_code', languageCode)
    .order('created_at', { ascending: false });

  const latestByTopic = new Map<string, { correct_count: number; total_count: number }>();
  for (const r of data ?? []) {
    if (!latestByTopic.has(r.topic_code)) latestByTopic.set(r.topic_code, r);
  }

  let topicsMastered = 0;
  for (const [, r] of Array.from(latestByTopic)) {
    if (r.correct_count / r.total_count >= QUIZ_MASTERY_RATE) topicsMastered++;
  }

  return {
    topicsMastered,
    topicsAttempted: latestByTopic.size,
    totalTopics: GRAMMAR_TOPICS.length,
    percentOfTarget: Math.round((topicsMastered / GRAMMAR_TOPICS.length) * 100),
  };
}

// ---------------------------------------------------------
// Écoute (moyenne de la dernière tentative par article, articles jamais
// tentés exclus)
// ---------------------------------------------------------
export type ListeningDomainScore = {
  articlesMastered: number;
  articlesAttempted: number;
  totalArticles: number;
  percentOfTarget: number;
};

export async function getListeningDomainScore(
  profileId: string,
  languageCode: string,
  levelCode: LevelCode
): Promise<ListeningDomainScore> {
  const { data: packs } = await supabaseAdmin
    .from('listening_packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  const packIds = (packs ?? []).map((p) => p.id);

  const { data: articles } =
    packIds.length > 0
      ? await supabaseAdmin.from('listening_articles').select('id').in('pack_id', packIds)
      : { data: [] as { id: string }[] };
  const totalArticles = articles?.length ?? 0;
  const articleIds = new Set((articles ?? []).map((a) => a.id));

  const { data } = await supabaseAdmin
    .from('listening_results')
    .select('article_id, correct_count, total_count, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  const latestByArticle = new Map<string, { correct_count: number; total_count: number }>();
  for (const r of data ?? []) {
    if (articleIds.has(r.article_id) && !latestByArticle.has(r.article_id)) latestByArticle.set(r.article_id, r);
  }

  let articlesMastered = 0;
  for (const [, r] of Array.from(latestByArticle)) {
    if (r.correct_count / r.total_count >= QUIZ_MASTERY_RATE) articlesMastered++;
  }

  return {
    articlesMastered,
    articlesAttempted: latestByArticle.size,
    totalArticles,
    percentOfTarget: totalArticles > 0 ? Math.round((articlesMastered / totalArticles) * 100) : 0,
  };
}

// ---------------------------------------------------------
// Phrases (Exercice à trous)
// ---------------------------------------------------------
export type PhrasesDomainScore = {
  masteredCount: number;
  practicedCount: number;
  levelTarget: number;
  percentOfTarget: number;
};

export async function getPhrasesDomainScore(
  profileId: string,
  languageCode: string,
  levelCode: LevelCode
): Promise<PhrasesDomainScore> {
  const { data: packs } = await supabaseAdmin
    .from('packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  const packIds = (packs ?? []).map((p) => p.id);

  const { data: phrases } =
    packIds.length > 0
      ? await supabaseAdmin.from('phrases').select('id').in('pack_id', packIds)
      : { data: [] as { id: string }[] };
  const phraseIds = new Set((phrases ?? []).map((p) => p.id));

  const { data: progress } = await supabaseAdmin
    .from('exercise_progress')
    .select('phrase_id, success_count, fail_count')
    .eq('profile_id', profileId);

  const relevant = (progress ?? []).filter((p) => phraseIds.has(p.phrase_id) && p.success_count + p.fail_count > 0);
  const masteredCount = relevant.filter((p) => isMastered(p.success_count, p.fail_count)).length;
  const levelTarget = LEVEL_CUMULATIVE_TARGET[levelCode] ?? 700;

  return {
    masteredCount,
    practicedCount: relevant.length,
    levelTarget,
    percentOfTarget: Math.min(100, Math.round((masteredCount / levelTarget) * 100)),
  };
}

// ---------------------------------------------------------
// Écriture (production libre notée) — un texte est "réussi" si sa dernière
// note est >= 70/100 (seuil plus souple qu'un QCM, cohérent avec une
// évaluation holistique plutôt que item par item).
// ---------------------------------------------------------
const WRITING_MASTERY_SCORE = 70;

export type WritingDomainScore = {
  promptsMastered: number;
  promptsAttempted: number;
  totalPrompts: number;
  percentOfTarget: number;
};

export async function getWritingDomainScore(
  profileId: string,
  languageCode: string,
  levelCode: LevelCode
): Promise<WritingDomainScore> {
  const { data: prompts } = await supabaseAdmin
    .from('writing_prompts')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);
  const totalPrompts = prompts?.length ?? 0;
  const promptIds = new Set((prompts ?? []).map((p) => p.id));

  const { data } = await supabaseAdmin
    .from('writing_results')
    .select('prompt_id, score, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  const latestByPrompt = new Map<string, number>();
  for (const r of data ?? []) {
    if (promptIds.has(r.prompt_id) && !latestByPrompt.has(r.prompt_id)) latestByPrompt.set(r.prompt_id, r.score);
  }

  let promptsMastered = 0;
  for (const [, score] of Array.from(latestByPrompt)) {
    if (score >= WRITING_MASTERY_SCORE) promptsMastered++;
  }

  return {
    promptsMastered,
    promptsAttempted: latestByPrompt.size,
    totalPrompts,
    percentOfTarget: totalPrompts > 0 ? Math.round((promptsMastered / totalPrompts) * 100) : 0,
  };
}

// ---------------------------------------------------------
// Score global pondéré (pas une équivalence officielle CECRL — une
// estimation "où j'en suis" pour le niveau actuellement sélectionné)
// ---------------------------------------------------------
export const DOMAIN_WEIGHTS = {
  listening: 0.25,
  phrases: 0.2,
  vocabulary: 0.18,
  writing: 0.15,
  conjugation: 0.12,
  grammar: 0.1,
};

export type AllDomainScores = {
  vocabulary: VocabularyDomainScore;
  conjugation: ConjugationDomainScore;
  grammar: GrammarDomainScore;
  listening: ListeningDomainScore;
  phrases: PhrasesDomainScore;
  writing: WritingDomainScore;
  globalPercent: number;
};

export async function getAllDomainScores(
  profileId: string,
  languageCode: string,
  levelCode: LevelCode
): Promise<AllDomainScores> {
  const [vocabulary, conjugation, grammar, listening, phrases, writing] = await Promise.all([
    getVocabularyDomainScore(profileId, languageCode, levelCode),
    getConjugationDomainScore(profileId, languageCode),
    getGrammarDomainScore(profileId, languageCode),
    getListeningDomainScore(profileId, languageCode, levelCode),
    getPhrasesDomainScore(profileId, languageCode, levelCode),
    getWritingDomainScore(profileId, languageCode, levelCode),
  ]);

  const globalPercent = Math.round(
    listening.percentOfTarget * DOMAIN_WEIGHTS.listening +
      phrases.percentOfTarget * DOMAIN_WEIGHTS.phrases +
      vocabulary.percentOfTarget * DOMAIN_WEIGHTS.vocabulary +
      writing.percentOfTarget * DOMAIN_WEIGHTS.writing +
      conjugation.percentOfTarget * DOMAIN_WEIGHTS.conjugation +
      grammar.percentOfTarget * DOMAIN_WEIGHTS.grammar
  );

  return { vocabulary, conjugation, grammar, listening, phrases, writing, globalPercent };
}
