'use server';

// Migration des fichiers audio de Supabase Storage vers Cloudflare R2, pilotée par les boutons du bloc
// « Migrer les audios vers Cloudflare R2 » (onglet Packs). Chaque appel traite un petit lot : le navigateur enchaîne les appels.
// Ordre : tester R2 → copier → vérifier et basculer les liens en base → supprimer les copies de Supabase.
import { HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { supabaseAdmin } from './supabaseAdmin';
import { FUNCTIONS_SCHEMA } from './dbSchema';
import { r2Client, AUDIO_BUCKET, type R2Config } from './audioStorage';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const BATCH = 100;
const CONCURRENCY = 12;
const R2_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'];

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const rpc = () => supabaseAdmin.schema(FUNCTIONS_SCHEMA);
const oldBase = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}`;

function rpcHint(message: string): string {
  return /function|schema cache|does not exist|Could not find/i.test(message)
    ? `Fonctions de migration absentes (${message}) — exécute d'abord la migration 034 dans le SQL Editor de Supabase.`
    : message;
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

async function r2Size(cfg: R2Config, key: string): Promise<number | null> {
  try {
    const head = await cfg.client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return head.ContentLength ?? 0;
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey') return null;
    throw e;
  }
}

async function countR2(cfg: R2Config): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  let token: string | undefined;
  do {
    const res = await cfg.client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, MaxKeys: 1000, ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      if (o.Key?.startsWith('_ping/')) continue;
      files++;
      bytes += o.Size ?? 0;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return { files, bytes };
}

async function supabaseCount(): Promise<{ files: number; bytes: number }> {
  const { data, error } = await rpc().rpc('count_audio_objects');
  if (error) throw new Error(rpcHint(error.message));
  const row = (data as { files: number; bytes: number }[] | null)?.[0];
  return { files: Number(row?.files ?? 0), bytes: Number(row?.bytes ?? 0) };
}

type LinkRow = { tbl: string; col: string; n_rows: number };
async function linkCounts(apply: boolean): Promise<LinkRow[]> {
  const { data, error } = await rpc().rpc('rewrite_audio_urls', { p_old: oldBase(), p_new: process.env.R2_PUBLIC_BASE_URL ?? '', p_apply: apply });
  if (error) throw new Error(rpcHint(error.message));
  return ((data ?? []) as LinkRow[]).map((r) => ({ ...r, n_rows: Number(r.n_rows) }));
}

// ---------------------------------------------------------------------
export type R2Status = {
  configured: boolean;
  missing: string[];
  publicBase: string | null;
  supabaseFiles: number;
  supabaseMo: number;
  linksToRewrite: number;
  links: LinkRow[];
};

/** État de la migration : configuration, fichiers encore chez Supabase, liens en base qui pointent encore vers Supabase. */
export async function getR2Status(): Promise<Result<R2Status>> {
  try {
    const missing = R2_VARS.filter((k) => !process.env[k]);
    const cfg = r2Client();
    const sb = await supabaseCount();
    let links: LinkRow[] = [];
    if (cfg) links = (await linkCounts(false)).filter((l) => l.n_rows > 0);
    return {
      ok: true,
      data: {
        configured: !!cfg,
        missing,
        publicBase: cfg?.publicBase ?? null,
        supabaseFiles: sb.files,
        supabaseMo: Math.round(sb.bytes / 1048576),
        linksToRewrite: links.reduce((s, l) => s + l.n_rows, 0),
        links,
      },
    };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export type R2Test = { writeOk: boolean; publicStatus: number; publicOk: boolean; message: string };

/** Écrit un petit fichier de test dans R2, le relit par l'adresse PUBLIQUE, puis le supprime : valide la clé ET l'accès public. */
export async function testR2(): Promise<Result<R2Test>> {
  const cfg = r2Client();
  if (!cfg) return fail('R2 n\'est pas configuré : il manque des variables d\'environnement dans Vercel (puis redéployer).');
  const key = `_ping/${Date.now()}.txt`;
  try {
    await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: 'ok', ContentType: 'text/plain' }));
  } catch (e: any) {
    return {
      ok: true,
      data: { writeOk: false, publicStatus: 0, publicOk: false, message: `Écriture refusée par R2 (${e?.name ?? 'erreur'}). Vérifie R2_ACCOUNT_ID, les clés, le nom du bucket et que la clé a bien le droit « Object Read & Write » sur ce bucket.` },
    };
  }
  let status = 0;
  let body = '';
  let netError = '';
  try {
    const res = await fetch(`${cfg.publicBase}/${key}`, { cache: 'no-store' });
    status = res.status;
    body = await res.text();
  } catch (e: any) {
    netError = e?.message ?? 'erreur réseau';
  }
  try {
    await cfg.client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  } catch {
    /* le fichier de test est minuscule : sans importance */
  }
  const publicOk = status === 200 && body === 'ok';
  const message = publicOk
    ? 'Tout fonctionne : l\'application écrit dans R2 et le fichier est lisible par l\'adresse publique.'
    : netError
    ? `L'écriture fonctionne, mais l'adresse publique ${cfg.publicBase} est injoignable (${netError}). Vérifie R2_PUBLIC_BASE_URL.`
    : status === 401 || status === 403
    ? 'L\'écriture fonctionne, mais l\'accès public est refusé : active « Public access » (sous-domaine r2.dev ou domaine personnalisé) dans les réglages du bucket.'
    : `L'écriture fonctionne, mais l'adresse publique répond ${status} : vérifie R2_PUBLIC_BASE_URL (adresse du bucket, sans « / » final).`;
  return { ok: true, data: { writeOk: true, publicStatus: status, publicOk, message } };
}

export type CopyStep = { processed: number; copied: number; skipped: number; failed: number; firstError?: string; last: string; done: boolean };

/** Copie un lot de fichiers Supabase → R2 (les fichiers déjà présents avec la même taille sont ignorés). `after` : nom du dernier fichier traité. */
export async function copyAudioStep(after: string): Promise<Result<CopyStep>> {
  try {
    const cfg = r2Client();
    if (!cfg) return fail('R2 n\'est pas configuré.');
    const { data, error } = await rpc().rpc('list_audio_objects', { p_after: after, p_limit: BATCH });
    if (error) return fail(rpcHint(error.message));
    const items = (data ?? []) as { name: string; size: number }[];

    let copied = 0;
    let skipped = 0;
    let failed = 0;
    let firstError: string | undefined;
    await pool(items, CONCURRENCY, async (it) => {
      try {
        const existing = await r2Size(cfg, it.name);
        if (existing !== null && existing === Number(it.size)) {
          skipped++;
          return;
        }
        const { data: blob, error: dlError } = await supabaseAdmin.storage.from(AUDIO_BUCKET).download(it.name);
        if (dlError || !blob) throw new Error(dlError?.message ?? 'téléchargement impossible');
        const body = Buffer.from(await blob.arrayBuffer());
        await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: it.name, Body: body, ContentType: 'audio/mpeg', CacheControl: 'public, max-age=31536000' }));
        copied++;
      } catch (e: any) {
        failed++;
        firstError ??= `${it.name} : ${e?.message ?? e}`;
      }
    });
    return { ok: true, data: { processed: items.length, copied, skipped, failed, firstError, last: items.length ? items[items.length - 1].name : after, done: items.length < BATCH } };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export type RewriteResult = { links: LinkRow[]; total: number; applied: boolean; supabaseFiles: number; r2Files: number };

/**
 * Bascule les liens audio de la base vers R2. `apply = false` : compte seulement. Avant d'appliquer, on vérifie que R2 contient au moins
 * autant de fichiers que Supabase : sinon des liens pointeraient vers des fichiers absents.
 */
export async function rewriteAudioLinks(apply: boolean): Promise<Result<RewriteResult>> {
  try {
    const cfg = r2Client();
    if (!cfg) return fail('R2 n\'est pas configuré.');
    const sb = await supabaseCount();
    const r2c = await countR2(cfg);
    if (apply && r2c.files < sb.files) {
      return fail(`Copie incomplète : R2 contient ${r2c.files} fichiers pour ${sb.files} chez Supabase. Relance l'étape « Copier les fichiers » jusqu'à la fin.`);
    }
    const links = await linkCounts(apply);
    return { ok: true, data: { links, total: links.reduce((s, l) => s + l.n_rows, 0), applied: apply, supabaseFiles: sb.files, r2Files: r2c.files } };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export type DeleteStep = { processed: number; deleted: number; kept: number; last: string; done: boolean };

/**
 * Supprime de Supabase un lot de fichiers dont la copie R2 existe avec la même taille. Refusé tant que des liens en base
 * pointent encore vers Supabase (le son serait perdu).
 */
export async function deleteSourceStep(after: string): Promise<Result<DeleteStep>> {
  try {
    const cfg = r2Client();
    if (!cfg) return fail('R2 n\'est pas configuré.');
    const pending = (await linkCounts(false)).reduce((s, l) => s + l.n_rows, 0);
    if (pending > 0) return fail(`${pending} liens en base pointent encore vers Supabase : fais d'abord l'étape « Basculer les liens ».`);

    const { data, error } = await rpc().rpc('list_audio_objects', { p_after: after, p_limit: BATCH });
    if (error) return fail(rpcHint(error.message));
    const items = (data ?? []) as { name: string; size: number }[];

    const safe: string[] = [];
    let kept = 0;
    await pool(items, CONCURRENCY, async (it) => {
      const size = await r2Size(cfg, it.name);
      if (size !== null && size === Number(it.size)) safe.push(it.name);
      else kept++;
    });
    if (safe.length > 0) {
      const { error: rmError } = await supabaseAdmin.storage.from(AUDIO_BUCKET).remove(safe);
      if (rmError) return fail(`Suppression impossible : ${rmError.message}`);
    }
    return { ok: true, data: { processed: items.length, deleted: safe.length, kept, last: items.length ? items[items.length - 1].name : after, done: items.length < BATCH } };
  } catch (e) {
    return fail((e as Error).message);
  }
}
