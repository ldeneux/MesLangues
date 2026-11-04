'use server';

// Images des mots sur Cloudflare R2 (même bucket que les audios, dossier « images/ ») + liste des noms dans la table word_images.
//  - copyLocalImagesStep : copie, par petits lots, les .webp encore présents dans public/image_webp vers R2 (bouton de l'onglet Packs).
//  - saveWordImages : enregistre les images qui viennent d'être générées (bouton « Envoyer sur R2 » de la génération par planches).
// R2 : mêmes variables R2_* que les audios (voir LISEZ-MOI-R2.md). Table : migration 036.

import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { headers } from 'next/headers';
import imageManifest from './imageManifest.json';
import { supabaseAdmin } from './supabaseAdmin';
import { r2Client } from './audioStorage';
import { imageFileName } from './imageName';
import { invalidateImageIndex } from './imageIndex';

// Type plat (pas d'union ok: true / ok: false) : le projet compile sans « strict », l'union ne se réduirait pas.
type Result<T> = { ok: boolean; data?: T; error?: string };

const PREFIX = 'images/';
const MAX_BYTES = 2 * 1024 * 1024; // une vignette fait ~15 ko : au-delà de 2 Mo, ce n'est pas une de nos images
const CACHE = 'public, max-age=86400';
const COPY_BATCH = 25;
const COPY_CONCURRENCY = 5;

const keyOf = (name: string) => `${PREFIX}${name}.webp`;
const localNames = (): string[] => [...(imageManifest as string[])].sort((a, b) => a.localeCompare(b, 'fr'));

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

async function registerNames(names: string[]): Promise<void> {
  for (let i = 0; i < names.length; i += 500) {
    const rows = names.slice(i, i + 500).map((name) => ({ name }));
    const { error } = await supabaseAdmin.from('word_images').upsert(rows, { onConflict: 'name' });
    if (error) {
      throw new Error(
        /word_images|schema cache|does not exist|Could not find/i.test(error.message)
          ? `Table word_images absente (${error.message}) — exécute d'abord la migration 036 dans le SQL Editor de Supabase.`
          : error.message
      );
    }
  }
}

async function existsInR2(client: any, bucket: string, key: string): Promise<boolean> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return (head.ContentLength ?? 0) > 0;
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey') return false;
    throw e;
  }
}

// ---------------------------------------------------------------------
export type ImageMigrationStatus = {
  configured: boolean; // variables R2_* renseignées
  publicBase: string | null;
  imageBase: string | null; // valeur à mettre dans NEXT_PUBLIC_IMAGE_BASE_URL
  envSet: boolean; // NEXT_PUBLIC_IMAGE_BASE_URL est déjà définie (et le site a été redéployé depuis)
  envMatches: boolean;
  localFiles: number; // .webp encore dans public/image_webp (liste du dernier déploiement)
  registered: number | null; // noms enregistrés dans word_images (null : table absente)
  tableError: string;
  sample: { name: string; status: number } | null; // une image prise au hasard, lue par son adresse publique R2
};

export async function getImageMigrationStatus(): Promise<Result<ImageMigrationStatus>> {
  try {
    const cfg = r2Client();
    const base = cfg ? `${cfg.publicBase}/${PREFIX.slice(0, -1)}` : null;
    const envBase = (process.env.NEXT_PUBLIC_IMAGE_BASE_URL || '').replace(/\/+$/, '');

    let registered: number | null = null;
    let tableError = '';
    let sampleName: string | null = null;
    const { count, error } = await supabaseAdmin.from('word_images').select('name', { count: 'exact', head: true });
    if (error) tableError = error.message;
    else registered = count ?? 0;
    if (registered) {
      const { data } = await supabaseAdmin.from('word_images').select('name').order('name').limit(1);
      sampleName = (data as { name: string }[] | null)?.[0]?.name ?? null;
    }

    let sample: { name: string; status: number } | null = null;
    if (cfg && sampleName) {
      try {
        const res = await fetch(`${base}/${encodeURIComponent(sampleName)}.webp`, { method: 'HEAD', cache: 'no-store' });
        sample = { name: sampleName, status: res.status };
      } catch {
        sample = { name: sampleName, status: 0 };
      }
    }

    return {
      ok: true,
      data: {
        configured: !!cfg,
        publicBase: cfg?.publicBase ?? null,
        imageBase: base,
        envSet: !!envBase,
        envMatches: !!base && envBase === base,
        localFiles: localNames().length,
        registered,
        tableError,
        sample,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------
export type CopyStep = { total: number; next: number; copied: number; skipped: number; failed: { name: string; error: string }[] };

/**
 * Copie un lot d'images du site (public/image_webp) vers R2 et les enregistre dans word_images.
 * `offset` : position dans la liste alphabétique ; le navigateur enchaîne les lots. Les images déjà dans R2 sont ignorées (reprenable).
 */
export async function copyLocalImagesStep(offset: number): Promise<Result<CopyStep>> {
  const cfg = r2Client();
  if (!cfg) return { ok: false, error: "R2 n'est pas configuré : il manque des variables R2_* dans Vercel (voir LISEZ-MOI-R2.md)." };
  try {
    const all = localNames();
    const slice = all.slice(offset, offset + COPY_BATCH);
    const h = headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const origin = `${proto}://${host}`;

    let copied = 0;
    let skipped = 0;
    const failed: { name: string; error: string }[] = [];
    const ok: string[] = [];

    await pool(slice, COPY_CONCURRENCY, async (name) => {
      try {
        if (await existsInR2(cfg.client, cfg.bucket, keyOf(name))) {
          skipped++;
          ok.push(name);
          return;
        }
        const res = await fetch(`${origin}/image_webp/${encodeURIComponent(name)}.webp`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`lecture du site : ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length === 0) throw new Error('fichier vide');
        await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: keyOf(name), Body: body, ContentType: 'image/webp', CacheControl: CACHE }));
        copied++;
        ok.push(name);
      } catch (e: any) {
        failed.push({ name, error: e?.message ?? String(e) });
      }
    });

    if (ok.length) await registerNames(ok);
    invalidateImageIndex();
    return { ok: true, data: { total: all.length, next: Math.min(all.length, offset + COPY_BATCH), copied, skipped, failed } };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------
export type SaveImagesResult = { saved: string[]; failed: { name: string; error: string }[] };

/** Enregistre des images .webp (base64) dans R2 et leurs noms dans word_images. Lots de 10 maximum. */
export async function saveWordImages(items: { name: string; b64: string }[]): Promise<Result<SaveImagesResult>> {
  const cfg = r2Client();
  if (!cfg) return { ok: false, error: "R2 n'est pas configuré : il manque des variables R2_* dans Vercel (voir LISEZ-MOI-R2.md)." };
  if (!Array.isArray(items) || items.length === 0 || items.length > 10) return { ok: false, error: 'Envoie 1 à 10 images à la fois.' };

  const saved: string[] = [];
  const failed: { name: string; error: string }[] = [];
  await pool(items, 4, async (it) => {
    const name = typeof it?.name === 'string' ? it.name : '';
    try {
      if (!name || name !== imageFileName(name) || name.length > 150) throw new Error('nom invalide');
      const body = Buffer.from(String(it.b64), 'base64');
      if (body.length === 0 || body.length > MAX_BYTES) throw new Error('taille invalide');
      // Un .webp commence par « RIFF », puis 4 octets de taille, puis « WEBP »
      if (body.subarray(0, 4).toString('latin1') !== 'RIFF' || body.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error("ce n'est pas un fichier webp");
      await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: keyOf(name), Body: body, ContentType: 'image/webp', CacheControl: CACHE }));
      saved.push(name);
    } catch (e: any) {
      failed.push({ name: name || '(sans nom)', error: e?.message ?? String(e) });
    }
  });

  try {
    if (saved.length) await registerNames(saved);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
  invalidateImageIndex();
  return { ok: true, data: { saved, failed } };
}
