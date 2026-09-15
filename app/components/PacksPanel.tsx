'use client';

import { useEffect, useState } from 'react';
import { getPacks, createPack, runPackStep, type PackInfo } from '../../lib/packs';
import { estimatePackCost } from '../../lib/pricing';
import { LEVEL_CUMULATIVE_TARGET, PACK_SIZE, type LevelCode } from '../../lib/constants';

export default function PacksPanel({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  async function handleConfirmDownload() {
    setConfirming(false);
    setError('');
    setGenerating(true);
    try {
      const pack = await createPack(languageCode, levelCode);
      setProgress({ generated: 0, target: pack.target_count });

      let done = false;
      while (!done) {
        const step = await runPackStep(pack.id);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal, themeLabel: step.themeLabel });
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du pack.');
    } finally {
      setGenerating(false);
      setProgress(null);
      refresh();
    }
  }

  if (packs === null) {
    return <p className="eyebrow-free">Chargement des packs…</p>;
  }

  return (
    <div>
      <p className="eyebrow-free">
        Progression vers le niveau suivant : {totalGenerated} / {cumulativeTarget} phrases générées pour ce niveau.
      </p>

      <div className="pack-list">
        {packs.map((p) => (
          <div key={p.id} className="pack-row">
            <div>
              <div className="pack-row-title">Pack {p.pack_number}</div>
              <div className="pack-row-sub">
                {p.status === 'ready'
                  ? `Prêt — ${p.generated_count} phrases`
                  : p.status === 'generating'
                  ? `En cours — ${p.generated_count} / ${p.target_count}`
                  : 'En attente'}
              </div>
            </div>
            <span className={`pack-status pack-status-${p.status}`}>
              {p.status === 'ready' ? 'Prêt' : p.status === 'generating' ? 'En cours' : 'En attente'}
            </span>
          </div>
        ))}

        {packs.length === 0 && <p className="eyebrow-free">Aucun pack téléchargé pour ce niveau pour l'instant.</p>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {generating && progress ? (
        <div className="pack-progress">
          <div className="pack-progress-label">
            {progress.themeLabel ? `Génération : ${progress.themeLabel}…` : 'Génération…'} ({progress.generated} /{' '}
            {progress.target})
          </div>
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{ width: `${Math.min(100, (progress.generated / progress.target) * 100)}%` }}
            />
          </div>
          <p className="eyebrow-free">
            Ça peut prendre plusieurs minutes — laisse cet onglet ouvert le temps de la génération.
          </p>
        </div>
      ) : (
        <button className="primary" onClick={() => setConfirming(true)}>
          Télécharger le pack suivant ({PACK_SIZE} phrases)
        </button>
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
    </div>
  );
}
