'use server';

import { FUNCTIONS_SCHEMA } from './dbSchema';
import { supabaseAdmin } from './supabaseAdmin';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client } from './audioStorage';
import { fetchAllRows } from './paging';
import {
  LANGS,
  LEVELS,
  LEVEL_CUMULATIVE_TARGET,
  VOCAB_PACK_SIZE,
  LISTENING_LEVEL_TARGET,
  WRITING_PROMPTS_PER_LEVEL,
  CONJUGATION_TARGET,
  grammarTopicsFor,
  GRAMMAR_QUIZ_TARGET_PER_TOPIC,
} from './constants';
import { kanjiForLevel } from './kanjiLists';

// ---------------------------------------------------------
// Inventaire du contenu (tableau langue x niveau x catégorie)
// ---------------------------------------------------------
export type LevelCell = { ready: number; target: number };

export type InventoryRow = {
  languageCode: string;
  levelCode: string;
  phrases: LevelCell;
  vocabulary: LevelCell;
  listening: LevelCell;
  writing: LevelCell;
  kanji?: LevelCell; // japonais uniquement
};

export type LangWideRow = {
  languageCode: string;
  grammarTopics: LevelCell;
  grammarQuiz: LevelCell;
  conjugation: LevelCell;
};

export type Inventory = {
  rows: InventoryRow[];
  langWide: LangWideRow[];
};

// Comptage EXACT côté base (head count) : on ne lit pas les lignes, donc pas de limite de 1000 lignes.
// Réessais automatiques : une requête de comptage peut échouer ponctuellement sous charge.
async function headCount(table: string, apply: (q: any) => any = (q) => q): Promise<number> {
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count, error, status } = await apply(supabaseAdmin.from(table).select('*', { count: 'exact', head: true }));
    if (!error) return count ?? 0;
    // Une requête HEAD n'a pas de corps de réponse : le message peut être vide, on ajoute le code HTTP et les détails.
    lastError = [error.message, error.code, error.details, error.hint, status ? `HTTP ${status}` : ''].filter(Boolean).join(' | ');
    // 4xx = requête invalide (colonne inconnue…) : inutile de réessayer
    if (status && status >= 400 && status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new Error(`Comptage impossible sur "${table}" (${lastError || 'erreur inconnue'})`);
}

async function countRows(table: string, filters: Record<string, string> = {}): Promise<number> {
  return headCount(table, (q) => {
    for (const [column, value] of Object.entries(filters)) q = q.eq(column, value);
    return q;
  });
}

// La table `phrases` n'a PAS de colonnes langue/niveau : elles sont portées par le pack (packs.language_code / level_code).
// On retrouve donc les packs correspondants, puis on compte les phrases de ces packs.
async function countPhrases(filters: Record<string, string> = {}): Promise<number> {
  let query = supabaseAdmin.from('packs').select('id');
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query;
  if (error) throw new Error(`packs : ${error.message}`);
  const ids = (data ?? []).map((p: any) => p.id as string);
  let total = 0;
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    total += await headCount('phrases', (q) => q.in('pack_id', chunk));
  }
  return total;
}

// Compte les lignes d'une table « par niveau », avec la bonne méthode selon la table
function countLevelTable(table: string, filters: Record<string, string> = {}): Promise<number> {
  return table === 'phrases' ? countPhrases(filters) : countRows(table, filters);
}

// Exécute des tâches avec au plus `limit` requêtes simultanées (évite de saturer l'API de la base)
async function runLimited<T>(tasks: (() => Promise<T>)[], limit = 4): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// En production, Next.js masque le message des erreurs levées par une action serveur : on renvoie donc
// l'erreur dans le résultat, pour que Réglages affiche la vraie cause.
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const INVENTORY_TABLES = ['phrases', 'vocabulary_words', 'listening_articles', 'writing_prompts'] as const;

async function buildInventory(): Promise<Inventory> {
  const rows: InventoryRow[] = [];

  for (const lang of LANGS) {
    const counts = await runLimited(
      LEVELS.flatMap((level) => INVENTORY_TABLES.map((t) => () => countLevelTable(t, { language_code: lang.code, level_code: level.code })))
    );
    // Kanji : japonais uniquement (la table n'existe qu'après la migration 015 → 0 sinon)
    const kanjiCounts =
      lang.code === 'ja' ? await runLimited(LEVELS.map((l) => () => countRows('kanji', { level_code: l.code }).catch(() => 0))) : null;

    LEVELS.forEach((level, li) => {
      const base = li * INVENTORY_TABLES.length;
      rows.push({
        languageCode: lang.code,
        levelCode: level.code,
        phrases: { ready: counts[base], target: LEVEL_CUMULATIVE_TARGET[level.code] },
        vocabulary: { ready: counts[base + 1], target: LEVEL_CUMULATIVE_TARGET[level.code] },
        listening: { ready: counts[base + 2], target: LISTENING_LEVEL_TARGET[level.code] },
        writing: { ready: counts[base + 3], target: WRITING_PROMPTS_PER_LEVEL },
        ...(kanjiCounts ? { kanji: { ready: kanjiCounts[li], target: kanjiForLevel(level.code).length } } : {}),
      });
    });
  }

  // Grammaire : transverse (une même fiche sert à tous les niveaux). Verbes : 120 par niveau, total affiché par langue.
  const langWide: LangWideRow[] = [];
  for (const lang of LANGS) {
    langWide.push(
      await (async () => {
      const [topics, questions, verbs] = await Promise.all([
        countRows('grammar_topics', { language_code: lang.code }),
        countRows('grammar_questions', { language_code: lang.code }),
        // japonais : seuls les verbes au nouveau format (avec formes calculées) comptent
        lang.code === 'ja'
          ? supabaseAdmin
              .from('conjugation_verbs')
              .select('*', { count: 'exact', head: true })
              .eq('language_code', 'ja')
              .not('ja_data', 'is', null)
              .then((r) => r.count ?? 0)
          : countRows('conjugation_verbs', { language_code: lang.code }),
      ]);
      return {
        languageCode: lang.code,
        grammarTopics: { ready: topics, target: grammarTopicsFor(lang.code).length },
        grammarQuiz: { ready: questions, target: grammarTopicsFor(lang.code).length * GRAMMAR_QUIZ_TARGET_PER_TOPIC },
        conjugation: { ready: verbs, target: CONJUGATION_TARGET * LEVELS.length }, // 120 verbes par niveau
      };
      })()
    );
  }

  return { rows, langWide };
}

export async function getInventory(): Promise<Result<Inventory>> {
  try {
    return { ok: true, data: await buildInventory() };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erreur pendant le chargement de l'inventaire." };
  }
}

// ---------------------------------------------------------
// Volumétrie (taille base + stockage), avec répartition par niveau
// ---------------------------------------------------------
export type StorageStats = {
  languageCode: string; // 'all' ou un code de langue
  dbLanguageBytes: number; // somme estimée pour la langue (ou pour toutes)
  storageLanguageBytes: number;
  dbUsedBytes: number;
  dbQuotaBytes: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  dbByLevel: { level: string; bytes: number }[];
  storageByLevel: { level: string; bytes: number }[]; // audios par niveau : R2 + Supabase, verbes et leçons rattachés à leur niveau
  r2: R2Stats | null; // null si R2 n'est pas configuré
};

export type R2Stats = {
  usedBytes: number; // tout le bucket (toutes langues)
  quotaBytes: number; // 10 Go gratuits
  objects: number;
  selectedBytes: number; // pour la langue choisie
  otherBytes: number; // audios sans niveau (écoute enregistrée, divers)
  byType: { type: string; bytes: number }[];
  byLanguage: { language: string; bytes: number }[];
  error?: string;
};

const DB_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 Go (plan Free)
const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 Go (plan Free)

// 'level' = table avec language_code + level_code directement.
// 'language' = table transverse (répartie à parts égales sur les 4
// niveaux) : soit vraiment sans niveau (grammaire/conjugaison), soit
// rattachée indirectement à un niveau via une autre table (questions
// d'écoute, résultats d'écriture) — approximé plutôt que d'ajouter une
// jointure par ligne pour un poids marginal dans le total.
const TABLE_LEVEL_SCOPE: Record<string, 'level' | 'language'> = {
  phrases: 'level',
  packs: 'level',
  vocabulary_words: 'level',
  vocabulary_packs: 'level',
  listening_articles: 'level',
  listening_packs: 'level',
  writing_prompts: 'level',
  listening_questions: 'language',
  writing_results: 'language',
  grammar_topics: 'language',
  grammar_questions: 'language',
  conjugation_verbs: 'level', // un verbe appartient à une langue ET à un niveau (migration 030)
  user_phrase_progress: 'language',
  vocabulary_progress: 'language',
  conjugation_progress: 'language',
  exercise_progress: 'language',
  listening_results: 'language',
  grammar_results: 'language',
  kanji: 'level',
  kanji_progress: 'language',
  ja_readings: 'language',
};

// Tables propres au japonais (pas de colonne language_code pour kanji / ja_readings)
const JA_ONLY = new Set(['kanji', 'kanji_progress', 'ja_readings']);
// Tables « langue » qui ont une colonne language_code : on peut les attribuer exactement à une langue
const LANG_COL_TABLES = new Set(['grammar_topics', 'grammar_questions', 'conjugation_verbs']);

// ---------------------------------------------------------
// Audios sur Cloudflare R2 : poids exact par langue / niveau / type, calculé en listant le bucket (mis en cache 5 minutes).
// Chemins : « langue/niveau/{vocabulary|packs|articles}/… », « langue/conjugation/<id verbe>/… » (niveau d'après la table des verbes),
// « langue/lessons/<id leçon>/… » (niveau d'après la table des leçons), le reste = sans niveau.
// ---------------------------------------------------------
const R2_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 Go gratuits
type R2Agg = { at: number; objects: number; bytes: number; cells: Map<string, number> }; // clé « langue\tniveau\ttype » → octets
let r2Cache: R2Agg | null = null;
const LANG_CODES_SET = new Set<string>(['it', 'es', 'en', 'ja', 'de']);
const LEVEL_CODES_SET = new Set<string>(LEVELS.map((l) => l.code));

async function aggregateR2(): Promise<R2Agg | null> {
  const cfg = r2Client();
  if (!cfg) return null;
  if (r2Cache && Date.now() - r2Cache.at < 5 * 60 * 1000) return r2Cache;

  const cells = new Map<string, number>();
  const verbBytes = new Map<string, number>(); // « langue\tidVerbe » → octets
  const lessonBytes = new Map<string, number>(); // « langue\tidLeçon » → octets
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  let objects = 0;
  let bytes = 0;
  let token: string | undefined;
  do {
    const res = await cfg.client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, MaxKeys: 1000, ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      const key = o.Key ?? '';
      if (key.startsWith('_')) continue; // fichiers techniques (_state, _ping)
      const size = o.Size ?? 0;
      objects++;
      bytes += size;
      const p = key.split('/');
      if (!LANG_CODES_SET.has(p[0])) add(cells, `\t\tautre`, size);
      else if (LEVEL_CODES_SET.has(p[1])) add(cells, `${p[0]}\t${p[1]}\t${p[2] ?? 'autre'}`, size);
      else if (p[1] === 'conjugation' && p[2]) add(verbBytes, `${p[0]}\t${p[2]}`, size);
      else if (p[1] === 'lessons' && p[2]) add(lessonBytes, `${p[0]}\t${p[2]}`, size);
      else add(cells, `${p[0]}\t\tautre`, size);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  // Verbes et leçons : le chemin ne contient pas le niveau, on le retrouve dans la base
  if (verbBytes.size > 0) {
    const rows = await fetchAllRows<{ id: string; level_code: string | null }>((from, to) =>
      supabaseAdmin.from('conjugation_verbs').select('id, level_code').order('id').range(from, to) as any
    );
    const levelOf = new Map(rows.map((r) => [r.id, r.level_code ?? '']));
    for (const [k, n] of Array.from(verbBytes)) {
      const [lang, id] = k.split('\t');
      add(cells, `${lang}\t${levelOf.get(id) ?? ''}\tconjugation`, n);
    }
  }
  if (lessonBytes.size > 0) {
    const rows = await fetchAllRows<{ id: string; level_code: string | null }>((from, to) =>
      supabaseAdmin.from('lessons').select('id, level_code').order('id').range(from, to) as any
    );
    const levelOf = new Map(rows.map((r) => [r.id, r.level_code ?? '']));
    for (const [k, n] of Array.from(lessonBytes)) {
      const [lang, id] = k.split('\t');
      add(cells, `${lang}\t${levelOf.get(id) ?? ''}\tlessons`, n);
    }
  }
  r2Cache = { at: Date.now(), objects, bytes, cells };
  return r2Cache;
}

async function buildStorageStats(languageCode: string): Promise<StorageStats> {
  const filterLang = languageCode !== 'all' ? languageCode : null;
  const [dbSizeRes, storageSizeRes, tableSizesRes, storageByPrefixRes] = await Promise.all([
    supabaseAdmin.schema(FUNCTIONS_SCHEMA).rpc('get_db_size_bytes'),
    supabaseAdmin.schema(FUNCTIONS_SCHEMA).rpc('get_storage_size_bytes'),
    supabaseAdmin.schema(FUNCTIONS_SCHEMA).rpc('get_content_table_sizes'),
    supabaseAdmin.schema(FUNCTIONS_SCHEMA).rpc('get_storage_size_by_prefix'),
  ]);

  const firstError = [dbSizeRes, storageSizeRes, tableSizesRes, storageByPrefixRes].find((r) => r.error)?.error;
  if (firstError) {
    throw new Error(
      `Fonctions de volumétrie indisponibles (${firstError.message}) — exécute la migration 012 dans Supabase.`
    );
  }

  const { data: dbSizeData } = dbSizeRes;
  const { data: storageSizeData } = storageSizeRes;
  const { data: tableSizes } = tableSizesRes;
  const { data: storageByPrefix } = storageByPrefixRes;

  const dbUsedBytes = typeof dbSizeData === 'number' ? dbSizeData : 0;
  const storageUsedBytes = typeof storageSizeData === 'number' ? storageSizeData : 0;

  // --- Stockage (audio) par niveau : EXACT, via les préfixes de chemin
  // réels ("ja/A1", "ja/conjugation"...), filtré sur la langue choisie.
  const storageByLevel = new Map<string, number>();
  for (const row of (storageByPrefix ?? []) as { path_prefix: string; total_bytes: number }[]) {
    const [first, second] = row.path_prefix.split('/');
    if (filterLang && first !== filterLang) continue;
    const levelCode = LEVELS.some((l) => l.code === second) ? second : null;
    if (levelCode) storageByLevel.set(levelCode, (storageByLevel.get(levelCode) ?? 0) + Number(row.total_bytes));
  }

  // --- Taille DB par niveau : ESTIMÉE. Poids = lignes (de la langue / du niveau) ÷ lignes totales de la
  // table × taille réelle de la table. Les comptages sont exacts (head count), pas de limite de 1000 lignes.
  // Tables sans niveau : réparties à parts égales sur les 4 niveaux.
  // Tables sans colonne langue (progression, résultats, questions d'écoute…) : attribuées à la langue
  // au prorata de son poids en contenu (phrases + vocabulaire + articles).
  let langContentShare = 1;
  if (filterLang) {
    const contentTables = ['phrases', 'vocabulary_words', 'listening_articles'];
    const mine = await runLimited(contentTables.map((t) => () => countLevelTable(t, { language_code: filterLang })));
    const all = await runLimited(contentTables.map((t) => () => countLevelTable(t)));
    const sumMine = mine.reduce((a, b) => a + b, 0);
    const sumAll = all.reduce((a, b) => a + b, 0);
    langContentShare = sumAll > 0 ? sumMine / sumAll : 0;
  }

  const contributions: Map<string, number>[] = [];
  for (const t of (tableSizes ?? []) as { table_name: string; total_bytes: number }[]) {
    contributions.push(
      await (async () => {
      const result = new Map<string, number>();
      const scope = TABLE_LEVEL_SCOPE[t.table_name];
      const bytes = Number(t.total_bytes);
      if (!scope) return result;
      const jaOnly = JA_ONLY.has(t.table_name);
      if (filterLang && jaOnly && filterLang !== 'ja') return result;

      if (scope === 'language') {
        let share = 1;
        if (filterLang && !jaOnly) {
          if (LANG_COL_TABLES.has(t.table_name)) {
            const total = await countRows(t.table_name);
            share = total > 0 ? (await countRows(t.table_name, { language_code: filterLang })) / total : 0;
          } else {
            share = langContentShare;
          }
        }
        for (const l of LEVELS) result.set(l.code, (bytes * share) / LEVELS.length);
        return result;
      }

      // Dénominateur = lignes de TOUTES les langues et de TOUS les niveaux ; numérateur = niveau (et langue choisie)
      const allCounts = await runLimited(LEVELS.map((l) => () => countLevelTable(t.table_name, { level_code: l.code })));
      const total = allCounts.reduce((a, b) => a + b, 0);
      if (total === 0) return result;
      const counts = filterLang && !jaOnly
        ? await runLimited(LEVELS.map((l) => () => countLevelTable(t.table_name, { language_code: filterLang, level_code: l.code })))
        : allCounts;
      LEVELS.forEach((l, i) => result.set(l.code, (counts[i] / total) * bytes));
      return result;
      })()
    );
  }

  // --- Audios sur R2 : exact, verbes et leçons rattachés à leur niveau ; s'ajoute au reste éventuel de Supabase
  let r2Info: R2Stats | null = null;
  try {
    const agg = await aggregateR2();
    if (agg) {
      const byType = new Map<string, number>();
      const byLanguage = new Map<string, number>();
      let selected = 0;
      let other = 0;
      for (const [k, n] of Array.from(agg.cells)) {
        const [lang, level, type] = k.split('	');
        byLanguage.set(lang, (byLanguage.get(lang) ?? 0) + n);
        if (filterLang && lang !== filterLang) continue;
        selected += n;
        byType.set(type, (byType.get(type) ?? 0) + n);
        if (level && LEVEL_CODES_SET.has(level)) storageByLevel.set(level, (storageByLevel.get(level) ?? 0) + n);
        else other += n;
      }
      r2Info = {
        usedBytes: agg.bytes,
        quotaBytes: R2_QUOTA_BYTES,
        objects: agg.objects,
        selectedBytes: selected,
        otherBytes: other,
        byType: Array.from(byType, ([type, bytes]) => ({ type, bytes })).sort((a, b) => b.bytes - a.bytes),
        byLanguage: Array.from(byLanguage, ([language, bytes]) => ({ language, bytes })).sort((a, b) => b.bytes - a.bytes),
      };
    }
  } catch (e: any) {
    r2Info = { usedBytes: 0, quotaBytes: R2_QUOTA_BYTES, objects: 0, selectedBytes: 0, otherBytes: 0, byType: [], byLanguage: [], error: e?.message ?? 'Lecture de R2 impossible.' };
  }

  const dbByLevel = new Map<string, number>(LEVELS.map((l) => [l.code, 0]));
  for (const c of contributions) for (const [lvl, v] of Array.from(c)) dbByLevel.set(lvl, (dbByLevel.get(lvl) ?? 0) + v);

  const dbLevels = LEVELS.map((l) => ({ level: l.code, bytes: Math.round(dbByLevel.get(l.code) ?? 0) }));
  const storageLevels = LEVELS.map((l) => ({ level: l.code, bytes: storageByLevel.get(l.code) ?? 0 }));

  return {
    languageCode,
    dbLanguageBytes: dbLevels.reduce((a, b) => a + b.bytes, 0),
    storageLanguageBytes: storageLevels.reduce((a, b) => a + b.bytes, 0),
    dbUsedBytes,
    dbQuotaBytes: DB_QUOTA_BYTES,
    storageUsedBytes,
    storageQuotaBytes: STORAGE_QUOTA_BYTES,
    dbByLevel: dbLevels,
    storageByLevel: storageLevels,
    r2: r2Info,
  };
}

export async function getStorageStats(languageCode: string = 'all'): Promise<Result<StorageStats>> {
  try {
    return { ok: true, data: await buildStorageStats(languageCode) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Erreur pendant le chargement de la volumétrie.' };
  }
}
