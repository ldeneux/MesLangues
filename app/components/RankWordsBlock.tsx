'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRankingStatus, rankVocabularyStep, type RankStepResult } from '../../lib/lessons';
import { estimateRankingCost } from '../../lib/pricing';

/**
 * « Classer les mots par utilité » (toujours visible sous les packs de vocabulaire) : Gemini donne à chaque mot un score
 * d'utilité, ce qui place les mots les plus utiles en premier dans les leçons. Seuls les mots pas encore classés sont traités.
 */
export default function RankWordsBlock({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [status, setStatus] = useState<{ total: number; unranked: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [run, setRun] = useState<{ remaining: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await getRankingStatus(languageCode, levelCode);
      if (r.ok) setStatus((r as { data: { total: number; unranked: number } }).data);
      else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de lire le classement des mots.');
    }
  }, [languageCode, levelCode]);

  useEffect(() => {
    setStatus(null);
    setConfirm(false);
    setError('');
    setNote('');
    refresh();
  }, [refresh]);

  async function runRanking() {
    if (!status) return;
    setConfirm(false);
    setError('');
    setNote('');
    const total = status.unranked;
    setRun({ remaining: total, total });
    try {
      for (let guard = 0; guard < 80; guard++) {
        const r = await rankVocabularyStep(languageCode, levelCode);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const remaining = (r as { data: RankStepResult }).data.remaining;
        setRun({ remaining, total });
        if (remaining === 0) {
          setNote('✅ Classement terminé. Recrée le plan de leçons pour que l\'ordre soit pris en compte.');
          break;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Le classement a été interrompu.');
    } finally {
      setRun(null);
      await refresh();
    }
  }

  const est = status ? estimateRankingCost(status.unranked) : null;
  const pct = run && run.total > 0 ? Math.round(((run.total - run.remaining) / run.total) * 100) : 0;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Classer les mots par utilité
      </div>
      <div className="phrase-card lesson-setup">
        {error && <p className="conv-warning">{error}</p>}
        {!status && !error ? (
          <p className="eyebrow-free">Chargement…</p>
        ) : run ? (
          <div className="pack-progress">
            <div className="pack-progress-label">
              {run.total - run.remaining} / {run.total} mots classés
            </div>
            <div className="pack-progress-track">
              <div className="pack-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : status ? (
          <>
            <p className="eyebrow-free">
              {status.unranked === 0
                ? `✅ Les ${status.total} mots de ce niveau sont tous classés.`
                : `${status.unranked} mots sur ${status.total} ne sont pas encore classés : ils sont placés au milieu de leur thème dans les leçons.`}{' '}
              Le classement ne sert qu'à mettre les mots les plus utiles en premier ; il ne se fait qu'une fois par mot.
            </p>
            {confirm && est ? (
              <div className="pack-confirm-modal">
                <p style={{ marginTop: 0 }}>
                  Gemini va noter l'utilité de <strong>{status.unranked} mots</strong>. Coût estimé : environ <strong>{est.eur.toFixed(2)} €</strong>, une seule fois.
                </p>
                <div className="conv-bubble-actions">
                  <button className="primary" onClick={runRanking}>
                    Lancer le classement
                  </button>
                  <button className="conv-mini-btn" onClick={() => setConfirm(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button className="primary" onClick={() => setConfirm(true)} disabled={status.unranked === 0}>
                {status.unranked === 0 ? 'Classer les mots (rien à classer)' : `Classer les mots${est ? ` (≈ ${est.eur.toFixed(2)} €)` : ''}`}
              </button>
            )}
          </>
        ) : null}
        {note && <p className="eyebrow-free" style={{ marginTop: '0.5rem', marginBottom: 0 }}>{note}</p>}
      </div>
    </div>
  );
}
