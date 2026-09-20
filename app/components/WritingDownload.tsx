'use client';

import { useEffect, useState } from 'react';
import { getWritingPrompts, runWritingBankStep } from '../../lib/writing';
import { estimateWritingBankCost } from '../../lib/pricing';
import { WRITING_PROMPTS_PER_LEVEL } from '../../lib/constants';

export default function WritingDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [themeLabel, setThemeLabel] = useState<string | undefined>();
  const [error, setError] = useState('');

  async function refresh() {
    const list = await getWritingPrompts(languageCode, levelCode);
    setCount(list.length);
  }

  useEffect(() => {
    setCount(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateWritingBankCost(WRITING_PROMPTS_PER_LEVEL);
  const complete = (count ?? 0) >= WRITING_PROMPTS_PER_LEVEL;

  async function handleConfirmDownload() {
    setConfirming(false);
    setError('');
    setRunning(true);
    try {
      let done = false;
      while (!done) {
        const step = await runWritingBankStep(languageCode, levelCode);
        setCount(step.generatedTotal);
        setThemeLabel(step.themeLabel);
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération des consignes.');
    } finally {
      setRunning(false);
      refresh();
    }
  }

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Écriture</div>
          <div className="pack-row-sub">
            {running
              ? `En cours${themeLabel ? ` — ${themeLabel}` : ''} — ${count ?? 0} / ${WRITING_PROMPTS_PER_LEVEL}`
              : complete
              ? `Prêt — ${count} consignes`
              : `${count ?? 0} / ${WRITING_PROMPTS_PER_LEVEL} consignes (ce niveau)`}
          </div>
        </div>
        {complete && !running && <span className="pack-status pack-status-ready">Prêt</span>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {running ? (
        <div className="pack-progress">
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{ width: `${Math.min(100, ((count ?? 0) / WRITING_PROMPTS_PER_LEVEL) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        !complete && (
          <button className="primary" onClick={() => setConfirming(true)}>
            Télécharger les consignes d'écriture ({WRITING_PROMPTS_PER_LEVEL})
          </button>
        )
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{WRITING_PROMPTS_PER_LEVEL - (count ?? 0)} consignes</strong> de
              rédaction guidée (texte seul), réparties sur tous les thèmes. La correction de chaque texte que tu
              écriras ensuite coûte séparément, mais très peu (≈ 0,003$ par soumission).
            </p>
            <p>
              Coût de la banque : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$).
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
