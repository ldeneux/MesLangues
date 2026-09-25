'use server';

import { supabaseAdmin } from './supabaseAdmin';
import {
  LANGS,
  LEVELS,
  LEVEL_CUMULATIVE_TARGET,
  VOCAB_PACK_SIZE,
  LISTENING_PACK_SIZE,
  WRITING_PROMPTS_PER_LEVEL,
  CONJUGATION_TARGET,
  GRAMMAR_TOPICS,
  GRAMMAR_QUIZ_TARGET_PER_TOPIC,
} from './constants';

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

async function countBy(table: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin.from(table).select('language_code, level_code');
  const map = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const key = `${row.language_code}::${row.level_code}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export async function getInventory(): Promise<Inventory> {
  const [phraseCounts, vocabCounts, listeningCounts, writingCounts] = await Promise.all([
    countBy('phrases'),
    countBy('vocabulary_words'),
    countBy('listening_articles'),
    countBy('writing_prompts'),
  ]);

  const rows: InventoryRow[] = [];
  for (const lang of LANGS) {
    for (const level of LEVELS) {
      const key = `${lang.code}::${level.code}`;
      rows.push({
        languageCode: lang.code,
        levelCode: level.code,
        phrases: { ready: phraseCounts.get(key) ?? 0, target: LEVEL_CUMULATIVE_TARGET[level.code] },
        vocabulary: { ready: vocabCounts.get(key) ?? 0, target: LEVEL_CUMULATIVE_TARGET[level.code] },
        listening: { ready: listeningCounts.get(key) ?? 0, target: LISTENING_PACK_SIZE },
        writing: { ready: writingCounts.get(key) ?? 0, target: WRITING_PROMPTS_PER_LEVEL },
      });
    }
  }

  // Grammaire/Conjugaison : transverses, par langue uniquement (pas de
  // niveau — un même verbe/une même fiche sert à tous les niveaux).
  const { data: grammarTopicRows } = await supabaseAdmin.from('grammar_topics').select('language_code');
  const { data: grammarQuestionRows } = await supabaseAdmin.from('grammar_questions').select('language_code');
  const { data: conjugationRows } = await supabaseAdmin.from('conjugation_verbs').select('language_code');

  const countByLang = (rows: { language_code: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.language_code, (map.get(r.language_code) ?? 0) + 1);
    return map;
  };
  const topicsByLang = countByLang(grammarTopicRows);
  const questionsByLang = countByLang(grammarQuestionRows);
  const verbsByLang = countByLang(conjugationRows);

  const langWide: LangWideRow[] = LANGS.map((lang) => ({
    languageCode: lang.code,
    grammarTopics: { ready: topicsByLang.get(lang.code) ?? 0, target: GRAMMAR_TOPICS.length },
    grammarQuiz: {
      ready: questionsByLang.get(lang.code) ?? 0,
      target: GRAMMAR_TOPICS.length * GRAMMAR_QUIZ_TARGET_PER_TOPIC,
    },
    conjugation: { ready: verbsByLang.get(lang.code) ?? 0, target: CONJUGATION_TARGET },
  }));

  return { rows, langWide };
}

// ---------------------------------------------------------
// Volumétrie (taille base + stockage), avec répartition par niveau
// ---------------------------------------------------------
export type StorageStats = {
  dbUsedBytes: number;
  dbQuotaBytes: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  dbByLevel: { level: string; bytes: number }[];
  storageByLevel: { level: string; bytes: number }[];
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
  conjugation_verbs: 'language',
  user_phrase_progress: 'language',
  vocabulary_progress: 'language',
  conjugation_progress: 'language',
  exercise_progress: 'language',
  listening_results: 'language',
  grammar_results: 'language',
};

export async function getStorageStats(): Promise<StorageStats> {
  const [{ data: dbSizeData }, { data: storageSizeData }, { data: tableSizes }, { data: storageByPrefix }] =
    await Promise.all([
      supabaseAdmin.rpc('get_db_size_bytes'),
      supabaseAdmin.rpc('get_storage_size_bytes'),
      supabaseAdmin.rpc('get_content_table_sizes'),
      supabaseAdmin.rpc('get_storage_size_by_prefix'),
    ]);

  const dbUsedBytes = typeof dbSizeData === 'number' ? dbSizeData : 0;
  const storageUsedBytes = typeof storageSizeData === 'number' ? storageSizeData : 0;

  // --- Stockage (audio) par niveau : EXACT, via les préfixes de chemin
  // réels ("it/A1", "it/conjugation"...).
  const storageByLevel = new Map<string, number>();
  for (const row of (storageByPrefix ?? []) as { path_prefix: string; total_bytes: number }[]) {
    const [, second] = row.path_prefix.split('/');
    const levelCode = LEVELS.some((l) => l.code === second) ? second : null;
    if (levelCode) storageByLevel.set(levelCode, (storageByLevel.get(levelCode) ?? 0) + Number(row.total_bytes));
  }

  // --- Taille DB par niveau : ESTIMÉE (poids = lignes par niveau / total
  // de la table x taille réelle de la table). Tables "language" réparties
  // à parts égales sur les 4 niveaux.
  const dbByLevel = new Map<string, number>(LEVELS.map((l) => [l.code, 0]));

  for (const t of (tableSizes ?? []) as { table_name: string; total_bytes: number }[]) {
    const scope = TABLE_LEVEL_SCOPE[t.table_name];
    if (!scope) continue;

    if (scope === 'language') {
      const share = Number(t.total_bytes) / LEVELS.length;
      for (const l of LEVELS) dbByLevel.set(l.code, (dbByLevel.get(l.code) ?? 0) + share);
      continue;
    }

    const { data: rows } = await supabaseAdmin.from(t.table_name).select('level_code');
    const counts = new Map<string, number>();
    for (const r of (rows ?? []) as { level_code: string }[]) counts.set(r.level_code, (counts.get(r.level_code) ?? 0) + 1);
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    for (const [levelCode, count] of Array.from(counts)) {
      const share = (count / total) * Number(t.total_bytes);
      dbByLevel.set(levelCode, (dbByLevel.get(levelCode) ?? 0) + share);
    }
  }

  return {
    dbUsedBytes,
    dbQuotaBytes: DB_QUOTA_BYTES,
    storageUsedBytes,
    storageQuotaBytes: STORAGE_QUOTA_BYTES,
    dbByLevel: LEVELS.map((l) => ({ level: l.code, bytes: Math.round(dbByLevel.get(l.code) ?? 0) })),
    storageByLevel: LEVELS.map((l) => ({ level: l.code, bytes: storageByLevel.get(l.code) ?? 0 })),
  };
}
