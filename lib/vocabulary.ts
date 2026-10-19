'use server';

import { resolveImage } from './imageIndex';
import { supabaseAdmin } from './supabaseAdmin';
import { callGeminiWithUsage, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { VOCAB_THEMES, packThemeQuotas, VOCAB_PACK_SIZE, LEVELS } from './constants';

const CHUNK_SIZE = 25; // plus de mots par appel = moins d'appels (la liste anti-doublon n'est envoyée qu'une fois par appel)
const MASTERY_MIN_ATTEMPTS = 1;
const MASTERY_MIN_RATE = 0.9;

import { normalizeForCompare, vocabPairKey } from './textUtils';
import { fetchAllRows } from './paging';
import { stripRuby, readingFromRuby } from './japanese';

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
  exhausted?: boolean; // true : tous les thèmes non écartés ont été essayés, plus aucun thème à proposer
  themeCode?: string;
  themeLabel?: string;
  usage?: { inputTokens: number; outputTokens: number }; // consommation Gemini de ce pas (pour suivre le coût réel)
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

/**
 * Un pas de génération (≈ 15 mots). Choix du thème :
 *  1) d'abord les 15 thèmes principaux, selon leurs quotas (comme avant) ;
 *  2) quand les thèmes principaux sont pleins ou écartés et que le pack n'est pas complet, on complète avec TOUS les
 *     thèmes (principaux + réserve), en commençant par celui qui a le moins de mots dans ce pack.
 * `skipThemes` : thèmes que le client a déjà essayés plusieurs fois sans obtenir de mot nouveau (à ne plus proposer
 * pendant cette génération). Quand tous les thèmes sont écartés, on renvoie `exhausted: true`.
 */
export async function runVocabularyPackStep(packId: string, skipThemes: string[] = []): Promise<VocabularyStepResult> {
  const { data: pack, error: packError } = await supabaseAdmin
    .from('vocabulary_packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (packError || !pack) throw new Error(packError?.message ?? 'Pack de vocabulaire introuvable');

  const skip = new Set(skipThemes);

  // Mots déjà présents dans ce pack, par thème (une seule lecture).
  const packWords = await fetchAllRows<{ theme_code: string }>((from, to) =>
    supabaseAdmin.from('vocabulary_words').select('theme_code').eq('pack_id', packId).order('id').range(from, to)
  );
  const countByTheme = new Map<string, number>();
  for (const w of packWords) countByTheme.set(w.theme_code, (countByTheme.get(w.theme_code) ?? 0) + 1);
  const packTotal = packWords.length;

  if (packTotal >= pack.target_count) {
    await supabaseAdmin
      .from('vocabulary_packs')
      .update({ status: 'ready', completed_at: new Date().toISOString(), generated_count: packTotal })
      .eq('id', packId);
    return { done: true, generatedThisStep: 0, generatedTotal: packTotal, targetTotal: pack.target_count };
  }

  let targetTheme: { code: string; label: string; room: number } | null = null;

  // Phase 1 : quotas des thèmes principaux.
  for (const q of packThemeQuotas(pack.target_count)) {
    if (skip.has(q.code)) continue;
    const have = countByTheme.get(q.code) ?? 0;
    if (have < q.count) {
      targetTheme = { code: q.code, label: q.label, room: q.count - have };
      break;
    }
  }

  // Phase 2 : complément sur tous les thèmes (principaux + réserve), le moins fourni dans ce pack d'abord.
  if (!targetTheme) {
    const candidates = VOCAB_THEMES.filter((t) => !skip.has(t.code))
      .map((t) => ({ ...t, have: countByTheme.get(t.code) ?? 0 }))
      .sort((a, b) => a.have - b.have); // tri stable : à égalité, ordre de la liste
    if (candidates.length > 0) {
      targetTheme = { code: candidates[0].code, label: candidates[0].label, room: pack.target_count - packTotal };
    }
  }

  if (!targetTheme) {
    // Tous les thèmes ont été essayés sans résultat : le pack reste incomplet.
    await supabaseAdmin.from('vocabulary_packs').update({ generated_count: packTotal }).eq('id', packId);
    return { done: false, exhausted: true, generatedThisStep: 0, generatedTotal: packTotal, targetTotal: pack.target_count };
  }

  if (pack.status !== 'generating') {
    await supabaseAdmin.from('vocabulary_packs').update({ status: 'generating' }).eq('id', packId);
  }

  const chunkCount = Math.min(CHUNK_SIZE, targetTheme.room);
  const langName = LANGUAGE_NAMES[pack.language_code] ?? pack.language_code;

  const theme = targetTheme;

  // Anti-doublon : un nouveau mot ne doit exister ni à ce niveau, ni aux niveaux INFÉRIEURS (A2 : ni en A2 ni en A1 ;
  // B1 : ni en B1, A2, A1…), tous packs et thèmes confondus. Un mot déjà présent à un niveau SUPÉRIEUR n'est PAS un
  // doublon (A1 peut recevoir un mot qui existe déjà en B1). On ne charge donc que les niveaux <= au niveau du pack.
  // La liste donnée à Gemini ne sert qu'à lui éviter de proposer des mots refusés ; le vrai verrou est le filtre
  // en code plus bas.
  const levelOrder: string[] = LEVELS.map((l) => l.code);
  const allowedLevels = levelOrder.slice(0, levelOrder.indexOf(pack.level_code) + 1); // ce niveau + niveaux inférieurs UNIQUEMENT
  const languageWords = await fetchAllRows<{
    target_text: string;
    translation_fr: string;
    level_code: string;
    theme_code: string;
    created_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from('vocabulary_words')
      .select('target_text, translation_fr, level_code, theme_code, created_at')
      .eq('language_code', pack.language_code)
      .in('level_code', allowedLevels)
      .order('id')
      .range(from, to)
  );

  const maxLevelIdx = levelOrder.indexOf(pack.level_code);
  const byRecent = (a: { created_at: string }, b: { created_at: string }) => (a.created_at < b.created_at ? 1 : -1);

  // Niveaux inférieurs ou égal, même thème d'abord (c'est là que les redites sont les plus probables), puis le reste du niveau.
  const sameThemeLowerOrSame = languageWords
    .filter((w) => levelOrder.indexOf(w.level_code) <= maxLevelIdx && w.theme_code === theme.code)
    .sort(byRecent)
    .slice(0, 400);

  // Seulement les mots du MÊME thème : les redites d'autres thèmes sont éliminées par le filtre en code (moins de tokens envoyés).
  const avoidList = Array.from(new Set(sameThemeLowerOrSame.map((w) => w.target_text)));
  const avoidInstruction =
    avoidList.length > 0
      ? `\n\nDéjà utilisés (ce niveau et les niveaux inférieurs), NE PAS répéter ces mots ni leurs variantes avec/sans article :\n- ${avoidList.join('\n- ')}`
      : '';

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

  const user = `Donne ${chunkCount} mots/expressions de niveau ${pack.level_code} sur le thème "${targetTheme.label}". Ils doivent être NOUVEAUX : aucun mot déjà vu à ce niveau ou aux niveaux inférieurs.`;

  const isJa = pack.language_code === 'ja';

  // Japonais : écriture moderne naturelle (kanji + kana), plus furigana et rōmaji pour l'affichage.
  const systemJa = `Tu es un professeur de japonais pour francophones. Tu constitues une banque de
vocabulaire de base niveau CECRL ${pack.level_code}, thème "${targetTheme.label}".
Donne des mots ou courtes expressions isolés (PAS des phrases complètes), utiles au quotidien.

ÉCRITURE : écris chaque mot comme dans le japonais d'aujourd'hui :
- kanji + hiragana (okurigana) pour les mots normalement écrits avec des kanji (食べる, 学校, 大きい) ;
- hiragana seul pour les mots courants qui s'écrivent d'habitude en kana (ありがとう, ください, とても) ;
- katakana pour les mots d'origine étrangère (コーヒー, テレビ).
Verbes et adjectifs à la forme du dictionnaire. Pas d'article (le japonais n'en a pas), mais la traduction
française garde son article (ex. "l'école", "une table"). Choisis des mots dont les kanji sont courants et
adaptés au niveau (les plus simples en A1/A2).

Tu réponds STRICTEMENT en JSON valide, un tableau d'objets, sans texte avant/après, sans balises markdown.
Chaque objet :
{
  "target_text": "le mot en écriture japonaise moderne",
  "translation_fr": "traduction française (avec article si nom)",
  "word_type": "nom | adjectif | adverbe | expression",
  "ruby": "le MÊME mot où chaque groupe de kanji est écrit {kanji|lecture en hiragana}, ex. {食|た}べる ; ne change aucun caractère",
  "romaji": "rōmaji Hepburn avec macrons (ō ū), ex. taberu"
}${avoidInstruction}`;

  const { text, usage } = await callGeminiWithUsage(isJa ? systemJa : system, user, { thinkingLevel: 'minimal' });
  let parsed: Array<{ target_text?: string; translation_fr?: string; word_type?: string; ruby?: string; romaji?: string }>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour le vocabulaire.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de vocabulaire inattendu reçu de Gemini');
  }

  // Filet de sécurité anti-doublon côté code (le vrai verrou) : on écarte tout mot déjà présent à ce niveau ou aux
  // niveaux inférieurs (même mot + même traduction à l'article près, tous packs), et tout mot déjà présent à ce niveau
  // (même texte), ainsi que les répétitions à l'intérieur du lot reçu. Les niveaux supérieurs sont ignorés.
  const knownPairs = new Set(
    languageWords
      .filter((w) => levelOrder.indexOf(w.level_code) <= maxLevelIdx)
      .map((w) => vocabPairKey(w.target_text, w.translation_fr))
  );
  const seenNormalized = new Set(
    languageWords.filter((w) => w.level_code === pack.level_code).map((w) => normalizeForCompare(w.target_text))
  );
  const validTypes = new Set(['nom', 'adjectif', 'adverbe', 'expression']);
  const rows = parsed
    .filter((w) => w.target_text && w.translation_fr)
    .filter((w) => {
      const pair = vocabPairKey(w.target_text!, w.translation_fr!);
      if (knownPairs.has(pair)) return false;
      const n = normalizeForCompare(w.target_text!);
      if (seenNormalized.has(n)) return false;
      knownPairs.add(pair);
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
    }))
    // Jamais plus que demandé : Gemini renvoie parfois plus de mots que le nombre voulu, et un pack dépassait alors 350.
    .slice(0, chunkCount);

  // Japonais : lectures validées (le ruby, sans accolades, doit redonner exactement le mot)
  const jaReadingByText = new Map<string, { ruby: string; romaji: string }>();
  if (isJa) {
    for (const w of parsed) {
      if (w.target_text && typeof w.ruby === 'string' && typeof w.romaji === 'string' && w.romaji.trim() && stripRuby(w.ruby) === w.target_text) {
        jaReadingByText.set(w.target_text, { ruby: w.ruby, romaji: w.romaji.trim() });
      }
    }
  }

  if (rows.length === 0) {
    // Tout était doublon cette fois — pas d'avancée, le client rappellera.
    return { done: false, themeCode: targetTheme.code, themeLabel: targetTheme.label, usage, generatedThisStep: 0, generatedTotal: packTotal, targetTotal: pack.target_count };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('vocabulary_words')
    .insert(rows)
    .select('id, target_text');

  if (insertError) throw new Error(insertError.message);

  if (isJa && jaReadingByText.size > 0) {
    const { error: readingError } = await supabaseAdmin
      .from('ja_readings')
      .upsert(Array.from(jaReadingByText, ([t, r]) => ({ text: t, ruby: r.ruby, romaji: r.romaji })), { onConflict: 'text' });
    if (readingError) console.error('ja_readings (migration 014 exécutée ?) :', readingError.message); // non bloquant
  }

  const TTS_CONCURRENCY = 6;
  for (let i = 0; i < (inserted?.length ?? 0); i += TTS_CONCURRENCY) {
    const batch = inserted!.slice(i, i + TTS_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (row) => {
        const storagePath = `${pack.language_code}/${pack.level_code}/vocabulary/${row.id}.mp3`;
        // Japonais : on fait lire la prononciation en kana (évite les kanji à lectures multiples)
        const rd = jaReadingByText.get(row.target_text);
        const ttsText = rd ? readingFromRuby(rd.ruby) : row.target_text;
        const { audioUrl } = await synthesizeAndStore(ttsText, pack.language_code, storagePath);
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
    themeCode: targetTheme.code,
    themeLabel: targetTheme.label,
    usage,
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
  image?: string | null; // nom du fichier image (sans extension) s'il existe dans public/image_webp
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

  // Le nom d'image enregistré en base est lu avec les mots ; si la colonne n'existe pas encore (migration 024), on s'en passe.
  let res: { data: any[] | null; error: any } = await supabaseAdmin
    .from('vocabulary_words')
    .select('id, theme_code, word_type, target_text, translation_fr, audio_url, image')
    .in('pack_id', packIds)
    .order('theme_code');
  if (res.error && String(res.error.message ?? '').includes('image')) {
    res = await supabaseAdmin
      .from('vocabulary_words')
      .select('id, theme_code, word_type, target_text, translation_fr, audio_url')
      .in('pack_id', packIds)
      .order('theme_code');
  }
  const { data: words, error } = res;

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
    return { ...w, image: resolveImage(w.image, w.translation_fr), success_count: success, fail_count: fail, mastered: computeMastered(success, fail) };
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
