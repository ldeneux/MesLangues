'use server';

import { supabaseAdmin } from './supabaseAdmin';
import {
  epreuvesForLevel,
  MIN_WRITING_PROMPTS_FOR_EXAM,
  COMPREHENSION_QUESTIONS,
  GRAMMAR_QUESTIONS,
  LEXICON_QUESTIONS,
  MIN_COMPREHENSION_QUESTIONS,
  MIN_ARTICLES_FOR_EXAM,
  MIN_GRAMMAR_QUESTIONS_FOR_EXAM,
  MIN_WORDS_FOR_EXAM,
  type EpreuveKey,
} from './examConfig';
import { submitWriting, type WritingResult } from './writing';
import { getUsableVocabularyPacks } from './vocabulary';
import type { ConversationRecord } from './conversation';
import { SCENARIOS, isAboveLevel, getScenario } from './conversationScenarios';
import { shuffle, pickSpread, buildLexiconQuestions, gradeAnswers, computeExamTotals, type ExamQuestion } from './examLogic';

// ---------------------------------------------------------
// Types (un fichier 'use server' ne peut exporter que des fonctions async et des types).
// On renvoie { ok:false, error } au lieu de lever : en production Next.js masque les erreurs levées.
// ---------------------------------------------------------
export type ExamResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export type PublicQuestion = {
  id: string;
  kind: ExamQuestion['kind'];
  prompt: string;
  options: string[];
  correct_index?: number; // fourni seulement une fois l'épreuve terminée (correction)
};

export type PublicEpreuve = {
  key: EpreuveKey;
  label: string;
  minutes: number;
  status: 'todo' | 'started' | 'done';
  score?: number;
  correct?: number;
  total?: number;
  seconds_used?: number;
  review?: {
    questions: PublicQuestion[];
    answers: Record<string, number | null>;
    article?: { title: string; text: string; text_fr: string };
  };
  // Écriture et oral : le résultat complet (même présentation que les onglets Écriture et Conversation)
  extra?: { writing?: WritingResult; conversation?: ConversationRecord | null };
};

export type PublicExam = {
  id: string;
  language_code: string;
  level_code: string;
  status: 'in_progress' | 'done' | 'abandoned';
  current_index: number;
  epreuves: PublicEpreuve[];
  total_score: number | null;
  passed: boolean | null;
  seconds_used: number;
  created_at: string;
  finished_at: string | null;
};

// Contenu envoyé au navigateur pendant une épreuve : jamais les bonnes réponses
export type EpreuveContent = {
  key: EpreuveKey;
  label: string;
  minutes: number;
  article?: { title?: string; text?: string; audio_url?: string | null };
  questions: PublicQuestion[];
  writing?: { instruction: string; guiding_points: string[]; min_words: number; max_words: number };
  speaking?: { scenarioCode: string; label: string; emoji: string; aiRole: string; objectives: string[] };
};

export type ExamReadinessItem = { key: EpreuveKey; label: string; ok: boolean; detail: string };

type StoredArticle = { id: string; title: string; text: string; text_fr: string; audio_url: string | null };
type StoredEpreuve = {
  key: EpreuveKey;
  label: string;
  minutes: number;
  status: 'todo' | 'started' | 'done';
  started_at?: string;
  content?: {
    article?: StoredArticle;
    questions: ExamQuestion[];
    writing_prompt?: { id: string; instruction: string; guiding_points: string[]; min_words: number; max_words: number };
    scenario_code?: string;
  };
  extra?: { writing?: WritingResult; conversation?: ConversationRecord | null };
  answers?: Record<string, number | null>;
  score?: number;
  correct?: number;
  total?: number;
  seconds_used?: number;
};

// ---------------------------------------------------------
// Conversion base -> navigateur (on retire les réponses tant que l'épreuve n'est pas terminée)
// ---------------------------------------------------------
function toPublic(row: any): PublicExam {
  const epreuves: PublicEpreuve[] = (row.epreuves as StoredEpreuve[]).map((e) => {
    const pub: PublicEpreuve = {
      key: e.key,
      label: e.label,
      minutes: e.minutes,
      status: e.status,
      score: e.score,
      correct: e.correct,
      total: e.total,
      seconds_used: e.seconds_used,
    };
    if (e.status === 'done' && e.extra) pub.extra = e.extra;
    if (e.status === 'done' && e.content && e.content.questions.length > 0) {
      pub.review = {
        questions: e.content.questions.map((q) => ({ ...q })),
        answers: e.answers ?? {},
        article: e.content.article
          ? { title: e.content.article.title, text: e.content.article.text, text_fr: e.content.article.text_fr }
          : undefined,
      };
    }
    return pub;
  });

  return {
    id: row.id,
    language_code: row.language_code,
    level_code: row.level_code,
    status: row.status,
    current_index: row.current_index,
    epreuves,
    total_score: row.total_score,
    passed: row.passed,
    seconds_used: row.seconds_used ?? 0,
    created_at: row.created_at,
    finished_at: row.finished_at,
  };
}

function publicQuestions(questions: ExamQuestion[]): PublicQuestion[] {
  return questions.map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options }));
}

function dbError(msg: string): string {
  return /exam_sessions/.test(msg) ? `${msg} — exécute la migration 023 dans le SQL Editor de Supabase.` : msg;
}

// ---------------------------------------------------------
// Vérification des ressources avant de démarrer
// ---------------------------------------------------------
export async function getExamReadiness(languageCode: string, levelCode: string): Promise<ExamResult<{ items: ExamReadinessItem[]; ready: boolean }>> {
  try {
    const { data: packs } = await supabaseAdmin
      .from('listening_packs')
      .select('id')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .eq('status', 'ready');
    const packIds = (packs ?? []).map((p) => p.id);

    let articleCount = 0;
    let audioCount = 0;
    if (packIds.length > 0) {
      const { data: arts } = await supabaseAdmin.from('listening_articles').select('id, audio_url').in('pack_id', packIds);
      articleCount = arts?.length ?? 0;
      audioCount = (arts ?? []).filter((a) => !!a.audio_url).length;
    }

    const { count: grammarCount } = await supabaseAdmin
      .from('grammar_questions')
      .select('id', { count: 'exact', head: true })
      .eq('language_code', languageCode);
    const usablePackIds = (await getUsableVocabularyPacks(languageCode, levelCode)).map((p) => p.id);
    const { count: wordCount } = usablePackIds.length
      ? await supabaseAdmin.from('vocabulary_words').select('id', { count: 'exact', head: true }).in('pack_id', usablePackIds)
      : { count: 0 };

    const { count: promptCount } = await supabaseAdmin
      .from('writing_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('language_code', languageCode)
      .eq('level_code', levelCode);
    const writingOk = (promptCount ?? 0) >= MIN_WRITING_PROMPTS_FOR_EXAM;

    const listeningOk = audioCount >= 1 && articleCount >= MIN_ARTICLES_FOR_EXAM;
    const grammarOk = (grammarCount ?? 0) >= MIN_GRAMMAR_QUESTIONS_FOR_EXAM && (wordCount ?? 0) >= MIN_WORDS_FOR_EXAM;

    const items: ExamReadinessItem[] = [
      {
        key: 'listening',
        label: 'Compréhension orale',
        ok: listeningOk,
        detail: listeningOk ? `${audioCount} article(s) avec audio` : "Il faut au moins 2 articles d'écoute prêts, dont 1 avec audio (onglet Packs → Écoute).",
      },
      {
        key: 'reading',
        label: 'Compréhension écrite',
        ok: listeningOk,
        detail: listeningOk ? `${articleCount} article(s) disponibles` : "Il faut au moins 2 articles d'écoute prêts (onglet Packs → Écoute).",
      },
      {
        key: 'grammar',
        label: 'Grammaire et lexique',
        ok: grammarOk,
        detail: grammarOk
          ? `${grammarCount} questions de grammaire, ${wordCount} mots`
          : `Il faut ${MIN_GRAMMAR_QUESTIONS_FOR_EXAM}+ questions de grammaire (Packs → Grammaire, conjugaison et quiz) et ${MIN_WORDS_FOR_EXAM}+ mots de vocabulaire (Packs → Vocabulaire).`,
      },
      {
        key: 'writing',
        label: 'Production écrite',
        ok: writingOk,
        detail: writingOk ? `${promptCount} consigne(s) disponibles` : 'Il faut au moins 1 consigne (Packs → Écriture).',
      },
      {
        key: 'speaking',
        label: 'Production orale',
        ok: true,
        detail: 'Conversation avec une situation tirée au sort (coût d\'environ 0,04 €)',
      },
    ];
    return { ok: true, items, ready: items.every((i) => i.ok) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Impossible de vérifier les ressources.' };
  }
}

// ---------------------------------------------------------
// État de l'examen (en cours + historique)
// ---------------------------------------------------------
export async function getExamState(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<ExamResult<{ active: PublicExam | null; history: PublicExam[] }>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('exam_sessions')
      .select('*')
      .eq('profile_id', profileId)
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .in('status', ['in_progress', 'done'])
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) return { ok: false, error: dbError(error.message) };

    const rows = data ?? [];
    const active = rows.find((r: any) => r.status === 'in_progress');
    return {
      ok: true,
      active: active ? toPublic(active) : null,
      history: rows.filter((r: any) => r.status === 'done').map(toPublic),
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible de charger l'examen." };
  }
}

// ---------------------------------------------------------
// Création d'un examen
// ---------------------------------------------------------
export async function startExam(profileId: string, languageCode: string, levelCode: string): Promise<ExamResult<{ exam: PublicExam }>> {
  try {
    const readiness = await getExamReadiness(languageCode, levelCode);
    if (!readiness.ok) return { ok: false, error: (readiness as { error: string }).error };
    if (!readiness.ready) return { ok: false, error: "Il manque des contenus pour passer l'examen (voir la liste)." };

    // Un seul examen en cours par langue et niveau : l'ancien est abandonné
    await supabaseAdmin
      .from('exam_sessions')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .eq('status', 'in_progress');

    const epreuves: StoredEpreuve[] = epreuvesForLevel(levelCode).map((e) => ({ key: e.key, label: e.label, minutes: e.minutes, status: 'todo' }));
    const { data, error } = await supabaseAdmin
      .from('exam_sessions')
      .insert({ profile_id: profileId, language_code: languageCode, level_code: levelCode, epreuves, current_index: 0 })
      .select('*')
      .single();
    if (error || !data) return { ok: false, error: dbError(error?.message ?? 'Échec de la création') };
    return { ok: true, exam: toPublic(data) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible de créer l'examen." };
  }
}

// ---------------------------------------------------------
// Tirage du contenu d'une épreuve
// ---------------------------------------------------------
async function pickArticleWithQuestions(
  languageCode: string,
  levelCode: string,
  profileId: string,
  excludeIds: string[],
  needAudio: boolean
): Promise<{ article: StoredArticle; questions: ExamQuestion[] } | null> {
  const { data: packs } = await supabaseAdmin
    .from('listening_packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  const packIds = (packs ?? []).map((p) => p.id);
  if (packIds.length === 0) return null;

  let query = supabaseAdmin.from('listening_articles').select('id, audio_url').in('pack_id', packIds);
  if (needAudio) query = query.not('audio_url', 'is', null);
  const { data: arts } = await query;
  const ids = (arts ?? []).map((a) => a.id).filter((id) => !excludeIds.includes(id));
  if (ids.length === 0) return null;

  // On privilégie les articles que l'apprenant n'a jamais travaillés
  const { data: seen } = await supabaseAdmin.from('listening_results').select('article_id').eq('profile_id', profileId);
  const seenSet = new Set((seen ?? []).map((r) => r.article_id));
  const candidates = [...shuffle(ids.filter((id) => !seenSet.has(id))), ...shuffle(ids.filter((id) => seenSet.has(id)))].slice(0, 8);

  for (const id of candidates) {
    const { data: qs } = await supabaseAdmin
      .from('listening_questions')
      .select('id, question, options, correct_index')
      .eq('article_id', id);
    if (!qs || qs.length < MIN_COMPREHENSION_QUESTIONS) continue;

    const { data: article } = await supabaseAdmin
      .from('listening_articles')
      .select('id, title, content, content_fr, audio_url')
      .eq('id', id)
      .single();
    if (!article) continue;

    const questions: ExamQuestion[] = shuffle<any>(qs as any[])
      .slice(0, COMPREHENSION_QUESTIONS)
      .map((q: any) => ({
        id: q.id,
        kind: 'comprehension' as const,
        prompt: q.question,
        options: q.options as string[],
        correct_index: q.correct_index,
      }));
    return {
      article: { id: article.id, title: article.title, text: article.content, text_fr: article.content_fr, audio_url: article.audio_url },
      questions,
    };
  }
  return null;
}

async function pickGrammarAndLexicon(languageCode: string, levelCode: string): Promise<ExamQuestion[] | null> {
  const { data: gq } = await supabaseAdmin
    .from('grammar_questions')
    .select('id, topic_code, question, options, correct_index')
    .eq('language_code', languageCode)
    .limit(1000);
  const usablePackIds = (await getUsableVocabularyPacks(languageCode, levelCode)).map((p) => p.id); // packs prêts et actifs
  const { data: words } = usablePackIds.length
    ? await supabaseAdmin
        .from('vocabulary_words')
        .select('id, word_type, target_text, translation_fr')
        .in('pack_id', usablePackIds)
        .limit(1000)
    : { data: [] as any[] };

  const grammar: ExamQuestion[] = pickSpread<any>((gq ?? []) as any[], GRAMMAR_QUESTIONS).map((q: any) => ({
    id: q.id,
    kind: 'grammar' as const,
    prompt: q.question,
    options: q.options as string[],
    correct_index: q.correct_index,
  }));
  const lexicon = buildLexiconQuestions((words ?? []) as any[], LEXICON_QUESTIONS);

  if (grammar.length === 0 && lexicon.length === 0) return null;
  return [...grammar, ...lexicon];
}

// ---------------------------------------------------------
// Démarrage d'une épreuve (ou recommencement si elle avait été interrompue)
// ---------------------------------------------------------
export async function beginEpreuve(profileId: string, examId: string, index: number): Promise<ExamResult<{ content: EpreuveContent }>> {
  try {
    const { data: row, error } = await supabaseAdmin.from('exam_sessions').select('*').eq('id', examId).eq('profile_id', profileId).single();
    if (error || !row) return { ok: false, error: 'Examen introuvable.' };
    if (row.status !== 'in_progress') return { ok: false, error: "Cet examen n'est plus en cours." };

    const epreuves: StoredEpreuve[] = row.epreuves;
    const ep = epreuves[index];
    if (!ep || index !== row.current_index) return { ok: false, error: "Ce n'est pas l'épreuve à passer maintenant." };
    if (ep.status === 'done') return { ok: false, error: 'Cette épreuve est déjà terminée.' };

    // Le contenu est tiré une seule fois : si tu recommences l'épreuve, ce sont les mêmes questions
    if (!ep.content) {
      if (ep.key === 'listening') {
        const picked = await pickArticleWithQuestions(row.language_code, row.level_code, profileId, [], true);
        if (!picked) return { ok: false, error: "Pas assez d'articles d'écoute avec audio pour cette épreuve." };
        ep.content = picked;
      } else if (ep.key === 'reading') {
        const usedId = epreuves.find((e) => e.key === 'listening')?.content?.article?.id;
        const picked = await pickArticleWithQuestions(row.language_code, row.level_code, profileId, usedId ? [usedId] : [], false);
        if (!picked) return { ok: false, error: "Pas assez d'articles pour l'épreuve de lecture (il en faut un autre que celui de l'oral)." };
        ep.content = picked;
      } else if (ep.key === 'grammar') {
        const questions = await pickGrammarAndLexicon(row.language_code, row.level_code);
        if (!questions) return { ok: false, error: 'Pas assez de questions de grammaire ou de vocabulaire.' };
        ep.content = { questions };
      } else if (ep.key === 'writing') {
        const { data: prompts } = await supabaseAdmin
          .from('writing_prompts')
          .select('id, instruction, guiding_points, min_words, max_words')
          .eq('language_code', row.language_code)
          .eq('level_code', row.level_code);
        if (!prompts || prompts.length === 0) return { ok: false, error: "Aucune consigne d'écriture disponible pour ce niveau." };
        const { data: seen } = await supabaseAdmin.from('writing_results').select('prompt_id').eq('profile_id', profileId);
        const seenSet = new Set((seen ?? []).map((r: any) => r.prompt_id));
        const pool = prompts.filter((p: any) => !seenSet.has(p.id));
        const chosen: any = shuffle<any>(pool.length > 0 ? pool : (prompts as any[]))[0];
        ep.content = {
          questions: [],
          writing_prompt: {
            id: chosen.id,
            instruction: chosen.instruction,
            guiding_points: chosen.guiding_points as string[],
            min_words: chosen.min_words,
            max_words: chosen.max_words,
          },
        };
      } else if (ep.key === 'speaking') {
        const { data: seen } = await supabaseAdmin
          .from('conversation_results')
          .select('theme_code')
          .eq('profile_id', profileId)
          .eq('language_code', row.language_code);
        const seenThemes = new Set((seen ?? []).map((r: any) => r.theme_code));
        const eligible = SCENARIOS.filter((sc) => !isAboveLevel(sc, row.level_code));
        const fresh = eligible.filter((sc) => !seenThemes.has(sc.code));
        const chosen = shuffle(fresh.length > 0 ? fresh : eligible)[0];
        if (!chosen) return { ok: false, error: 'Aucune situation de conversation disponible.' };
        ep.content = { questions: [], scenario_code: chosen.code };
      } else {
        return { ok: false, error: "Cette épreuve n'est pas encore disponible." };
      }
    }

    ep.status = 'started';
    ep.started_at = new Date().toISOString();
    ep.answers = {};
    const { error: upErr } = await supabaseAdmin
      .from('exam_sessions')
      .update({ epreuves, updated_at: new Date().toISOString() })
      .eq('id', examId)
      .eq('profile_id', profileId);
    if (upErr) return { ok: false, error: dbError(upErr.message) };

    const article = ep.content.article;
    const content: EpreuveContent = {
      key: ep.key,
      label: ep.label,
      minutes: ep.minutes,
      questions: publicQuestions(ep.content.questions),
      article:
        ep.key === 'listening'
          ? { audio_url: article?.audio_url ?? null } // pas de titre ni de texte pendant l'écoute
          : ep.key === 'reading' && article
          ? { title: article.title, text: article.text }
          : undefined,
      writing: ep.key === 'writing' ? ep.content.writing_prompt : undefined,
      speaking: (() => {
        const sc = ep.key === 'speaking' ? getScenario(ep.content.scenario_code) : null;
        return sc ? { scenarioCode: sc.code, label: sc.label, emoji: sc.emoji, aiRole: sc.aiRole, objectives: sc.objectives } : undefined;
      })(),
    };
    return { ok: true, content };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible de démarrer l'épreuve." };
  }
}

// ---------------------------------------------------------
// Remise d'une épreuve : notation côté serveur, enregistrement, passage à la suivante
// ---------------------------------------------------------
export async function submitEpreuve(
  profileId: string,
  examId: string,
  index: number,
  answers: Record<string, number | null>
): Promise<ExamResult<{ exam: PublicExam }>> {
  try {
    const { data: row, error } = await supabaseAdmin.from('exam_sessions').select('*').eq('id', examId).eq('profile_id', profileId).single();
    if (error || !row) return { ok: false, error: 'Examen introuvable.' };
    if (row.status !== 'in_progress') return { ok: false, error: "Cet examen n'est plus en cours." };

    const epreuves: StoredEpreuve[] = row.epreuves;
    const ep = epreuves[index];
    if (!ep || ep.status !== 'started' || !ep.content || index !== row.current_index) {
      return { ok: false, error: "Cette épreuve n'est pas en cours." };
    }

    if (ep.content.questions.length === 0) return { ok: false, error: "Cette épreuve n'est pas un questionnaire." };

    // On ne garde que des réponses valides pour les questions de l'épreuve
    const clean: Record<string, number | null> = {};
    for (const q of ep.content.questions) {
      const a = answers?.[q.id];
      clean[q.id] = typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
    }

    const grade = gradeAnswers(ep.content.questions, clean);
    ep.answers = clean;
    return await completeEpreuve(profileId, examId, row, epreuves, index, { score: grade.score, correct: grade.correct, total: grade.total });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible d'enregistrer l'épreuve." };
  }
}

// Marque l'épreuve terminée, avance l'examen et calcule la note globale si c'était la dernière.
async function completeEpreuve(
  profileId: string,
  examId: string,
  row: any,
  epreuves: StoredEpreuve[],
  index: number,
  result: { score: number; correct?: number; total?: number; extra?: StoredEpreuve['extra'] }
): Promise<ExamResult<{ exam: PublicExam }>> {
  const ep = epreuves[index];
  const elapsed = ep.started_at ? Math.round((Date.now() - new Date(ep.started_at).getTime()) / 1000) : ep.minutes * 60;

  ep.status = 'done';
  ep.score = result.score;
  ep.correct = result.correct;
  ep.total = result.total;
  ep.extra = result.extra;
  ep.seconds_used = Math.max(0, Math.min(elapsed, ep.minutes * 60 + 20));

  const update: Record<string, any> = {
    epreuves,
    current_index: index + 1,
    seconds_used: epreuves.reduce((s, e) => s + (e.seconds_used ?? 0), 0),
    updated_at: new Date().toISOString(),
  };

  if (epreuves.every((e) => e.status === 'done')) {
    const totals = computeExamTotals(epreuves.map((e) => e.score ?? 0));
    update.status = 'done';
    update.total_score = totals.total;
    update.passed = totals.passed;
    update.finished_at = new Date().toISOString();
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('exam_sessions')
    .update(update)
    .eq('id', examId)
    .eq('profile_id', profileId)
    .select('*')
    .single();
  if (upErr || !updated) return { ok: false, error: dbError(upErr?.message ?? "Échec de l'enregistrement") };
  return { ok: true, exam: toPublic(updated) };
}

// Récupère l'examen et l'épreuve en cours, avec les contrôles communs
async function loadStartedEpreuve(profileId: string, examId: string, index: number, key: EpreuveKey) {
  const { data: row, error } = await supabaseAdmin.from('exam_sessions').select('*').eq('id', examId).eq('profile_id', profileId).single();
  if (error || !row) return { error: 'Examen introuvable.' as string };
  if (row.status !== 'in_progress') return { error: "Cet examen n'est plus en cours." };
  const epreuves: StoredEpreuve[] = row.epreuves;
  const ep = epreuves[index];
  if (!ep || ep.key !== key || ep.status !== 'started' || !ep.content || index !== row.current_index) {
    return { error: "Cette épreuve n'est pas en cours." };
  }
  return { row, epreuves, ep };
}

// Production écrite : correction par Gemini avec le même barème que l'onglet Écriture (le texte
// apparaît donc aussi dans l'historique de cette consigne, dans l'onglet Écriture).
export async function submitWritingEpreuve(
  profileId: string,
  examId: string,
  index: number,
  text: string,
  timedOut: boolean
): Promise<ExamResult<{ exam: PublicExam }>> {
  try {
    const loaded = await loadStartedEpreuve(profileId, examId, index, 'writing');
    if ('error' in loaded) return { ok: false, error: loaded.error };
    const { row, epreuves, ep } = loaded;
    const prompt = ep.content!.writing_prompt;
    if (!prompt) return { ok: false, error: 'Consigne introuvable.' };

    let writing: WritingResult | undefined;
    try {
      writing = await submitWriting(profileId, prompt.id, text, row.language_code);
    } catch (e: any) {
      // Texte trop court : si le temps est écoulé, l'épreuve est notée 0 ; sinon l'apprenant peut continuer à écrire
      if (!timedOut) return { ok: false, error: e?.message ?? 'Correction impossible.' };
    }

    return await completeEpreuve(profileId, examId, row, epreuves, index, {
      score: writing?.score ?? 0,
      extra: writing ? { writing } : undefined,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible d'enregistrer l'épreuve." };
  }
}

// Production orale : la conversation est menée et notée par le module Conversation (enregistrée dans son historique) ;
// l'examen retient la note de cette séance. Sans séance terminée (conversationId null), l'épreuve vaut 0.
export async function submitSpeakingEpreuve(
  profileId: string,
  examId: string,
  index: number,
  conversationId: string | null
): Promise<ExamResult<{ exam: PublicExam }>> {
  try {
    const loaded = await loadStartedEpreuve(profileId, examId, index, 'speaking');
    if ('error' in loaded) return { ok: false, error: loaded.error };
    const { row, epreuves, ep } = loaded;

    let record: ConversationRecord | null = null;
    if (conversationId) {
      const { data } = await supabaseAdmin
        .from('conversation_results')
        .select('*')
        .eq('id', conversationId)
        .eq('profile_id', profileId)
        .eq('language_code', row.language_code)
        .eq('level_code', row.level_code)
        .single();
      // La séance doit avoir été faite pendant cette épreuve
      if (data && (!ep.started_at || new Date(data.created_at).getTime() >= new Date(ep.started_at).getTime() - 1000)) {
        record = { ...data, cost_usd: Number(data.cost_usd) } as ConversationRecord;
      }
    }

    return await completeEpreuve(profileId, examId, row, epreuves, index, {
      score: record?.score ?? 0,
      extra: { conversation: record },
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible d'enregistrer l'épreuve." };
  }
}

export async function abandonExam(profileId: string, examId: string): Promise<ExamResult<{}>> {
  const { error } = await supabaseAdmin
    .from('exam_sessions')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() })
    .eq('id', examId)
    .eq('profile_id', profileId);
  if (error) return { ok: false, error: dbError(error.message) };
  return { ok: true };
}

export async function deleteExam(profileId: string, examId: string): Promise<ExamResult<{}>> {
  const { error } = await supabaseAdmin.from('exam_sessions').delete().eq('id', examId).eq('profile_id', profileId);
  if (error) return { ok: false, error: dbError(error.message) };
  return { ok: true };
}

// Dernier examen terminé pour un apprenant, une langue et un niveau (affiché dans « Mes scores »)
export async function getLatestExamSummary(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<ExamResult<{ summary: { total_score: number; passed: boolean; date: string; epreuves: { label: string; score: number }[] } | null }>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('exam_sessions')
      .select('total_score, passed, finished_at, epreuves')
      .eq('profile_id', profileId)
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .eq('status', 'done')
      .order('finished_at', { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: dbError(error.message) };
    const r: any = data?.[0];
    if (!r) return { ok: true, summary: null };
    return {
      ok: true,
      summary: {
        total_score: r.total_score ?? 0,
        passed: !!r.passed,
        date: r.finished_at,
        epreuves: (r.epreuves as StoredEpreuve[]).map((e) => ({ label: e.label, score: e.score ?? 0 })),
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Impossible de charger l'examen." };
  }
}
