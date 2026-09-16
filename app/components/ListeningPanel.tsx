'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getArticles,
  getArticle,
  generateArticle,
  deleteArticle,
  getOrCreateComprehensionQuestions,
  saveComprehensionResult,
  getComprehensionHistory,
  type ArticleSummary,
  type Article,
  type ComprehensionQuestion,
  type ComprehensionResult,
} from '../../lib/articles';
import { THEMES } from '../../lib/constants';

export default function ListeningPanel({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
}) {
  const [summaries, setSummaries] = useState<ArticleSummary[] | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [revealed, setRevealed] = useState(false);
  const [revealedFr, setRevealedFr] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  // Quiz de compréhension
  const [quizOpen, setQuizOpen] = useState(false);
  const [questions, setQuestions] = useState<ComprehensionQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);
  const [history, setHistory] = useState<ComprehensionResult[]>([]);

  async function refresh() {
    const list = await getArticles(languageCode, levelCode);
    setSummaries(list);
    return list;
  }

  useEffect(() => {
    setSummaries(null);
    setArticle(null);
    setThemeFilter('all');
    setLoadError('');
    refresh()
      .then((list) => {
        if (list[0]) selectArticle(list[0].id);
      })
      .catch((e: any) => {
        setSummaries([]);
        setLoadError(
          e?.message?.includes('relation') || e?.message?.includes('listening_')
            ? "Des tables du mode Écoute n'existent pas encore en base — exécute les migrations 003 et 004 dans Supabase."
            : e?.message ?? 'Erreur de chargement des articles.'
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  async function selectArticle(id: string) {
    setArticle(null);
    setRevealed(false);
    setRevealedFr(false);
    resetQuiz();
    const a = await getArticle(id);
    setArticle(a);
    if (a) {
      getComprehensionHistory(profileId, a.id).then(setHistory);
    }
  }

  function resetQuiz() {
    setQuizOpen(false);
    setQuestions(null);
    setAnswers({});
    setQuizScore(null);
  }

  function pickRandom() {
    if (!summaries || summaries.length === 0) return;
    const random = summaries[Math.floor(Math.random() * summaries.length)];
    setThemeFilter('all');
    selectArticle(random.id);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const a = await generateArticle(languageCode, levelCode, themeFilter === 'all' ? undefined : themeFilter);
      await refresh();
      setArticle(a);
      setRevealed(false);
      setRevealedFr(false);
      resetQuiz();
      setHistory([]);
    } catch (e: any) {
      setError(e.message ?? "Erreur pendant la génération de l'article.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteCurrent() {
    if (!article) return;
    await deleteArticle(article.id);
    const list = await refresh();
    setArticle(null);
    if (list[0]) selectArticle(list[0].id);
  }

  async function openQuiz() {
    if (!article) return;
    setQuizOpen(true);
    setQuizScore(null);
    setAnswers({});
    const q = await getOrCreateComprehensionQuestions(article.id);
    setQuestions(q);
  }

  async function submitQuiz() {
    if (!questions || !article) return;
    const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
    setQuizScore({ correct, total: questions.length });
    await saveComprehensionResult(profileId, article.id, correct, questions.length);
    getComprehensionHistory(profileId, article.id).then(setHistory);
  }

  const usedThemeCodes = useMemo(
    () => new Set((summaries ?? []).map((s) => s.theme_code).filter(Boolean) as string[]),
    [summaries]
  );
  const availableThemes = THEMES.filter((t) => usedThemeCodes.has(t.code));
  const filteredSummaries =
    themeFilter === 'all' ? summaries ?? [] : (summaries ?? []).filter((s) => s.theme_code === themeFilter);

  if (summaries === null) return <p className="eyebrow-free">Chargement…</p>;

  if (loadError) return <p className="conv-warning">{loadError}</p>;

  return (
    <div>
      <p className="eyebrow-free">
        Écoute de courts articles façon presse locale (contenu générique, pas de vraie actualité datée), avec les
        mêmes options d'affichage texte/traduction que "Phrases du jour", et un quiz de compréhension noté.
      </p>

      <div className="cascade-row">
        <select className="cascade-select" value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
          <option value="all">Tous les thèmes</option>
          {availableThemes.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          className="cascade-select"
          value={article?.id ?? ''}
          onChange={(e) => selectArticle(e.target.value)}
          disabled={filteredSummaries.length === 0}
        >
          {filteredSummaries.length === 0 && <option value="">Aucun article dans ce thème</option>}
          {filteredSummaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>

        <button className="secondary" onClick={pickRandom} disabled={summaries.length === 0}>
          🎲 Aléatoire
        </button>
      </div>

      {error && <p className="conv-warning">{error}</p>}

      <div className="conv-bubble-actions" style={{ marginBottom: '1rem' }}>
        <button className="secondary" onClick={handleGenerate} disabled={generating}>
          {generating
            ? 'Génération en cours…'
            : `+ Générer un article${themeFilter !== 'all' ? ` (${THEMES.find((t) => t.code === themeFilter)?.label})` : ''}`}
        </button>
        {article && (
          <button className="conv-mini-btn" onClick={handleDeleteCurrent}>
            Supprimer cet article
          </button>
        )}
      </div>

      {summaries.length === 0 && !generating && (
        <p className="eyebrow-free">Aucun article pour ce niveau pour l'instant — génère le premier ci-dessus.</p>
      )}

      {article && (
        <div className="phrase-card phrase-card-big">
          <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {article.title}
          </div>

          {article.audio_url ? (
            <audio className="phrase-audio" controls src={article.audio_url} />
          ) : (
            <div className="phrase-notes">Audio en cours de génération, réessaie dans une minute.</div>
          )}

          {revealed ? (
            <div className="phrase-target" style={{ fontSize: '1.05rem', lineHeight: 1.6 }}>
              {article.content}
            </div>
          ) : (
            <div className="conv-hidden-text">🔊 (écoute l'audio)</div>
          )}

          {revealedFr && (
            <div className="phrase-fr" style={{ lineHeight: 1.6 }}>
              {article.content_fr}
            </div>
          )}

          <div className="conv-bubble-actions">
            <button className="conv-mini-btn" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Masquer le texte' : 'Afficher le texte'}
            </button>
            <button className="conv-mini-btn" onClick={() => setRevealedFr((r) => !r)}>
              {revealedFr ? 'Masquer la traduction' : 'Afficher la traduction'}
            </button>
          </div>

          {!quizOpen ? (
            <button className="primary" style={{ marginTop: '1rem' }} onClick={openQuiz}>
              Tester ma compréhension
            </button>
          ) : (
            <div className="quiz-block">
              {questions === null && <p className="eyebrow-free">Préparation des questions…</p>}

              {questions && quizScore === null && (
                <>
                  {questions.map((q) => (
                    <div key={q.id} className="quiz-question">
                      <div className="quiz-question-text">{q.question}</div>
                      <div className="quiz-options">
                        {q.options.map((opt, i) => (
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
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="quiz-history">
              <div className="sidebar-label">Historique de compréhension sur cet article</div>
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
