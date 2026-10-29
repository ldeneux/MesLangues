'use server';

// Traduction d'un mot ou d'une courte expression sélectionnés dans le Coin lecture.
// 1) Les mots de ta base (vocabulaire et infinitifs de verbes) : instantané, gratuit.
// 2) Sinon Gemini, avec le paragraphe et sa traduction française pour donner le sens EN CONTEXTE (coût d'environ 0,0003 €).
import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { jeuAnswer } from './wordGamesLogic';

export type SelectionTranslation =
  | { ok: true; fr: string; lemma?: string; info?: string; source: 'base' | 'ia'; level?: string }
  | { ok: false; error: string };

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2'];
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function translateReadingSelection(
  languageCode: string,
  selected: string,
  paragraph: string,
  paragraphFr: string
): Promise<SelectionTranslation> {
  try {
    const text = (selected ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!text) return { ok: false, error: 'Sélection vide.' };

    // --- 1) Base : un seul mot (lettres, apostrophe, trait d'union) ---
    if (/^[\p{L}][\p{L}'’-]*$/u.test(text)) {
      const e = esc(text);
      const wanted = languageCode === 'ja' ? text : jeuAnswer(text, languageCode)?.answer;
      const sel = 'target_text, translation_fr, level_code';
      const q = (pattern: string) =>
        supabaseAdmin.from('vocabulary_words').select(sel).eq('language_code', languageCode).ilike('target_text', pattern).limit(20);
      const [a, b, c, d, verb] = await Promise.all([
        q(e), // « giornale »
        q(`% ${e}`), // « il giornale »
        q(`%'${e}`), // « l'amico »
        q(`%’${e}`),
        supabaseAdmin.from('conjugation_verbs').select('translation_fr, level_code').eq('language_code', languageCode).ilike('infinitive', e).limit(3),
      ]);
      const rows = [...(a.data ?? []), ...(b.data ?? []), ...(c.data ?? []), ...(d.data ?? [])].filter((r) => {
        if (languageCode === 'ja') return r.target_text === text;
        return jeuAnswer(r.target_text, languageCode)?.answer === wanted; // même mot, article exclu (pas une expression qui se termine pareil)
      });
      const hits = [...rows.map((r) => ({ fr: r.translation_fr as string, level: r.level_code as string })), ...(verb.data ?? []).map((v) => ({ fr: v.translation_fr as string, level: v.level_code as string }))];
      if (hits.length > 0) {
        const unique = Array.from(new Set(hits.map((h) => h.fr))).slice(0, 3);
        const level = hits.map((h) => h.level).sort((x, y) => LEVEL_ORDER.indexOf(x) - LEVEL_ORDER.indexOf(y))[0];
        return { ok: true, fr: unique.join(' / '), source: 'base', level };
      }
    }

    // --- 2) Gemini, en contexte ---
    const system = `Tu aides un francophone qui lit un texte en ${LANGUAGE_NAMES[languageCode] ?? languageCode}. On te donne un paragraphe, sa traduction française et un mot ou une courte expression sélectionnés dans ce paragraphe.
Donne la traduction française de la sélection EN CONTEXTE (le sens exact dans cette phrase), courte (1 à 4 mots).
Si la sélection est un verbe conjugué, un mot décliné, un pluriel ou une forme contractée, donne aussi "lemma" (forme du dictionnaire avec sa traduction, ex. « parlare = parler ») et "info" (nature de la forme, ex. « passé simple, 3e pers. du singulier »). Sinon laisse "lemma" et "info" vides.
Tu réponds STRICTEMENT en JSON valide, sans texte autour ni balises markdown : { "fr": "...", "lemma": "...", "info": "..." }.`;
    const user = `Paragraphe : ${(paragraph ?? '').slice(0, 1500)}\nTraduction française du paragraphe : ${(paragraphFr ?? '').slice(0, 1500)}\nSélection : « ${text} »`;
    const raw = await callGemini(system, user, { temperature: 0.1, maxOutputTokens: 300, thinkingLevel: 'minimal' });
    let p: any;
    try {
      p = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Réponse illisible, réessaie.' };
    }
    const fr = typeof p?.fr === 'string' ? p.fr.trim() : '';
    if (!fr) return { ok: false, error: 'Pas de traduction trouvée.' };
    return {
      ok: true,
      fr,
      lemma: typeof p?.lemma === 'string' && p.lemma.trim() ? p.lemma.trim() : undefined,
      info: typeof p?.info === 'string' && p.info.trim() ? p.info.trim() : undefined,
      source: 'ia',
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Traduction impossible.' };
  }
}
