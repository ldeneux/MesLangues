'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { GRAMMAR_TOPICS, GRAMMAR_QUIZ_TARGET_PER_TOPIC, GRAMMAR_QUIZ_DRAW_SIZE } from './constants';

export type GrammarExample = { target: string; fr: string };

export type GrammarTopic = {
  topic_code: string;
  title: string;
  explanation_fr: string;
  examples: GrammarExample[];
};

export async function getGrammarTopic(languageCode: string, topicCode: string): Promise<GrammarTopic | null> {
  const { data } = await supabaseAdmin
    .from('grammar_topics')
    .select('topic_code, title, explanation_fr, examples')
    .eq('language_code', languageCode)
    .eq('topic_code', topicCode)
    .maybeSingle();

  return data ?? null;
}

export async function getAvailableGrammarTopicCodes(languageCode: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('grammar_topics').select('topic_code').eq('language_code', languageCode);
  return (data ?? []).map((r) => r.topic_code);
}

/**
 * Codes des fiches manquantes OU générées avant l'ajout de la surbrillance
 * (aucun exemple ne contient de marqueur **...**) — pour que le bouton de
 * téléchargement dans Packs les régénère automatiquement avec la nouvelle
 * version du prompt.
 */
export async function getTopicsNeedingRegeneration(languageCode: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('grammar_topics')
    .select('topic_code, examples')
    .eq('language_code', languageCode);

  const existingByCode = new Map((data ?? []).map((r) => [r.topic_code, r.examples as GrammarExample[]]));

  return GRAMMAR_TOPICS.map((t) => t.code).filter((code) => {
    const examples = existingByCode.get(code);
    if (!examples) return true; // manquante
    return !examples.some((ex) => ex.target?.includes('**') || ex.fr?.includes('**'));
  });
}

export async function generateGrammarTopic(languageCode: string, topicCode: string): Promise<GrammarTopic> {
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const topicMeta = GRAMMAR_TOPICS.find((t) => t.code === topicCode);
  if (!topicMeta) throw new Error(`Thème de grammaire inconnu : ${topicCode}`);

  const system = `Tu es un professeur de ${langName} langue étrangère qui rédige des fiches
de grammaire de base claires pour un apprenant francophone débutant à
intermédiaire. Explique le point de grammaire simplement, en français, avec
des exemples concrets et utiles au quotidien.

Dans chaque exemple ("target" ET sa traduction "fr"), encadre avec des doubles
astérisques **ainsi** le ou les mots qui illustrent concrètement le point de
grammaire enseigné (ex: l'article, la terminaison, le pronom...), pour qu'ils
puissent être mis en surbrillance à l'affichage. Encadre uniquement l'élément
pertinent, pas la phrase entière.

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement ces clés :
{
  "title": "titre de la fiche en français",
  "explanation_fr": "explication claire en français, 4 à 8 phrases, sans jargon excessif",
  "examples": [ { "target": "phrase d'exemple en ${langName} avec **élément clé** encadré", "fr": "traduction française avec **élément clé** encadré" }, ... ]
}
Donne entre 4 et 6 exemples, variés et représentatifs du point de grammaire.`;

  const user = `Fiche de grammaire : "${topicMeta.label}".`;

  const text = await callGemini(system, user);
  const parsed = JSON.parse(text) as { title?: string; explanation_fr?: string; examples?: GrammarExample[] };

  if (!parsed.title || !parsed.explanation_fr || !parsed.examples) {
    throw new Error('Format de fiche de grammaire inattendu reçu de Gemini');
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('grammar_topics')
    .upsert(
      {
        language_code: languageCode,
        topic_code: topicCode,
        title: parsed.title,
        explanation_fr: parsed.explanation_fr,
        examples: parsed.examples,
      },
      { onConflict: 'language_code,topic_code' }
    )
    .select('topic_code, title, explanation_fr, examples')
    .single();

  if (error || !inserted) throw new Error(error?.message ?? "Échec de l'enregistrement de la fiche");
  return inserted;
}

// ---------------------------------------------------------
// Banque de quiz par fiche (100 questions/fiche, générées par lots de 20
// pour éviter toute troncature JSON) — tirage de 10 à chaque tentative.
// ---------------------------------------------------------
const GRAMMAR_QUIZ_CHUNK_SIZE = 20;

export type GrammarQuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
};

export type GrammarQuizResult = { correct_count: number; total_count: number; created_at: string };

export async function getGrammarQuizBankTotal(languageCode: string): Promise<number> {
  const counts = await getAllTopicQuestionCounts(languageCode);
  let total = 0;
  for (const t of GRAMMAR_TOPICS) total += counts.get(t.code) ?? 0;
  return total;
}

/**
 * Compte les questions par fiche en UNE seule requête (au lieu d'une par
 * fiche) — optimisation : avant, chaque étape de génération faisait jusqu'à
 * 10 allers-retours DB séquentiels rien que pour savoir où reprendre.
 */
async function getAllTopicQuestionCounts(languageCode: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin
    .from('grammar_questions')
    .select('topic_code')
    .eq('language_code', languageCode);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.topic_code, (counts.get(row.topic_code) ?? 0) + 1);
  }
  return counts;
}

export type GrammarQuizStepResult = {
  done: boolean;
  topicLabel?: string;
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

/**
 * Fait avancer la banque de questions d'un cran : trouve la première fiche
 * n'ayant pas encore ses ${GRAMMAR_QUIZ_TARGET_PER_TOPIC} questions, en
 * génère jusqu'à 20 de plus, et s'arrête. Le client rappelle en boucle
 * jusqu'à `done: true`.
 */
export async function runGrammarQuizStep(languageCode: string): Promise<GrammarQuizStepResult> {
  const counts = await getAllTopicQuestionCounts(languageCode);

  let targetTopic: { code: string; label: string; existing: number } | null = null;
  for (const t of GRAMMAR_TOPICS) {
    const existing = counts.get(t.code) ?? 0;
    if (existing < GRAMMAR_QUIZ_TARGET_PER_TOPIC) {
      targetTopic = { code: t.code, label: t.label, existing };
      break;
    }
  }

  const totalTarget = GRAMMAR_TOPICS.length * GRAMMAR_QUIZ_TARGET_PER_TOPIC;
  if (!targetTopic) {
    let total = 0;
    for (const t of GRAMMAR_TOPICS) total += counts.get(t.code) ?? 0;
    return { done: true, generatedThisStep: 0, generatedTotal: total, targetTotal: totalTarget };
  }

  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const chunkCount = Math.min(GRAMMAR_QUIZ_CHUNK_SIZE, GRAMMAR_QUIZ_TARGET_PER_TOPIC - targetTopic.existing);

  const system = `Tu es un professeur de ${langName} langue étrangère. Tu crées des
questions à choix multiples (QCM) en FRANÇAIS pour vérifier la maîtrise d'un
point de grammaire précis : "${targetTopic.label}". 4 options chacune, une
seule correcte. Varie largement la formulation et les exemples pour qu'un
tirage aléatoire dans une grande banque ne se ressemble jamais d'une
tentative à l'autre.

Tu réponds STRICTEMENT en JSON valide, un tableau de ${chunkCount} objets,
sans texte avant/après, sans balises markdown. Chaque objet :
{ "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0 }`;

  const user = `Donne ${chunkCount} questions sur le point de grammaire "${targetTopic.label}" en ${langName}, niveau A1-B2 mélangé.`;

  const text = await callGemini(system, user);
  let parsed: { question: string; options: string[]; correct_index: number }[];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour le quiz de grammaire.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de questions de grammaire inattendu reçu de Gemini');
  }

  const { error } = await supabaseAdmin.from('grammar_questions').insert(
    parsed.map((q) => ({
      language_code: languageCode,
      topic_code: targetTopic!.code,
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
    }))
  );
  if (error) throw new Error(error.message);

  const newExisting = targetTopic.existing + parsed.length;
  let generatedTotal = 0;
  for (const t of GRAMMAR_TOPICS) {
    generatedTotal += t.code === targetTopic.code ? newExisting : counts.get(t.code) ?? 0;
  }

  return {
    done: false,
    topicLabel: targetTopic.label,
    generatedThisStep: parsed.length,
    generatedTotal,
    targetTotal: totalTarget,
  };
}

export async function getGrammarQuizQuestions(languageCode: string, topicCode: string): Promise<GrammarQuizQuestion[]> {
  const { data } = await supabaseAdmin
    .from('grammar_questions')
    .select('id, question, options, correct_index')
    .eq('language_code', languageCode)
    .eq('topic_code', topicCode);

  const all = data ?? [];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, GRAMMAR_QUIZ_DRAW_SIZE);
}

export async function saveGrammarQuizResult(
  profileId: string,
  languageCode: string,
  topicCode: string,
  correctCount: number,
  totalCount: number
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('grammar_results')
    .insert({ profile_id: profileId, language_code: languageCode, topic_code: topicCode, correct_count: correctCount, total_count: totalCount });
  if (error) throw new Error(error.message);
}

export async function getGrammarQuizHistory(
  profileId: string,
  languageCode: string,
  topicCode: string
): Promise<GrammarQuizResult[]> {
  const { data } = await supabaseAdmin
    .from('grammar_results')
    .select('correct_count, total_count, created_at')
    .eq('profile_id', profileId)
    .eq('language_code', languageCode)
    .eq('topic_code', topicCode)
    .order('created_at', { ascending: false });
  return data ?? [];
}
