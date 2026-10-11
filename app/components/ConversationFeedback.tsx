'use client';

import HighlightText from './HighlightText';
import { CONV_CRITERIA, type ConvCriterionKey } from '../../lib/conversationRubric';
import { formatEur } from '../../lib/conversationBudget';
import { USD_TO_EUR } from '../../lib/pricing';
import type { ConversationRecord } from '../../lib/conversation';

const KEYS: ConvCriterionKey[] = ['interaction', 'grammar', 'vocabulary', 'development'];
const NUMBER_WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq'];

// Note + détail du barème + objectifs + erreurs relevées (même présentation que l'Écriture)
export default function ConversationFeedback({ record }: { record: ConversationRecord }) {
  const hasDetail = !!record.criteria;
  const errors = (record.errors ?? []).filter((e) => e.original);

  return (
    <div className={record.score >= 70 ? 'conv-correction exercise-success' : 'conv-correction'}>
      <div className="conv-correction-label">Score : {record.score} / 100</div>
      <div className="conv-correction-explanation">{record.feedback_fr}</div>

      {record.objectives && record.objectives.length > 0 && (
        <div className="writing-detail">
          <div className="sidebar-label">Objectifs de la situation</div>
          {record.objectives.map((o, i) => (
            <div key={i} className="writing-error-row">
              {o.covered ? '✅' : '⬜'} {o.label}
            </div>
          ))}
        </div>
      )}

      {hasDetail && (
        <div className="writing-detail">
          <div className="sidebar-label">Détail de la note</div>
          {KEYS.map((key) => {
            const c = record.criteria![key];
            if (!c) return null;
            return (
              <div key={key} className="writing-criterion-row">
                <div className="writing-criterion-head">
                  <span>{CONV_CRITERIA[key]}</span>
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

          {record.penalties && record.penalties.participationPct > 0 && (
            <p className="eyebrow-free">
              Séance courte : −{record.penalties.participationPct}% ({record.user_turns} réponses ; la note est complète à partir de 6).
            </p>
          )}
          {record.penalties?.caps
            ?.filter((c) => !c.includes(' : '))
            .map((c, i) => (
              <p key={i} className="eyebrow-free">⚠️ {c}</p>
            ))}

          {errors.length > 0 && (
            <div className="writing-errors">
              <div className="sidebar-label">Erreurs relevées</div>
              {errors.map((e, i) => (
                <div key={i} className="writing-error-row">
                  <span className="writing-error-original">{e.original}</span> →{' '}
                  <span className="writing-error-correction">{e.correction}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="eyebrow-free" style={{ marginTop: '0.6rem' }}>
        Coût réel de la séance : {formatEur(record.cost_usd * USD_TO_EUR)}
      </p>
    </div>
  );
}

// Transcription avec la correction sous chaque réponse de l'apprenant
export function ConversationTranscript({ record }: { record: ConversationRecord }) {
  return (
    <div className="conv-transcript">
      {record.transcript.map((t, i) => {
        if (t.speaker === 'ai') {
          return (
            <div key={i} className="conv-bubble conv-bubble-ai">
              <div>{t.text}</div>
              {t.text_fr && <div className="conv-bubble-translation">🇫🇷 {t.text_fr}</div>}
            </div>
          );
        }
        return (
          <div key={i}>
            <div className="conv-bubble conv-bubble-user">{t.text}</div>
            {t.correction?.has_error && (
              <div className="conv-correction">
                <div className="conv-correction-label">✏️ Correction</div>
                <div className="conv-correction-text">
                  <HighlightText text={t.correction.corrected_text} />
                </div>
                <div className="conv-correction-explanation">{t.correction.explanation_fr}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
