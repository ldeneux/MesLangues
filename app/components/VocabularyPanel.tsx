'use client';

import { useEffect, useMemo, useState } from 'react';
import { getVocabularyWords, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import { VOCAB_THEMES, LANGS } from '../../lib/constants';
import VocabularyGamePanel from './VocabularyGamePanel';
import VocabularyStatsPanel from './VocabularyStatsPanel';
import JapaneseRuby from './JapaneseRuby';
import { imageUrl } from '../../lib/imageName';
import { usePersistentFlag } from './usePersistentFlag';
import { useJapaneseReadings } from './useJapaneseReadings';

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
  // '' = pas encore choisi : on arrive sur le premier thème de la liste (page plus légère), « Tous les thèmes » reste un choix
  const [themeChoice, setThemeChoice] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [masteredOnly, setMasteredOnly] = useState(false);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const isJa = languageCode === 'ja';
  const [furigana, setFurigana] = usePersistentFlag('ja-furigana', levelCode === 'A1' || levelCode === 'A2');
  const [romaji, setRomaji] = usePersistentFlag('ja-romaji');
  const [visible, setVisible] = useState(60);
  const PAGE = 60;

  const bcp47 = LANGS.find((l) => l.code === languageCode)?.bcp47 ?? 'en-GB';

  useEffect(() => {
    setWords(null);
    setThemeChoice('');
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
  const availableThemes = VOCAB_THEMES.filter((t) => usedThemeCodes.has(t.code));
  const themeFilter = themeChoice || availableThemes[0]?.code || 'all';

  const filtered = (words ?? []).filter(
    (w) =>
      (themeFilter === 'all' || w.theme_code === themeFilter) &&
      (typeFilter === 'all' || w.word_type === typeFilter) &&
      (!masteredOnly || w.mastered)
  );

  // Liste paginée (images chargées à la demande ; japonais : lectures chargées seulement pour les mots affichés)
  const shown = filtered.slice(0, visible);
  useEffect(() => {
    setVisible(PAGE);
  }, [themeFilter, typeFilter, masteredOnly, words]);
  const { readings, error: readingError, loading: readingLoading } = useJapaneseReadings(
    isJa ? shown.map((w) => w.target_text) : [],
    isJa && subTab === 'list' && (furigana || romaji)
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
                <select className="cascade-select" value={themeFilter} onChange={(e) => setThemeChoice(e.target.value)}>
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

              {isJa && (
                <div className="conv-bubble-actions" style={{ marginBottom: '1rem' }}>
                  <button className={`conv-mini-btn${furigana ? ' active' : ''}`} onClick={() => setFurigana(!furigana)}>
                    Furigana : {furigana ? 'oui' : 'non'}
                  </button>
                  <button className={`conv-mini-btn${romaji ? ' active' : ''}`} onClick={() => setRomaji(!romaji)}>
                    Rōmaji : {romaji ? 'oui' : 'non'}
                  </button>
                  {readingLoading && <span className="eyebrow-free" style={{ marginBottom: 0 }}>Chargement des lectures…</span>}
                </div>
              )}
              {readingError && <p className="conv-warning">{readingError}</p>}

              <p className="eyebrow-free">{filtered.length} mot(s)</p>

              <div className="lesson-word-grid">
                {shown.map((w) => (
                  <div key={w.id} className="lesson-word-card">
                    {w.image && (
                      <div className="lesson-word-img">
                        <img src={imageUrl(w.image)} alt="" loading="lazy" />
                      </div>
                    )}
                    <div className="lesson-word-card-body">
                      <button
                        className={`play-btn${playingId === w.id ? ' playing' : ''}`}
                        onClick={() => play(w)}
                        disabled={!w.audio_url}
                        aria-label="Écouter"
                      >
                        {playingId === w.id ? '❚❚' : '▶'}
                      </button>
                      <div className="lesson-word-body">
                        <div className="lesson-word-text">
                          {isJa && furigana && readings[w.target_text] ? (
                            <JapaneseRuby ruby={readings[w.target_text].ruby} />
                          ) : (
                            <span lang={isJa ? 'ja' : undefined}>{w.target_text}</span>
                          )}
                        </div>
                        {isJa && romaji && readings[w.target_text]?.romaji && (
                          <div className="phrase-notes">{readings[w.target_text].romaji}</div>
                        )}
                        <div className="lesson-word-fr">{w.translation_fr}</div>
                        {w.mastered && <span className="mastery-badge">✅ Acquis</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {shown.length < filtered.length && (
                <button className="secondary" style={{ marginTop: '1rem' }} onClick={() => setVisible((v) => v + PAGE)}>
                  Afficher {Math.min(PAGE, filtered.length - shown.length)} mots de plus (reste {filtered.length - shown.length})
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
