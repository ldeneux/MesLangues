'use client';

import { useEffect, useMemo, useState } from 'react';
import { getVocabularyWords, setVocabularyFavorite, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import { themeLabelIn, natureLabelIn } from '../../lib/themeLabels';
import { VOCAB_THEMES, LANGS } from '../../lib/constants';
import VocabularyGamePanel from './VocabularyGamePanel';
import VocabularyStatsPanel from './VocabularyStatsPanel';
import DeleteWordModal from './DeleteWordModal';
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
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // « Inclure les niveaux précédents » (A2 à B2) : tout le vocabulaire des niveaux d'en dessous, pour réviser en même temps
  const [includePrevRaw, setIncludePrevRaw] = usePersistentFlag('vocab-include-previous', false);
  const includePrev = includePrevRaw && levelCode !== 'A1';
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
    getVocabularyWords(profileId, languageCode, levelCode, includePrev)
      .then(setWords)
      .catch((e: any) =>
        setError(
          e?.message?.includes('relation') || e?.message?.includes('vocabulary_words')
            ? "La table \"vocabulary_words\" n'existe pas encore — exécute la migration 006 dans Supabase."
            : e?.message ?? 'Erreur de chargement du vocabulaire.'
        )
      );
  }, [profileId, languageCode, levelCode, includePrev]);

  // Double-clic sur un mot (image ou carte) : fenêtre de suppression (ex. « la cuillère » / « une cuillère »)
  const [toDelete, setToDelete] = useState<VocabularyWordWithMastery | null>(null);

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
      (!masteredOnly || w.mastered) &&
      (!favoritesOnly || w.favorite)
  );
  const favoriteCount = (words ?? []).filter((w) => w.favorite && (themeFilter === 'all' || w.theme_code === themeFilter)).length;

  // Étoile : mise à jour immédiate, annulée si l'enregistrement échoue
  async function toggleFavorite(w: VocabularyWordWithMastery) {
    const next = !w.favorite;
    setWords((prev) => (prev ? prev.map((x) => (x.id === w.id ? { ...x, favorite: next } : x)) : prev));
    try {
      await setVocabularyFavorite(profileId, w.id, next);
    } catch (e: any) {
      setWords((prev) => (prev ? prev.map((x) => (x.id === w.id ? { ...x, favorite: !next } : x)) : prev));
      setError(e?.message ?? 'Impossible de modifier le favori.');
    }
  }

  // Titre en langue étrangère du thème et/ou de la nature choisis
  const themeTitle = themeFilter !== 'all' ? themeLabelIn(themeFilter, languageCode) : null;
  const natureTitle = typeFilter !== 'all' ? natureLabelIn(typeFilter, languageCode) : null;
  const foreignTitle = [themeTitle, natureTitle].filter(Boolean).join(' — ');

  // Liste paginée (images chargées à la demande ; japonais : lectures chargées seulement pour les mots affichés)
  const shown = filtered.slice(0, visible);
  useEffect(() => {
    setVisible(PAGE);
  }, [themeFilter, typeFilter, masteredOnly, favoritesOnly, words]);
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
      {levelCode !== 'A1' && (
        <label className="switch-row" title="Affiche aussi le vocabulaire des niveaux précédents (liste, test et statistiques)">
          <span className="switch">
            <input type="checkbox" checked={includePrev} onChange={(e) => setIncludePrevRaw(e.target.checked)} />
            <span className="switch-track" />
          </span>
          <span>Inclure les niveaux précédents</span>
          {includePrev && <span className="eyebrow-free" style={{ margin: 0 }}>(A1 → {levelCode})</span>}
        </label>
      )}
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
        <VocabularyGamePanel profileId={profileId} languageCode={languageCode} levelCode={levelCode} bcp47={bcp47} includePrevious={includePrev} />
      ) : subTab === 'stats' ? (
        <VocabularyStatsPanel profileId={profileId} languageCode={languageCode} levelCode={levelCode} includePrevious={includePrev} />
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
                <button className={`conv-mini-btn${favoritesOnly ? ' selected-mini' : ''}`} onClick={() => setFavoritesOnly((f) => !f)}>
                  ⭐ Favoris{favoriteCount > 0 ? ` (${favoriteCount})` : ''}
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

              {foreignTitle && (
                <h3 className="vocab-foreign-title" lang={languageCode}>
                  {foreignTitle}
                </h3>
              )}
              <p className="eyebrow-free">{filtered.length} mot(s)</p>

              <div className="lesson-word-grid">
                {shown.map((w) => (
                  <div
                    key={w.id}
                    className="lesson-word-card"
                    title="Double-clic : supprimer ce mot"
                    onDoubleClick={(e) => {
                      if ((e.target as HTMLElement).closest('.play-btn')) return; // double-clic sur ▶ = pas une suppression
                      setToDelete(w);
                    }}
                  >
                    <button
                      className={`fav-star${w.favorite ? ' on' : ''}`}
                      onClick={() => toggleFavorite(w)}
                      onDoubleClick={(e) => e.stopPropagation()}
                      aria-label={w.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      title={w.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      {w.favorite ? '★' : '☆'}
                    </button>
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
                        {includePrev && w.level_code && w.level_code !== levelCode && <span className="level-tag">{w.level_code}</span>}
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
      {toDelete && (
        <DeleteWordModal
          word={toDelete}
          languageCode={languageCode}
          levelCode={levelCode}
          onCancel={() => setToDelete(null)}
          onDeleted={(id) => {
            setWords((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
            setToDelete(null);
          }}
        />
      )}
    </div>
  );
}
