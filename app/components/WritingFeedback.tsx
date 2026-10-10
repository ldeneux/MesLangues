'use client';

import { useEffect, useState } from 'react';
import HighlightText from './HighlightText';
import RubyHighlight from './RubyHighlight';
import { usePersistentFlag } from './usePersistentFlag';
import { getJapaneseReadings } from '../../lib/japaneseReadings';
import { applyHighlightToRuby } from '../../lib/japanese';
import { CRITERIA, type CriterionKey } from '../../lib/writingRubric';
import type { WritingResult } from '../../lib/writing';

const CRITERION_KEYS: CriterionKey[] = ['task', 'grammar', 'vocabulary', 'coherence'];
const NUMBER_WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq'];

export default function WritingFeedback({ result, languageCode }: { result: WritingResult; languageCode?: string }) {
  const hasDetail = !!result.criteria;
  const isJa = languageCode === 'ja';
  const [furigana, setFurigana] = usePersistentFlag('ja-furigana');
  const [ruby, setRuby] = useState<string | null>(null);
  const [rubyLoading, setRubyLoading] = useState(false);
  const [rubyError, setRubyError] = useState('');

  // Japonais : furigana de la correction (demandé une fois, puis mis en cache en base)
  useEffect(() => {
    setRuby(null);
    setRubyError('');
    if (!isJa || !furigana) return;
    const plain = result.corrected_text.replace(/\*\*/g, '');
    let cancelled = false;
    setRubyLoading(true);
    getJapaneseReadings([plain])
      .then((r) => {
        if (cancelled) return;
        const entry = r[plain];
        const withHl = entry ? applyHighlightToRuby(result.corrected_text, entry.ruby) : null;
        if (withHl && /\{[^|}]+\|[^}]+\}/.test(withHl)) setRuby(withHl);
        else setRubyError('Furigana indisponible pour ce texte.');
      })
      .catch((e: any) => {
        if (!cancelled) setRubyError(e?.message ?? 'Furigana indisponible.');
      })
      .finally(() => {
        if (!cancelled) setRubyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isJa, furigana, result.id, result.corrected_text]);

  return (
    <div className={result.score >= 70 ? 'conv-correction exercise-success' : 'conv-correction'}>
      <div className="conv-correction-label">Score : {result.score} / 100</div>
      <div className="conv-correction-text" lang={isJa ? 'ja' : undefined}>
        {isJa && furigana && ruby ? <RubyHighlight ruby={ruby} /> : <HighlightText text={result.corrected_text} />}
      </div>
      {isJa && (
        <div className="conv-bubble-actions" style={{ margin: '0.5rem 0' }}>
          <button className={`conv-mini-btn${furigana ? ' active' : ''}`} onClick={() => setFurigana(!furigana)}>
            Furigana : {furigana ? 'oui' : 'non'}
          </button>
          {rubyLoading && <span className="eyebrow-free" style={{ marginBottom: 0 }}>Chargement…</span>}
          {rubyError && <span className="eyebrow-free" style={{ marginBottom: 0 }}>{rubyError}</span>}
        </div>
      )}

      {hasDetail && (
        <div className="writing-detail">
          <div className="sidebar-label">Détail de la note</div>
          {CRITERION_KEYS.map((key) => {
            const c = result.criteria![key];
            return (
              <div key={key} className="writing-criterion-row">
                <div className="writing-criterion-head">
                  <span>{CRITERIA[key]}</span>
                  <span>{NUMBER_WORDS[c.score]} sur cinq</span>
                </div>
                <div className="writing-criterion-track">
                  <div className="writing-criterion-fill" style={{ width: `${(c.score / 5) * 100}%` }} />
                </div>
                {c.justification && <p className="eyebrow-free">{c.justification}</p>}
                {c.capped_by && <p className="eyebrow-free">⚠️ Plafonné : {c.capped_by}</p>}
              </div>
            );
          })}

          {result.penalties && result.penalties.lengthPct > 0 && (
            <p className="eyebrow-free">
              Longueur : −{result.penalties.lengthPct}% ({result.word_count} mots pour la fourchette attendue)
            </p>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="writing-errors">
              <div className="sidebar-label">Erreurs relevées</div>
              {result.errors.map((e, i) => (
                <div key={i} className="writing-error-row">
                  <span className="writing-error-original">{e.original}</span> →{' '}
                  <span className="writing-error-correction">{e.correction}</span>
                  <span className="revision-fr"> — {e.explanation_fr}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="conv-correction-explanation">{result.feedback_fr}</div>
    </div>
  );
}
