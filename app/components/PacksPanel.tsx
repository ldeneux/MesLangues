'use client';

import { useEffect, useState } from 'react';
import { getPacks, createPack, runPackStep, type PackInfo } from '../../lib/packs';
import { estimatePackCost } from '../../lib/pricing';
import { LEVEL_CUMULATIVE_TARGET, PACK_SIZE, type LevelCode } from '../../lib/constants';
import GrammarConjugationDownload from './GrammarConjugationDownload';
import VocabularyDownload from './VocabularyDownload';

export default function PacksPanel({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generatingPackId, setGeneratingPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ generated: number; target: number; themeLabel?: string } | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const list = await getPacks(languageCode, levelCode);
    setPacks(list);
  }

  useEffect(() => {
    setPacks(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimatePackCost(PACK_SIZE);
  const cumulativeTarget = LEVEL_CUMULATIVE_TARGET[levelCode as LevelCode] ?? PACK_SIZE;
  const totalGenerated = (packs ?? []).reduce((sum, p) => sum + p.generated_count, 0);

  async function runLoop(packId: string, initialGenerated: number, target: number) {
    setGeneratingPackId(packId);
    setProgress({ generated: initialGenerated, target });
    setError('');
    try {
      let done = false;
      while (!done) {
        const step = await runPackStep(packId);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal, themeLabel: step.themeLabel });
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du pack.');
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
      const pack = await createPack(languageCode, levelCode);
      await runLoop(pack.id, 0, pack.target_count);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la création du pack.');
    }
  }

  function handleResume(pack: PackInfo) {
    runLoop(pack.id, pack.generated_count, pack.target_count);
  }

  if (packs === null) {
    return <p className="eyebrow-free">Chargement des packs…</p>;
  }

  const hasIncomplete = packs.some((p) => p.generated_count < p.target_count);

  return (
    <div>
      <p className="eyebrow-free">
        Progression vers le niveau suivant : {totalGenerated} / {cumulativeTarget} phrases générées pour ce niveau.
      </p>

      <div className="pack-list">
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
                    ? `Incomplet — ${p.generated_count} / ${p.target_count} phrases`
                    : `Prêt — ${p.generated_count} phrases`}
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

        {packs.length === 0 && <p className="eyebrow-free">Aucun pack téléchargé pour ce niveau pour l'instant.</p>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {generatingPackId && progress && (
        <div className="pack-progress">
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{ width: `${Math.min(100, (progress.generated / progress.target) * 100)}%` }}
            />
          </div>
          <p className="eyebrow-free">
            Ça peut prendre plusieurs minutes — laisse cet onglet ouvert le temps de la génération. Si la connexion
            coupe, le bouton "Reprendre" du pack repartira pile d'où c'était resté.
          </p>
        </div>
      )}

      {!generatingPackId && (
        <button className="primary" onClick={() => setConfirming(true)} disabled={hasIncomplete}>
          Télécharger le pack suivant ({PACK_SIZE} phrases)
        </button>
      )}
      {hasIncomplete && !generatingPackId && (
        <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>
          Termine d'abord le pack incomplet ci-dessus avant d'en démarrer un nouveau.
        </p>
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{PACK_SIZE} nouvelles phrases</strong> (texte + audio) pour ce
              niveau, réparties sur tous les thèmes.
            </p>
            <p>
              Coût estimé : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$, Gemini + Google
              Cloud TTS — souvent couvert par les paliers gratuits, voir discussion).
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

      <VocabularyDownload languageCode={languageCode} levelCode={levelCode} />
      <GrammarConjugationDownload languageCode={languageCode} />
    </div>
  );
}
