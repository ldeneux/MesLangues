'use server';

// Mots sans image pour une langue (tous niveaux), triés A1 → B2 puis par utilité décroissante.
// Une entrée par mot français (les images sont nommées d'après la traduction française : un même fichier sert à toutes les langues).

import { supabaseAdmin } from './supabaseAdmin';
import { imageBareKey, imageFileName } from './imageName';
import { resolveImage } from './imageIndex';

export type BoardWord = {
  fr: string; // traduction française telle qu'écrite (sert de légende sur la planche)
  name: string; // nom de fichier à créer, sans .webp
  level: string;
  theme: string;
  usage: number; // utilité du mot (1-100, 50 si absente)
};

export type MissingImageSummary = {
  words: BoardWord[]; // tous les mots sans image, déjà triés
  byLevel: Record<string, number>;
};

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2'];
const levelRank = (l: string) => {
  const i = LEVEL_ORDER.indexOf(l);
  return i < 0 ? LEVEL_ORDER.length : i;
};

type Row = { translation_fr: string; image: string | null; level_code: string; theme_code: string; usage_score?: number | null };

async function fetchRows(languageCode: string, withUsage: boolean): Promise<Row[]> {
  const cols = `translation_fr, image, level_code, theme_code${withUsage ? ', usage_score' : ''}`;
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('vocabulary_words')
      .select(cols)
      .eq('language_code', languageCode)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function getMissingImageWords(languageCode: string): Promise<MissingImageSummary> {
  let rows: Row[];
  try {
    rows = await fetchRows(languageCode, true);
  } catch (e: any) {
    // colonne usage_score absente (migration 020 non lancée) : on s'en passe
    if (String(e?.message ?? '').includes('usage_score')) rows = await fetchRows(languageCode, false);
    else throw e;
  }

  const found = new Set<string>();
  const missing = new Map<string, BoardWord>();
  for (const r of rows) {
    const key = imageBareKey(r.translation_fr);
    if (!key) continue;
    if (resolveImage(r.image, r.translation_fr) !== null) {
      found.add(key);
      continue;
    }
    const cand: BoardWord = {
      fr: r.translation_fr.trim(),
      name: imageFileName(r.translation_fr),
      level: r.level_code,
      theme: r.theme_code,
      usage: r.usage_score ?? 50,
    };
    const prev = missing.get(key);
    // un mot présent à plusieurs niveaux : on garde le niveau le plus bas
    if (!prev || levelRank(cand.level) < levelRank(prev.level) || (levelRank(cand.level) === levelRank(prev.level) && cand.usage > prev.usage)) {
      missing.set(key, cand);
    }
  }

  const words = Array.from(missing.entries())
    .filter(([k]) => !found.has(k))
    .map(([, w]) => w)
    .sort(
      (a, b) =>
        levelRank(a.level) - levelRank(b.level) || b.usage - a.usage || a.fr.localeCompare(b.fr, 'fr')
    );

  const byLevel: Record<string, number> = {};
  for (const w of words) byLevel[w.level] = (byLevel[w.level] ?? 0) + 1;
  return { words, byLevel };
}
