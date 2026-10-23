'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { resolveImage } from './imageIndex';
import { imageBareKey } from './imageName';
import { stripRuby } from './japanese';

// Les 5 langues, dans l'ordre d'affichage de l'application.
const LANG_CODES = ['it', 'es', 'en', 'ja', 'de'] as const;
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2'];

export type DictionaryEntry = {
  text: string;
  audio_url: string | null;
  ruby?: string; // japonais : furigana {kanji|lecture}
  romaji?: string;
  source: 'base' | 'ia'; // « base » : mot déjà dans le vocabulaire ; « ia » : traduit à la demande (rien n'est enregistré)
};

export type DictionaryResult = {
  french: string; // forme française retenue (celle de la base si le mot y est)
  image: string | null; // nom du fichier image (sans extension) s'il en existe une
  entries: Record<string, DictionaryEntry | null>;
};

// Échappe les jokers du ILIKE (% _ \) pour chercher le texte tel quel.
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Propositions d'auto-complétion : mots français du vocabulaire (toutes langues, tous niveaux) qui COMMENCENT par la saisie,
 * puis ceux dont le mot suit un article (« fromage » → « du fromage »). Dédoublonnés, les plus courts d'abord.
 */
export async function suggestFrenchWords(prefix: string): Promise<string[]> {
  const q = (prefix ?? '').trim();
  if (q.length === 0) return [];
  const esc = likeEscape(q);

  const [starts, afterArticle] = await Promise.all([
    supabaseAdmin.from('vocabulary_words').select('translation_fr').ilike('translation_fr', `${esc}%`).limit(60),
    supabaseAdmin.from('vocabulary_words').select('translation_fr').ilike('translation_fr', `% ${esc}%`).limit(60),
  ]);

  const seen = new Set<string>();
  const out: { text: string; starts: boolean }[] = [];
  const add = (rows: { translation_fr: string }[] | null, isStart: boolean) => {
    for (const r of rows ?? []) {
      const t = (r.translation_fr ?? '').trim();
      const k = t.toLowerCase();
      if (!t || seen.has(k)) continue;
      seen.add(k);
      out.push({ text: t, starts: isStart });
    }
  };
  add(starts.data, true);
  add(afterArticle.data, false);

  return out
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.text.length - b.text.length || a.text.localeCompare(b.text, 'fr'))
    .slice(0, 8)
    .map((o) => o.text);
}

type BaseRow = {
  language_code: string;
  level_code: string;
  target_text: string;
  translation_fr: string;
  audio_url: string | null;
  image?: string | null;
};

/**
 * Cherche un mot français dans les 5 langues : d'abord dans le vocabulaire existant (avec audio), puis les langues
 * manquantes sont traduites par Gemini (un seul appel). Rien n'est écrit en base. Renvoie aussi l'image du mot si elle existe.
 */
export async function lookupFrenchWord(input: string): Promise<DictionaryResult> {
  const q = (input ?? '').trim().replace(/\s+/g, ' ');
  if (!q) throw new Error('Saisis un mot.');
  const esc = likeEscape(q);

  // 1) Correspondance exacte (casse ignorée), puis à l'article près (« fromage » trouve « du fromage »).
  const SELECT = 'language_code, level_code, target_text, translation_fr, audio_url';
  let rows: BaseRow[] = [];
  const exact = await supabaseAdmin.from('vocabulary_words').select(SELECT).ilike('translation_fr', esc).limit(80);
  if (exact.error) throw new Error(exact.error.message);
  rows = (exact.data ?? []) as BaseRow[];

  const bareQ = imageBareKey(q);
  if (rows.length === 0 || new Set(rows.map((r) => r.language_code)).size < LANG_CODES.length) {
    const loose = await supabaseAdmin
      .from('vocabulary_words')
      .select(SELECT)
      .ilike('translation_fr', `%${likeEscape(q)}`)
      .limit(120);
    const seenKey = new Set(rows.map((r) => `${r.language_code}|${r.target_text}`));
    for (const r of (loose.data ?? []) as BaseRow[]) {
      if (imageBareKey(r.translation_fr) !== bareQ) continue; // même mot à l'article près, pas un mot plus long qui se termine pareil
      const k = `${r.language_code}|${r.target_text}`;
      if (!seenKey.has(k)) {
        seenKey.add(k);
        rows.push(r);
      }
    }
  }

  // Forme française canonique : celle de la base (la plus fréquente, article compris) si elle existe.
  let french = q;
  if (rows.length > 0) {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.translation_fr, (counts.get(r.translation_fr) ?? 0) + 1);
    // la saisie exacte (casse ignorée) prime, sinon la forme la plus répandue
    const sameAsInput = rows.find((r) => r.translation_fr.toLowerCase() === q.toLowerCase());
    french = sameAsInput?.translation_fr ?? Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Une entrée par langue : on garde la ligne de la forme retenue, avec audio de préférence, niveau le plus bas.
  const entries: Record<string, DictionaryEntry | null> = {};
  for (const code of LANG_CODES) {
    const cands = rows
      .filter((r) => r.language_code === code)
      .sort((a, b) => {
        const fa = a.translation_fr === french ? 0 : 1;
        const fb = b.translation_fr === french ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const aa = a.audio_url ? 0 : 1;
        const ab = b.audio_url ? 0 : 1;
        if (aa !== ab) return aa - ab;
        return LEVEL_ORDER.indexOf(a.level_code) - LEVEL_ORDER.indexOf(b.level_code);
      });
    entries[code] = cands[0]
      ? { text: cands[0].target_text, audio_url: cands[0].audio_url || null, source: 'base' }
      : null;
  }

  // Japonais de la base : lecture (furigana + rōmaji) déjà en cache
  const jaBase = entries.ja;
  if (jaBase) {
    const { data } = await supabaseAdmin.from('ja_readings').select('text, ruby, romaji').eq('text', jaBase.text).maybeSingle();
    if (data) {
      jaBase.ruby = data.ruby;
      jaBase.romaji = data.romaji;
    }
  }

  // 2) Langues manquantes : traduction par Gemini (un seul appel)
  const missing = LANG_CODES.filter((c) => !entries[c]);
  if (missing.length > 0) {
    try {
      const translated = await translateMissing(french, missing);
      for (const code of missing) if (translated[code]) entries[code] = translated[code]!;
    } catch (e: any) {
      // Les traductions de la base restent affichées ; seules les manquantes sont vides.
      console.error('Traduction Gemini (recherche) :', e?.message ?? e);
      throw new Error(
        rows.length > 0
          ? `Traduction impossible pour ${missing.map((c) => LANGUAGE_NAMES[c]).join(', ')} : ${e?.message ?? 'erreur Gemini'}`
          : e?.message ?? 'Traduction impossible.'
      );
    }
  }

  // 3) Image : la saisie, la forme canonique, puis les autres formes françaises trouvées
  let image: string | null = resolveImage(null, french) ?? resolveImage(null, q);
  if (!image) {
    for (const r of rows) {
      image = resolveImage(null, r.translation_fr);
      if (image) break;
    }
  }

  return { french, image, entries };
}

async function translateMissing(french: string, codes: string[]): Promise<Record<string, DictionaryEntry | null>> {
  const langList = codes.map((c) => `"${c}" = ${LANGUAGE_NAMES[c]}`).join(', ');
  const needsJa = codes.includes('ja');
  const system = `Tu es un dictionnaire français → langues étrangères pour des apprenants francophones.
Traduis le mot ou l'expression français donné dans chacune des langues demandées (${langList}).
Règles : donne la traduction la plus courante et naturelle, au singulier ; pour un nom, inclus TOUJOURS l'article qui va avec
(ex. « una sedia », « ein Stuhl », « a chair »). Pas de phrase, pas d'explication.
${needsJa ? 'Japonais : écriture moderne (kanji + kana), verbes à la forme du dictionnaire, pas d\'article ; ajoute "ruby" (chaque groupe de kanji écrit {kanji|lecture en hiragana}, ex. {食|た}べる, sans changer aucun caractère) et "romaji" (Hepburn avec macrons).' : ''}
Tu réponds STRICTEMENT en JSON valide, sans texte autour ni balises markdown : un objet dont les clés sont exactement les codes demandés (${codes.join(', ')}),
chaque valeur étant ${needsJa ? '{ "text": "...", "ruby": "... (japonais seulement)", "romaji": "... (japonais seulement)" }' : '{ "text": "..." }'}.`;
  const user = `Mot français : « ${french} »`;

  const raw = await callGemini(system, user, { temperature: 0.2, maxOutputTokens: 1024, thinkingLevel: 'minimal' });
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable).');
  }

  const out: Record<string, DictionaryEntry | null> = {};
  for (const code of codes) {
    const v = parsed?.[code];
    const text = typeof v === 'string' ? v.trim() : typeof v?.text === 'string' ? v.text.trim() : '';
    if (!text) {
      out[code] = null;
      continue;
    }
    const entry: DictionaryEntry = { text, audio_url: null, source: 'ia' };
    if (code === 'ja' && typeof v?.ruby === 'string' && typeof v?.romaji === 'string' && stripRuby(v.ruby) === text) {
      entry.ruby = v.ruby;
      entry.romaji = v.romaji.trim();
    }
    out[code] = entry;
  }
  return out;
}
