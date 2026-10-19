'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES, CONJUGATION_TARGET, LEVELS } from './constants';
import { fetchAllRows } from './paging';
import { runJapaneseVerbStep } from './japaneseConjugation';
import type { JaVerbData } from './japaneseVerbs';

const CHUNK_SIZE = 10;
const TENSES = ['present', 'futur', 'passe_compose', 'imparfait'] as const;

export type ConjugationVerb = {
  id: string;
  infinitive: string;
  translation_fr: string;
  frequency_rank: number;
  theme_code: string | null;
  tenses: Record<(typeof TENSES)[number], string[]>;
  tense_audio: Partial<Record<(typeof TENSES)[number], string>> & { basic?: string; infinitive?: string };
  ja_data?: JaVerbData | null; // japonais : groupe + lecture (les formes sont calculées par code)
};

/**
 * Verbes d'une langue. Sans `levelCode` : tous les niveaux. Avec `levelCode` : les verbes de CE niveau ;
 * avec `cumulative` : ceux de ce niveau et des niveaux inférieurs (révision, jeux).
 */
export async function getConjugationVerbs(languageCode: string, levelCode?: string, cumulative = false): Promise<ConjugationVerb[]> {
  const isJa = languageCode === 'ja';
  let query = supabaseAdmin
    .from('conjugation_verbs')
    .select(isJa ? 'id, infinitive, translation_fr, frequency_rank, theme_code, tenses, tense_audio, ja_data' : 'id, infinitive, translation_fr, frequency_rank, theme_code, tenses, tense_audio')
    .eq('language_code', languageCode);
  if (levelCode) {
    const codes: string[] = LEVELS.map((l) => l.code);
    const idx = codes.indexOf(levelCode);
    query = cumulative && idx >= 0 ? query.in('level_code', codes.slice(0, idx + 1)) : query.eq('level_code', levelCode);
  }
  // Japonais : on ignore d'éventuels anciens verbes générés au format européen (sans ja_data)
  if (isJa) query = query.not('ja_data', 'is', null);
  const { data, error } = await query.order('frequency_rank');

  if (error) {
    throw new Error(
      error.message.includes('ja_data')
        ? 'La colonne "ja_data" n\'existe pas encore — exécute la migration 016 dans Supabase.'
        : error.message.includes('level_code')
        ? 'La colonne "level_code" des verbes n\'existe pas encore — exécute la migration 030 dans Supabase.'
        : error.message
    );
  }
  return (data ?? []) as any;
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
 * Génère jusqu'à CHUNK_SIZE verbes supplémentaires POUR CE NIVEAU (120 par niveau), classés par fréquence d'usage
 * décroissante, parmi les verbes pas encore traités dans la langue (tous niveaux confondus : un verbe n'existe
 * qu'une fois par langue, A2 reçoit donc d'autres verbes que A1). Reprise par petits lots, comme les packs de phrases.
 */
export async function runConjugationStep(
  languageCode: string,
  levelCode: string,
  target: number = CONJUGATION_TARGET
): Promise<ConjugationStepResult> {
  if (languageCode === 'ja') return runJapaneseVerbStep(target, levelCode); // formes calculées par code

  const { count: levelCount } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);

  const generatedTotal = levelCount ?? 0; // verbes déjà présents à ce niveau
  if (generatedTotal >= target) {
    return { done: true, generatedThisStep: 0, generatedTotal, targetTotal: target };
  }

  // Tous les verbes déjà présents dans la langue (à éviter) et rang de fréquence de départ
  const existingVerbs = await fetchAllRows<{ infinitive: string; frequency_rank: number }>((from, to) =>
    supabaseAdmin
      .from('conjugation_verbs')
      .select('infinitive, frequency_rank')
      .eq('language_code', languageCode)
      .order('frequency_rank')
      .range(from, to)
  );
  const avoidList = existingVerbs.map((v) => v.infinitive);
  const rankBase = existingVerbs.reduce((m, v) => Math.max(m, v.frequency_rank), 0);
  const chunkCount = Math.min(CHUNK_SIZE, target - generatedTotal);
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const themeLabels = THEMES.map((t) => t.code).join(', ');

  const system = `Tu es un professeur de ${langName} langue étrangère. Tu listes les verbes
les plus fréquemment utilisés en ${langName} courant et adaptés au niveau CECRL ${levelCode},
par ordre décroissant de fréquence d'usage réelle (le plus utilisé en premier), avec leur
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

  const user = `Donne les ${chunkCount} prochains verbes les plus fréquents et utiles au niveau ${levelCode}
(parmi ceux qui ne sont pas déjà traités), avec leur conjugaison complète.${avoidInstruction}`;

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
    .filter((v) => {
      if (!v.infinitive) return false;
      const k = v.infinitive.toLowerCase();
      if (avoidNormalized.has(k)) return false;
      avoidNormalized.add(k); // pas de doublon à l'intérieur du lot
      return true;
    })
    .map((v, i) => ({
      language_code: languageCode,
      level_code: levelCode,
      infinitive: v.infinitive!,
      translation_fr: v.translation_fr ?? '',
      frequency_rank: rankBase + i + 1,
      theme_code: v.theme_code && validThemeCodes.has(v.theme_code) ? v.theme_code : null,
      tenses: {
        present: v.tenses?.present ?? [],
        futur: v.tenses?.futur ?? [],
        passe_compose: v.tenses?.passe_compose ?? [],
        imparfait: v.tenses?.imparfait ?? [],
      },
    }));

  if (rows.length === 0) {
    // Rien de nouveau cette fois (tout doublon) : pas d'avancée, le client rappelle (et s'arrête après plusieurs essais à vide).
    return { done: false, generatedThisStep: 0, generatedTotal, targetTotal: target };
  }

  const { data: insertedRows, error } = await supabaseAdmin
    .from('conjugation_verbs')
    .upsert(rows, { onConflict: 'language_code,infinitive', ignoreDuplicates: true }) // jamais d'écrasement d'un verbe d'un autre niveau
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
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);

  return {
    done: (newTotal ?? 0) >= target,
    generatedThisStep: rows.length,
    generatedTotal: newTotal ?? generatedTotal + rows.length,
    targetTotal: target,
  };
}
