'use server';

// Suppression ciblée de fichiers audio (libérer du stockage Supabase) : par langue, par niveau, pour le vocabulaire et/ou les verbes.
// IRRÉVERSIBLE pour les fichiers : les mots et les verbes restent, mais sans audio (on peut les régénérer ensuite avec Google TTS,
// ce qui est payant au-delà du quota gratuit). Travail par petits lots : le client enchaîne les appels jusqu'à « fini ».
import { supabaseAdmin } from './supabaseAdmin';
import { fetchAllRows } from './paging';

export type PurgeScope = { languages: string[]; levels: string[]; vocabulary: boolean; verbs: boolean };
export type PurgeCounts = {
  vocabularyWords: number; // mots de vocabulaire qui ont un audio
  verbRows: number; // verbes qui ont au moins un audio
  verbFiles: number; // fichiers audio de ces verbes (un par temps, plus l'infinitif)
};
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const BUCKET = 'phrase-audio';
const CHUNK = 40; // jamais .in() sur des centaines d'identifiants
const VOCAB_BATCH = 120;
const VERB_BATCH = 30;

function clean(scope: PurgeScope): PurgeScope {
  const langs = scope.languages.filter((l) => ['it', 'es', 'en', 'ja', 'de'].includes(l));
  const levels = scope.levels.filter((l) => ['A1', 'A2', 'B1', 'B2'].includes(l));
  return { languages: langs, levels, vocabulary: !!scope.vocabulary, verbs: !!scope.verbs };
}

// URL publique → chemin dans le bucket (null si l'URL ne vient pas de ce bucket)
function pathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

// Fichiers audio d'un verbe (tense_audio : un lien par temps, plus « infinitive » / « basic » ; la clé « rev » n'est pas un lien)
function verbUrls(tenseAudio: unknown): string[] {
  if (!tenseAudio || typeof tenseAudio !== 'object') return [];
  return Object.values(tenseAudio as Record<string, unknown>).filter((v): v is string => typeof v === 'string' && v.startsWith('http'));
}

async function verbRowsInScope(scope: PurgeScope): Promise<{ id: string; tense_audio: unknown }[]> {
  const rows = await fetchAllRows<{ id: string; tense_audio: unknown }>((from, to) =>
    supabaseAdmin
      .from('conjugation_verbs')
      .select('id, tense_audio')
      .in('language_code', scope.languages)
      .in('level_code', scope.levels)
      .order('id')
      .range(from, to)
  );
  return rows.filter((r) => verbUrls(r.tense_audio).length > 0);
}

/** Combien d'audios seraient supprimés (lecture seule). */
export async function previewAudioPurge(input: PurgeScope): Promise<Result<PurgeCounts>> {
  try {
    const scope = clean(input);
    if (scope.languages.length === 0 || scope.levels.length === 0) return { ok: false, error: 'Choisis au moins une langue et un niveau.' };
    let vocabularyWords = 0;
    if (scope.vocabulary) {
      const { count, error } = await supabaseAdmin
        .from('vocabulary_words')
        .select('id', { count: 'exact', head: true })
        .in('language_code', scope.languages)
        .in('level_code', scope.levels)
        .not('audio_url', 'is', null)
        .neq('audio_url', '');
      if (error) throw new Error(error.message);
      vocabularyWords = count ?? 0;
    }
    let verbRows = 0;
    let verbFiles = 0;
    if (scope.verbs) {
      const rows = await verbRowsInScope(scope);
      verbRows = rows.length;
      verbFiles = rows.reduce((s, r) => s + verbUrls(r.tense_audio).length, 0);
    }
    return { ok: true, data: { vocabularyWords, verbRows, verbFiles } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type PurgeStep = { removedFiles: number; vocabularyWordsLeft: number; verbRowsLeft: number; keptShared: number };

/**
 * Un lot de suppression. On supprime d'abord les fichiers du stockage, PUIS on efface le lien en base (si la suppression du
 * stockage échoue, le lien est conservé et l'erreur remontée). Un fichier encore utilisé par un mot HORS du périmètre choisi
 * (audio partagé après le ménage des doublons) n'est jamais supprimé : seul le lien du mot du périmètre est effacé.
 */
export async function purgeAudioStep(input: PurgeScope): Promise<Result<PurgeStep>> {
  try {
    const scope = clean(input);
    if (scope.languages.length === 0 || scope.levels.length === 0) return { ok: false, error: 'Choisis au moins une langue et un niveau.' };
    let removedFiles = 0;
    let keptShared = 0;

    // --- Vocabulaire ---
    if (scope.vocabulary) {
      const { data: words, error } = await supabaseAdmin
        .from('vocabulary_words')
        .select('id, audio_url')
        .in('language_code', scope.languages)
        .in('level_code', scope.levels)
        .not('audio_url', 'is', null)
        .neq('audio_url', '')
        .order('id')
        .limit(VOCAB_BATCH);
      if (error) throw new Error(error.message);
      const batch = words ?? [];

      if (batch.length > 0) {
        // fichiers partagés avec un mot hors périmètre : à conserver
        const urls = Array.from(new Set(batch.map((w) => w.audio_url as string)));
        const protectedUrls = new Set<string>();
        for (let i = 0; i < urls.length; i += 20) {
          const { data: refs } = await supabaseAdmin
            .from('vocabulary_words')
            .select('audio_url, language_code, level_code')
            .in('audio_url', urls.slice(i, i + 20));
          for (const r of refs ?? []) {
            if (!scope.languages.includes(r.language_code) || !scope.levels.includes(r.level_code)) protectedUrls.add(r.audio_url as string);
          }
        }
        keptShared = protectedUrls.size;

        const paths = urls.filter((u) => !protectedUrls.has(u)).map(pathFromUrl).filter((p): p is string => !!p);
        if (paths.length > 0) {
          const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
          if (rmErr) throw new Error(`Suppression des fichiers impossible : ${rmErr.message}`);
          removedFiles += paths.length;
        }
        const ids = batch.map((w) => w.id);
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { error: upErr } = await supabaseAdmin.from('vocabulary_words').update({ audio_url: null }).in('id', ids.slice(i, i + CHUNK));
          if (upErr) throw new Error(upErr.message);
        }
      }
    }

    // --- Verbes ---
    if (scope.verbs) {
      const rows = (await verbRowsInScope(scope)).slice(0, VERB_BATCH);
      if (rows.length > 0) {
        const paths = rows.flatMap((r) => verbUrls(r.tense_audio).map(pathFromUrl)).filter((p): p is string => !!p);
        for (let i = 0; i < paths.length; i += 100) {
          const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
          if (rmErr) throw new Error(`Suppression des fichiers impossible : ${rmErr.message}`);
        }
        removedFiles += paths.length;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error: upErr } = await supabaseAdmin
            .from('conjugation_verbs')
            .update({ tense_audio: {} })
            .in('id', rows.slice(i, i + CHUNK).map((r) => r.id));
          if (upErr) throw new Error(upErr.message);
        }
      }
    }

    // Reste à faire
    let vocabularyWordsLeft = 0;
    if (scope.vocabulary) {
      const { count } = await supabaseAdmin
        .from('vocabulary_words')
        .select('id', { count: 'exact', head: true })
        .in('language_code', scope.languages)
        .in('level_code', scope.levels)
        .not('audio_url', 'is', null)
        .neq('audio_url', '');
      vocabularyWordsLeft = count ?? 0;
    }
    const verbRowsLeft = scope.verbs ? (await verbRowsInScope(scope)).length : 0;
    return { ok: true, data: { removedFiles, vocabularyWordsLeft, verbRowsLeft, keptShared } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
