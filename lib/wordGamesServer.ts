'use server';

// Accès serveur des jeux de mots : lectures japonaises déjà en cache (mahjong) et définitions Wikipédia (mots croisés).
import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { readingFromRuby, toHiragana } from './japanese';
import { normLetters, jeuAnswer } from './wordGamesLogic';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const CHUNK = 40; // jamais .in() sur des centaines d'identifiants (résultat vide silencieux)

/**
 * Lectures en hiragana des textes japonais DÉJÀ présentes dans le cache ja_readings (table de lectures existante).
 * Ne demande rien à Gemini : aucun coût. Les textes sans lecture connue sont simplement absents du résultat.
 */
export async function getCachedJaReadings(texts: string[]): Promise<Result<{ readings: Record<string, string> }>> {
  try {
    const unique = Array.from(new Set(texts.filter(Boolean)));
    const readings: Record<string, string> = {};
    for (let i = 0; i < unique.length; i += CHUNK) {
      const { data, error } = await supabaseAdmin.from('ja_readings').select('text, ruby').in('text', unique.slice(i, i + CHUNK));
      if (error) return { ok: false, error: error.message.includes('ja_readings') ? 'Table ja_readings absente : exécute la migration 014 dans Supabase.' : error.message };
      for (const r of data ?? []) readings[r.text] = toHiragana(readingFromRuby(r.ruby));
    }
    return { ok: true, readings };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Définitions déjà en cache pour ces mots (vide '' = « rien de trouvé », donc non renvoyé). */
export async function getWordDefinitions(wordIds: string[]): Promise<Result<{ defs: Record<string, string>; tried: string[] }>> {
  try {
    const defs: Record<string, string> = {};
    const tried: string[] = [];
    for (let i = 0; i < wordIds.length; i += CHUNK) {
      const { data, error } = await supabaseAdmin.from('word_definitions').select('word_id, definition').in('word_id', wordIds.slice(i, i + CHUNK));
      if (error) {
        return { ok: false, error: error.message.includes('word_definitions') ? 'Table word_definitions absente : exécute la migration 028 dans Supabase.' : error.message };
      }
      for (const r of data ?? []) {
        tried.push(r.word_id);
        if (r.definition) defs[r.word_id] = r.definition;
      }
    }
    return { ok: true, defs, tried };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Premières phrases d'un résumé Wikipédia, sans parenthèses (prononciations, dates), 220 caractères maximum. */
function shortExtract(extract: string): string {
  const clean = extract.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = sentences[0].trim();
  if (out.length < 60 && sentences[1]) out += ' ' + sentences[1].trim();
  return out.length > 220 ? out.slice(0, 217).replace(/\s+\S*$/, '') + '…' : out;
}

async function wikiExtract(titleFr: string): Promise<{ text: string; url: string } | null> {
  const title = titleFr.replace(/^(?:un|une|le|la|les|l['’]|du|de la|des|d['’])\s*/i, '').replace(/^(?:l['’])/i, '').trim();
  if (!title) return null;
  const url =
    'https://fr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts%7Cpageprops&exintro=1&explaintext=1&exsentences=3&redirects=1&ppprop=disambiguation&titles=' +
    encodeURIComponent(title);
  const res = await fetch(url, { headers: { 'User-Agent': 'MesLangues/1.0 (apprentissage des langues, usage familial)' } });
  if (!res.ok) return null;
  const json = await res.json();
  const page = Object.values(json?.query?.pages ?? {})[0] as { title?: string; extract?: string; missing?: unknown; pageprops?: { disambiguation?: unknown } } | undefined;
  if (!page || page.missing !== undefined || page.pageprops?.disambiguation !== undefined || !page.extract) return null;
  if (/peut désigner|peut faire référence|may refer to/i.test(page.extract)) return null;
  const text = shortExtract(page.extract);
  if (text.length < 25) return null;
  return { text, url: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent((page.title ?? title).replace(/ /g, '_')) };
}

/**
 * Prépare les définitions de 10 mots au plus (appel résumable : le client boucle tant qu'il en reste ; durée < 60 s).
 * Wikipédia (gratuit) fournit le texte français, Gemini le traduit dans la langue apprise (payant, une seule fois : cache).
 * Une définition qui contient le mot à deviner est refusée (sinon l'indice donnerait la réponse).
 */
export async function generateWordDefinitions(
  wordIds: string[],
  languageCode: string
): Promise<Result<{ done: number; withDefinition: number }>> {
  try {
    const ids = wordIds.slice(0, 10);
    if (ids.length === 0) return { ok: true, done: 0, withDefinition: 0 };
    const { data: words, error } = await supabaseAdmin.from('vocabulary_words').select('id, target_text, translation_fr').in('id', ids);
    if (error) return { ok: false, error: error.message };

    const wiki = await Promise.all((words ?? []).map((w) => wikiExtract(w.translation_fr).catch(() => null)));
    const withWiki = (words ?? []).map((w, i) => ({ w, wk: wiki[i] })).filter((x) => x.wk);

    const translated: Record<string, string> = {};
    if (withWiki.length > 0) {
      const lang = LANGUAGE_NAMES[languageCode] ?? languageCode;
      const system = `Tu aides un francophone qui apprend le ${lang} (niveau débutant). Pour chaque définition française numérotée, écris une définition COURTE et SIMPLE (20 mots maximum, vocabulaire de base) en ${lang}.
Règle absolue : la définition ne doit JAMAIS contenir le mot à deviner (indiqué entre crochets) ni sa traduction française ; reformule autrement.
Tu réponds STRICTEMENT en JSON valide : un tableau de chaînes dans le même ordre, sans texte avant/après, sans balises markdown. Si une définition est impossible sans citer le mot, renvoie une chaîne vide.`;
      const user = withWiki.map((x, i) => `${i + 1}. [${x.w.target_text} / ${x.w.translation_fr}] ${x.wk!.text}`).join('\n');
      const raw = await callGemini(system, user, { temperature: 0.2 });
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, error: 'Réponse Gemini invalide (JSON non parsable) pour les définitions.' };
      }
      withWiki.forEach((x, i) => {
        const d = Array.isArray(parsed) ? (parsed as unknown[])[i] : '';
        if (typeof d !== 'string' || d.trim().length < 8) return;
        const a = jeuAnswer(x.w.target_text, languageCode)?.answer ?? normLetters(x.w.target_text);
        if (languageCode !== 'ja' && a && normLetters(d).includes(a)) return; // la définition donnerait la réponse
        translated[x.w.id] = d.trim();
      });
    }

    const rows = (words ?? []).map((w, i) => ({ word_id: w.id, definition: translated[w.id] ?? '', source_url: wiki[i]?.url ?? null }));
    const { error: upErr } = await supabaseAdmin.from('word_definitions').upsert(rows, { onConflict: 'word_id' });
    if (upErr) {
      return { ok: false, error: upErr.message.includes('word_definitions') ? 'Table word_definitions absente : exécute la migration 028 dans Supabase.' : upErr.message };
    }
    return { ok: true, done: rows.length, withDefinition: rows.filter((r) => r.definition).length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
