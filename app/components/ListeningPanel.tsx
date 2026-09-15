'use client';

import { useEffect, useState } from 'react';
import { getArticles, getArticle, generateArticle, type ArticleSummary, type Article } from '../../lib/articles';

export default function ListeningPanel({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [summaries, setSummaries] = useState<ArticleSummary[] | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [revealedFr, setRevealedFr] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const list = await getArticles(languageCode, levelCode);
    setSummaries(list);
    return list;
  }

  useEffect(() => {
    setSummaries(null);
    setArticle(null);
    refresh().then((list) => {
      if (list[0]) selectArticle(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  async function selectArticle(id: string) {
    setArticle(null);
    setRevealed(false);
    setRevealedFr(false);
    const a = await getArticle(id);
    setArticle(a);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const a = await generateArticle(languageCode, levelCode);
      await refresh();
      setArticle(a);
      setRevealed(false);
      setRevealedFr(false);
    } catch (e: any) {
      setError(e.message ?? "Erreur pendant la génération de l'article.");
    } finally {
      setGenerating(false);
    }
  }

  if (summaries === null) return <p className="eyebrow-free">Chargement…</p>;

  return (
    <div>
      <p className="eyebrow-free">
        Écoute de courts articles façon presse locale (contenu générique, pas de vraie actualité datée), avec les
        mêmes options d'affichage texte/traduction que "Phrases du jour".
      </p>

      {summaries.length > 0 && (
        <div className="date-chips">
          {summaries.map((s) => (
            <button
              key={s.id}
              className={`date-chip${article?.id === s.id ? ' active' : ''}`}
              onClick={() => selectArticle(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {error && <p className="conv-warning">{error}</p>}

      <button className="secondary" onClick={handleGenerate} disabled={generating}>
        {generating ? 'Génération en cours…' : '+ Générer un nouvel article'}
      </button>

      {summaries.length === 0 && !generating && (
        <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
          Aucun article pour ce niveau pour l'instant — génère le premier avec le bouton ci-dessus.
        </p>
      )}

      {article && (
        <div className="phrase-card phrase-card-big" style={{ marginTop: '1.25rem' }}>
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
        </div>
      )}
    </div>
  );
}
