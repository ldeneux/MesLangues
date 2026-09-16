'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { GRAMMAR_TOPICS } from './constants';

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
