'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getVocabularyScores,
  resetWordProgress,
  resetAllVocabularyProgress,
  type VocabularyScoreEntry,
} from '../../lib/vocabulary';

const BUCKET_SIZE = 10;

// Rouge (0%) -> vert (100%), en passant par un jaune/orange au milieu.
function scoreColor(pct: number) {
  const hue = (pct / 100) * 120; // 0 = rouge, 120 = vert
  return `hsl(${hue}, 65%, 45%)`;
}

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
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    setEntries(null);
    getVocabularyScores(profileId, languageCode, levelCode).then(setEntries);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleResetWord(wordId: string) {
    setError('');
    try {
      await resetWordProgress(profileId, wordId);
      setEntries((prev) => (prev ? prev.filter((e) => e.id !== wordId) : prev));
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la remise à zéro.');
    }
  }

  async function handleClearAll() {
    setConfirmingClearAll(false);
    setError('');
    try {
      await resetAllVocabularyProgress(profileId, languageCode, levelCode);
      refresh();
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la remise à zéro globale.');
    }
  }

  if (entries === null) return <p className="eyebrow-free">Chargement des statistiques…</p>;

  if (entries.length === 0) {
    return (
      <p className="eyebrow-free">
        Aucun mot pratiqué pour l'instant — les scores apparaîtront ici après des parties du mode Test.
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
      <div className="conv-bubble-actions" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <p className="eyebrow-free" style={{ margin: 0 }}>
          {entries.length} mot(s) pratiqué(s) au moins une fois (les mots jamais joués sont exclus).
        </p>
        <button className="conv-mini-btn" onClick={() => setConfirmingClearAll(true)}>
          🗑️ Effacer toutes les statistiques
        </button>
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {confirmingClearAll && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Ça va effacer le score succès/échec de <strong>tous les mots</strong> de cette langue et ce niveau,
              pour cet apprenant. Irréversible.
            </p>
            <div className="profile-create-actions">
              <button className="secondary" onClick={() => setConfirmingClearAll(false)}>
                Annuler
              </button>
              <button className="primary" onClick={handleClearAll}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="stats-histogram">
        {buckets.map((count, i) => {
          const midPct = i * BUCKET_SIZE + 5;
          return (
            <div key={i} className="stats-bar-col">
              <div className="stats-bar-count">{count}</div>
              <div
                className="stats-bar"
                style={{
                  height: `${(count / maxBucketCount) * 80 + (count > 0 ? 6 : 0)}px`,
                  background: scoreColor(midPct),
                }}
              />
              <div className="stats-bar-label">
                {i * BUCKET_SIZE}-{i * BUCKET_SIZE + 10}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="stats-slider-block">
        <div className="sidebar-label">
          Filtrer par score : {min}% — {max}%
        </div>
        <div className="stats-slider-row">
          <input type="range" min={0} max={100} value={min} onChange={(e) => handleMinChange(Number(e.target.value))} />
          <input type="range" min={0} max={100} value={max} onChange={(e) => handleMaxChange(Number(e.target.value))} />
        </div>
      </div>

      <p className="eyebrow-free">{filtered.length} mot(s) dans cette plage</p>

      <div className="revision-grid">
        {filtered.map((e) => (
          <div key={e.id} className="revision-card">
            <div className="revision-card-text">
              <div className="revision-target">
                {e.target_text}
                <span className="mastery-badge" style={{ color: scoreColor(e.score) }}>
                  {e.score}% ({e.success_count}✓ / {e.fail_count}✗)
                </span>
              </div>
              <div className="revision-fr">{e.translation_fr}</div>
            </div>
            <button
              className="stats-reset-btn"
              onClick={() => handleResetWord(e.id)}
              aria-label="Effacer les statistiques de ce mot"
              title="Effacer les statistiques de ce mot"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
