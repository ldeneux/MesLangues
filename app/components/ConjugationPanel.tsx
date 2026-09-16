'use client';

import { useEffect, useState } from 'react';
import { getConjugationVerbs, runConjugationStep, type ConjugationVerb } from '../../lib/conjugation';
import { THEMES, CONJUGATION_TARGET } from '../../lib/constants';

const TENSE_LABELS: Record<string, string> = {
  present: 'Présent',
  futur: 'Futur simple',
  passe_compose: 'Passé composé',
  imparfait: 'Imparfait',
};

const PRONOUNS_FR = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

type SortMode = 'frequency' | 'theme';

export default function ConjugationPanel({ languageCode }: { languageCode: string }) {
  const [verbs, setVerbs] = useState<ConjugationVerb[] | null>(null);
  const [selected, setSelected] = useState<ConjugationVerb | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('frequency');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ generated: number; target: number } | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const list = await getConjugationVerbs(languageCode);
    setVerbs(list);
    if (list.length > 0) setSelected((prev) => list.find((v) => v.id === prev?.id) ?? list[0]);
    return list;
  }

  useEffect(() => {
    setVerbs(null);
    setSelected(null);
    refresh().catch((e: any) =>
      setError(
        e?.message?.includes('relation') || e?.message?.includes('conjugation_verbs')
          ? "La table \"conjugation_verbs\" n'existe pas encore — exécute la migration 005 dans Supabase."
          : e?.message ?? 'Erreur de chargement.'
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode]);

  async function handleGenerateMore() {
    setGenerating(true);
    setError('');
    try {
      let done = false;
      let total = verbs?.length ?? 0;
      setProgress({ generated: total, target: CONJUGATION_TARGET });
      while (!done) {
        const step = await runConjugationStep(languageCode);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal });
        done = step.done;
        total = step.generatedTotal;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération des verbes.');
    } finally {
      setGenerating(false);
      setProgress(null);
      refresh();
    }
  }

  if (verbs === null && !error) return <p className="eyebrow-free">Chargement des verbes…</p>;

  const sorted = [...(verbs ?? [])].sort((a, b) =>
    sortMode === 'frequency'
      ? a.frequency_rank - b.frequency_rank
      : (a.theme_code ?? '').localeCompare(b.theme_code ?? '') || a.frequency_rank - b.frequency_rank
  );

  return (
    <div>
      <p className="eyebrow-free">
        {verbs?.length ?? 0} / {CONJUGATION_TARGET} verbes générés pour cette langue — présent, futur simple, passé
        composé, imparfait.
      </p>

      {error && <p className="conv-warning">{error}</p>}

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
          {sorted.map((v) => (
            <button
              key={v.id}
              className={`conjugation-list-item${selected?.id === v.id ? ' active' : ''}`}
              onClick={() => setSelected(v)}
            >
              <span>{v.infinitive}</span>
              <span className="conjugation-list-fr">{v.translation_fr}</span>
            </button>
          ))}
          {sorted.length === 0 && !generating && (
            <p className="eyebrow-free">Aucun verbe généré pour l'instant.</p>
          )}
        </div>

        {selected && (
          <div className="phrase-card conjugation-detail">
            <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.1rem' }}>
              {selected.infinitive} <span className="revision-fr">— {selected.translation_fr}</span>
            </div>
            {selected.theme_code && (
              <p className="eyebrow-free">{THEMES.find((t) => t.code === selected.theme_code)?.label}</p>
            )}

            {Object.entries(TENSE_LABELS).map(([key, label]) => (
              <div key={key} className="conjugation-tense-block">
                <div className="conjugation-tense-title">{label}</div>
                <div className="conjugation-forms">
                  {(selected.tenses[key as keyof typeof selected.tenses] ?? []).map((form, i) => (
                    <div key={i} className="conjugation-form-row">
                      <span className="conjugation-pronoun">{PRONOUNS_FR[i]}</span>
                      <span>{form}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {generating && progress && (
        <div className="pack-progress" style={{ marginTop: '1rem' }}>
          <div className="pack-progress-track">
            <div
              className="pack-progress-fill"
              style={{ width: `${Math.min(100, (progress.generated / progress.target) * 100)}%` }}
            />
          </div>
          <p className="eyebrow-free">
            {progress.generated} / {progress.target} — laisse cet onglet ouvert le temps de la génération.
          </p>
        </div>
      )}

      {!generating && (verbs?.length ?? 0) < CONJUGATION_TARGET && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={handleGenerateMore}>
          Générer {Math.min(20, CONJUGATION_TARGET - (verbs?.length ?? 0))} verbes de plus
        </button>
      )}
    </div>
  );
}
