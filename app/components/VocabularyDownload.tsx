'use client';

import { useEffect, useState } from 'react';
import {
  getVocabularyPacks,
  createVocabularyPack,
  runVocabularyPackStep,
  type VocabularyPackInfo,
} from '../../lib/vocabulary';
import { estimateVocabularyCost } from '../../lib/pricing';
import { VOCAB_PACK_SIZE } from '../../lib/constants';

export default function VocabularyDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [packs, setPacks] = useState<VocabularyPackInfo[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generatingPackId, setGeneratingPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ generated: number; target: number; themeLabel?: string } | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const list = await getVocabularyPacks(languageCode, levelCode);
    setPacks(list);
  }

  useEffect(() => {
    setPacks(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateVocabularyCost(VOCAB_PACK_SIZE);

  async function runLoop(packId: string, target: number) {
    setGeneratingPackId(packId);
    setProgress({ generated: 0, target });
    setError('');
    try {
      let done = false;
      while (!done) {
        const step = await runVocabularyPackStep(packId);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal, themeLabel: step.themeLabel });
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du vocabulaire.');
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
      const pack = await createVocabularyPack(languageCode, levelCode);
      await runLoop(pack.id, pack.target_count);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la création du pack.');
    }
  }

  function handleResume(pack: VocabularyPackInfo) {
    runLoop(pack.id, pack.target_count);
  }

  if (packs === null) return <p className="eyebrow-free">Chargement du vocabulaire…</p>;

  const hasIncomplete = packs.some((p) => p.generated_count < p.target_count);

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Vocabulaire ({VOCAB_PACK_SIZE} mots/pack, comme les packs de phrases)
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
                  ? `Incomplet — ${p.generated_count} / ${p.target_count} mots`
                  : `Prêt — ${p.generated_count} mots`}
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

      {packs.length === 0 && <p className="eyebrow-free">Aucun pack de vocabulaire téléchargé pour ce niveau.</p>}

      {error && <p className="conv-warning">{error}</p>}

      {!generatingPackId && (
        <button className="primary" onClick={() => setConfirming(true)} disabled={hasIncomplete}>
          Télécharger un pack de vocabulaire ({VOCAB_PACK_SIZE} mots)
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
              Cette opération va générer <strong>{VOCAB_PACK_SIZE} mots</strong> (avec article quand pertinent) +
              leur audio, répartis sur tous les thèmes.
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
