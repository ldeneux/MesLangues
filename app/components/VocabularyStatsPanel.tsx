'use client';

import { useEffect, useMemo, useState } from 'react';
import { getVocabularyScores, type VocabularyScoreEntry } from '../../lib/vocabulary';

const BUCKET_SIZE = 10;

export default function VocabularyStatsPanel({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
}) {
  const [entries, setEntries] = useState<VocabularyScoreEntry[] | null>(null);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);

  useEffect(() => {
    setEntries(null);
    getVocabularyScores(profileId, languageCode, levelCode).then(setEntries);
  }, [profileId, languageCode, levelCode]);

  const buckets = useMemo(() => {
    const counts = new Array(10).fill(0);
    for (const e of entries ?? []) {
      const idx = Math.min(9, Math.floor(e.score / BUCKET_SIZE));
      counts[idx]++;
    }
    return counts;
  }, [entries]);

  const maxBucketCount = Math.max(1, ...buckets);

  if (entries === null) return <p className="eyebrow-free">Chargement des statistiques…</p>;

  if (entries.length === 0) {
    return (
      <p className="eyebrow-free">
        Aucun mot pratiqué pour l'instant — les scores apparaîtront ici après des parties du mode Jeu.
      </p>
    );
  }

  const filtered = entries.filter((e) => e.score >= min && e.score <= max);

  function handleMinChange(v: number) {
    setMin(Math.min(v, max));
  }
  function handleMaxChange(v: number) {
    setMax(Math.max(v, min));
  }

  return (
    <div>
      <p className="eyebrow-free">
        {entries.length} mot(s) pratiqué(s) au moins une fois (les mots jamais joués sont exclus des statistiques).
      </p>

      <div className="stats-histogram">
        {buckets.map((count, i) => (
          <div key={i} className="stats-bar-col">
            <div className="stats-bar-count">{count}</div>
            <div
              className="stats-bar"
              style={{ height: `${(count / maxBucketCount) * 80 + (count > 0 ? 6 : 0)}px` }}
            />
            <div className="stats-bar-label">
              {i * BUCKET_SIZE}-{i * BUCKET_SIZE + 10}%
            </div>
          </div>
        ))}
      </div>

      <div className="stats-slider-block">
        <div className="sidebar-label">Filtrer par score : {min}% — {max}%</div>
        <div className="stats-slider-row">
          <input
            type="range"
            min={0}
            max={100}
            value={min}
            onChange={(e) => handleMinChange(Number(e.target.value))}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={max}
            onChange={(e) => handleMaxChange(Number(e.target.value))}
          />
        </div>
      </div>

      <p className="eyebrow-free">{filtered.length} mot(s) dans cette plage</p>

      <div className="revision-grid">
        {filtered.map((e) => (
          <div key={e.id} className="revision-card">
            <div className="revision-card-text">
              <div className="revision-target">
                {e.target_text}
                <span className="mastery-badge" style={{ color: 'var(--ink-soft)' }}>
                  {e.score}% ({e.success_count}✓ / {e.fail_count}✗)
                </span>
              </div>
              <div className="revision-fr">{e.translation_fr}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
