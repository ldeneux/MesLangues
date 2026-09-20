'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getWritingPrompts,
  submitWriting,
  getWritingHistory,
  type WritingPrompt,
  type WritingResult,
} from '../../lib/writing';
import { THEMES } from '../../lib/constants';
import HighlightText from './HighlightText';

export default function WritingPanel({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
}) {
  const [prompts, setPrompts] = useState<WritingPrompt[] | null>(null);
  const [themeFilter, setThemeFilter] = useState('all');
  const [selected, setSelected] = useState<WritingPrompt | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WritingResult | null>(null);
  const [history, setHistory] = useState<WritingResult[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setPrompts(null);
    getWritingPrompts(languageCode, levelCode)
      .then((list) => {
        setPrompts(list);
        if (list[0]) selectPrompt(list[0]);
      })
      .catch((e: any) =>
        setError(
          e?.message?.includes('relation') || e?.message?.includes('writing_')
            ? "La table \"writing_prompts\" n'existe pas encore — exécute la migration 010 dans Supabase."
            : e?.message ?? 'Erreur de chargement.'
        )
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  function selectPrompt(p: WritingPrompt) {
    setSelected(p);
    setText('');
    setResult(null);
    getWritingHistory(profileId, p.id).then(setHistory);
  }

  async function handleSubmit() {
    if (!selected || !text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const r = await submitWriting(profileId, selected.id, text, languageCode);
      setResult(r);
      getWritingHistory(profileId, selected.id).then(setHistory);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la correction.');
    } finally {
      setSubmitting(false);
    }
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const availableThemes = useMemo(
    () => THEMES.filter((t) => (prompts ?? []).some((p) => p.theme_code === t.code)),
    [prompts]
  );
  const filteredPrompts =
    themeFilter === 'all' ? prompts ?? [] : (prompts ?? []).filter((p) => p.theme_code === themeFilter);

  if (prompts === null) return <p className="eyebrow-free">Chargement…</p>;

  if (prompts.length === 0) {
    return (
      <p className="eyebrow-free">
        Aucune consigne d'écriture téléchargée pour ce niveau — va dans l'onglet "Packs" pour en télécharger.
      </p>
    );
  }

  return (
    <div>
      <p className="eyebrow-free">
        Rédaction courte guidée, façon épreuve de production écrite. Écris librement, la correction met en
        surbrillance ce qui a été changé.
      </p>

      <div className="cascade-row">
        <select className="cascade-select" value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
          <option value="all">Tous les thèmes</option>
          {availableThemes.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="cascade-select"
          value={selected?.id ?? ''}
          onChange={(e) => {
            const p = prompts.find((x) => x.id === e.target.value);
            if (p) selectPrompt(p);
          }}
        >
          {filteredPrompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.instruction.slice(0, 60)}…
            </option>
          ))}
        </select>
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {selected && (
        <div className="phrase-card phrase-card-big">
          <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {selected.instruction}
          </div>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
            {selected.guiding_points.map((pt, i) => (
              <li key={i} className="revision-fr">
                {pt}
              </li>
            ))}
          </ul>
          <p className="eyebrow-free">
            {selected.min_words}-{selected.max_words} mots attendus
          </p>

          <textarea
            className="writing-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Écris ta réponse ici…"
            rows={6}
          />
          <p className="eyebrow-free">{wordCount} mot(s)</p>

          <button className="primary" onClick={handleSubmit} disabled={submitting || !text.trim()}>
            {submitting ? 'Correction en cours…' : 'Corriger ma production'}
          </button>

          {result && (
            <div className={result.score >= 70 ? 'conv-correction exercise-success' : 'conv-correction'}>
              <div className="conv-correction-label">Score : {result.score} / 100</div>
              <div className="conv-correction-text">
                <HighlightText text={result.corrected_text} />
              </div>
              <div className="conv-correction-explanation">{result.feedback_fr}</div>
            </div>
          )}

          {history.length > 0 && (
            <div className="quiz-history">
              <div className="sidebar-label">Historique sur cette consigne</div>
              {history.map((h) => (
                <div key={h.id} className="quiz-history-row">
                  {h.score} / 100 — {new Date(h.created_at).toLocaleDateString('fr-FR')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
