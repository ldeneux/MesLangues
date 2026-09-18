'use client';

import { useEffect, useState } from 'react';
import {
  getListeningPacks,
  createListeningPack,
  runListeningPackStep,
  type ListeningPackInfo,
} from '../../lib/articles';
import { estimateListeningPackCost } from '../../lib/pricing';
import { LISTENING_PACK_SIZE } from '../../lib/constants';

export default function ListeningDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [packs, setPacks] = useState<ListeningPackInfo[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generatingPackId, setGeneratingPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ generated: number; target: number; themeLabel?: string } | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const list = await getListeningPacks(languageCode, levelCode);
    setPacks(list);
  }

  useEffect(() => {
    setPacks(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateListeningPackCost(LISTENING_PACK_SIZE);

  async function runLoop(packId: string, target: number) {
    setGeneratingPackId(packId);
    setProgress({ generated: 0, target });
    setError('');
    try {
      let done = false;
      while (!done) {
        const step = await runListeningPackStep(packId);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal, themeLabel: step.themeLabel });
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du pack Écoute.');
    } finally {
      setGeneratingPackId(null);
      setProgress(null);
      refresh();
    }
  }

  async function handleConfirmDownload() {
    setConfirming(false);
    setError('');
    try {
      const pack = await createListeningPack(languageCode, levelCode);
      await runLoop(pack.id, pack.target_count);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la création du pack.');
    }
  }

  function handleResume(pack: ListeningPackInfo) {
    runLoop(pack.id, pack.target_count);
  }

  if (packs === null) return <p className="eyebrow-free">Chargement des packs Écoute…</p>;

  const hasIncomplete = packs.some((p) => p.generated_count < p.target_count);

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Écoute ({LISTENING_PACK_SIZE} articles/pack, {`25 questions chacun`})
      </div>

      {packs.map((p) => {
        const incomplete = p.generated_count < p.target_count;
        const isGeneratingThis = generatingPackId === p.id;
        return (
          <div key={p.id} className="pack-row">
            <div>
              <div className="pack-row-title">Pack {p.pack_number}</div>
              <div className="pack-row-sub">
                {isGeneratingThis && progress
                  ? `En cours${progress.themeLabel ? ` — ${progress.themeLabel}` : ''} — ${progress.generated} / ${progress.target}`
                  : incomplete
                  ? `Incomplet — ${p.generated_count} / ${p.target_count} articles`
                  : `Prêt — ${p.generated_count} articles`}
              </div>
            </div>
            {isGeneratingThis ? (
              <span className="pack-status pack-status-generating">En cours</span>
            ) : incomplete ? (
              <button className="secondary" onClick={() => handleResume(p)} disabled={generatingPackId !== null}>
                Reprendre
              </button>
            ) : (
              <span className="pack-status pack-status-ready">Prêt</span>
            )}
          </div>
        );
      })}

      {packs.length === 0 && <p className="eyebrow-free">Aucun pack Écoute téléchargé pour ce niveau.</p>}

      {error && <p className="conv-warning">{error}</p>}

      {!generatingPackId && (
        <button className="primary" onClick={() => setConfirming(true)} disabled={hasIncomplete}>
          Télécharger un pack Écoute ({LISTENING_PACK_SIZE} articles)
        </button>
      )}
      {hasIncomplete && !generatingPackId && (
        <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>
          Termine d'abord le pack incomplet ci-dessus.
        </p>
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{LISTENING_PACK_SIZE} articles</strong> (texte + audio) avec leur
              banque de <strong>25 questions</strong> chacun (tirage aléatoire de 5 à chaque quiz, pour ne jamais
              rejouer le même).
            </p>
            <p>
              Coût estimé : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$).
            </p>
            <div className="profile-create-actions">
              <button className="secondary" onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button className="primary" onClick={handleConfirmDownload}>
                Confirmer et générer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
