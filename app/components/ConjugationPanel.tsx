'use client';

import { useEffect, useState } from 'react';
import { getConjugationVerbs, type ConjugationVerb } from '../../lib/conjugation';
import { THEMES, CONJUGATION_TARGET } from '../../lib/constants';
import { splitEnding } from '../../lib/conjugationHighlight';

const TENSE_LABELS: Record<string, string> = {
  present: 'Présent',
  futur: 'Futur simple',
  passe_compose: 'Passé composé',
  imparfait: 'Imparfait',
};

const PRONOUNS_FR = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

type SortMode = 'frequency' | 'theme';

function themeLabel(code: string | null) {
  return THEMES.find((t) => t.code === code)?.label ?? 'Autre';
}

export default function ConjugationPanel({ languageCode }: { languageCode: string }) {
  const [verbs, setVerbs] = useState<ConjugationVerb[] | null>(null);
  const [selected, setSelected] = useState<ConjugationVerb | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('frequency');
  const [error, setError] = useState('');

  useEffect(() => {
    setVerbs(null);
    setSelected(null);
    getConjugationVerbs(languageCode)
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
  }, [languageCode]);

  if (verbs === null && !error) return <p className="eyebrow-free">Chargement des verbes…</p>;

  const sorted = [...(verbs ?? [])].sort((a, b) =>
    sortMode === 'frequency'
      ? a.frequency_rank - b.frequency_rank
      : themeLabel(a.theme_code).localeCompare(themeLabel(b.theme_code)) || a.frequency_rank - b.frequency_rank
  );

  return (
    <div>
      <p className="eyebrow-free">
        {verbs?.length ?? 0} / {CONJUGATION_TARGET} verbes générés pour cette langue — présent, futur simple, passé
        composé, imparfait.
      </p>

      {error && <p className="conv-warning">{error}</p>}

      {(verbs?.length ?? 0) === 0 && !error && (
        <p className="eyebrow-free">
          Aucun verbe téléchargé pour l'instant — va dans l'onglet "Packs" et clique sur "Grammaire et conjugaison".
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
                      <span>{v.infinitive}</span>
                      <span className="conjugation-list-fr">
                        {v.translation_fr}
                        {sortMode === 'frequency' && ` · ${themeLabel(v.theme_code)}`}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            {selected && (
              <div className="phrase-card conjugation-detail">
                <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.1rem' }}>
                  {selected.infinitive} <span className="revision-fr">— {selected.translation_fr}</span>
                </div>
                <p className="eyebrow-free">{themeLabel(selected.theme_code)}</p>

                {Object.entries(TENSE_LABELS).map(([key, label]) => (
                  <div key={key} className="conjugation-tense-block">
                    <div className="conjugation-tense-title-row">
                      <div className="conjugation-tense-title">{label}</div>
                      {selected.tense_audio?.[key as keyof typeof selected.tense_audio] && (
                        <audio
                          className="conjugation-tense-audio"
                          controls
                          src={selected.tense_audio[key as keyof typeof selected.tense_audio]}
                        />
                      )}
                    </div>
                    <div className="conjugation-forms">
                      {(selected.tenses[key as keyof typeof selected.tenses] ?? []).map((form, i) => {
                        const split = splitEnding(form, languageCode, key);
                        return (
                          <div key={i} className="conjugation-form-row">
                            <span className="conjugation-pronoun">{PRONOUNS_FR[i]}</span>
                            <span>
                              {split ? (
                                <>
                                  {split.stem}
                                  <mark className="highlight-mark">{split.ending}</mark>
                                </>
                              ) : (
                                form
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
