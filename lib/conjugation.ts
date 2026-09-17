'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
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
  tense_audio: Partial<Record<(typeof TENSES)[number], string>>;
};

export async function getConjugationVerbs(languageCode: string): Promise<ConjugationVerb[]> {
  const { data, error } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id, infinitive, translation_fr, frequency_rank, theme_code, tenses, tense_audio')
    .eq('language_code', languageCode)
    .order('frequency_rank');

  if (error) throw new Error(error.message);
  return data ?? [];
}

const BACKFILL_BATCH_SIZE = 5;

/**
 * Complète l'audio manquant pour des verbes déjà générés avant l'ajout de
 * tense_audio (ou dont un temps avait échoué). Traite un petit lot à la
 * fois — le client rappelle en boucle jusqu'à `done: true`.
 */
export async function backfillConjugationAudio(
  languageCode: string
): Promise<{ done: boolean; processed: number }> {
  const { data: verbs } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id, tenses, tense_audio')
    .eq('language_code', languageCode);

  const incomplete = (verbs ?? []).filter((v) => {
    const audio = (v.tense_audio as Record<string, string>) ?? {};
    return TENSES.some((t) => (v.tenses as Record<string, string[]>)?.[t]?.length > 0 && !audio[t]);
  });

  if (incomplete.length === 0) return { done: true, processed: 0 };

  const batch = incomplete.slice(0, BACKFILL_BATCH_SIZE);
  const TTS_CONCURRENCY = 4;
  const jobs: { verbId: string; tense: string; forms: string[] }[] = [];
  for (const v of batch) {
    const audio = (v.tense_audio as Record<string, string>) ?? {};
    for (const tense of TENSES) {
      const forms = (v.tenses as Record<string, string[]>)?.[tense];
      if (forms?.length > 0 && !audio[tense]) jobs.push({ verbId: v.id, tense, forms });
    }
  }

  for (let i = 0; i < jobs.length; i += TTS_CONCURRENCY) {
    const chunk = jobs.slice(i, i + TTS_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (job) => {
        const spoken = job.forms.join(', ') + '.';
        const storagePath = `${languageCode}/conjugation/${job.verbId}/${job.tense}.mp3`;
        const { audioUrl } = await synthesizeAndStore(spoken, languageCode, storagePath);

        const { data: current } = await supabaseAdmin
          .from('conjugation_verbs')
          .select('tense_audio')
          .eq('id', job.verbId)
          .single();
        const updatedAudio = { ...(current?.tense_audio ?? {}), [job.tense]: audioUrl };
        await supabaseAdmin.from('conjugation_verbs').update({ tense_audio: updatedAudio }).eq('id', job.verbId);
      })
    );
  }

  return { done: incomplete.length <= BACKFILL_BATCH_SIZE, processed: batch.length };
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

  const { data: insertedRows, error } = await supabaseAdmin
    .from('conjugation_verbs')
    .upsert(rows, { onConflict: 'language_code,infinitive' })
    .select('id, infinitive, tenses');
  if (error) throw new Error(error.message);

  // Audio : un seul fichier par temps (les 6 formes enchaînées), pas un par
  // forme individuelle — ex. "dico, dici, dice, diciamo, dite, dicono."
  const TTS_CONCURRENCY = 4;
  const audioJobs: { verbId: string; tense: string }[] = [];
  for (const row of insertedRows ?? []) {
    for (const tense of TENSES) {
      const forms = (row.tenses as Record<string, string[]>)?.[tense];
      if (forms && forms.length > 0) audioJobs.push({ verbId: row.id, tense });
    }
  }

  for (let i = 0; i < audioJobs.length; i += TTS_CONCURRENCY) {
    const batch = audioJobs.slice(i, i + TTS_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (job) => {
        const row = insertedRows!.find((r) => r.id === job.verbId)!;
        const forms = (row.tenses as Record<string, string[]>)[job.tense];
        const spoken = forms.join(', ') + '.';
        const storagePath = `${languageCode}/conjugation/${job.verbId}/${job.tense}.mp3`;
        const { audioUrl } = await synthesizeAndStore(spoken, languageCode, storagePath);

        const { data: current } = await supabaseAdmin
          .from('conjugation_verbs')
          .select('tense_audio')
          .eq('id', job.verbId)
          .single();
        const updatedAudio = { ...(current?.tense_audio ?? {}), [job.tense]: audioUrl };
        await supabaseAdmin.from('conjugation_verbs').update({ tense_audio: updatedAudio }).eq('id', job.verbId);
      })
    );
  }

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
