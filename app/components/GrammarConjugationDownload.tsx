'use client';

import { useEffect, useState } from 'react';
import { getAvailableGrammarTopicCodes, getTopicsNeedingRegeneration, generateGrammarTopic } from '../../lib/grammar';
import { getConjugationVerbs, runConjugationStep, backfillConjugationAudio } from '../../lib/conjugation';
import { estimateGrammarConjugationCost } from '../../lib/pricing';
import { GRAMMAR_TOPICS, CONJUGATION_TARGET } from '../../lib/constants';

export default function GrammarConjugationDownload({ languageCode }: { languageCode: string }) {
  const [grammarDone, setGrammarDone] = useState<number>(0);
  const [conjugationDone, setConjugationDone] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<'grammar' | 'conjugation' | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const [topicCodes, verbs] = await Promise.all([
      getAvailableGrammarTopicCodes(languageCode),
      getConjugationVerbs(languageCode),
    ]);
    setGrammarDone(topicCodes.length);
    setConjugationDone(verbs.length);
  }

  useEffect(() => {
    setGrammarDone(0);
    setConjugationDone(0);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode]);

  const cost = estimateGrammarConjugationCost(CONJUGATION_TARGET);
  const complete = grammarDone >= GRAMMAR_TOPICS.length && conjugationDone >= CONJUGATION_TARGET;

  async function handleConfirmDownload() {
    setConfirming(false);
    setError('');
    setRunning(true);
    try {
      const missing = await getTopicsNeedingRegeneration(languageCode);

      setStage('grammar');
      for (const topicCode of missing) {
        await generateGrammarTopic(languageCode, topicCode);
        setGrammarDone((d) => d + 1);
      }

      setStage('conjugation');
      let audioDone = false;
      while (!audioDone) {
        const step = await backfillConjugationAudio(languageCode);
        audioDone = step.done;
      }

      let done = false;
      while (!done) {
        const step = await runConjugationStep(languageCode);
        setConjugationDone(step.generatedTotal);
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération.');
    } finally {
      setRunning(false);
      setStage(null);
      refresh();
    }
  }

  return (
    <div className="pack-list" style={{ marginTop: '2rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Grammaire et conjugaison</div>
          <div className="pack-row-sub">
            {complete
              ? `Prêt — ${grammarDone} fiches, ${conjugationDone} verbes`
              : `Grammaire ${grammarDone}/${GRAMMAR_TOPICS.length} · Conjugaison ${conjugationDone}/${CONJUGATION_TARGET}`}
          </div>
        </div>
        {complete && <span className="pack-status pack-status-ready">Prêt</span>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {running ? (
        <div className="pack-progress">
          <div className="pack-progress-label">
            {stage === 'grammar'
              ? `Fiches de grammaire : ${grammarDone} / ${GRAMMAR_TOPICS.length}`
              : `Verbes : ${conjugationDone} / ${CONJUGATION_TARGET}`}
          </div>
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{
                width:
                  stage === 'grammar'
                    ? `${Math.min(100, (grammarDone / GRAMMAR_TOPICS.length) * 100)}%`
                    : `${Math.min(100, (conjugationDone / CONJUGATION_TARGET) * 100)}%`,
              }}
            />
          </div>
          <p className="eyebrow-free">Laisse cet onglet ouvert le temps de la génération.</p>
        </div>
      ) : (
        !complete && (
          <button className="primary" onClick={() => setConfirming(true)}>
            Télécharger Grammaire et conjugaison
          </button>
        )
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{GRAMMAR_TOPICS.length - grammarDone} fiche(s) de grammaire</strong>{' '}
              et <strong>{CONJUGATION_TARGET - conjugationDone} verbe(s) conjugués</strong> (texte seulement, pas
              d'audio).
            </p>
            <p>
              Coût estimé : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$, Gemini uniquement).
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
