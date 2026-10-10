'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini } from './gemini';
import { kanjiForLevel } from './kanjiLists';
import { KANJI_CATEGORIES } from './constants';

export type KanjiExample = { word: string; reading: string; meaning_fr: string };

export type KanjiItem = {
  id: string;
  char: string;
  level_code: string;
  position: number;
  meaning_fr: string;
  onyomi: string[];
  kunyomi: string[];
  examples: KanjiExample[];
  category?: string | null; // thème (voir KANJI_CATEGORIES) ; null tant que non classé
};

export type KanjiProgressMap = Record<string, { success: number; fail: number }>;

const STEP_SIZE = 15;
const HIRA = /^[\u3041-\u3096ー]+$/;
const KATA = /^[\u30A1-\u30FAー]+$/;
const KUN = /^[\u3041-\u3096ー.\-]+$/;

function tableMissing(msg: string) {
  return msg.includes('kanji') && (msg.includes('relation') || msg.includes('schema cache') || msg.includes('does not exist'));
}

export async function getKanjiList(levelCode: string): Promise<KanjiItem[]> {
  const baseColumns = 'id, char, level_code, position, meaning_fr, onyomi, kunyomi, examples';
  let { data, error } = await supabaseAdmin.from('kanji').select(`${baseColumns}, category`).eq('level_code', levelCode).order('position');
  if (error && error.message.includes('category')) {
    // Migration 018 pas encore exécutée : on charge quand même les kanji, sans le filtre par thème
    ({ data, error } = (await supabaseAdmin.from('kanji').select(baseColumns).eq('level_code', levelCode).order('position')) as any);
  }
  if (error) {
    throw new Error(tableMissing(error.message) ? 'La table "kanji" n\'existe pas encore — exécute la migration 015 dans Supabase.' : error.message);
  }
  return (data ?? []).map((k: any) => ({
    ...k,
    onyomi: Array.isArray(k.onyomi) ? k.onyomi : [],
    kunyomi: Array.isArray(k.kunyomi) ? k.kunyomi : [],
    examples: Array.isArray(k.examples) ? k.examples : [],
  }));
}

export async function getKanjiCount(levelCode: string): Promise<{ have: number; target: number }> {
  const { count, error } = await supabaseAdmin
    .from('kanji')
    .select('id', { count: 'exact', head: true })
    .eq('level_code', levelCode);
  if (error) {
    throw new Error(tableMissing(error.message) ? 'La table "kanji" n\'existe pas encore — exécute la migration 015 dans Supabase.' : error.message);
  }
  return { have: count ?? 0, target: kanjiForLevel(levelCode).length };
}

export type KanjiStepResult = { done: boolean; generatedThisStep: number; generatedTotal: number; targetTotal: number };

/**
 * Génère les fiches des prochains kanji manquants du niveau (15 par appel, < 60 s).
 * Le client rappelle en boucle jusqu'à done: true ; l'état réel est recompté en base à chaque appel.
 */
export async function runKanjiStep(levelCode: string): Promise<KanjiStepResult> {
  const list = kanjiForLevel(levelCode);
  const target = list.length;

  const { data: existing, error: exErr } = await supabaseAdmin.from('kanji').select('char').eq('level_code', levelCode);
  if (exErr) {
    throw new Error(tableMissing(exErr.message) ? 'La table "kanji" n\'existe pas encore — exécute la migration 015 dans Supabase.' : exErr.message);
  }
  const have = new Set((existing ?? []).map((r: any) => r.char));
  const missing = list.filter((c) => !have.has(c));
  if (missing.length === 0) return { done: true, generatedThisStep: 0, generatedTotal: have.size, targetTotal: target };

  const batch = missing.slice(0, STEP_SIZE);

  const system = `Tu es un professeur de japonais pour francophones. Pour chaque kanji fourni, tu donnes sa fiche d'étude.
Tu réponds STRICTEMENT en JSON valide : un tableau d'objets, sans texte avant/après, sans balises markdown.
Chaque objet a exactement ces clés :
- "kanji" : le kanji demandé, recopié à l'identique
- "meaning_fr" : sens principal(s) en français, 1 à 3 mots (ex. "soleil, jour")
- "onyomi" : lectures on'yomi en KATAKANA (ex. ["ニチ","ジツ"]), seulement les 1 à 3 plus courantes ; [] s'il n'y en a pas
- "kunyomi" : lectures kun'yomi en HIRAGANA (ex. ["ひ","か"]) ; pour un verbe/adjectif, sépare avec un point la partie en kanji et les okurigana (ex. "た.べる") ; 1 à 3 plus courantes ; [] s'il n'y en a pas
- "category" : UN code parmi : ${KANJI_CATEGORIES.map((c) => c.code + ' (' + c.label + ')').join(' ; ')}
- "examples" : exactement 3 mots COURANTS contenant ce kanji : { "word": "mot en écriture japonaise normale", "reading": "lecture complète en hiragana", "meaning_fr": "traduction française courte" }
Les lectures doivent être exactes et usuelles dans le japonais moderne. N'invente rien.`;
  const user = `Kanji : ${batch.join(' ')}`;

  const raw = await callGemini(system, user, { temperature: 0.1, maxOutputTokens: 8192 });
  let parsed: any[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour les kanji.');
  }
  if (!Array.isArray(parsed)) throw new Error('Format de fiches kanji inattendu reçu de Gemini');

  // Validation : on ne garde que les fiches cohérentes (anti-hallucination).
  const rows: any[] = [];
  for (const p of parsed) {
    const char = typeof p?.kanji === 'string' ? p.kanji.trim() : '';
    if (!batch.includes(char) || rows.some((r) => r.char === char)) continue;
    if (typeof p.meaning_fr !== 'string' || !p.meaning_fr.trim()) continue;
    const onyomi = (Array.isArray(p.onyomi) ? p.onyomi : []).filter((x: any) => typeof x === 'string' && KATA.test(x)).slice(0, 3);
    const kunyomi = (Array.isArray(p.kunyomi) ? p.kunyomi : []).filter((x: any) => typeof x === 'string' && KUN.test(x)).slice(0, 3);
    const examples = (Array.isArray(p.examples) ? p.examples : [])
      .filter(
        (e: any) =>
          typeof e?.word === 'string' &&
          e.word.includes(char) &&
          typeof e?.reading === 'string' &&
          HIRA.test(e.reading) &&
          typeof e?.meaning_fr === 'string' &&
          e.meaning_fr.trim()
      )
      .slice(0, 3)
      .map((e: any) => ({ word: e.word.trim(), reading: e.reading.trim(), meaning_fr: e.meaning_fr.trim() }));
    if (examples.length === 0) continue;
    rows.push({
      char,
      level_code: levelCode,
      position: list.indexOf(char),
      meaning_fr: p.meaning_fr.trim(),
      onyomi,
      kunyomi,
      examples,
      category: KANJI_CATEGORIES.some((c) => c.code === p.category) ? p.category : null,
    });
  }

  if (rows.length === 0) {
    throw new Error(`Gemini n'a pas renvoyé de fiches valides pour : ${batch.join(' ')}. Clique sur "Reprendre" pour réessayer.`);
  }

  const { error } = await supabaseAdmin.from('kanji').upsert(rows, { onConflict: 'char' });
  if (error) throw new Error(error.message);

  const total = have.size + rows.length;
  return { done: total >= target, generatedThisStep: rows.length, generatedTotal: total, targetTotal: target };
}

// --- Progression (quiz) ---
export async function getKanjiProgress(profileId: string): Promise<KanjiProgressMap> {
  const { data } = await supabaseAdmin
    .from('kanji_progress')
    .select('kanji_id, success_count, fail_count')
    .eq('profile_id', profileId);
  const map: KanjiProgressMap = {};
  for (const r of data ?? []) map[r.kanji_id] = { success: r.success_count, fail: r.fail_count };
  return map;
}

export async function recordKanjiAnswer(profileId: string, kanjiId: string, correct: boolean): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('kanji_progress')
    .select('success_count, fail_count')
    .eq('profile_id', profileId)
    .eq('kanji_id', kanjiId)
    .maybeSingle();
  const { error } = await supabaseAdmin.from('kanji_progress').upsert(
    {
      profile_id: profileId,
      kanji_id: kanjiId,
      success_count: (existing?.success_count ?? 0) + (correct ? 1 : 0),
      fail_count: (existing?.fail_count ?? 0) + (correct ? 0 : 1),
      last_practiced_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,kanji_id' }
  );
  if (error) throw new Error(error.message);
}

// --- Classement par thème (kanji déjà générés sans catégorie) ---
export async function getKanjiCategoryCount(levelCode: string): Promise<{ total: number; unclassified: number }> {
  const total = await supabaseAdmin.from('kanji').select('id', { count: 'exact', head: true }).eq('level_code', levelCode);
  const missing = await supabaseAdmin
    .from('kanji')
    .select('id', { count: 'exact', head: true })
    .eq('level_code', levelCode)
    .is('category', null);
  if (missing.error) {
    throw new Error(missing.error.message.includes('category') ? 'La colonne "category" n\'existe pas encore — exécute la migration 018 dans Supabase.' : missing.error.message);
  }
  return { total: total.count ?? 0, unclassified: missing.count ?? 0 };
}

/** Classe jusqu'à 50 kanji sans thème (coût négligible : quelques centimes de centime). */
export async function runKanjiCategoryStep(levelCode: string): Promise<{ done: boolean; remaining: number }> {
  const { data, error } = await supabaseAdmin
    .from('kanji')
    .select('id, char, meaning_fr')
    .eq('level_code', levelCode)
    .is('category', null)
    .order('position')
    .limit(50);
  if (error) {
    throw new Error(error.message.includes('category') ? 'La colonne "category" n\'existe pas encore — exécute la migration 018 dans Supabase.' : error.message);
  }
  const todo = data ?? [];
  if (todo.length === 0) return { done: true, remaining: 0 };

  const codes = KANJI_CATEGORIES.map((c) => `${c.code} = ${c.label}`).join('\n');
  const system = `Tu ranges des kanji par thème. Pour chaque kanji, choisis UN SEUL code de catégorie, le plus évident
d'après son sens principal. Codes possibles :
${codes}
Tu réponds STRICTEMENT en JSON valide : un objet {"kanji": "code", ...}, sans texte avant/après, sans balises markdown.`;
  const user = todo.map((k: any) => `${k.char} (${k.meaning_fr})`).join('\n');
  const raw = await callGemini(system, user, { temperature: 0.1 });
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour le classement des kanji.');
  }

  const valid = new Set<string>(KANJI_CATEGORIES.map((c) => c.code));
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(
      todo.slice(i, i + 10).map(async (k: any) => {
        const code = valid.has(parsed?.[k.char]) ? parsed[k.char] : 'abstract'; // « idées / qualités » par défaut, pour ne jamais boucler
        const { error: upErr } = await supabaseAdmin.from('kanji').update({ category: code }).eq('id', k.id);
        if (upErr) throw new Error(upErr.message);
      })
    );
  }
  const { unclassified } = await getKanjiCategoryCount(levelCode);
  return { done: unclassified === 0, remaining: unclassified };
}
