'use client';

import { useEffect, useState } from 'react';
import {
  getCleanupPreview,
  runCleanupStep,
  getPendingAudioCount,
  deleteAudioBatch,
  type CleanupPreview,
  type CleanupStep,
} from '../../lib/maintenance';
import { LANGS } from '../../lib/constants';

const STEPS: { step: CleanupStep; label: string; loop: boolean }[] = [
  { step: 'prepare', label: 'Recherche des doublons', loop: false },
  { step: 'progress', label: 'Fusion de la progression', loop: true },
  { step: 'archive', label: 'Archivage des mots à supprimer', loop: true },
  { step: 'delete', label: 'Suppression des doublons', loop: true },
  { step: 'finalize', label: 'Mise à jour des packs et liste des audios', loop: false },
];

type Busy = null | 'preview' | 'cleanup' | 'audio';

export default function DuplicatesCleanup({ languageCode, onCleaned }: { languageCode: string; onCleaned?: () => void }) {
  const langLabel = LANGS.find((l) => l.code === languageCode)?.label ?? languageCode;

  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [confirmingAudio, setConfirmingAudio] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<number | null>(null);

  async function refreshPendingAudio() {
    try {
      setPendingAudio(await getPendingAudioCount());
    } catch {
      setPendingAudio(null); // migration 027 pas encore exécutée : le bouton audio reste masqué
    }
  }

  useEffect(() => {
    setPreview(null);
    setResult('');
    setError('');
    refreshPendingAudio();
  }, [languageCode]);

  // 1) Aperçu (rien n'est modifié), puis fenêtre de confirmation
  async function handleOpen() {
    setBusy('preview');
    setError('');
    setResult('');
    try {
      setPreview(await getCleanupPreview(languageCode));
    } catch (e: any) {
      setError(e.message ?? "Erreur pendant l'analyse des doublons.");
    } finally {
      setBusy(null);
    }
  }

  // 2) Ménage complet, étape par étape (chaque étape traite un petit lot pour ne pas dépasser le temps imparti)
  async function handleConfirmCleanup() {
    setPreview(null);
    setBusy('cleanup');
    setError('');
    setResult('');
    try {
      let deleted = 0;
      let audios = 0;
      for (let i = 0; i < STEPS.length; i++) {
        const { step, label, loop } = STEPS[i];
        setStatus(`Étape ${i + 1}/${STEPS.length} — ${label}…`);
        if (!loop) {
          const r = await runCleanupStep(languageCode, step);
          if (step === 'finalize') {
            deleted = r.deleted ?? 0;
            audios = r.audiosPending ?? 0;
          }
          continue;
        }
        let last = Number.POSITIVE_INFINITY;
        let stuck = 0;
        for (;;) {
          const r = await runCleanupStep(languageCode, step);
          setStatus(`Étape ${i + 1}/${STEPS.length} — ${label}${r.remaining > 0 ? ` (reste ${r.remaining})` : ''}…`);
          if (r.remaining === 0) break;
          // sécurité : si le reste ne diminue plus, on s'arrête au lieu de boucler
          stuck = r.remaining >= last ? stuck + 1 : 0;
          if (stuck >= 3) throw new Error(`L'étape « ${label} » n'avance plus (reste ${r.remaining}). Relance le nettoyage ; si ça persiste, regarde les scripts SQL du dossier supabase.`);
          last = r.remaining;
        }
      }
      setResult(
        deleted === 0
          ? 'Aucun doublon à supprimer.'
          : `${deleted} mot(s) en double supprimé(s) et archivé(s). Les packs touchés ont été remis à jour (un pack devenu incomplet passe « Incomplet » : tu peux le reprendre, la génération connaît maintenant les mots déjà existants).`
      );
      setPendingAudio(audios);
      onCleaned?.();
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant le nettoyage. Tu peux relancer : chaque étape reprend là où elle en était.');
      onCleaned?.();
    } finally {
      setBusy(null);
      setStatus('');
      refreshPendingAudio();
    }
  }

  // 3) Suppression des fichiers audio devenus inutiles (irréversible)
  async function handleConfirmAudio() {
    setConfirmingAudio(false);
    setBusy('audio');
    setError('');
    setResult('');
    let total = 0;
    try {
      for (;;) {
        const r = await deleteAudioBatch();
        total += r.deleted;
        setStatus(`Suppression des audios… ${total} supprimé(s), reste ${r.remaining}`);
        if (r.remaining === 0) break;
        if (r.deleted + r.kept === 0) {
          throw new Error(`${r.failed} fichier(s) n'ont pas pu être supprimés du stockage. Réessaie dans un moment.`);
        }
      }
      setResult(`${total} fichier(s) audio supprimé(s) du stockage.`);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la suppression des audios.');
    } finally {
      setBusy(null);
      setStatus('');
      refreshPendingAudio();
    }
  }

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Nettoyage des doublons de vocabulaire ({langLabel})
      </div>
      <p className="eyebrow-free">
        Pour chaque mot présent plusieurs fois dans le MÊME niveau (même mot, même traduction à l'article près), on ne
        garde qu'une ligne et on supprime les autres. Un mot qui existe dans deux niveaux différents (ex. A1 et B1) est
        conservé aux deux. Les homonymes et les synonymes ne sont pas touchés.
      </p>

      <div className="profile-create-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <button className="secondary" onClick={handleOpen} disabled={busy !== null}>
          {busy === 'preview' ? 'Analyse…' : 'Nettoyer les doublons'}
        </button>
        {pendingAudio !== null && pendingAudio > 0 && (
          <button className="secondary" onClick={() => setConfirmingAudio(true)} disabled={busy !== null}>
            Supprimer les audios en double ({pendingAudio})
          </button>
        )}
      </div>

      {status && <p className="eyebrow-free">{status} Laisse cet onglet ouvert.</p>}
      {error && <p className="conv-warning">{error}</p>}
      {result && <p className="eyebrow-free">{result}</p>}

      {preview && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            {preview.total === 0 ? (
              <>
                <p>Aucun doublon trouvé en {langLabel}.</p>
                <div className="profile-create-actions">
                  <button className="secondary" onClick={() => setPreview(null)}>
                    Fermer
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  <strong>{preview.total} mot(s) en double</strong> vont être supprimés en {langLabel} ({preview.lowerLevel} déjà
                  vus à un niveau plus bas, {preview.sameLevel} doublon(s) dans le même niveau).
                </p>
                <p>
                  La progression des apprenants est fusionnée sur le mot gardé, les mots supprimés sont archivés, et les
                  packs touchés sont remis à jour. Les fichiers audio ne sont pas supprimés ici : le bouton « Supprimer
                  les audios en double » s'en charge ensuite.
                </p>
                <div className="profile-create-actions">
                  <button className="secondary" onClick={() => setPreview(null)}>
                    Annuler
                  </button>
                  <button className="primary" onClick={handleConfirmCleanup}>
                    Confirmer le nettoyage
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmingAudio && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              <strong>{pendingAudio} fichier(s) audio</strong> devenus inutiles vont être supprimés du stockage.
            </p>
            <p>C'est <strong>irréversible</strong> : après ça, les mots archivés ne pourront plus retrouver leur audio.</p>
            <div className="profile-create-actions">
              <button className="secondary" onClick={() => setConfirmingAudio(false)}>
                Annuler
              </button>
              <button className="primary" onClick={handleConfirmAudio}>
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
