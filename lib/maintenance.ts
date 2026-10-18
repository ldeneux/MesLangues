'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { FUNCTIONS_SCHEMA } from './dbSchema';
import { LANGS } from './constants';

// ---------------------------------------------------------------------------------------------------------------
// Ménage des doublons de vocabulaire (bouton de l'onglet Packs) — voir supabase/migrations/027_menage_doublons.sql.
// Même logique que les scripts SQL lancés à la main, découpée en petites étapes pour tenir dans la durée d'une
// action serveur : le client enchaîne les étapes (et relance une étape tant qu'il « reste » des lignes à traiter).
// ---------------------------------------------------------------------------------------------------------------

export type CleanupPreview = {
  total: number; // mots qui seraient supprimés
  lowerLevel: number; // dont « déjà vus à un niveau plus bas »
  sameLevel: number; // dont « doublons dans le même niveau »
  audiosPending: number; // fichiers audio déjà listés, en attente de suppression
};

export type CleanupStep = 'prepare' | 'progress' | 'archive' | 'delete' | 'finalize';

export type CleanupStepResult = {
  step: CleanupStep;
  remaining: number; // lignes restant à traiter pour cette étape (0 = étape terminée)
  deleted?: number; // finalize : mots supprimés
  audiosPending?: number; // finalize : audios listés en attente
};

const PROGRESS_BATCH = 500;
const ARCHIVE_BATCH = 300;
const DELETE_BATCH = 300;

function checkLanguage(languageCode: string) {
  if (!LANGS.some((l) => l.code === languageCode)) throw new Error(`Langue inconnue : ${languageCode}`);
}

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Could not find the function|does not exist|schema cache|relation .* does not exist/i.test(msg)) {
    return new Error(
      "La migration 027_menage_doublons.sql n'a pas encore été exécutée dans Supabase (SQL Editor), ou le cache de l'API n'est pas à jour."
    );
  }
  return new Error(msg);
}

async function callRpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabaseAdmin.schema(FUNCTIONS_SCHEMA).rpc(fn, args);
  if (error) throw friendly(new Error(error.message));
  return data;
}

async function countPendingAudio(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('audio_a_supprimer')
    .select('id', { count: 'exact', head: true })
    .is('done_at', null);
  if (error) throw friendly(new Error(error.message));
  return count ?? 0;
}

/** Aperçu SANS rien modifier : combien de mots seraient supprimés dans cette langue. */
export async function getCleanupPreview(languageCode: string): Promise<CleanupPreview> {
  checkLanguage(languageCode);
  const rows: { motif: string; nb: number }[] = (await callRpc('menage_apercu', { p_lang: languageCode })) ?? [];
  const lowerLevel = rows.filter((r) => r.motif.startsWith('deja vu')).reduce((s, r) => s + Number(r.nb), 0);
  const sameLevel = rows.filter((r) => !r.motif.startsWith('deja vu')).reduce((s, r) => s + Number(r.nb), 0);
  return { total: lowerLevel + sameLevel, lowerLevel, sameLevel, audiosPending: await countPendingAudio() };
}

/** Une étape du ménage. Ordre : prepare → progress (jusqu'à 0) → archive (jusqu'à 0) → delete (jusqu'à 0) → finalize. */
export async function runCleanupStep(languageCode: string, step: CleanupStep): Promise<CleanupStepResult> {
  checkLanguage(languageCode);
  switch (step) {
    case 'prepare':
      return { step, remaining: Number(await callRpc('menage_preparer', { p_lang: languageCode })) };
    case 'progress':
      return { step, remaining: Number(await callRpc('menage_progression', { p_lang: languageCode, p_limit: PROGRESS_BATCH })) };
    case 'archive':
      return { step, remaining: Number(await callRpc('menage_archiver', { p_lang: languageCode, p_limit: ARCHIVE_BATCH })) };
    case 'delete':
      return { step, remaining: Number(await callRpc('menage_supprimer', { p_lang: languageCode, p_limit: DELETE_BATCH })) };
    case 'finalize': {
      const rows = await callRpc('menage_finaliser', { p_lang: languageCode });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { step, remaining: 0, deleted: Number(row?.mots_supprimes ?? 0), audiosPending: Number(row?.audios_en_attente ?? 0) };
    }
    default:
      throw new Error(`Étape inconnue : ${step}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Suppression des fichiers audio devenus inutiles (listés par le ménage). IRRÉVERSIBLE.
// ---------------------------------------------------------------------------------------------------------------

export async function getPendingAudioCount(): Promise<number> {
  return countPendingAudio();
}

const AUDIO_BATCH = 100;

/**
 * Supprime un lot de fichiers audio listés dans audio_a_supprimer. Avant chaque suppression, on revérifie qu'aucun mot
 * ne s'en sert encore : dans ce cas le fichier est conservé et retiré de la liste.
 */
export async function deleteAudioBatch(): Promise<{ deleted: number; kept: number; failed: number; remaining: number }> {
  const { data: rows, error } = await supabaseAdmin
    .from('audio_a_supprimer')
    .select('id, bucket, path')
    .is('done_at', null)
    .order('id')
    .limit(AUDIO_BATCH);
  if (error) throw friendly(new Error(error.message));

  let deleted = 0;
  let kept = 0;
  let failed = 0;

  // 1) garde-fou : un fichier encore utilisé par un mot n'est jamais supprimé
  const toRemove: { id: number; bucket: string; path: string }[] = [];
  const stillUsedIds: number[] = [];
  const CHECK_CONCURRENCY = 10;
  const list = rows ?? [];
  for (let i = 0; i < list.length; i += CHECK_CONCURRENCY) {
    await Promise.all(
      list.slice(i, i + CHECK_CONCURRENCY).map(async (r) => {
        const { count } = await supabaseAdmin
          .from('vocabulary_words')
          .select('id', { count: 'exact', head: true })
          .like('audio_url', `%/${r.bucket}/${r.path}%`);
        if ((count ?? 0) > 0) stillUsedIds.push(r.id);
        else toRemove.push(r);
      })
    );
  }
  if (stillUsedIds.length > 0) {
    await supabaseAdmin.from('audio_a_supprimer').delete().in('id', stillUsedIds);
    kept = stillUsedIds.length;
  }

  // 2) suppression dans le stockage, bucket par bucket, puis marquage « fait »
  const byBucket = new Map<string, { id: number; path: string }[]>();
  for (const r of toRemove) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), { id: r.id, path: r.path }]);

  for (const [bucket, items] of byBucket) {
    const { error: rmError } = await supabaseAdmin.storage.from(bucket).remove(items.map((i) => i.path));
    if (rmError) {
      failed += items.length;
      continue;
    }
    const { error: markError } = await supabaseAdmin
      .from('audio_a_supprimer')
      .update({ done_at: new Date().toISOString() })
      .in('id', items.map((i) => i.id));
    if (markError) failed += items.length;
    else deleted += items.length;
  }

  return { deleted, kept, failed, remaining: await countPendingAudio() };
}
