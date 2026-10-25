'use server';

// Dictionnaire des jeux « Le mot le plus long » et « Scrabble » : TOUS les mots de la langue présents dans les packs de
// vocabulaire prêts et actifs (tous niveaux confondus), un seul mot par orthographe. Aucun appel à l'IA, aucun coût.
import { supabaseAdmin } from './supabaseAdmin';
import { fetchAllRows } from './paging';
import { jeuAnswer } from './wordGamesLogic';
import { readingFromRuby, toHiragana } from './japanese';
import type { LetterEntry } from './letterGamesLogic';

type Result = { ok: true; entries: LetterEntry[]; total: number } | { ok: false; error: string };

const MAX_LEN = 15; // taille du plateau
const CHUNK = 40; // jamais .in() sur des centaines d'identifiants
const cache = new Map<string, { at: number; entries: LetterEntry[]; total: number }>();
const TTL = 10 * 60 * 1000;

export async function getLetterDictionary(languageCode: string): Promise<Result> {
  try {
    const hit = cache.get(languageCode);
    if (hit && Date.now() - hit.at < TTL) return { ok: true, entries: hit.entries, total: hit.total };

    const { data: packs, error: packErr } = await supabaseAdmin
      .from('vocabulary_packs')
      .select('id')
      .eq('language_code', languageCode)
      .eq('status', 'ready')
      .eq('active', true);
    if (packErr) throw new Error(packErr.message);
    const packIds = (packs ?? []).map((p) => p.id);
    if (packIds.length === 0) return { ok: true, entries: [], total: 0 };

    const words = await fetchAllRows<{ id: string; target_text: string; translation_fr: string }>((from, to) =>
      supabaseAdmin
        .from('vocabulary_words')
        .select('id, target_text, translation_fr')
        .eq('language_code', languageCode)
        .in('pack_id', packIds)
        .order('id')
        .range(from, to)
    );

    const seen = new Set<string>();
    const entries: LetterEntry[] = [];

    if (languageCode === 'ja') {
      // Japonais : les tuiles sont les kana de la lecture (lectures déjà en cache, gratuites)
      const texts = Array.from(new Set(words.map((w) => w.target_text).filter(Boolean)));
      const readings = new Map<string, string>();
      const chunks: string[][] = [];
      for (let i = 0; i < texts.length; i += CHUNK) chunks.push(texts.slice(i, i + CHUNK));
      for (let i = 0; i < chunks.length; i += 8) {
        await Promise.all(
          chunks.slice(i, i + 8).map(async (chunk) => {
            const { data, error } = await supabaseAdmin.from('ja_readings').select('text, ruby').in('text', chunk);
            if (error) throw new Error(error.message);
            for (const r of data ?? []) readings.set(r.text, toHiragana(readingFromRuby(r.ruby)));
          })
        );
      }
      for (const w of words) {
        const kana = readings.get(w.target_text);
        if (!kana || !/^[\u3041-\u3096]+$/.test(kana) || Array.from(kana).length < 2 || Array.from(kana).length > MAX_LEN || seen.has(kana)) continue;
        seen.add(kana);
        entries.push({ id: w.id, answer: kana, display: w.target_text, fr: w.translation_fr });
      }
    } else {
      for (const w of words) {
        const a = jeuAnswer(w.target_text, languageCode); // article retiré, accents supprimés, un seul mot
        if (!a || a.answer.length > MAX_LEN || seen.has(a.answer)) continue;
        seen.add(a.answer);
        entries.push({ id: w.id, answer: a.answer, display: a.display, fr: w.translation_fr });
      }
    }

    cache.set(languageCode, { at: Date.now(), entries, total: words.length });
    return { ok: true, entries, total: words.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
