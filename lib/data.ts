'use server';

import { supabaseAdmin } from './supabaseAdmin';

export type Phrase = {
  id: string;
  target_text: string;
  translation_fr: string;
  notes: string | null;
  audio_url: string | null;
  position: number;
};

export type PhraseSetInfo = {
  id: string;
  set_date: string;
  theme: string | null;
};

/**
 * Lot du jour (aujourd'hui) pour une langue + niveau donnés, avec ses phrases.
 * Utilisé par l'onglet "Phrases du jour".
 */
export async function getTodaySet(
  languageCode: string,
  levelCode: string
): Promise<{ phraseSet: PhraseSetInfo | null; phrases: Phrase[] }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: phraseSet } = await supabaseAdmin
    .from('phrase_sets')
    .select('id, set_date, theme')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('set_date', today)
    .maybeSingle();

  if (!phraseSet) return { phraseSet: null, phrases: [] };

  const { data: phrases } = await supabaseAdmin
    .from('phrases')
    .select('id, target_text, translation_fr, notes, audio_url, position')
    .eq('phrase_set_id', phraseSet.id)
    .order('position');

  return { phraseSet, phrases: phrases ?? [] };
}

/**
 * Liste de TOUTES les dates disponibles (lots déjà générés) pour une langue
 * + niveau, les plus récentes en premier. Utilisé par l'onglet "Révision" —
 * volontairement sans limite : l'historique complet doit être accessible.
 */
export async function getAvailableDates(
  languageCode: string,
  levelCode: string
): Promise<PhraseSetInfo[]> {
  const { data } = await supabaseAdmin
    .from('phrase_sets')
    .select('id, set_date, theme')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('set_date', { ascending: false });

  return data ?? [];
}

/**
 * Toutes les phrases d'un lot (identifié par son id), pour affichage en
 * grille complète dans l'onglet "Révision".
 */
export async function getPhrasesBySetId(phraseSetId: string): Promise<Phrase[]> {
  const { data } = await supabaseAdmin
    .from('phrases')
    .select('id, target_text, translation_fr, notes, audio_url, position')
    .eq('phrase_set_id', phraseSetId)
    .order('position');

  return data ?? [];
}
