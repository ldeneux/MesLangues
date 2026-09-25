'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES, packThemeQuotas, VOCAB_PACK_SIZE } from './constants';

const CHUNK_SIZE = 15;
const MASTERY_MIN_ATTEMPTS = 1;
const MASTERY_MIN_RATE = 0.9;

import { normalizeForCompare } from './textUtils';

function computeMastered(success: number, fail: number): boolean {
  const total = success + fail;
  return total >= MASTERY_MIN_ATTEMPTS && success / total >= MASTERY_MIN_RATE;
}

// ---------------------------------------------------------
// Packs de vocabulaire (même principe que les packs de phrases : 350 mots,
// répartis par thème, génération par petits lots résumable).
// ---------------------------------------------------------
export type VocabularyPackInfo = {
  id: string;
  pack_number: number;
  status: 'pending' | 'generating' | 'ready';
  generated_count: number;
  target_count: number;
};

export async function getVocabularyPacks(languageCode: string, levelCode: string): Promise<VocabularyPackInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('id, pack_number, status, generated_count, target_count')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createVocabularyPack(languageCode: string, levelCode: string): Promise<VocabularyPackInfo> {
  const { data: existing } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('pack_number')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number', { ascending: false })
    .limit(1);

  const nextNumber = (existing?.[0]?.pack_number ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('vocabulary_packs')
    .insert({ language_code: languageCode, level_code: levelCode, pack_number: nextNumber, target_count: VOCAB_PACK_SIZE })
    .select('id, pack_number, status, generated_count, target_count')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export type VocabularyStepResult = {
  done: boolean;
  themeLabel?: string;
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

export async function runVocabularyPackStep(packId: string): Promise<VocabularyStepResult> {
  const { data: pack, error: packError } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (packError || !pack) throw new Error(packError?.message ?? 'Pack de vocabulaire introuvable');

  const quotas = packThemeQuotas(pack.target_count);

  let targetTheme: { code: string; label: string; count: number; existing: number } | null = null;
  for (const q of quotas) {
    const { count } = await supabaseAdmin
      .from('vocabulary_words')
      .select('id', { count: 'exact', head: true })
      .eq('pack_id', packId)
      .eq('theme_code', q.code);

    if ((count ?? 0) < q.count) {
      targetTheme = { ...q, existing: count ?? 0 };
      break;
    }
  }

  if (!targetTheme) {
    const { count: actualTotal } = await supabaseAdmin
      .from('vocabulary_words')
      .select('id', { count: 'exact', head: true })
      .eq('pack_id', packId);
    await supabaseAdmin
      .from('vocabulary_packs')
      .update({ status: 'ready', completed_at: new Date().toISOString(), generated_count: actualTotal ?? pack.target_count })
      .eq('id', packId);
    return {
      done: true,
      generatedThisStep: 0,
      generatedTotal: actualTotal ?? pack.target_count,
      targetTotal: pack.target_count,
    };
  }

  if (pack.status !== 'generating') {
    await supabaseAdmin.from('vocabulary_packs').update({ status: 'generating' }).eq('id', packId);
  }

  const chunkCount = Math.min(CHUNK_SIZE, targetTheme.count - targetTheme.existing);
  const langName = LANGUAGE_NAMES[pack.language_code] ?? pack.language_code;

  // Anti-doublon GLOBAL : tous les mots déjà générés pour cette langue/ce
  // niveau, tous thèmes confondus (un mot comme "stanco"/fatigué peut être
  // proposé sous plusieurs thèmes par erreur — l'éviter partout, pas juste
  // dans le thème courant).
  const { data: siblingPackIds } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('id')
    .eq('language_code', pack.language_code)
    .eq('level_code', pack.level_code);

  const { data: prior } = await supabaseAdmin
    .from('vocabulary_words')
    .select('target_text')
    .in(
      'pack_id',
      (siblingPackIds ?? []).map((p) => p.id)
    )
    .order('created_at', { ascending: false })
    .limit(400);

  const avoidList = (prior ?? []).map((p) => p.target_text);
  const avoidInstruction =
    avoidList.length > 0 ? `\n\nDéjà utilisés (tous thèmes confondus), ne pas répéter :\n- ${avoidList.join('\n- ')}` : '';

  const system = `Tu es un professeur de ${langName} langue étrangère. Tu constitues une
banque de vocabulaire de base niveau CECRL ${pack.level_code}, thème "${targetTheme.label}".
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

  const user = `Donne ${chunkCount} mots/expressions de niveau ${pack.level_code} sur le thème "${targetTheme.label}".`;

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

  // Filet de sécurité anti-doublon côté code, en plus de l'instruction à
  // Gemini (global, pas juste le thème courant).
  const seenNormalized = new Set(avoidList.map(normalizeForCompare));
  const validTypes = new Set(['nom', 'adjectif', 'adverbe', 'expression']);
  const rows = parsed
    .filter((w) => w.target_text && w.translation_fr)
    .filter((w) => {
      const n = normalizeForCompare(w.target_text!);
      if (seenNormalized.has(n)) return false;
      seenNormalized.add(n);
      return true;
    })
    .map((w) => ({
      language_code: pack.language_code,
      level_code: pack.level_code,
      pack_id: packId,
      theme_code: targetTheme!.code,
      word_type: w.word_type && validTypes.has(w.word_type) ? w.word_type : 'nom',
      target_text: w.target_text!,
      translation_fr: w.translation_fr!,
    }));

  if (rows.length === 0) {
    // Tout était doublon cette fois — pas d'avancée, le client rappellera.
    return { done: false, generatedThisStep: 0, generatedTotal: pack.generated_count, targetTotal: pack.target_count };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('vocabulary_words')
    .insert(rows)
    .select('id, target_text');

  if (insertError) throw new Error(insertError.message);

  const TTS_CONCURRENCY = 6;
  for (let i = 0; i < (inserted?.length ?? 0); i += TTS_CONCURRENCY) {
    const batch = inserted!.slice(i, i + TTS_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (row) => {
        const storagePath = `${pack.language_code}/${pack.level_code}/vocabulary/${row.id}.mp3`;
        const { audioUrl } = await synthesizeAndStore(row.target_text, pack.language_code, storagePath);
        await supabaseAdmin.from('vocabulary_words').update({ audio_url: audioUrl }).eq('id', row.id);
      })
    );
  }

  const { count: totalGenerated } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id', { count: 'exact', head: true })
    .eq('pack_id', packId);

  await supabaseAdmin.from('vocabulary_packs').update({ generated_count: totalGenerated ?? 0 }).eq('id', packId);

  return {
    done: false,
    themeLabel: targetTheme.label,
    generatedThisStep: inserted?.length ?? 0,
    generatedTotal: totalGenerated ?? 0,
    targetTotal: pack.target_count,
  };
}

// ---------------------------------------------------------
// Liste + filtres (onglet Vocabulaire)
// ---------------------------------------------------------
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

async function getReadyVocabularyPackIds(languageCode: string, levelCode: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  return (data ?? []).map((p) => p.id);
}

export type VocabularyScoreEntry = {
  id: string;
  target_text: string;
  translation_fr: string;
  success_count: number;
  fail_count: number;
  score: number; // 0-100
};

/**
 * Score (0-100) de chaque mot déjà pratiqué au moins une fois par ce
 * profil — les mots jamais pratiqués sont exclus, pour l'onglet
 * Statistiques.
 */
export async function getVocabularyScores(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<VocabularyScoreEntry[]> {
  const packIds = await getReadyVocabularyPackIds(languageCode, levelCode);
  if (packIds.length === 0) return [];

  const { data: words } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id, target_text, translation_fr')
    .in('pack_id', packIds);

  const wordMap = new Map((words ?? []).map((w) => [w.id, w]));

  const { data: progress } = await supabaseAdmin
    .from('vocabulary_progress')
    .select('word_id, success_count, fail_count')
    .eq('profile_id', profileId);

  const relevantProgress = (progress ?? []).filter((p) => wordMap.has(p.word_id));

  return relevantProgress
    .filter((p) => p.success_count + p.fail_count > 0)
    .map((p) => {
      const w = wordMap.get(p.word_id)!;
      return {
        id: p.word_id,
        target_text: w.target_text,
        translation_fr: w.translation_fr,
        success_count: p.success_count,
        fail_count: p.fail_count,
        score: Math.round((p.success_count / (p.success_count + p.fail_count)) * 100),
      };
    });
}

export async function resetWordProgress(profileId: string, wordId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('vocabulary_progress')
    .delete()
    .eq('profile_id', profileId)
    .eq('word_id', wordId);
  if (error) throw new Error(error.message);
}

export async function resetAllVocabularyProgress(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<void> {
  const packIds = await getReadyVocabularyPackIds(languageCode, levelCode);
  if (packIds.length === 0) return;

  const { data: words } = await supabaseAdmin.from('vocabulary_words').select('id').in('pack_id', packIds);
  const wordIds = (words ?? []).map((w) => w.id);
  if (wordIds.length === 0) return;

  const { data: progress } = await supabaseAdmin
    .from('vocabulary_progress')
    .select('word_id')
    .eq('profile_id', profileId);

  const toDelete = (progress ?? []).map((p) => p.word_id).filter((id) => wordIds.includes(id));

  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error } = await supabaseAdmin
      .from('vocabulary_progress')
      .delete()
      .eq('profile_id', profileId)
      .in('word_id', batch);
    if (error) throw new Error(error.message);
  }
}

export async function getVocabularyWords(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<VocabularyWordWithMastery[]> {
  const packIds = await getReadyVocabularyPackIds(languageCode, levelCode);
  if (packIds.length === 0) return [];

  const { data: words, error } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id, theme_code, word_type, target_text, translation_fr, audio_url')
    .in('pack_id', packIds)
    .order('theme_code');

  if (error) throw new Error(error.message);
  if (!words || words.length === 0) return [];

  const wordIds = new Set(words.map((w) => w.id));

  const { data: progress } = await supabaseAdmin
    .from('vocabulary_progress')
    .select('word_id, success_count, fail_count')
    .eq('profile_id', profileId);

  const progressMap = new Map((progress ?? []).filter((p) => wordIds.has(p.word_id)).map((p) => [p.word_id, p]));

  return words.map((w) => {
    const p = progressMap.get(w.id);
    const success = p?.success_count ?? 0;
    const fail = p?.fail_count ?? 0;
    return { ...w, success_count: success, fail_count: fail, mastered: computeMastered(success, fail) };
  });
}

// ---------------------------------------------------------
// Mode Test : pioche mêlée mots + verbes, résultat oral uniquement.
// ---------------------------------------------------------
export type GameItem = {
  id: string;
  source: 'word' | 'verb';
  target_text: string;
  translation_fr: string;
  audio_url: string | null;
};

export async function getGameItems(
  languageCode: string,
  levelCode: string,
  profileId: string,
  count = 20,
  onlyPracticed = false
): Promise<GameItem[]> {
  const packIds = await getReadyVocabularyPackIds(languageCode, levelCode);

  const { data: words } =
    packIds.length > 0
      ? await supabaseAdmin
          .from('vocabulary_words')
          .select('id, target_text, translation_fr, audio_url')
          .in('pack_id', packIds)
      : { data: [] as { id: string; target_text: string; translation_fr: string; audio_url: string | null }[] };

  const { data: verbs } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id, infinitive, translation_fr, tense_audio')
    .eq('language_code', languageCode);

  let wordItems: GameItem[] = (words ?? []).map((w) => ({
    id: w.id,
    source: 'word',
    target_text: w.target_text,
    translation_fr: w.translation_fr,
    audio_url: w.audio_url,
  }));

  let verbItems: GameItem[] = (verbs ?? []).map((v) => ({
    id: v.id,
    source: 'verb',
    target_text: v.infinitive,
    translation_fr: v.translation_fr,
    // Pas d'audio de l'infinitif seul généré à part — réutiliser l'audio de
    // conjugaison au présent ferait entendre toute la déclinaison, trompeur.
    audio_url: null,
  }));

  if (onlyPracticed) {
    const [{ data: wordProgress }, { data: verbProgress }] = await Promise.all([
      supabaseAdmin.from('vocabulary_progress').select('word_id').eq('profile_id', profileId),
      supabaseAdmin.from('conjugation_progress').select('verb_id').eq('profile_id', profileId),
    ]);
    const practicedWordIds = new Set((wordProgress ?? []).map((p) => p.word_id));
    const practicedVerbIds = new Set((verbProgress ?? []).map((p) => p.verb_id));
    wordItems = wordItems.filter((w) => practicedWordIds.has(w.id));
    verbItems = verbItems.filter((v) => practicedVerbIds.has(v.id));

    const pool = [...wordItems, ...verbItems];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  // Mix 70% jamais pratiqué / 30% déjà pratiqué (révision), pour ancrer ce
  // qui a déjà été vu plutôt que de le laisser retomber dans l'oubli.
  const [{ data: wordProgress }, { data: verbProgress }] = await Promise.all([
    supabaseAdmin.from('vocabulary_progress').select('word_id').eq('profile_id', profileId),
    supabaseAdmin.from('conjugation_progress').select('verb_id').eq('profile_id', profileId),
  ]);
  const practicedWordIds = new Set((wordProgress ?? []).map((p) => p.word_id));
  const practicedVerbIds = new Set((verbProgress ?? []).map((p) => p.verb_id));

  const allItems = [...wordItems, ...verbItems];
  const isPracticed = (item: GameItem) =>
    item.source === 'word' ? practicedWordIds.has(item.id) : practicedVerbIds.has(item.id);

  const fresh = allItems.filter((i) => !isPracticed(i));
  const practiced = allItems.filter(isPracticed);

  const shuffle = (arr: GameItem[]) => arr.sort(() => Math.random() - 0.5);

  const newGoal = Math.round(count * 0.7);
  const reviewGoal = count - newGoal;

  const freshPart = shuffle(fresh.slice()).slice(0, newGoal);
  const reviewPart = shuffle(practiced.slice()).slice(0, reviewGoal);

  let combined = shuffle([...freshPart, ...reviewPart]);
  if (combined.length < count) {
    const usedIds = new Set(combined.map((i) => i.id));
    const filler = allItems.filter((i) => !usedIds.has(i.id)).slice(0, count - combined.length);
    combined = shuffle([...combined, ...filler]);
  }

  return combined.slice(0, count);
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
