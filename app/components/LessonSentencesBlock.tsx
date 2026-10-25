'use client';

import { useEffect, useState } from 'react';
import { getSentenceCoverage, generateSentencesStep, type SentenceCoverage } from '../../lib/lessons';
import { estimateLessonSentencesCost } from '../../lib/pricing';

/** « Phrases d'exemple dans les leçons » : couverture (gratuit) puis génération des phrases manquantes (payant, après confirmation). Paramétrage, onglet Packs. */
export default function LessonSentencesBlock({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [sentCov, setSentCov] = useState<SentenceCoverage | null>(null);
  const [sentBusy, setSentBusy] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);
  const [sentRun, setSentRun] = useState<{ done: number; total: number } | null>(null);
  const [sentNote, setSentNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSentCov(null);
    setConfirmSent(false);
    setSentNote('');
    setError('');
  }, [languageCode, levelCode]);

  async function computeCoverage() {
    setError('');
    setSentNote('');
    setSentBusy('Calcul en cours…');
    try {
      const r = await getSentenceCoverage(languageCode, levelCode);
      if (r.ok) setSentCov((r as { data: SentenceCoverage }).data);
      else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Calcul impossible.');
    } finally {
      setSentBusy('');
    }
  }

  async function runSentences() {
    if (!sentCov) return;
    setConfirmSent(false);
    setError('');
    setSentNote('');
    const total = sentCov.needLessons;
    const skip: number[] = [];
    let done = 0;
    let audioMissing = 0;
    setSentRun({ done: 0, total });
    try {
      for (let guard = 0; guard < 80; guard++) {
        const r = await generateSentencesStep(languageCode, levelCode, skip);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const d = (r as { data: { remainingLessons: number; lessonNumber: number | null; added: number; failedLesson: number | null; audioMissing: number } }).data;
        if (d.lessonNumber === null) break; // plus rien à compléter
        if (d.failedLesson !== null) skip.push(d.failedLesson);
        else done++;
        audioMissing += d.audioMissing;
        setSentRun({ done, total });
      }
      const failed = skip.length;
      setSentNote(
        `${done} leçon(s) complétée(s).${failed ? ` ${failed} leçon(s) n'ont pas pu être complétées (Gemini n'a pas fourni de phrases utilisables) : relance plus tard.` : ''}${audioMissing ? ` ${audioMissing} phrase(s) sans audio (synthèse vocale indisponible).` : ''}`
      );
    } catch (e: any) {
      setError(e?.message ?? 'La génération a été interrompue.');
    } finally {
      setSentRun(null);
      await computeCoverage();
    }
  }

  const est = sentCov ? estimateLessonSentencesCost(sentCov.needLessons, sentCov.needSentences) : null;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Phrases d'exemple dans les leçons
      </div>
      <div className="phrase-card lesson-setup">
        <p className="eyebrow-free">
          Chaque leçon montre jusqu'à 3 phrases qui contiennent des mots de la leçon (mis en couleur). Elles viennent de tes packs de phrases : un nouveau pack enrichit les leçons tout
          seul. Quand les packs n'en ont pas assez, on peut écrire les phrases manquantes pour la leçon. (Il faut d'abord avoir créé le plan de leçons du niveau.)
        </p>
        {error && <p className="conv-warning">{error}</p>}
        {sentRun ? (
          <div className="pack-progress">
            <div className="pack-progress-label">
              {sentRun.done} / {sentRun.total} leçons complétées
            </div>
            <div className="pack-progress-track">
              <div className="pack-progress-fill" style={{ width: `${sentRun.total ? Math.round((sentRun.done / sentRun.total) * 100) : 0}%` }} />
            </div>
          </div>
        ) : (
          <>
            {!sentCov ? (
              <button className="primary" onClick={computeCoverage} disabled={!!sentBusy}>
                {sentBusy || 'Voir la couverture (gratuit)'}
              </button>
            ) : (
              <>
                <p className="eyebrow-free">
                  {sentCov.basePhrases} phrases dans tes packs. <strong>{sentCov.fullLessons} / {sentCov.lessons}</strong> leçons ont déjà 3 bonnes phrases (au moins 2 mots de la leçon) ;{' '}
                  {sentCov.withOne} ont au moins une phrase avec un mot de la leçon.
                  {sentCov.generated > 0 ? ` ${sentCov.generated} phrases ont déjà été écrites pour des leçons.` : ''}
                </p>
                {sentCov.needSentences > 0 && est ? (
                  confirmSent ? (
                    <div className="pack-confirm-modal">
                      <p style={{ marginTop: 0 }}>
                        Gemini va écrire <strong>{sentCov.needSentences} phrases</strong> pour {sentCov.needLessons} leçons, puis chaque phrase est lue par la synthèse vocale. Coût estimé :{' '}
                        <strong>au plus {est.eur.toFixed(2)} €</strong> ({est.usd.toFixed(2)} $), une seule fois. Chaque phrase est contrôlée par le code (au moins 2 mots de la leçon) avant
                        d'être gardée.
                      </p>
                      <div className="conv-bubble-actions">
                        <button className="primary" onClick={runSentences}>
                          Générer les phrases
                        </button>
                        <button className="conv-mini-btn" onClick={() => setConfirmSent(false)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="conv-bubble-actions">
                      <button className="primary" onClick={() => setConfirmSent(true)}>
                        Générer les {sentCov.needSentences} phrases manquantes (≈ {est.eur.toFixed(2)} €)
                      </button>
                      <button className="conv-mini-btn" onClick={computeCoverage} disabled={!!sentBusy}>
                        Recalculer
                      </button>
                    </div>
                  )
                ) : (
                  <p className="eyebrow-free" style={{ marginBottom: 0 }}>✅ Toutes les leçons ont leurs 3 bonnes phrases.</p>
                )}
              </>
            )}
            {sentNote && <p className="eyebrow-free" style={{ marginTop: '0.5rem', marginBottom: 0 }}>{sentNote}</p>}
          </>
        )}
      </div>
    </div>
  );
}
