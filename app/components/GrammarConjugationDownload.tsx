'use client';

import { useEffect, useState } from 'react';
import {
  getAvailableGrammarTopicCodes,
  getTopicsNeedingRegeneration,
  generateGrammarTopic,
  runGrammarQuizStep,
  getGrammarQuizBankTotal,
} from '../../lib/grammar';
import { getConjugationVerbs, runConjugationStep, backfillConjugationAudio } from '../../lib/conjugation';
import { estimateGrammarConjugationCost, estimateGrammarQuizBankCost } from '../../lib/pricing';
import { GRAMMAR_TOPICS, CONJUGATION_TARGET, GRAMMAR_QUIZ_TARGET_PER_TOPIC } from '../../lib/constants';

type Stage = 'grammar' | 'conjugation' | 'quiz' | null;

export default function GrammarConjugationDownload({ languageCode }: { languageCode: string }) {
  const [grammarDone, setGrammarDone] = useState<number>(0);
  const [conjugationDone, setConjugationDone] = useState<number>(0);
  const [quizDone, setQuizDone] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState('');

  const quizTarget = GRAMMAR_TOPICS.length * GRAMMAR_QUIZ_TARGET_PER_TOPIC;

  async function refresh() {
    const [topicCodes, verbs, quizTotal] = await Promise.all([
      getAvailableGrammarTopicCodes(languageCode),
      getConjugationVerbs(languageCode),
      getGrammarQuizBankTotal(languageCode),
    ]);
    setGrammarDone(topicCodes.length);
    setConjugationDone(verbs.length);
    setQuizDone(quizTotal);
  }

  useEffect(() => {
    setGrammarDone(0);
    setConjugationDone(0);
    setQuizDone(0);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode]);

  const cost = estimateGrammarConjugationCost(CONJUGATION_TARGET);
  const quizCost = estimateGrammarQuizBankCost(quizTarget);
  const complete =
    grammarDone >= GRAMMAR_TOPICS.length && conjugationDone >= CONJUGATION_TARGET && quizDone >= quizTarget;

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

      setStage('quiz');
      let quizFinished = false;
      while (!quizFinished) {
        const step = await runGrammarQuizStep(languageCode);
        setQuizDone(step.generatedTotal);
        quizFinished = step.done;
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
          <div className="pack-row-title">Grammaire, conjugaison et quiz</div>
          <div className="pack-row-sub">
            {complete
              ? `Prêt — ${grammarDone} fiches, ${conjugationDone} verbes, ${quizDone} questions de quiz`
              : `Grammaire ${grammarDone}/${GRAMMAR_TOPICS.length} · Conjugaison ${conjugationDone}/${CONJUGATION_TARGET} · Quiz ${quizDone}/${quizTarget}`}
          </div>
        </div>
        {complete && <span className="pack-status pack-status-ready">Prêt</span>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {running ? (
        <div className="pack-progress">
          <div className="pack-progress-label">
            {stage === 'grammar' && `Fiches de grammaire : ${grammarDone} / ${GRAMMAR_TOPICS.length}`}
            {stage === 'conjugation' && `Verbes : ${conjugationDone} / ${CONJUGATION_TARGET}`}
            {stage === 'quiz' && `Questions de quiz : ${quizDone} / ${quizTarget}`}
          </div>
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{
                width:
                  stage === 'grammar'
                    ? `${Math.min(100, (grammarDone / GRAMMAR_TOPICS.length) * 100)}%`
                    : stage === 'conjugation'
                    ? `${Math.min(100, (conjugationDone / CONJUGATION_TARGET) * 100)}%`
                    : `${Math.min(100, (quizDone / quizTarget) * 100)}%`,
              }}
            />
          </div>
          <p className="eyebrow-free">Laisse cet onglet ouvert le temps de la génération.</p>
        </div>
      ) : (
        <button className="primary" onClick={() => setConfirming(true)}>
          {complete ? 'Vérifier / mettre à jour' : 'Télécharger Grammaire, conjugaison et quiz'}
        </button>
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              {complete
                ? "Vérifie s'il y a des fiches, de l'audio ou des questions de quiz à régénérer/compléter. S'il n'y a rien à faire, ça ne coûtera rien."
                : `Cette opération va générer ${GRAMMAR_TOPICS.length - grammarDone} fiche(s) de grammaire, ${CONJUGATION_TARGET - conjugationDone} verbe(s) conjugués (+ audio), et ${quizTarget - quizDone} questions de quiz de grammaire (10 fiches × 100).`}
            </p>
            <p>
              Coût estimé : <strong>≈ {(cost.eur + quizCost.eur).toFixed(2)}€</strong> (≈ {(cost.usd + quizCost.usd).toFixed(2)}$).
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
