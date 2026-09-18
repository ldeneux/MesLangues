'use client';

import { useEffect, useMemo, useState } from 'react';
import { getVocabularyWords, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import { THEMES, LANGS } from '../../lib/constants';
import VocabularyGamePanel from './VocabularyGamePanel';
import VocabularyStatsPanel from './VocabularyStatsPanel';

const WORD_TYPES = [
  { code: 'nom', label: 'Noms' },
  { code: 'adjectif', label: 'Adjectifs' },
  { code: 'adverbe', label: 'Adverbes' },
  { code: 'expression', label: 'Expressions' },
];

type SubTab = 'list' | 'game' | 'stats';

export default function VocabularyPanel({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
}) {
  const [subTab, setSubTab] = useState<SubTab>('list');
  const [words, setWords] = useState<VocabularyWordWithMastery[] | null>(null);
  const [themeFilter, setThemeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [masteredOnly, setMasteredOnly] = useState(false);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const bcp47 = LANGS.find((l) => l.code === languageCode)?.bcp47 ?? 'en-GB';

  useEffect(() => {
    setWords(null);
    setError('');
    getVocabularyWords(profileId, languageCode, levelCode)
      .then(setWords)
      .catch((e: any) =>
        setError(
          e?.message?.includes('relation') || e?.message?.includes('vocabulary_words')
            ? "La table \"vocabulary_words\" n'existe pas encore — exécute la migration 006 dans Supabase."
            : e?.message ?? 'Erreur de chargement du vocabulaire.'
        )
      );
  }, [profileId, languageCode, levelCode]);

  const usedThemeCodes = useMemo(
    () => new Set((words ?? []).map((w) => w.theme_code)),
    [words]
  );
  const availableThemes = THEMES.filter((t) => usedThemeCodes.has(t.code));

  const filtered = (words ?? []).filter(
    (w) =>
      (themeFilter === 'all' || w.theme_code === themeFilter) &&
      (typeFilter === 'all' || w.word_type === typeFilter) &&
      (!masteredOnly || w.mastered)
  );

  function play(word: VocabularyWordWithMastery) {
    if (!word.audio_url) return;
    setPlayingId(word.id);
    const el = new Audio(word.audio_url);
    el.onended = () => setPlayingId(null);
    el.play().catch(() => setPlayingId(null));
  }

  return (
    <div>
      <div className="subtab-row">
        <button className={`subtab-btn${subTab === 'list' ? ' active' : ''}`} onClick={() => setSubTab('list')}>
          Liste
        </button>
        <button className={`subtab-btn${subTab === 'game' ? ' active' : ''}`} onClick={() => setSubTab('game')}>
          Test
        </button>
        <button className={`subtab-btn${subTab === 'stats' ? ' active' : ''}`} onClick={() => setSubTab('stats')}>
          Statistiques
        </button>
      </div>

      {subTab === 'game' ? (
        <VocabularyGamePanel profileId={profileId} languageCode={languageCode} levelCode={levelCode} bcp47={bcp47} />
      ) : subTab === 'stats' ? (
        <VocabularyStatsPanel profileId={profileId} languageCode={languageCode} levelCode={levelCode} />
      ) : (
        <>
          {error && <p className="conv-warning">{error}</p>}

          {words === null && !error && <p className="eyebrow-free">Chargement du vocabulaire…</p>}

          {words && words.length === 0 && !error && (
            <p className="eyebrow-free">
              Aucun vocabulaire téléchargé pour ce niveau — va dans l'onglet "Packs" pour en télécharger.
            </p>
          )}

          {words && words.length > 0 && (
            <>
              <div className="cascade-row">
                <select className="cascade-select" value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
                  <option value="all">Tous les thèmes</option>
                  {availableThemes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select className="cascade-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Toutes natures</option>
                  {WORD_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="conv-bubble-actions" style={{ marginBottom: '1rem' }}>
                <button
                  className={`conv-mini-btn${masteredOnly ? ' selected-mini' : ''}`}
                  onClick={() => setMasteredOnly((m) => !m)}
                >
                  ✅ Vocabulaire acquis uniquement
                </button>
              </div>

              <p className="eyebrow-free">{filtered.length} mot(s)</p>

              <div className="revision-grid">
                {filtered.map((w) => (
                  <div key={w.id} className="revision-card">
                    <button
                      className={`play-btn${playingId === w.id ? ' playing' : ''}`}
                      onClick={() => play(w)}
                      disabled={!w.audio_url}
                      aria-label="Écouter"
                    >
                      {playingId === w.id ? '❚❚' : '▶'}
                    </button>
                    <div className="revision-card-text">
                      <div className="revision-target">
                        {w.target_text}
                        {w.mastered && <span className="mastery-badge">✅ Acquis</span>}
                      </div>
                      <div className="revision-fr">{w.translation_fr}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
