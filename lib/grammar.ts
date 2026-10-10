'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { grammarTopicsFor, GRAMMAR_QUIZ_TARGET_PER_TOPIC, GRAMMAR_QUIZ_DRAW_SIZE } from './constants';
import { stripRuby } from './japanese';

export type GrammarExample = { target: string; fr: string; ruby?: string; romaji?: string };

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

  if (!data) return null;
  // Normalisation : on ne renvoie jamais au client une donnée qui ne soit pas du texte.
  const examples = (Array.isArray(data.examples) ? data.examples : []).map((ex: any) => ({
    target: typeof ex?.target === 'string' ? ex.target : String(ex?.target ?? ''),
    fr: typeof ex?.fr === 'string' ? ex.fr : String(ex?.fr ?? ''),
    ...(typeof ex?.ruby === 'string' ? { ruby: ex.ruby } : {}),
    ...(typeof ex?.romaji === 'string' ? { romaji: ex.romaji } : {}),
  }));
  return { ...data, examples };
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

  return grammarTopicsFor(languageCode).map((t) => t.code).filter((code) => {
    const examples = existingByCode.get(code);
    if (!Array.isArray(examples)) return true; // manquante ou malformée
    return !examples.some((ex) => ex.target?.includes('**') || ex.fr?.includes('**'));
  });
}

export async function generateGrammarTopic(languageCode: string, topicCode: string): Promise<GrammarTopic> {
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const topicMeta = grammarTopicsFor(languageCode).find((t) => t.code === topicCode);
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

  const isJa = languageCode === 'ja';
  const hint = (topicMeta as { hint?: string }).hint;
  const level = (topicMeta as { level?: string }).level ?? 'A1';

  // Japonais : fiche pensée pour le japonais (particules, politesse, groupes de verbes…), exemples avec furigana + rōmaji
  const systemJa = `Tu es un professeur de japonais qui rédige des fiches de grammaire claires pour un apprenant
francophone. Explique le point en français, simplement, avec des exemples concrets du quotidien. Écris les termes
japonais importants avec leur lecture (ex. « は (wa) »). Niveau de la fiche : ${level} — phrases courtes et naturelles,
vocabulaire courant, kanji simples (hiragana pour le reste).

Dans chaque exemple, encadre avec **doubles astérisques** UNIQUEMENT l'élément qui illustre le point (la particule, la
terminaison…), dans "target", dans "ruby" ET dans la traduction "fr".

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises markdown, avec exactement ces clés :
{
  "title": "titre de la fiche en français",
  "explanation_fr": "explication claire en français, 5 à 9 phrases, avec les règles de formation et les pièges pour un francophone",
  "examples": [ {
    "target": "phrase japonaise avec **élément clé** encadré",
    "ruby": "la MÊME phrase où chaque groupe de kanji est écrit {kanji|lecture en hiragana}, en gardant les ** ; ne change aucun caractère",
    "romaji": "rōmaji Hepburn de la phrase, sans les **, particules lues comme elles se prononcent (は → wa)",
    "fr": "traduction française avec **élément clé** encadré"
  }, ... ]
}
Donne entre 5 et 7 exemples, variés et représentatifs.`;
  const userJa = `Fiche de grammaire : "${topicMeta.label}".${hint ? ' À couvrir : ' + hint + '.' : ''}`;

  const user = `Fiche de grammaire : "${topicMeta.label}".`;

  const text = await callGemini(isJa ? systemJa : system, isJa ? userJa : user);
  const parsed = JSON.parse(text) as { title?: string; explanation_fr?: string; examples?: GrammarExample[] };

  if (!parsed.title || !parsed.explanation_fr || !parsed.examples) {
    throw new Error('Format de fiche de grammaire inattendu reçu de Gemini');
  }

  // Japonais : on contrôle chaque exemple (le furigana, accolades retirées, doit redonner la phrase d'origine)
  if (isJa) {
    const strip = (t: string) => t.replace(/\*\*/g, '');
    parsed.examples = (parsed.examples as GrammarExample[])
      .filter((ex) => typeof ex?.target === 'string' && ex.target.trim() && typeof ex?.fr === 'string')
      .map((ex) => {
        const rubyOk = typeof ex.ruby === 'string' && stripRuby(strip(ex.ruby)) === strip(ex.target);
        return {
          target: ex.target,
          fr: ex.fr,
          ...(rubyOk ? { ruby: ex.ruby } : {}),
          ...(typeof ex.romaji === 'string' && ex.romaji.trim() ? { romaji: ex.romaji.trim() } : {}),
        };
      });
    if (parsed.examples.length === 0) throw new Error('Aucun exemple valide dans la fiche japonaise reçue de Gemini');
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
  for (const t of grammarTopicsFor(languageCode)) total += counts.get(t.code) ?? 0;
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
  for (const t of grammarTopicsFor(languageCode)) {
    const existing = counts.get(t.code) ?? 0;
    if (existing < GRAMMAR_QUIZ_TARGET_PER_TOPIC) {
      targetTopic = { code: t.code, label: t.label, existing };
      break;
    }
  }

  const totalTarget = grammarTopicsFor(languageCode).length * GRAMMAR_QUIZ_TARGET_PER_TOPIC;
  if (!targetTopic) {
    let total = 0;
    for (const t of grammarTopicsFor(languageCode)) total += counts.get(t.code) ?? 0;
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

  // Japonais : QCM adaptés (particules à choisir, formes verbales, traductions) — consigne en français, options en japonais
  const topicMeta2 = grammarTopicsFor(languageCode).find((t) => t.code === targetTopic!.code) as { hint?: string; level?: string } | undefined;
  const systemJa = `Tu es un professeur de japonais pour francophones. Tu crées des questions à choix multiples (QCM)
pour vérifier la maîtrise d'un point de grammaire précis : "${targetTopic.label}"${topicMeta2?.hint ? ' (' + topicMeta2.hint + ')' : ''}.
Chaque question est rédigée en FRANÇAIS (consigne) et contient, si besoin, la phrase japonaise (ex. « Complète : わたし＿＿ がくせいです。 »).
4 options distinctes, UNE seule correcte, les 3 autres plausibles (erreurs typiques de francophones). Les options sont en japonais
(ou en français pour une question de traduction). Types variés : particule à choisir, forme verbale ou adjectivale à choisir,
traduction FR→JA ou JA→FR, phrase correcte à repérer. Phrases simples comme dans un manuel : peu de kanji, hiragana sinon ;
jamais de rōmaji. Varie largement les phrases et le vocabulaire.

Tu réponds STRICTEMENT en JSON valide, un tableau de ${chunkCount} objets, sans texte avant/après, sans balises markdown.
Chaque objet : { "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0 }`;

  const text = await callGemini(languageCode === 'ja' ? systemJa : system, user);
  let parsed: { question: string; options: string[]; correct_index: number }[];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour le quiz de grammaire.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de questions de grammaire inattendu reçu de Gemini');
  }

  // On ne garde que les questions bien formées (4 options distinctes, bonne réponse valide)
  parsed = parsed.filter(
    (q) =>
      typeof q?.question === 'string' &&
      q.question.trim() &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      new Set(q.options).size === q.options.length &&
      Number.isInteger(q.correct_index) &&
      q.correct_index >= 0 &&
      q.correct_index < q.options.length
  );
  if (parsed.length === 0) throw new Error('Aucune question valide reçue de Gemini pour ce point de grammaire — relance.');

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
  for (const t of grammarTopicsFor(languageCode)) {
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
