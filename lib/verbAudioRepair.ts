'use server';

// Audios de verbes manquants : état précis par langue et par niveau, puis génération des fichiers qui manquent
// (tous les temps + infinitif ; en japonais : les formes de base + infinitif). Fonctionne pour TOUTES les langues et tous les niveaux.
import { supabaseAdmin } from './supabaseAdmin';
import { synthesizeAndStore } from './tts';
import { fetchAllRows } from './paging';
import { spokenConjugation, displayInfinitive } from './conjugationDisplay';
import { conjugateJapaneseVerb, type JaVerbData } from './japaneseVerbs';

const TENSES = ['present', 'futur', 'passe_compose', 'imparfait'] as const;
const VERBS_PER_STEP = 4;
const TTS_CONCURRENCY = 4;

type Row = {
  id: string;
  infinitive: string;
  level_code: string | null;
  tenses: Record<string, string[]> | null;
  tense_audio: Record<string, unknown> | null;
  ja_data?: JaVerbData | null;
};
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const has = (audio: Record<string, unknown> | null, key: string) => typeof audio?.[key] === 'string' && (audio![key] as string).length > 0;

// Fichiers audio qui manquent pour un verbe : [clé, texte à lire, chemin]
function missingFiles(v: Row, lang: string): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const audio = v.tense_audio ?? {};
  if (lang === 'ja') {
    if (!v.ja_data) return out; // verbe sans données japonaises : rien à lire
    if (!has(audio, 'basic')) {
      const forms = conjugateJapaneseVerb(v.infinitive, v.ja_data.reading, v.ja_data.group);
      const pick = (id: string) => forms.find((f) => f.id === id)?.reading;
      const spoken = ['dict', 'masu', 'te', 'nai', 'ta'].map(pick).filter(Boolean).join('、') + '。';
      out.push({ key: 'basic', text: spoken });
    }
    if (!has(audio, 'infinitive')) out.push({ key: 'infinitive', text: v.ja_data.reading || v.infinitive });
    return out;
  }
  for (const t of TENSES) {
    const forms = v.tenses?.[t];
    if (forms && forms.length > 0 && !has(audio, t)) out.push({ key: t, text: spokenConjugation(forms, lang) });
  }
  if (!has(audio, 'infinitive')) out.push({ key: 'infinitive', text: displayInfinitive(v.infinitive, lang) });
  return out;
}

async function loadVerbs(lang: string, levels?: string[]): Promise<Row[]> {
  const cols = lang === 'ja' ? 'id, infinitive, level_code, tenses, tense_audio, ja_data' : 'id, infinitive, level_code, tenses, tense_audio';
  const rows = await fetchAllRows<Row>((from, to) =>
    supabaseAdmin.from('conjugation_verbs').select(cols).eq('language_code', lang).order('id').range(from, to) as any
  );
  return levels && levels.length ? rows.filter((r) => r.level_code && levels.includes(r.level_code)) : rows;
}

export type VerbAudioStatus = {
  languageCode: string;
  perLevel: { level: string; verbs: number; verbsMissing: number; files: number }[];
  totalFiles: number;
  totalVerbsMissing: number;
  estimateEur: number; // coût indicatif de la synthèse vocale (voix Standard)
};

/** Combien de fichiers audio manquent pour les verbes d'une langue (par niveau). Lecture seule. */
export async function getVerbAudioStatus(languageCode: string): Promise<Result<VerbAudioStatus>> {
  try {
    const rows = await loadVerbs(languageCode);
    const levels = new Map<string, { verbs: number; verbsMissing: number; files: number; chars: number }>();
    for (const v of rows) {
      const lvl = v.level_code ?? '?';
      const entry = levels.get(lvl) ?? { verbs: 0, verbsMissing: 0, files: 0, chars: 0 };
      const miss = missingFiles(v, languageCode);
      entry.verbs++;
      if (miss.length > 0) {
        entry.verbsMissing++;
        entry.files += miss.length;
        entry.chars += miss.reduce((s, m) => s + m.text.length, 0);
      }
      levels.set(lvl, entry);
    }
    const order = ['A1', 'A2', 'B1', 'B2', '?'];
    const perLevel = Array.from(levels.entries())
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([level, e]) => ({ level, verbs: e.verbs, verbsMissing: e.verbsMissing, files: e.files }));
    const chars = Array.from(levels.values()).reduce((s, e) => s + e.chars, 0);
    return {
      ok: true,
      data: {
        languageCode,
        perLevel,
        totalFiles: perLevel.reduce((s, l) => s + l.files, 0),
        totalVerbsMissing: perLevel.reduce((s, l) => s + l.verbsMissing, 0),
        estimateEur: (chars / 1e6) * 4 * 0.93, // 4 $ le million de caractères (voix Standard) → €
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type VerbAudioStep = { generated: number; remainingVerbs: number; remainingFiles: number; firstError?: string };

/** Génère les audios manquants de quelques verbes (les niveaux demandés, ou tous). Le client rappelle jusqu'à « remainingVerbs = 0 ». */
export async function generateMissingVerbAudioStep(languageCode: string, levels?: string[]): Promise<Result<VerbAudioStep>> {
  try {
    const rows = await loadVerbs(languageCode, levels);
    const todo = rows.filter((v) => missingFiles(v, languageCode).length > 0);
    if (todo.length === 0) return { ok: true, data: { generated: 0, remainingVerbs: 0, remainingFiles: 0 } };

    const batch = todo.slice(0, VERBS_PER_STEP);
    const jobs = batch.flatMap((v) => missingFiles(v, languageCode).map((m) => ({ verb: v, ...m })));
    const results: Record<string, Record<string, string>> = {}; // verbId → { clé: URL }
    let generated = 0;
    let firstError: string | undefined;

    for (let i = 0; i < jobs.length; i += TTS_CONCURRENCY) {
      const settled = await Promise.allSettled(
        jobs.slice(i, i + TTS_CONCURRENCY).map(async (job) => {
          const { audioUrl } = await synthesizeAndStore(job.text, languageCode, `${languageCode}/conjugation/${job.verb.id}/${job.key}.mp3`);
          (results[job.verb.id] ??= {})[job.key] = audioUrl;
        })
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') generated++;
        else firstError ??= (r.reason as Error)?.message ?? String(r.reason);
      }
    }

    // Enregistrement : on relit la ligne juste avant d'écrire, pour ne rien écraser
    for (const [verbId, urls] of Object.entries(results)) {
      const { data: current } = await supabaseAdmin.from('conjugation_verbs').select('tense_audio').eq('id', verbId).single();
      const merged = { ...((current?.tense_audio as Record<string, unknown>) ?? {}), ...urls, rev: 2 };
      const { error } = await supabaseAdmin.from('conjugation_verbs').update({ tense_audio: merged }).eq('id', verbId);
      if (error) throw new Error(error.message);
    }

    if (generated === 0) return { ok: false, error: `Aucun audio généré : ${firstError ?? 'raison inconnue'}` };
    const left = todo.length - batch.length; // approximation : les verbes du lot sont considérés faits (un échec partiel sera recompté au tour suivant)
    return { ok: true, data: { generated, remainingVerbs: left, remainingFiles: 0, firstError } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
