'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { THEMES, CONJUGATION_TARGET } from './constants';

const CHUNK_SIZE = 10;
const TENSES = ['present', 'futur', 'passe_compose', 'imparfait'] as const;

export type ConjugationVerb = {
  id: string;
  infinitive: string;
  translation_fr: string;
  frequency_rank: number;
  theme_code: string | null;
  tenses: Record<(typeof TENSES)[number], string[]>;
};

export async function getConjugationVerbs(languageCode: string): Promise<ConjugationVerb[]> {
  const { data, error } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id, infinitive, translation_fr, frequency_rank, theme_code, tenses')
    .eq('language_code', languageCode)
    .order('frequency_rank');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ConjugationStepResult = {
  done: boolean;
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

/**
 * Génère jusqu'à CHUNK_SIZE verbes supplémentaires, classés par fréquence
 * d'usage décroissante, en poursuivant après les verbes déjà en base.
 * Même logique de reprise par petits lots que les packs de phrases.
 */
export async function runConjugationStep(
  languageCode: string,
  target: number = CONJUGATION_TARGET
): Promise<ConjugationStepResult> {
  const { count: existingCount } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', languageCode);

  const generatedTotal = existingCount ?? 0;
  if (generatedTotal >= target) {
    return { done: true, generatedThisStep: 0, generatedTotal, targetTotal: target };
  }

  const { data: existingVerbs } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('infinitive')
    .eq('language_code', languageCode)
    .order('frequency_rank', { ascending: false })
    .limit(150);

  const avoidList = (existingVerbs ?? []).map((v) => v.infinitive);
  const chunkCount = Math.min(CHUNK_SIZE, target - generatedTotal);
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const themeLabels = THEMES.map((t) => t.code).join(', ');

  const system = `Tu es un professeur de ${langName} langue étrangère. Tu listes les verbes
les plus fréquemment utilisés en ${langName} courant, par ordre décroissant
de fréquence d'usage réelle (le plus utilisé en premier), avec leur
conjugaison complète.

Tu réponds STRICTEMENT en JSON valide, un tableau d'objets, sans texte
avant/après, sans balises markdown. Chaque objet :
{
  "infinitive": "verbe à l'infinitif en ${langName}",
  "translation_fr": "traduction française de l'infinitif",
  "theme_code": "un des codes suivants selon le sens du verbe : ${themeLabels}",
  "tenses": {
    "present": ["je/tu/il-elle/nous/vous/ils-elles au présent, 6 formes"],
    "futur": ["6 formes au futur simple"],
    "passe_compose": ["6 formes au passé composé"],
    "imparfait": ["6 formes à l'imparfait"]
  }
}
Chaque tableau de "tenses" doit avoir exactement 6 formes, dans l'ordre des
pronoms personnels standards de ${langName} (1ère/2e/3e du singulier puis du
pluriel), conjuguées en ${langName} (pas de traduction, juste la forme
conjuguée).`;

  const avoidInstruction =
    avoidList.length > 0
      ? `\n\nCes verbes ont déjà été traités, ne les répète pas :\n- ${avoidList.join('\n- ')}`
      : '';

  const user = `Donne les ${chunkCount} prochains verbes les plus fréquents (rangs
${generatedTotal + 1} à ${generatedTotal + chunkCount} par fréquence décroissante), avec leur
conjugaison complète.${avoidInstruction}`;

  const text = await callGemini(system, user);
  let parsed: Array<{
    infinitive?: string;
    translation_fr?: string;
    theme_code?: string;
    tenses?: Record<string, string[]>;
  }>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour la génération des verbes.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de verbes inattendu reçu de Gemini');
  }

  const validThemeCodes = new Set(THEMES.map((t) => t.code as string));
  const avoidNormalized = new Set(avoidList.map((v) => v.toLowerCase()));

  const rows = parsed
    .filter((v) => v.infinitive && !avoidNormalized.has(v.infinitive.toLowerCase()))
    .map((v, i) => ({
      language_code: languageCode,
      infinitive: v.infinitive!,
      translation_fr: v.translation_fr ?? '',
      frequency_rank: generatedTotal + i + 1,
      theme_code: v.theme_code && validThemeCodes.has(v.theme_code) ? v.theme_code : null,
      tenses: {
        present: v.tenses?.present ?? [],
        futur: v.tenses?.futur ?? [],
        passe_compose: v.tenses?.passe_compose ?? [],
        imparfait: v.tenses?.imparfait ?? [],
      },
    }));

  if (rows.length === 0) {
    // Rien de nouveau cette fois (tout doublon) — on considère l'étape faite
    // pour éviter une boucle infinie côté client, sans avancer le total.
    return { done: generatedTotal >= target, generatedThisStep: 0, generatedTotal, targetTotal: target };
  }

  const { error } = await supabaseAdmin.from('conjugation_verbs').upsert(rows, { onConflict: 'language_code,infinitive' });
  if (error) throw new Error(error.message);

  const { count: newTotal } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', languageCode);

  return {
    done: (newTotal ?? 0) >= target,
    generatedThisStep: rows.length,
    generatedTotal: newTotal ?? generatedTotal + rows.length,
    targetTotal: target,
  };
}
