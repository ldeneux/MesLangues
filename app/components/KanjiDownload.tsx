'use client';

import { useEffect, useState } from 'react';
import { getKanjiCount, runKanjiStep } from '../../lib/kanji';
import { estimateKanjiCost } from '../../lib/pricing';

export default function KanjiDownload({ levelCode }: { levelCode: string }) {
  const [count, setCount] = useState<{ have: number; target: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setCount(await getKanjiCount(levelCode));
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement.');
    }
  }

  useEffect(() => {
    setCount(null);
    setError('');
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelCode]);

  const have = count?.have ?? 0;
  const target = count?.target ?? 0;
  const complete = count !== null && have >= target;
  const cost = estimateKanjiCost(Math.max(0, target - have));

  async function handleConfirm() {
    setConfirming(false);
    setError('');
    setRunning(true);
    try {
      let done = false;
      while (!done) {
        const step = await runKanjiStep(levelCode);
        setCount({ have: step.generatedTotal, target: step.targetTotal });
        done = step.done;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant la génération des kanji.');
    } finally {
      setRunning(false);
      refresh();
    }
  }

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Kanji</div>
          <div className="pack-row-sub">
            {running
              ? `En cours — ${have} / ${target}`
              : complete
              ? `Prêt — ${have} kanji`
              : `${have} / ${target} kanji (ce niveau)`}
          </div>
        </div>
        {complete && !running && <span className="pack-status pack-status-ready">Prêt</span>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {running ? (
        <div className="pack-progress">
          <div className="pack-progress-track">
            <div className="pack-progress-fill" style={{ width: `${target ? Math.min(100, (have / target) * 100) : 0}%` }} />
          </div>
          <p className="eyebrow-free">Laisse cet onglet ouvert. Si ça coupe, relance : ça repart là où c'était resté.</p>
        </div>
      ) : (
        count !== null &&
        !complete && (
          <button className="primary" onClick={() => setConfirming(true)}>
            {have > 0 ? 'Reprendre' : 'Télécharger'} les kanji ({target - have} restants)
          </button>
        )
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{target - have} fiches de kanji</strong> (sens en français, lectures,
              3 mots d'exemple chacun). Texte seul, pas d'audio payant : les prononciations utilisent la voix de ton
              navigateur.
            </p>
            <p>
              Coût estimé : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$, Gemini).
            </p>
            <div className="profile-create-actions">
              <button className="secondary" onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button className="primary" onClick={handleConfirm}>
                Confirmer et générer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
