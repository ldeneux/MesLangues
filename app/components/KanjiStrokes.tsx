'use client';

import { useEffect, useState } from 'react';
import { loadKanjiPaths } from './kanjiPaths';

export default function KanjiStrokes({ char }: { char: string }) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [runId, setRunId] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setShowAll(false);
    setRunId((n) => n + 1);
    setPaths(null);
    loadKanjiPaths(char)
      .then((ds) => {
        if (!cancelled) setPaths(ds);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [char]);

  if (error) return <p className="eyebrow-free">Tracé indisponible pour le moment (connexion ?).</p>;
  if (!paths) return <p className="eyebrow-free">Chargement du tracé…</p>;

  return (
    <div className="kanji-strokes">
      <svg className="kanji-svg" viewBox="0 0 109 109" width="200" height="200" role="img" aria-label={`Ordre des traits de ${char}`}>
        <line x1="54.5" y1="0" x2="54.5" y2="109" className="kanji-guide" />
        <line x1="0" y1="54.5" x2="109" y2="54.5" className="kanji-guide" />
        {paths.map((d, i) => (
          <path
            key={`${runId}-${showAll}-${i}`}
            d={d}
            pathLength={1}
            className={showAll ? '' : 'kanji-stroke-anim'}
            style={showAll ? undefined : { animationDelay: `${i * 0.8}s` }}
          />
        ))}
      </svg>
      <div className="conv-bubble-actions">
        <button className="conv-mini-btn" onClick={() => { setShowAll(false); setRunId((n) => n + 1); }}>
          ▶ Rejouer le tracé
        </button>
        <button className={`conv-mini-btn${showAll ? ' active' : ''}`} onClick={() => setShowAll((s) => !s)}>
          Voir tous les traits
        </button>
        <span className="eyebrow-free" style={{ marginBottom: 0 }}>
          {paths.length} traits
        </span>
      </div>
    </div>
  );
}
