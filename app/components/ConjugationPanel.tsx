'use client';

import { useEffect, useRef, useState } from 'react';
import { getConjugationVerbs, type ConjugationVerb } from '../../lib/conjugation';
import { THEMES, CONJUGATION_TARGET, LANGS } from '../../lib/constants';
import { speak } from '../../lib/speech';
import { displayInfinitive } from '../../lib/conjugationDisplay';
import ConjugationTables from './ConjugationTables';
import JapaneseConjugationDetail from './JapaneseConjugationDetail';

type SortMode = 'frequency' | 'theme';

function themeLabel(code: string | null) {
  return THEMES.find((t) => t.code === code)?.label ?? 'Autre';
}

export default function ConjugationPanel({ languageCode, levelCode = 'A1' }: { languageCode: string; levelCode?: string }) {
  const [verbs, setVerbs] = useState<ConjugationVerb[] | null>(null);
  const [selected, setSelected] = useState<ConjugationVerb | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('frequency');
  const [error, setError] = useState('');
  const [playingInf, setPlayingInf] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Infinitif : audio enregistré s'il existe, sinon voix du navigateur (même règle que dans les leçons).
  function stopInfinitive() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlayingInf(false);
  }

  function playInfinitive(v: ConjugationVerb) {
    if (playingInf) {
      stopInfinitive();
      return;
    }
    stopInfinitive();
    const url = v.tense_audio?.infinitive ?? null;
    if (url) {
      const el = new Audio(url);
      audioRef.current = el;
      setPlayingInf(true);
      el.onended = () => setPlayingInf(false);
      el.play().catch(() => setPlayingInf(false));
      return;
    }
    const bcp47 = LANGS.find((l) => l.code === languageCode)?.bcp47 ?? 'en-US';
    if (speak(displayInfinitive(v.infinitive, languageCode), bcp47)) {
      setPlayingInf(true);
      window.setTimeout(() => setPlayingInf(false), 1500);
    }
  }

  // changer de verbe ou de langue coupe le son en cours
  useEffect(() => {
    stopInfinitive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, languageCode]);

  useEffect(() => () => stopInfinitive(), []);

  useEffect(() => {
    setVerbs(null);
    setSelected(null);
    getConjugationVerbs(languageCode, levelCode)
      .then((list) => {
        setVerbs(list);
        if (list[0]) setSelected(list[0]);
      })
      .catch((e: any) =>
        setError(
          e?.message?.includes('relation') || e?.message?.includes('conjugation_verbs')
            ? "La table \"conjugation_verbs\" n'existe pas encore — exécute les migrations 005 et 006 dans Supabase."
            : e?.message ?? 'Erreur de chargement.'
        )
      );
  }, [languageCode, levelCode]);

  if (verbs === null && !error) return <p className="eyebrow-free">Chargement des verbes…</p>;

  const sorted = [...(verbs ?? [])].sort((a, b) =>
    sortMode === 'frequency'
      ? a.frequency_rank - b.frequency_rank
      : themeLabel(a.theme_code).localeCompare(themeLabel(b.theme_code)) || a.frequency_rank - b.frequency_rank
  );

  return (
    <div>
      <p className="eyebrow-free">
        {verbs?.length ?? 0} / {CONJUGATION_TARGET} verbes pour ce niveau —{' '}
        {languageCode === 'ja'
          ? 'formes poli / familier, en て, négation, passé, potentiel, passif… (selon ton niveau).'
          : 'présent, futur simple, passé composé, imparfait.'}
      </p>

      {error && <p className="conv-warning">{error}</p>}

      {(verbs?.length ?? 0) === 0 && !error && (
        <p className="eyebrow-free">
          Aucun verbe téléchargé pour ce niveau — va dans l'onglet "Packs" et clique sur « Télécharger les verbes ».
        </p>
      )}

      {(verbs?.length ?? 0) > 0 && (
        <>
          <div className="conv-bubble-actions" style={{ marginBottom: '1rem' }}>
            <button
              className={`conv-mini-btn${sortMode === 'frequency' ? ' selected-mini' : ''}`}
              onClick={() => setSortMode('frequency')}
            >
              Trier par fréquence
            </button>
            <button
              className={`conv-mini-btn${sortMode === 'theme' ? ' selected-mini' : ''}`}
              onClick={() => setSortMode('theme')}
            >
              Trier par thème
            </button>
          </div>

          <div className="conjugation-layout">
            <div className="conjugation-list">
              {sorted.map((v, i) => {
                const showHeader =
                  sortMode === 'theme' && (i === 0 || themeLabel(sorted[i - 1].theme_code) !== themeLabel(v.theme_code));
                return (
                  <div key={v.id}>
                    {showHeader && <div className="conjugation-theme-header">{themeLabel(v.theme_code)}</div>}
                    <button
                      className={`conjugation-list-item${selected?.id === v.id ? ' active' : ''}`}
                      onClick={() => setSelected(v)}
                    >
                      <span>{displayInfinitive(v.infinitive, languageCode)}</span>
                      <span className="conjugation-list-fr">
                        {v.translation_fr}
                        {sortMode === 'frequency' && ` · ${themeLabel(v.theme_code)}`}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            {selected && languageCode === 'ja' && selected.ja_data && (
              <JapaneseConjugationDetail verb={selected} levelCode={levelCode} />
            )}

            {selected && !(languageCode === 'ja') && (
              <div className="phrase-card conjugation-detail">
                <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    className={`play-btn${playingInf ? ' playing' : ''}`}
                    onClick={() => playInfinitive(selected)}
                    aria-label={`Écouter ${displayInfinitive(selected.infinitive, languageCode)}`}
                  >
                    {playingInf ? '❚❚' : '▶'}
                  </button>
                  <span>
                    {displayInfinitive(selected.infinitive, languageCode)} <span className="revision-fr">— {selected.translation_fr}</span>
                  </span>
                </div>
                <p className="eyebrow-free">{themeLabel(selected.theme_code)}</p>

                <ConjugationTables verb={selected} languageCode={languageCode} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
