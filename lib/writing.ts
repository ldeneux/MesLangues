'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { packThemeQuotas, WRITING_PROMPTS_PER_LEVEL } from './constants';

const CHUNK_SIZE = 5;

const LEVEL_WORD_RANGE: Record<string, [number, number]> = {
  A1: [30, 40],
  A2: [40, 60],
  B1: [60, 90],
  B2: [100, 130],
};

export type WritingPrompt = {
  id: string;
  theme_code: string;
  instruction: string;
  guiding_points: string[];
  min_words: number;
  max_words: number;
};

export async function getWritingPrompts(languageCode: string, levelCode: string): Promise<WritingPrompt[]> {
  const { data, error } = await supabaseAdmin
    .from('writing_prompts')
    .select('id, theme_code, instruction, guiding_points, min_words, max_words')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('theme_code');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type WritingBankStepResult = {
  done: boolean;
  themeLabel?: string;
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

/**
 * Génère jusqu'à un lot de consignes pour le thème le moins complet — même
 * logique de reprise par petits pas que les autres banques de contenu.
 */
export async function runWritingBankStep(languageCode: string, levelCode: string): Promise<WritingBankStepResult> {
  const quotas = packThemeQuotas(WRITING_PROMPTS_PER_LEVEL);

  let targetTheme: { code: string; label: string; count: number; existing: number } | null = null;
  for (const q of quotas) {
    const { count } = await supabaseAdmin
      .from('writing_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .eq('theme_code', q.code);
    if ((count ?? 0) < q.count) {
      targetTheme = { ...q, existing: count ?? 0 };
      break;
    }
  }

  if (!targetTheme) {
    const { count: total } = await supabaseAdmin
      .from('writing_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('language_code', languageCode)
      .eq('level_code', levelCode);
    return { done: true, generatedThisStep: 0, generatedTotal: total ?? 0, targetTotal: WRITING_PROMPTS_PER_LEVEL };
  }

  const chunkCount = Math.min(CHUNK_SIZE, targetTheme.count - targetTheme.existing);
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const [minWords, maxWords] = LEVEL_WORD_RANGE[levelCode] ?? LEVEL_WORD_RANGE.A1;

  const { data: prior } = await supabaseAdmin
    .from('writing_prompts')
    .select('instruction')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('theme_code', targetTheme.code)
    .limit(20);
  const avoidList = (prior ?? []).map((p) => p.instruction);
  const avoidInstruction =
    avoidList.length > 0 ? `\n\nDéjà utilisées, propose un angle différent :\n- ${avoidList.join('\n- ')}` : '';

  const system = `Tu crées des consignes de rédaction courte guidée, façon épreuve de
production écrite DELF/DALF (ou équivalent), en FRANÇAIS (l'apprenant écrira
en ${langName}, mais la consigne elle-même est en français pour qu'il la
comprenne à coup sûr). Niveau CECRL ${levelCode}, thème "${targetTheme.label}".
Chaque consigne doit ressembler à une vraie situation d'écriture (message à
un ami, carte postale, avis, description...), avec 2 à 3 points précis à
aborder. Longueur attendue de la réponse : ${minWords} à ${maxWords} mots.${avoidInstruction}

Tu réponds STRICTEMENT en JSON valide, un tableau de ${chunkCount} objets,
sans texte avant/après, sans balises markdown. Chaque objet :
{ "instruction": "consigne en français (1-2 phrases)", "guiding_points": ["point 1", "point 2", "point 3 (optionnel)"] }`;

  const user = `Donne ${chunkCount} consignes de rédaction, thème "${targetTheme.label}", niveau ${levelCode}.`;

  const text = await callGemini(system, user);
  let parsed: { instruction: string; guiding_points: string[] }[];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour les consignes de rédaction.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de consignes inattendu reçu de Gemini');
  }

  const { error } = await supabaseAdmin.from('writing_prompts').insert(
    parsed.map((p) => ({
      language_code: languageCode,
      level_code: levelCode,
      theme_code: targetTheme!.code,
      instruction: p.instruction,
      guiding_points: p.guiding_points,
      min_words: minWords,
      max_words: maxWords,
    }))
  );
  if (error) throw new Error(error.message);

  const newExisting = targetTheme.existing + parsed.length;
  const { count: newTotal } = await supabaseAdmin
    .from('writing_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);

  return {
    done: (newTotal ?? newExisting) >= WRITING_PROMPTS_PER_LEVEL,
    themeLabel: targetTheme.label,
    generatedThisStep: parsed.length,
    generatedTotal: newTotal ?? newExisting,
    targetTotal: WRITING_PROMPTS_PER_LEVEL,
  };
}

// ---------------------------------------------------------
// Soumission et correction notée
// ---------------------------------------------------------
export type WritingResult = {
  id: string;
  submitted_text: string;
  corrected_text: string;
  feedback_fr: string;
  score: number;
  created_at: string;
};

export async function submitWriting(
  profileId: string,
  promptId: string,
  submittedText: string,
  languageCode: string
): Promise<WritingResult> {
  const { data: prompt } = await supabaseAdmin
    .from('writing_prompts')
    .select('instruction, guiding_points, min_words, max_words')
    .eq('id', promptId)
    .single();
  if (!prompt) throw new Error('Consigne introuvable');

  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;

  const system = `Tu corriges un texte écrit en ${langName} par un apprenant francophone,
en réponse à une consigne de production écrite guidée. Tu es bienveillant
mais précis.

Encadre avec des doubles astérisques **ainsi** chaque correction dans le
texte corrigé, pour qu'elle puisse être mise en surbrillance à l'affichage.

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement ces clés :
{
  "corrected_text": "texte réécrit correctement en ${langName}, avec **corrections** encadrées",
  "feedback_fr": "2 à 4 phrases en français : ce qui est réussi, ce qui manque par rapport aux points demandés, un conseil pour progresser",
  "score": 0
}
"score" est une note de 0 à 100 tenant compte de : la grammaire/orthographe,
le respect des points demandés dans la consigne, la longueur attendue
(${prompt.min_words}-${prompt.max_words} mots), et la cohérence générale.`;

  const user = `Consigne : ${prompt.instruction}
Points à aborder : ${(prompt.guiding_points as string[]).join(' / ')}

Texte de l'apprenant :
${submittedText}`;

  const text = await callGemini(system, user);
  let parsed: { corrected_text?: string; feedback_fr?: string; score?: number };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour la correction.');
  }
  if (!parsed.corrected_text || !parsed.feedback_fr || typeof parsed.score !== 'number') {
    throw new Error('Format de correction inattendu reçu de Gemini');
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('writing_results')
    .insert({
      profile_id: profileId,
      prompt_id: promptId,
      submitted_text: submittedText,
      corrected_text: parsed.corrected_text,
      feedback_fr: parsed.feedback_fr,
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
    })
    .select('id, submitted_text, corrected_text, feedback_fr, score, created_at')
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Échec de l'enregistrement");

  return inserted;
}

export async function getWritingHistory(profileId: string, promptId: string): Promise<WritingResult[]> {
  const { data } = await supabaseAdmin
    .from('writing_results')
    .select('id, submitted_text, corrected_text, feedback_fr, score, created_at')
    .eq('profile_id', profileId)
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: false });
  return data ?? [];
}
