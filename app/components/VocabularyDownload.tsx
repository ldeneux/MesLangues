'use client';

import { useEffect, useState } from 'react';
import { getVocabularyStatus, runVocabularyStep } from '../../lib/vocabulary';
import { estimateVocabularyCost } from '../../lib/pricing';
import { VOCAB_TARGET } from '../../lib/constants';

export default function VocabularyDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const c = await getVocabularyStatus(languageCode, levelCode);
    setCount(c);
  }

  useEffect(() => {
    setCount(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateVocabularyCost(VOCAB_TARGET);
  const complete = (count ?? 0) >= VOCAB_TARGET;

  async function handleConfirmDownload() {
    setConfirming(false);
    setError('');
    setRunning(true);
    try {
      let done = false;
      while (!done) {
        const step = await runVocabularyStep(languageCode, levelCode);
        setCount(step.generatedTotal);
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du vocabulaire.');
    } finally {
      setRunning(false);
      refresh();
    }
  }

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Vocabulaire</div>
          <div className="pack-row-sub">
            {complete ? `Prêt — ${count} mots` : `${count ?? 0} / ${VOCAB_TARGET} mots (ce niveau)`}
          </div>
        </div>
        {complete && <span className="pack-status pack-status-ready">Prêt</span>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {running ? (
        <div className="pack-progress">
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{ width: `${Math.min(100, ((count ?? 0) / VOCAB_TARGET) * 100)}%` }}
            />
          </div>
          <p className="eyebrow-free">
            {count ?? 0} / {VOCAB_TARGET} — laisse cet onglet ouvert le temps de la génération.
          </p>
        </div>
      ) : (
        !complete && (
          <button className="primary" onClick={() => setConfirming(true)}>
            Télécharger le vocabulaire ({VOCAB_TARGET} mots)
          </button>
        )
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{VOCAB_TARGET - (count ?? 0)} mots</strong> (avec article quand
              pertinent) + leur audio, répartis sur tous les thèmes.
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
