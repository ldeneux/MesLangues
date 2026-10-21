'use server';

// Coin lecture : versions déjà enregistrées + génération à la demande, une langue à la fois.
//  - 1re langue d'un récit : version dans la langue + traduction française (un appel Gemini).
//  - langue suivante : version écrite à partir de la traduction française déjà enregistrée (appel plus léger).
import { supabaseAdmin } from './supabaseAdmin';
import { callGeminiWithUsage } from './gemini';
import { geminiCostEur } from './pricing';
import { findReadingEntry } from './readingCatalog';
import { buildMasterPrompt, buildTranslationPrompt, parseMaster, parseTranslation, type ReadingLang, type ReadingView, type StoredVersion } from './readingLogic';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const TABLE_MISSING = 'Table reading_texts absente : exécute la migration 032 dans Supabase.';
const LANGS = ['it', 'es', 'en', 'ja', 'de'];

function explain(message: string): string {
  return message.includes('reading_texts') ? TABLE_MISSING : message;
}

type Row = { story_id: string; lang: string; title: string; paragraphs: string[] };

/** Versions déjà enregistrées : { identifiant du récit: [langues] } (aucun coût). */
export async function getReadingStatus(): Promise<Result<{ langs: Record<string, string[]> }>> {
  try {
    const { data, error } = await supabaseAdmin.from('reading_texts').select('story_id, lang').limit(5000);
    if (error) return { ok: false, error: explain(error.message) };
    const langs: Record<string, string[]> = {};
    for (const r of (data ?? []) as { story_id: string; lang: string }[]) (langs[r.story_id] ??= []).push(r.lang);
    return { ok: true, langs };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function fetchRows(id: string, langs: string[]): Promise<{ rows: Row[]; error?: string }> {
  const { data, error } = await supabaseAdmin.from('reading_texts').select('story_id, lang, title, paragraphs').eq('story_id', id).in('lang', langs);
  if (error) return { rows: [], error: explain(error.message) };
  return { rows: (data ?? []) as Row[] };
}

function toVersion(r: Row): StoredVersion {
  return { title: r.title, paragraphs: r.paragraphs };
}

function toView(rows: Row[], lang: ReadingLang): ReadingView | null {
  const v = rows.find((r) => r.lang === lang);
  const fr = rows.find((r) => r.lang === 'fr');
  return v && fr ? { lang, version: toVersion(v), fr: toVersion(fr) } : null;
}

/** Ouvre une version déjà enregistrée (aucun coût). */
export async function getReadingStory(id: string, lang: ReadingLang): Promise<Result<{ view: ReadingView }>> {
  try {
    if (!LANGS.includes(lang)) return { ok: false, error: 'Langue inconnue.' };
    const { rows, error } = await fetchRows(id, [lang, 'fr']);
    if (error) return { ok: false, error };
    const view = toView(rows, lang);
    if (!view) return { ok: false, error: "Ce récit n'a pas encore été généré dans cette langue." };
    return { ok: true, view };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Génère la version dans la langue demandée si elle n'existe pas (sinon la renvoie sans rien facturer).
 * Rien n'est enregistré si la réponse ne passe pas la vérification.
 */
export async function generateReadingStory(id: string, lang: ReadingLang): Promise<Result<{ view: ReadingView; costEur: number }>> {
  try {
    const entry = findReadingEntry(id);
    if (!entry) return { ok: false, error: 'Récit inconnu.' };
    if (!LANGS.includes(lang)) return { ok: false, error: 'Langue inconnue.' };

    const existing = await fetchRows(id, [lang, 'fr']);
    if (existing.error) return { ok: false, error: existing.error };
    const already = toView(existing.rows, lang);
    if (already) return { ok: true, view: already, costEur: 0 };

    const frRow = existing.rows.find((r) => r.lang === 'fr');
    const options = { temperature: 0.7, maxOutputTokens: 16384, thinkingLevel: 'minimal' as const };
    let version: StoredVersion;
    let fr: StoredVersion;
    let costEur: number;
    let toStore: { story_id: string; lang: string; title: string; paragraphs: string[]; cost_eur: number }[];

    if (frRow) {
      // La traduction française existe déjà : la nouvelle version s'aligne dessus.
      fr = toVersion(frRow);
      const { system, user } = buildTranslationPrompt(entry, lang, fr);
      const { text, usage } = await callGeminiWithUsage(system, user, options);
      costEur = geminiCostEur(usage.inputTokens, usage.outputTokens);
      version = parseTranslation(text, lang, entry, fr.paragraphs.length);
      toStore = [{ story_id: id, lang, title: version.title, paragraphs: version.paragraphs, cost_eur: costEur }];
    } else {
      const { system, user } = buildMasterPrompt(entry, lang);
      const { text, usage } = await callGeminiWithUsage(system, user, options);
      costEur = geminiCostEur(usage.inputTokens, usage.outputTokens);
      const parsed = parseMaster(text, lang, entry);
      version = parsed.version;
      fr = parsed.fr;
      toStore = [
        { story_id: id, lang, title: version.title, paragraphs: version.paragraphs, cost_eur: costEur },
        { story_id: id, lang: 'fr', title: fr.title, paragraphs: fr.paragraphs, cost_eur: 0 },
      ];
    }

    const { error } = await supabaseAdmin.from('reading_texts').upsert(toStore, { onConflict: 'story_id,lang', ignoreDuplicates: true });
    if (error) return { ok: false, error: explain(error.message) };
    return { ok: true, view: { lang, version, fr }, costEur };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
