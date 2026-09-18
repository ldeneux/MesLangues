'use server';

import { supabaseAdmin } from './supabaseAdmin';

export type Phrase = {
  id: string;
  target_text: string;
  translation_fr: string;
  notes: string | null;
  audio_url: string | null;
  theme_code: string | null;
};

export type ReadyPack = {
  id: string;
  pack_number: number;
};

async function getReadyPacks(languageCode: string, levelCode: string): Promise<ReadyPack[]> {
  const { data } = await supabaseAdmin
    .from('packs')
    .select('id, pack_number')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready')
    .order('pack_number');

  return data ?? [];
}

/**
 * Prochaines phrases non encore vues par ce profil, dans l'ordre des packs
 * prêts. C'est ce qui alimente "Phrases du jour" — plus une génération
 * quotidienne automatique, mais une file d'attente personnelle par profil.
 */
export async function getNextDailyPhrases(
  profileId: string,
  languageCode: string,
  levelCode: string,
  dailyGoal = 30
): Promise<{ phrases: Phrase[]; hasReadyPacks: boolean }> {
  const packs = await getReadyPacks(languageCode, levelCode);
  if (packs.length === 0) return { phrases: [], hasReadyPacks: false };

  const { data: seenRows } = await supabaseAdmin
    .from('user_phrase_progress')
    .select('phrase_id')
    .eq('user_id', profileId);
  const seenIds = new Set((seenRows ?? []).map((r) => r.phrase_id));

  const { data: pool } = await supabaseAdmin
    .from('phrases')
    .select('id, target_text, translation_fr, notes, audio_url, theme_code, pack_id, pack_position')
    .in(
      'pack_id',
      packs.map((p) => p.id)
    )
    .order('pack_position');

  const all = pool ?? [];
  const unseen = all.filter((p) => !seenIds.has(p.id));
  const seen = all.filter((p) => seenIds.has(p.id));

  // Mix 70% nouveau / 30% révision (déjà vu), pour ancrer le vocabulaire
  // plutôt que de le voir une seule fois et l'oublier.
  const newGoal = Math.round(dailyGoal * 0.7);
  const reviewGoal = dailyGoal - newGoal;

  const shuffle = <T,>(arr: T[]) => arr.sort(() => Math.random() - 0.5);

  const newPart = unseen.slice(0, newGoal);
  const reviewPart = shuffle(seen.slice()).slice(0, reviewGoal);

  // Si pas assez d'un des deux tas, on complète avec l'autre pour garder
  // dailyGoal phrases au total quand c'est possible.
  let combined = shuffle([...newPart, ...reviewPart]);
  if (combined.length < dailyGoal) {
    const usedIds = new Set(combined.map((p) => p.id));
    const filler = all.filter((p) => !usedIds.has(p.id)).slice(0, dailyGoal - combined.length);
    combined = shuffle([...combined, ...filler]);
  }

  return { phrases: combined, hasReadyPacks: true };
}

export async function recordExerciseResult(profileId: string, phraseId: string, success: boolean): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('exercise_progress')
    .select('success_count, fail_count')
    .eq('profile_id', profileId)
    .eq('phrase_id', phraseId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('exercise_progress').upsert(
    {
      profile_id: profileId,
      phrase_id: phraseId,
      success_count: (existing?.success_count ?? 0) + (success ? 1 : 0),
      fail_count: (existing?.fail_count ?? 0) + (success ? 0 : 1),
      last_practiced_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,phrase_id' }
  );
  if (error) throw new Error(error.message);
}

export async function getAllReadyPhrases(languageCode: string, levelCode: string): Promise<Phrase[]> {
  const packs = await getReadyPacks(languageCode, levelCode);
  if (packs.length === 0) return [];

  const { data } = await supabaseAdmin
    .from('phrases')
    .select('id, target_text, translation_fr, notes, audio_url, theme_code')
    .in(
      'pack_id',
      packs.map((p) => p.id)
    );

  return data ?? [];
}

export async function markPhraseSeen(profileId: string, phraseId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('user_phrase_progress')
    .select('seen_count')
    .eq('user_id', profileId)
    .eq('phrase_id', phraseId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('user_phrase_progress').upsert(
    {
      user_id: profileId,
      phrase_id: phraseId,
      last_seen_at: new Date().toISOString(),
      seen_count: (existing?.seen_count ?? 0) + 1,
    },
    { onConflict: 'user_id,phrase_id' }
  );

  if (error) throw new Error(`markPhraseSeen a échoué : ${error.message}`);
}

/**
 * Packs prêts pour la navigation "Révision" (parcourir tout le contenu déjà
 * téléchargé, pas seulement ce qui a été vu).
 */
export async function getBrowsablePacks(languageCode: string, levelCode: string): Promise<ReadyPack[]> {
  return getReadyPacks(languageCode, levelCode);
}

export async function getPhrasesByPack(packId: string): Promise<Phrase[]> {
  const { data } = await supabaseAdmin
    .from('phrases')
    .select('id, target_text, translation_fr, notes, audio_url, theme_code')
    .eq('pack_id', packId)
    .order('pack_position');

  return data ?? [];
}

export type VocabularyEntry = Phrase & { seen_at: string };

/**
 * Vocabulaire vu par ce profil pour une langue/niveau donnés — utilisé par
 * l'onglet "Vocabulaire".
 */
export async function getVocabulary(
  profileId: string,
  languageCode: string,
  levelCode: string
): Promise<VocabularyEntry[]> {
  const packs = await getReadyPacks(languageCode, levelCode);
  if (packs.length === 0) return [];

  const { data: phraseRows } = await supabaseAdmin
    .from('phrases')
    .select('id, target_text, translation_fr, notes, audio_url, theme_code')
    .in(
      'pack_id',
      packs.map((p) => p.id)
    );

  const phraseMap = new Map((phraseRows ?? []).map((p) => [p.id, p]));

  const { data: progressRows } = await supabaseAdmin
    .from('user_phrase_progress')
    .select('phrase_id, last_seen_at')
    .eq('user_id', profileId)
    .in('phrase_id', Array.from(phraseMap.keys()));

  return (progressRows ?? [])
    .map((r) => {
      const phrase = phraseMap.get(r.phrase_id);
      return phrase ? { ...phrase, seen_at: r.last_seen_at } : null;
    })
    .filter((x): x is VocabularyEntry => x !== null)
    .sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1));
}
