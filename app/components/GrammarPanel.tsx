'use client';

import { useEffect, useState } from 'react';
import {
  getGrammarTopic,
  getGrammarQuizQuestions,
  saveGrammarQuizResult,
  getGrammarQuizHistory,
  type GrammarTopic,
  type GrammarQuizQuestion,
  type GrammarQuizResult,
} from '../../lib/grammar';
import { grammarTopicsFor } from '../../lib/constants';
import HighlightText from './HighlightText';
import RubyHighlight from './RubyHighlight';
import { usePersistentFlag } from './usePersistentFlag';

export default function GrammarPanel({ profileId, languageCode }: { profileId: string; languageCode: string }) {
  const topics = grammarTopicsFor(languageCode);
  const isJa = languageCode === 'ja';
  const [furigana, setFurigana] = usePersistentFlag('ja-furigana');
  const [romaji, setRomaji] = usePersistentFlag('ja-romaji');
  const [selected, setSelected] = useState<string>(topics[0].code);
  const [topic, setTopic] = useState<GrammarTopic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [quizOpen, setQuizOpen] = useState(false);
  const [questions, setQuestions] = useState<GrammarQuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);
  const [history, setHistory] = useState<GrammarQuizResult[]>([]);

  useEffect(() => {
    load(selected);
    resetQuiz();
    getGrammarQuizHistory(profileId, languageCode, selected).then(setHistory).catch(() => setHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, selected]);

  async function load(topicCode: string) {
    setLoading(true);
    setError('');
    setTopic(null);
    try {
      const existing = await getGrammarTopic(languageCode, topicCode);
      setTopic(existing);
    } catch (e: any) {
      setError(e.message ?? 'Erreur de chargement de la fiche de grammaire.');
    } finally {
      setLoading(false);
    }
  }

  function resetQuiz() {
    setQuizOpen(false);
    setQuestions(null);
    setAnswers({});
    setQuizScore(null);
  }

  async function openQuiz() {
    setQuizOpen(true);
    setQuizScore(null);
    setAnswers({});
    try {
      const q = await getGrammarQuizQuestions(languageCode, selected);
      setQuestions(q);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement du quiz.');
      setQuestions([]);
    }
  }

  async function submitQuiz() {
    if (!questions) return;
    const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
    setQuizScore({ correct, total: questions.length });
    await saveGrammarQuizResult(profileId, languageCode, selected, correct, questions.length);
    getGrammarQuizHistory(profileId, languageCode, selected).then(setHistory).catch(() => {});
  }

  return (
    <div>
      <div className="cascade-row">
        <select className="cascade-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {topics.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="eyebrow-free">Chargement…</p>}
      {error && <p className="conv-warning">{error}</p>}

      {!loading && !topic && !error && (
        <p className="eyebrow-free">
          Cette fiche n'a pas encore été téléchargée — va dans l'onglet "Packs" et clique sur "Grammaire et
          quiz".
        </p>
      )}

      {topic && (
        <div className="phrase-card phrase-card-big">
          <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.05rem' }}>
            {topic.title}
          </div>
          <p style={{ lineHeight: 1.6 }}>{topic.explanation_fr}</p>

          {isJa && (
            <div className="conv-bubble-actions" style={{ marginBottom: '0.75rem' }}>
              <button className={`conv-mini-btn${furigana ? ' active' : ''}`} onClick={() => setFurigana(!furigana)}>
                Furigana : {furigana ? 'oui' : 'non'}
              </button>
              <button className={`conv-mini-btn${romaji ? ' active' : ''}`} onClick={() => setRomaji(!romaji)}>
                Rōmaji : {romaji ? 'oui' : 'non'}
              </button>
            </div>
          )}

          <div className="grammar-examples">
            {(Array.isArray(topic.examples) ? topic.examples : []).map((ex, i) => (
              <div key={i} className="grammar-example-row">
                <div className="revision-target" lang={isJa ? 'ja' : undefined}>
                  {isJa && furigana && ex.ruby ? <RubyHighlight ruby={ex.ruby} /> : <HighlightText text={ex.target} />}
                </div>
                {isJa && romaji && ex.romaji && <div className="phrase-notes">{ex.romaji}</div>}
                <div className="revision-fr">
                  <HighlightText text={ex.fr} />
                </div>
              </div>
            ))}
          </div>

          {!quizOpen ? (
            <button className="primary" style={{ marginTop: '1rem' }} onClick={openQuiz}>
              Tester mes connaissances (10 questions)
            </button>
          ) : (
            <div className="quiz-block">
              {questions === null && <p className="eyebrow-free">Préparation du quiz…</p>}
              {questions?.length === 0 && (
                <p className="eyebrow-free">
                  Pas encore de questions pour cette fiche — télécharge-les depuis l'onglet "Packs".
                </p>
              )}

              {questions && questions.length > 0 && quizScore === null && (
                <>
                  {questions.map((q) => (
                    <div key={q.id} className="quiz-question">
                      <div className="quiz-question-text">{q.question}</div>
                      <div className="quiz-options">
                        {(Array.isArray(q.options) ? q.options : []).map((opt, i) => (
                          <button
                            key={i}
                            className={`quiz-option${answers[q.id] === i ? ' selected' : ''}`}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    className="primary"
                    onClick={submitQuiz}
                    disabled={Object.keys(answers).length < questions.length}
                  >
                    Valider
                  </button>
                </>
              )}

              {quizScore && (
                <div className="conv-correction exercise-success">
                  <div className="conv-correction-label">Score</div>
                  <div className="conv-correction-text">
                    {quizScore.correct} / {quizScore.total} bonnes réponses
                  </div>
                  <button className="conv-mini-btn" style={{ marginTop: '0.5rem' }} onClick={openQuiz}>
                    Rejouer (10 autres questions)
                  </button>
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="quiz-history">
              <div className="sidebar-label">Historique sur cette fiche</div>
              {history.map((h, i) => (
                <div key={i} className="quiz-history-row">
                  {h.correct_count} / {h.total_count} — {new Date(h.created_at).toLocaleDateString('fr-FR')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
