// Stockage des fichiers audio : Cloudflare R2 si les variables R2_* sont renseignées, sinon Supabase Storage (comportement historique).
// Pendant une migration, des liens anciens (Supabase) et nouveaux (R2) coexistent : la SUPPRESSION touche donc les deux endroits
// (supprimer un fichier absent ne provoque pas d'erreur).
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from './supabaseAdmin';

export const AUDIO_BUCKET = 'phrase-audio';

type R2Config = { client: S3Client; bucket: string; publicBase: string };
let cached: R2Config | null | undefined;

/** Configuration R2, ou null si elle n'est pas (entièrement) renseignée. */
function r2(): R2Config | null {
  if (cached !== undefined) return cached;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE_URL) {
    cached = null;
    return cached;
  }
  cached = {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    }),
    bucket: R2_BUCKET,
    publicBase: R2_PUBLIC_BASE_URL.replace(/\/+$/, ''),
  };
  return cached;
}

export function audioBackend(): 'r2' | 'supabase' {
  return r2() ? 'r2' : 'supabase';
}

/** Enregistre un MP3 et retourne son URL publique. */
export async function putAudio(path: string, data: Buffer): Promise<string> {
  const cfg = r2();
  if (cfg) {
    await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: path, Body: data, ContentType: 'audio/mpeg', CacheControl: 'public, max-age=31536000' }));
    return `${cfg.publicBase}/${path}`;
  }
  const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).upload(path, data, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw error;
  return supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Supprime des fichiers par chemin. `bucket` : espace Supabase concerné (R2 ne contient que « phrase-audio »).
 * Retourne un message d'erreur, ou null si tout s'est bien passé.
 */
export async function removeAudio(paths: string[], bucket: string = AUDIO_BUCKET): Promise<string | null> {
  if (paths.length === 0) return null;
  const errors: string[] = [];

  const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (error) errors.push(error.message);

  const cfg = r2();
  if (cfg && bucket === AUDIO_BUCKET) {
    try {
      for (let i = 0; i < paths.length; i += 1000) {
        await cfg.client.send(
          new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: paths.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } })
        );
      }
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
    }
  }
  return errors.length ? errors.join(' ; ') : null;
}

/** Chemin dans le bucket d'après une URL publique (Supabase ou R2) ; null si l'URL n'est pas reconnue. */
export function audioPathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = `/object/public/${AUDIO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i >= 0) return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  const cfg = r2();
  if (cfg && url.startsWith(`${cfg.publicBase}/`)) return decodeURIComponent(url.slice(cfg.publicBase.length + 1).split('?')[0]);
  return null;
}
