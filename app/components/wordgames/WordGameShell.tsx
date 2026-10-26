'use client';

import './wordgames.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { recordGameResult, type VocabularyWordWithMastery } from '../../../lib/vocabulary';
import { getGameWords } from '../../../lib/gameWords';
import { VOCAB_THEMES, type LangCode, type LevelCode } from '../../../lib/constants';

export type WordGameCtx = {
  pool: VocabularyWordWithMastery[]; // mots retenus par les filtres thème + maîtrise
  all: VocabularyWordWithMastery[]; // tout le vocabulaire du niveau (propositions fausses, etc.)
  record: (wordId: string, success: boolean) => void; // met à jour la maîtrise du mot
  lang: LangCode;
  level: LevelCode;
};

type Mastery = 'all' | 'seen' | 'unmastered';

/** Chargement du vocabulaire + options communes à tous les jeux de mots : thème (ou mélangé) et filtre de maîtrise. */
export default function WordGameShell({
  profileId,
  lang,
  level,
  minWords,
  children,
}: {
  profileId: string;
  lang: LangCode;
  level: LevelCode;
  minWords: number;
  children: (ctx: WordGameCtx) => ReactNode;
}) {
  const [words, setWords] = useState<VocabularyWordWithMastery[] | null>(null);
  const [theme, setTheme] = useState('all');
  const [mastery, setMastery] = useState<Mastery>('all');
  const [verbMode, setVerbMode] = useState<'inf' | 'forms' | 'none'>('inf'); // verbes : infinitif (par défaut), + formes conjuguées, ou aucun

  useEffect(() => {
    setWords(null);
    getGameWords(profileId, lang, level, verbMode === 'forms')
      .catch(() => [] as VocabularyWordWithMastery[])
      .then((list) => setWords(list ?? []));
  }, [profileId, lang, level, verbMode === 'forms']); // eslint-disable-line react-hooks/exhaustive-deps

  const themes = useMemo(() => {
    const present = new Set((words ?? []).map((w) => w.theme_code));
    return VOCAB_THEMES.filter((t) => present.has(t.code));
  }, [words]);

  const pool = useMemo(
    () =>
      (words ?? []).filter(
        (w) =>
          (verbMode !== 'none' || w.word_type !== 'verbe') &&
          (theme === 'all' || w.theme_code === theme) &&
          (mastery === 'all' || (mastery === 'seen' ? w.success_count + w.fail_count > 0 : !w.mastered))
      ),
    [words, theme, mastery, verbMode]
  );

  if (words === null) return <p className="eyebrow-free">Chargement…</p>;
  if (words.length === 0) return <p className="eyebrow-free">Pas encore de vocabulaire téléchargé — va dans l'onglet "Packs".</p>;

  const record = (wordId: string, success: boolean) => {
    recordGameResult(profileId, wordId, 'word', success).catch(() => {});
  };

  return (
    <div>
      <div className="wg-filters">
        <label>
          Thème
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="all">Tous les thèmes (mélangés)</option>
            {themes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vocabulaire
          <select value={mastery} onChange={(e) => setMastery(e.target.value as Mastery)}>
            <option value="all">Tout le vocabulaire</option>
            <option value="seen">Seulement déjà vu / appris</option>
            <option value="unmastered">Seulement pas encore su (révision)</option>
          </select>
        </label>
        {lang !== 'ja' ? (
          <label>
            Verbes
            <select value={verbMode} onChange={(e) => setVerbMode(e.target.value as 'inf' | 'forms' | 'none')}>
              <option value="inf">Avec les verbes (infinitif)</option>
              <option value="forms">Avec les verbes conjugués</option>
              <option value="none">Sans les verbes</option>
            </select>
          </label>
        ) : null}
        <span className="wg-note">{pool.length} mot{pool.length > 1 ? 's' : ''} retenu{pool.length > 1 ? 's' : ''}</span>
      </div>
      {pool.length < minWords ? (
        <p className="wg-msg">
          Pas assez de mots pour ce filtre ({pool.length}, il en faut au moins {minWords}). Élargis le thème ou le filtre de vocabulaire.
        </p>
      ) : (
        <div key={`${theme}|${mastery}`}>{children({ pool, all: words, record, lang, level })}</div>
      )}
    </div>
  );
}
