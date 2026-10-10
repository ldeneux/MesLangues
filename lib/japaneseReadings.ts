'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini } from './gemini';
import { stripRuby } from './japanese';

export type JaReading = { ruby: string; romaji: string };

/**
 * Lectures (furigana + rōmaji) de textes japonais, à la demande.
 * Les lectures déjà connues viennent de la table `ja_readings` (gratuit) ;
 * seules les manquantes sont demandées à Gemini (≈ 0,0006 $ par phrase),
 * puis mises en cache pour toujours.
 */
export async function getJapaneseReadings(texts: string[]): Promise<Record<string, JaReading>> {
  const unique = Array.from(new Set(texts.map((t) => (t ?? '').trim()).filter(Boolean))).slice(0, 8);
  const result: Record<string, JaReading> = {};
  if (unique.length === 0) return result;

  const { data, error } = await supabaseAdmin.from('ja_readings').select('text, ruby, romaji').in('text', unique);
  if (error) {
    throw new Error(
      error.message.includes('ja_readings')
        ? 'La table "ja_readings" n\'existe pas encore — exécute la migration 014 dans Supabase.'
        : error.message
    );
  }
  for (const r of data ?? []) result[r.text] = { ruby: r.ruby, romaji: r.romaji };

  const missing = unique.filter((t) => !result[t]);
  if (missing.length === 0) return result;

  const system = `Tu es un professeur de japonais pour francophones. Pour chaque texte japonais
numéroté, tu donnes :
- "ruby" : le MÊME texte, où chaque groupe de kanji est écrit {kanji|lecture en hiragana}.
  Les kana, la ponctuation et les okurigana restent HORS des accolades.
  Exemple : 食べます → {食|た}べます ; 学校 → {学校|がっこう}.
  Ne modifie, n'ajoute et ne supprime AUCUN caractère du texte d'origine.
- "romaji" : la phrase en rōmaji Hepburn (voyelles longues avec macron : ō ū), mots séparés
  par des espaces, particules lues comme elles se prononcent (は → wa, を → o, へ → e).
Tu réponds STRICTEMENT en JSON valide : un tableau d'objets {"ruby": "...", "romaji": "..."} dans le même
ordre que les textes, sans texte avant/après, sans balises markdown.`;
  const user = missing.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const raw = await callGemini(system, user, { temperature: 0.1 });
  let parsed: { ruby?: string; romaji?: string }[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour les lectures japonaises.');
  }

  const toCache: { text: string; ruby: string; romaji: string }[] = [];
  missing.forEach((text, i) => {
    const p = parsed?.[i];
    // Anti-hallucination : le ruby, une fois les accolades retirées, doit redonner exactement le texte d'origine.
    const rubyOk = typeof p?.ruby === 'string' && stripRuby(p.ruby) === text;
    const romaji = typeof p?.romaji === 'string' ? p.romaji : '';
    if (rubyOk && romaji) {
      result[text] = { ruby: p!.ruby as string, romaji };
      toCache.push({ text, ruby: p!.ruby as string, romaji });
    } else {
      result[text] = { ruby: text, romaji }; // affichage sans furigana, non mis en cache
    }
  });

  if (toCache.length > 0) {
    const { error: upErr } = await supabaseAdmin.from('ja_readings').upsert(toCache, { onConflict: 'text' });
    if (upErr) throw new Error(upErr.message);
  }
  return result;
}
