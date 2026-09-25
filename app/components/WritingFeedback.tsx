'use client';

import HighlightText from './HighlightText';
import { CRITERIA, type CriterionKey } from '../../lib/writingRubric';
import type { WritingResult } from '../../lib/writing';

const CRITERION_KEYS: CriterionKey[] = ['task', 'grammar', 'vocabulary', 'coherence'];
const NUMBER_WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq'];

export default function WritingFeedback({ result }: { result: WritingResult }) {
  const hasDetail = !!result.criteria;

  return (
    <div className={result.score >= 70 ? 'conv-correction exercise-success' : 'conv-correction'}>
      <div className="conv-correction-label">Score : {result.score} / 100</div>
      <div className="conv-correction-text">
        <HighlightText text={result.corrected_text} />
      </div>

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
