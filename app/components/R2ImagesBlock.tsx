'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyLocalImagesStep, getImageMigrationStatus, type ImageMigrationStatus } from '../../lib/imageStorageServer';

/**
 * Images des mots → Cloudflare R2 (même bucket que les audios, dossier « images/ »).
 * Copie par petits lots les .webp encore présents dans public/image_webp, et les enregistre dans la table word_images (migration 036).
 * Reprenable : les images déjà dans R2 sont ignorées. Les liens des pages ne changent qu'une fois NEXT_PUBLIC_IMAGE_BASE_URL définie.
 */
export default function R2ImagesBlock() {
  const [status, setStatus] = useState<ImageMigrationStatus | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ next: number; total: number; copied: number; skipped: number; failed: { name: string; error: string }[] } | null>(null);
  const stopRef = useRef(false);

  const refresh = useCallback(async () => {
    const r = await getImageMigrationStatus();
    if (r.ok && r.data) {
      setStatus(r.data);
      setError('');
    } else setError(r.error ?? 'Lecture de l’état impossible.');
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e?.message ?? 'Lecture de l’état impossible.'));
  }, [refresh]);

  async function copyAll() {
    setRunning(true);
    setError('');
    stopRef.current = false;
    let offset = 0;
    let copied = 0;
    let skipped = 0;
    const failed: { name: string; error: string }[] = [];
    try {
      for (;;) {
        if (stopRef.current) break;
        const r = await copyLocalImagesStep(offset);
        if (!r.ok || !r.data) {
          setError(r.error ?? 'Erreur pendant la copie.');
          break;
        }
        copied += r.data.copied;
        skipped += r.data.skipped;
        failed.push(...r.data.failed);
        offset = r.data.next;
        setProgress({ next: offset, total: r.data.total, copied, skipped, failed: [...failed] });
        if (offset >= r.data.total) break;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant la copie.');
    } finally {
      setRunning(false);
      refresh().catch(() => {});
    }
  }

  const sampleOk = status?.sample?.status === 200;

  return (
    <div className="pack-list" style={{ marginTop: '2rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Images des mots sur Cloudflare R2</div>
          <div className="pack-row-sub">
            {status
              ? `${status.localFiles} image(s) dans le site (public/image_webp) · ${status.registered ?? '—'} déjà enregistrée(s) dans R2`
              : 'Lecture de l’état…'}
          </div>
        </div>
      </div>

      {error && <p className="conv-warning">{error}</p>}
      {status && status.tableError && (
        <p className="conv-warning">
          Table word_images indisponible ({status.tableError}) — exécute la migration 036 dans le SQL Editor de Supabase.
        </p>
      )}
      {status && !status.configured && (
        <p className="conv-warning">R2 n’est pas configuré : renseigne les variables R2_* dans Vercel (voir LISEZ-MOI-R2.md), puis redéploie.</p>
      )}

      {status && status.configured && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {!running ? (
              <button className="primary" onClick={copyAll} disabled={status.localFiles === 0 || !!status.tableError}>
                {progress ? 'Reprendre / refaire la copie' : 'Copier les images vers R2'}
              </button>
            ) : (
              <button
                className="secondary"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                Arrêter
              </button>
            )}
            <button className="secondary" onClick={() => refresh()} disabled={running}>
              Actualiser
            </button>
          </div>

          {progress && (
            <p className="eyebrow-free">
              {progress.next} / {progress.total} traitées — {progress.copied} copiée(s), {progress.skipped} déjà présente(s)
              {progress.failed.length > 0 ? `, ${progress.failed.length} en échec (ex. « ${progress.failed[0].name} » : ${progress.failed[0].error})` : ''}
            </p>
          )}
          {status.localFiles === 0 && <p className="eyebrow-free">Aucune image dans le site : rien à copier (les nouvelles images se génèrent directement vers R2).</p>}

          <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
            <strong>Vérification :</strong>{' '}
            {status.sample
              ? sampleOk
                ? `l’image « ${status.sample.name} » est lisible par son adresse publique R2 ✓`
                : `l’image « ${status.sample.name} » répond ${status.sample.status || 'erreur réseau'} à son adresse publique : vérifie l’accès public du bucket.`
              : 'copie d’abord des images.'}
          </p>
          <p className="eyebrow-free">
            <strong>Bascule :</strong>{' '}
            {status.envMatches ? (
              'les pages lisent déjà les images sur R2 ✓ (tu peux supprimer le dossier public/image_webp du dépôt).'
            ) : (
              <>
                quand la copie est terminée et la vérification ✓, ajoute dans Vercel la variable <code>NEXT_PUBLIC_IMAGE_BASE_URL</code> ={' '}
                <code>{status.imageBase}</code>, puis redéploie.
                {status.envSet && ' (Une valeur différente est actuellement définie.)'}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
