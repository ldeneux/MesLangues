'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES, packThemeQuotas, VOCAB_TARGET } from './constants';

export type VocabularyWord = {
  id: string;
  theme_code: string;
  word_type: string;
  target_text: string;
  translation_fr: string;
  audio_url: string | null;
};

export type VocabularyWordWithMastery = VocabularyWord & {
  success_count: number;
  fail_count: number;
  mastered: boolean;
};

const MASTERY_MIN_ATTEMPTS = 5;
const MASTERY_MIN_RATE = 0.9;

function computeMastered(success: number, fail: number): boolean {
  const total = success + fail;
  return total >= MASTERY_MIN_ATTEMPTS && success / total >= MASTERY_MIN_RATE;
}

export async function getVocabularyStatus(languageCode: string, levelCode: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);
  return count ?? 0;
}

export async function getVocabularyWords(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<VocabularyWordWithMastery[]> {
  const { data: words, error } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id, theme_code, word_type, target_text, translation_fr, audio_url')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('theme_code');

  if (error) throw new Error(error.message);
  if (!words || words.length === 0) return [];

  const { data: progress } = await supabaseAdmin
    .from('vocabulary_progress')
    .select('word_id, success_count, fail_count')
    .eq('profile_id', profileId)
    .in(
      'word_id',
      words.map((w) => w.id)
    );

  const progressMap = new Map((progress ?? []).map((p) => [p.word_id, p]));

  return words.map((w) => {
    const p = progressMap.get(w.id);
    const success = p?.success_count ?? 0;
    const fail = p?.fail_count ?? 0;
    return { ...w, success_count: success, fail_count: fail, mastered: computeMastered(success, fail) };
  });
}

/**
 * Génère jusqu'à un lot de mots pour le thème le moins complet, avec leur
 * audio — même logique de reprise par petits lots que les packs de phrases.
 */
export async function runVocabularyStep(
  languageCode: string,
  levelCode: string
): Promise<{ done: boolean; generatedThisStep: number; generatedTotal: number; targetTotal: number }> {
  const quotas = packThemeQuotas(VOCAB_TARGET);
  const CHUNK_SIZE = 15;

  let targetTheme: { code: string; label: string; count: number; existing: number } | null = null;
  for (const q of quotas) {
    const { count } = await supabaseAdmin
      .from('vocabulary_words')
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
    const total = await getVocabularyStatus(languageCode, levelCode);
    return { done: true, generatedThisStep: 0, generatedTotal: total, targetTotal: VOCAB_TARGET };
  }

  const chunkCount = Math.min(CHUNK_SIZE, targetTheme.count - targetTheme.existing);
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;

  const { data: prior } = await supabaseAdmin
    .from('vocabulary_words')
    .select('target_text')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('theme_code', targetTheme.code)
    .order('created_at', { ascending: false })
    .limit(100);

  const avoidList = (prior ?? []).map((p) => p.target_text);
  const avoidInstruction =
    avoidList.length > 0 ? `\n\nDéjà utilisés pour ce thème, ne pas répéter :\n- ${avoidList.join('\n- ')}` : '';

  const system = `Tu es un professeur de ${langName} langue étrangère. Tu constitues une
banque de vocabulaire de base niveau CECRL ${levelCode}, thème "${targetTheme.label}".
Donne des mots ou courtes expressions isolés (PAS des phrases complètes),
utiles au quotidien. Pour chaque nom, inclus TOUJOURS l'article qui va avec,
aussi bien dans "target_text" que dans "translation_fr" (ex: "una sedia" /
"une chaise", jamais "sedia" / "chaise" tout seul).

Tu réponds STRICTEMENT en JSON valide, un tableau d'objets, sans texte
avant/après, sans balises markdown. Chaque objet :
{
  "target_text": "mot ou expression en ${langName} (avec article si nom)",
  "translation_fr": "traduction française (avec article si nom)",
  "word_type": "nom | adjectif | adverbe | expression"
}${avoidInstruction}`;

  const user = `Donne ${chunkCount} mots/expressions de niveau ${levelCode} sur le thème "${targetTheme.label}".`;

  const text = await callGemini(system, user);
  let parsed: Array<{ target_text?: string; translation_fr?: string; word_type?: string }>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour le vocabulaire.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de vocabulaire inattendu reçu de Gemini');
  }

  const validTypes = new Set(['nom', 'adjectif', 'adverbe', 'expression']);
  const rows = parsed
    .filter((w) => w.target_text && w.translation_fr)
    .map((w) => ({
      language_code: languageCode,
      level_code: levelCode,
      theme_code: targetTheme!.code,
      word_type: w.word_type && validTypes.has(w.word_type) ? w.word_type : 'nom',
      target_text: w.target_text!,
      translation_fr: w.translation_fr!,
    }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('vocabulary_words')
    .insert(rows)
    .select('id, target_text');

  if (insertError) throw new Error(insertError.message);

  // Audio, un fichier par mot.
  const TTS_CONCURRENCY = 6;
  for (let i = 0; i < (inserted?.length ?? 0); i += TTS_CONCURRENCY) {
    const batch = inserted!.slice(i, i + TTS_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (row) => {
        const storagePath = `${languageCode}/${levelCode}/vocabulary/${row.id}.mp3`;
        const { audioUrl } = await synthesizeAndStore(row.target_text, languageCode, storagePath);
        await supabaseAdmin.from('vocabulary_words').update({ audio_url: audioUrl }).eq('id', row.id);
      })
    );
  }

  const generatedTotal = await getVocabularyStatus(languageCode, levelCode);

  return {
    done: generatedTotal >= VOCAB_TARGET,
    generatedThisStep: inserted?.length ?? 0,
    generatedTotal,
    targetTotal: VOCAB_TARGET,
  };
}

// ---------------------------------------------------------
// Mode Jeu : pioche mêlée mots + verbes, résultat oral uniquement.
// ---------------------------------------------------------
export type GameItem = {
  id: string;
  source: 'word' | 'verb';
  target_text: string;
  translation_fr: string;
  audio_url: string | null;
};

export async function getGameItems(languageCode: string, levelCode: string, count = 20): Promise<GameItem[]> {
  const { data: words } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id, target_text, translation_fr, audio_url')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);

  const { data: verbs } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id, infinitive, translation_fr, tense_audio')
    .eq('language_code', languageCode);

  const wordItems: GameItem[] = (words ?? []).map((w) => ({
    id: w.id,
    source: 'word',
    target_text: w.target_text,
    translation_fr: w.translation_fr,
    audio_url: w.audio_url,
  }));

  const verbItems: GameItem[] = (verbs ?? []).map((v) => ({
    id: v.id,
    source: 'verb',
    target_text: v.infinitive,
    translation_fr: v.translation_fr,
    audio_url: (v.tense_audio as Record<string, string>)?.present ?? null,
  }));

  const pool = [...wordItems, ...verbItems];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export async function recordGameResult(
  profileId: string,
  itemId: string,
  source: 'word' | 'verb',
  success: boolean
): Promise<void> {
  const table = source === 'word' ? 'vocabulary_progress' : 'conjugation_progress';
  const idColumn = source === 'word' ? 'word_id' : 'verb_id';

  const { data: existing } = await supabaseAdmin
    .from(table)
    .select('success_count, fail_count')
    .eq('profile_id', profileId)
    .eq(idColumn, itemId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from(table).upsert(
    {
      profile_id: profileId,
      [idColumn]: itemId,
      success_count: (existing?.success_count ?? 0) + (success ? 1 : 0),
      fail_count: (existing?.fail_count ?? 0) + (success ? 0 : 1),
      last_practiced_at: new Date().toISOString(),
    },
    { onConflict: `profile_id,${idColumn}` }
  );

  if (error) throw new Error(error.message);
}
