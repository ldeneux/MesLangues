'use client';

import '../conversation-exam.css';
import { useEffect, useRef, useState } from 'react';
import {
  getExamReadiness,
  getExamState,
  startExam,
  beginEpreuve,
  submitEpreuve,
  submitWritingEpreuve,
  submitSpeakingEpreuve,
  abandonExam,
  deleteExam,
  type PublicExam,
  type PublicEpreuve,
  type PublicQuestion,
  type EpreuveContent,
  type ExamReadinessItem,
} from '../../lib/exam';
import LanguageInput from './LanguageInput';
import ConversationPanel from './ConversationPanel';
import WritingFeedback from './WritingFeedback';
import ConversationFeedback, { ConversationTranscript } from './ConversationFeedback';
import { LANGS } from '../../lib/constants';
import { countLength, adjustedRange } from '../../lib/writingRubric';
import type { ConversationRecord } from '../../lib/conversation';
import {
  epreuvesForLevel,
  EXAM_PASS_TOTAL,
  EXAM_MIN_PER_EPREUVE,
  LISTENING_MAX_PLAYS,
  epreuveMeta,
  formatClock,
} from '../../lib/examConfig';

type View = 'home' | 'between' | 'epreuve' | 'final';

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------------------------------------------------------------- Chrono
// Basé sur l'heure réelle (et non sur un compteur) : un onglet en arrière-plan ne ralentit pas le temps.
function ExamTimer({ minutes, onExpire }: { minutes: number; onExpire: () => void }) {
  const deadline = useRef(Date.now() + minutes * 60000);
  const [left, setLeft] = useState(minutes * 60);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = Math.ceil((deadline.current - Date.now()) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current();
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  return <span className={`exam-timer${left <= 60 ? ' exam-timer-low' : ''}`}>⏱ {formatClock(left)}</span>;
}

// ------------------------------------------------- Lecteur audio limité (2 écoutes)
function LimitedAudio({ src }: { src: string | null | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);

  if (!src) return <p className="conv-warning">Audio indisponible pour ce document.</p>;

  function play() {
    const el = ref.current;
    if (!el || playing || plays >= LISTENING_MAX_PLAYS) return;
    el.currentTime = 0;
    setPlays((p) => p + 1);
    setPlaying(true);
    el.play().catch(() => setPlaying(false));
  }

  return (
    <div className="exam-audio">
      <audio ref={ref} src={src} onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
      <button className="primary" onClick={play} disabled={playing || plays >= LISTENING_MAX_PLAYS}>
        {playing ? '🔊 Écoute en cours…' : plays === 0 ? '▶ Écouter le document' : plays < LISTENING_MAX_PLAYS ? '▶ Réécouter' : 'Écoutes épuisées'}
      </button>
      <span className="eyebrow-free" style={{ margin: 0 }}>
        {Math.max(0, LISTENING_MAX_PLAYS - plays)} écoute(s) restante(s)
      </span>
    </div>
  );
}

// ------------------------------------------------------------ Correction d'une épreuve
function EpreuveReview({ epreuve, languageCode }: { epreuve: PublicEpreuve; languageCode?: string }) {
  const review = epreuve.review;
  if (epreuve.extra?.writing) {
    return (
      <div className="exam-review">
        <WritingFeedback result={epreuve.extra.writing} languageCode={languageCode} />
      </div>
    );
  }
  if (epreuve.key === 'speaking') {
    const conv = epreuve.extra?.conversation as ConversationRecord | null | undefined;
    if (!conv) return <p className="eyebrow-free">Aucune conversation terminée dans le temps imparti : épreuve notée 0.</p>;
    return (
      <div className="exam-review">
        <ConversationTranscript record={conv} />
        <ConversationFeedback record={conv} />
      </div>
    );
  }
  if (epreuve.key === 'writing') return <p className="eyebrow-free">Texte trop court ou non remis : épreuve notée 0.</p>;
  if (!review) return null;
  return (
    <div className="exam-review">
      {review.article && (
        <details className="exam-article-details">
          <summary>Voir le texte : {review.article.title}</summary>
          <p className="exam-article-text">{review.article.text}</p>
          <p className="exam-article-text revision-fr">{review.article.text_fr}</p>
        </details>
      )}
      {review.questions.map((q: PublicQuestion, qi) => {
        const chosen = review.answers[q.id];
        return (
          <div key={q.id} className="quiz-question">
            <div className="quiz-question-text">
              {qi + 1}. {q.prompt} {chosen === q.correct_index ? '✅' : chosen == null ? '⬜ (sans réponse)' : '❌'}
            </div>
            <div className="quiz-options">
              {q.options.map((opt, i) => (
                <div
                  key={i}
                  className={`quiz-option${i === q.correct_index ? ' kana-correct' : chosen === i ? ' kana-wrong' : ''}`}
                >
                  {opt}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ Résumé d'un examen terminé
function ExamSummary({ exam, languageCode }: { exam: PublicExam; languageCode?: string }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className={exam.passed ? 'conv-correction exercise-success' : 'conv-correction'}>
      <div className="conv-correction-label">
        Examen blanc {exam.level_code} — {exam.total_score} / 100 — {exam.passed ? 'RÉUSSI ✅' : 'non réussi'}
      </div>
      <p className="eyebrow-free">
        Réussite : moyenne d'au moins {EXAM_PASS_TOTAL} % et au moins {EXAM_MIN_PER_EPREUVE} % à chaque épreuve (barème interne à l'appli).
        Temps passé dans les épreuves : {formatClock(exam.seconds_used)}.
      </p>
      {exam.epreuves.map((e) => (
        <div key={e.key} className="writing-criterion-row">
          <div className="writing-criterion-head">
            <span>
              {epreuveMeta(e.key)?.emoji} {e.label}
            </span>
            <span>
              {e.total != null ? `${e.correct}/${e.total} — ` : ''}
              {e.score} %
            </span>
          </div>
          <div className="writing-criterion-track">
            <div className="writing-criterion-fill" style={{ width: `${e.score ?? 0}%` }} />
          </div>
          {(e.score ?? 0) < EXAM_MIN_PER_EPREUVE && <p className="eyebrow-free">⚠️ Sous le minimum de {EXAM_MIN_PER_EPREUVE} % pour cette épreuve.</p>}
          <button className="conv-mini-btn" onClick={() => setOpenKey(openKey === e.key ? null : e.key)}>
            {openKey === e.key ? 'Masquer la correction' : 'Voir la correction'}
          </button>
          {openKey === e.key && <EpreuveReview epreuve={e} languageCode={languageCode} />}
        </div>
      ))}
    </div>
  );
}

// ================================================================ Écran principal
export default function ExamPanel({
  profileId,
  languageCode,
  levelCode,
  onLockChange,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
  onLockChange: (locked: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<ExamReadinessItem[]>([]);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<PublicExam | null>(null);
  const [history, setHistory] = useState<PublicExam[]>([]);
  const [view, setView] = useState<View>('home');

  const [content, setContent] = useState<EpreuveContent | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answersRef = useRef<Record<string, number>>({});
  const submittingRef = useRef(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [writingText, setWritingText] = useState('');
  const writingTextRef = useRef('');
  const [speakingExpired, setSpeakingExpired] = useState(false);
  const langInfo = LANGS.find((l) => l.code === languageCode);

  const [lastEpreuve, setLastEpreuve] = useState<PublicEpreuve | null>(null);
  const [finalExam, setFinalExam] = useState<PublicExam | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Verrou : pendant une épreuve, la navigation de l'appli est masquée
  useEffect(() => {
    onLockChange(view === 'epreuve');
    return () => onLockChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view !== 'epreuve') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [view]);

  async function load() {
    setLoading(true);
    setError('');
    const [r, s] = await Promise.all([getExamReadiness(languageCode, levelCode), getExamState(profileId, languageCode, levelCode)]);
    if (r.ok) {
      setReadiness(r.items);
      setReady(r.ready);
    } else {
      setError((r as { error: string }).error);
    }
    if (s.ok) {
      setActive(s.active);
      setHistory(s.history);
    } else {
      setError((s as { error: string }).error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, languageCode, levelCode]);

  async function handleStart() {
    setBusy(true);
    setError('');
    const r = await startExam(profileId, languageCode, levelCode);
    setBusy(false);
    if (!r.ok) {
      setError((r as { error: string }).error);
      return;
    }
    setActive(r.exam);
    setLastEpreuve(null);
    setConfirmAbandon(false);
    setView('between');
  }

  async function handleAbandon() {
    if (!active) return;
    await abandonExam(profileId, active.id);
    setActive(null);
    setConfirmAbandon(false);
    setView('home');
  }

  async function handleBegin() {
    if (!active) return;
    setBusy(true);
    setError('');
    const r = await beginEpreuve(profileId, active.id, active.current_index);
    setBusy(false);
    if (!r.ok) {
      setError((r as { error: string }).error);
      return;
    }
    answersRef.current = {};
    submittingRef.current = false;
    writingTextRef.current = '';
    setWritingText('');
    setSpeakingExpired(false);
    setAnswers({});
    setConfirmFinish(false);
    setLastEpreuve(null);
    setContent(r.content);
    setView('epreuve');
  }

  // Après la remise d'une épreuve : on passe à l'écran « entre deux épreuves » ou au résultat final
  function afterSubmit(exam: PublicExam, index: number) {
    setLastEpreuve(exam.epreuves[index]);
    setContent(null);
    setConfirmFinish(false);
    if (exam.status === 'done') {
      setFinalExam(exam);
      setActive(null);
      setHistory((h) => [exam, ...h]);
      setView('final');
    } else {
      setActive(exam);
      setView('between');
    }
  }

  // Épreuves à questions (écoute, lecture, grammaire et lexique)
  async function handleSubmit() {
    if (!active || !content || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    const index = active.current_index;
    const r = await submitEpreuve(profileId, active.id, index, answersRef.current);
    setBusy(false);
    if (!r.ok) {
      submittingRef.current = false;
      setError((r as { error: string }).error);
      return;
    }
    afterSubmit(r.exam, index);
  }

  // Production écrite : correction par Gemini (quelques secondes)
  async function handleSubmitWriting(timedOut: boolean) {
    if (!active || !content || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    const index = active.current_index;
    const r = await submitWritingEpreuve(profileId, active.id, index, writingTextRef.current, timedOut);
    setBusy(false);
    if (!r.ok) {
      submittingRef.current = false;
      setError((r as { error: string }).error);
      return;
    }
    afterSubmit(r.exam, index);
  }

  // Production orale : la conversation notée est terminée (ou le temps est écoulé sans séance)
  async function handleSpeakingDone(record: ConversationRecord | null) {
    if (!active || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    const index = active.current_index;
    const r = await submitSpeakingEpreuve(profileId, active.id, index, record?.id ?? null);
    setBusy(false);
    if (!r.ok) {
      submittingRef.current = false;
      setError((r as { error: string }).error);
      return;
    }
    afterSubmit(r.exam, index);
  }

  function choose(qid: string, i: number) {
    answersRef.current = { ...answersRef.current, [qid]: i };
    setAnswers(answersRef.current);
  }

  async function handleDeleteHistory(id: string) {
    const r = await deleteExam(profileId, id);
    if (!r.ok) {
      setError((r as { error: string }).error);
      return;
    }
    setHistory((h) => h.filter((x) => x.id !== id));
    setConfirmDeleteId(null);
    setOpenHistoryId(null);
  }

  if (loading) return <p className="eyebrow-free">Chargement de l'examen…</p>;

  // ------------------------------------------------------------- ÉPREUVE ÉCRITE (verrouillée)
  if (view === 'epreuve' && content && content.key === 'writing' && content.writing) {
    const w = content.writing;
    const { count, unit } = countLength(writingText, languageCode);
    const [lo, hi] = adjustedRange(w.min_words, w.max_words, languageCode);
    return (
      <div className="exam-epreuve">
        <div className="exam-header">
          <div className="sidebar-label">
            {epreuveMeta('writing')?.emoji} {content.label}
          </div>
          <ExamTimer minutes={content.minutes} onExpire={() => handleSubmitWriting(true)} />
        </div>
        {error && <p className="conv-warning">{error}</p>}
        <div className="exam-article">
          <div className="quiz-question-text">{w.instruction}</div>
          <ul>
            {w.guiding_points.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
        <LanguageInput
          languageCode={languageCode}
          value={writingText}
          onChange={(v) => {
            writingTextRef.current = v;
            setWritingText(v);
          }}
          rows={8}
          disabled={busy}
        />
        <p className="eyebrow-free">
          {count} {unit} (attendu : {lo} à {hi}). Le texte est corrigé et noté à la fin : cela prend quelques secondes.
        </p>
        <div className="exam-finish">
          <button className="primary" onClick={() => handleSubmitWriting(false)} disabled={busy || !writingText.trim()}>
            {busy ? 'Correction en cours…' : 'Terminer et corriger'}
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- ÉPREUVE ORALE (verrouillée)
  if (view === 'epreuve' && content && content.key === 'speaking' && content.speaking) {
    return (
      <div className="exam-epreuve">
        <div className="exam-header">
          <div className="sidebar-label">
            {epreuveMeta('speaking')?.emoji} {content.label}
          </div>
          <ExamTimer minutes={content.minutes} onExpire={() => setSpeakingExpired(true)} />
        </div>
        {error && <p className="conv-warning">{error}</p>}
        {busy && <p className="eyebrow-free">Enregistrement du résultat…</p>}
        <ConversationPanel
          profileId={profileId}
          languageCode={languageCode}
          languageLabel={langInfo?.label.toLowerCase() ?? languageCode}
          levelCode={levelCode}
          bcp47={langInfo?.bcp47 ?? 'en-US'}
          exam={{ scenarioCode: content.speaking.scenarioCode, expired: speakingExpired, onDone: handleSpeakingDone }}
        />
      </div>
    );
  }

  // ------------------------------------------------------------- ÉPREUVE À QUESTIONS (verrouillée)
  if (view === 'epreuve' && content) {
    const total = content.questions.length;
    const answered = content.questions.filter((q) => answers[q.id] != null).length;
    const sections: { title: string; kinds: string[] }[] =
      content.key === 'grammar'
        ? [
            { title: 'Grammaire', kinds: ['grammar'] },
            { title: 'Lexique', kinds: ['lexicon'] },
          ]
        : [{ title: '', kinds: ['comprehension'] }];
    let counter = 0;

    return (
      <div className="exam-epreuve">
        <div className="exam-header">
          <div>
            <div className="sidebar-label">
              {epreuveMeta(content.key)?.emoji} {content.label}
            </div>
            <span className="eyebrow-free" style={{ margin: 0 }}>
              {answered} / {total} réponses
            </span>
          </div>
          <ExamTimer minutes={content.minutes} onExpire={handleSubmit} />
        </div>

        {error && <p className="conv-warning">{error}</p>}

        {content.key === 'listening' && <LimitedAudio src={content.article?.audio_url} />}
        {content.key === 'reading' && content.article && (
          <div className="exam-article">
            <div className="quiz-question-text">{content.article.title}</div>
            <p className="exam-article-text">{content.article.text}</p>
          </div>
        )}

        {sections.map((sec) => {
          const qs = content.questions.filter((q) => sec.kinds.includes(q.kind));
          if (qs.length === 0) return null;
          return (
            <div key={sec.title || 'q'}>
              {sec.title && <div className="sidebar-label" style={{ marginTop: '1rem' }}>{sec.title}</div>}
              {qs.map((q) => {
                counter++;
                return (
                  <div key={q.id} className="quiz-question">
                    <div className="quiz-question-text">
                      {counter}. {q.prompt}
                    </div>
                    <div className="quiz-options">
                      {q.options.map((opt, i) => (
                        <button key={i} className={`quiz-option${answers[q.id] === i ? ' selected' : ''}`} onClick={() => choose(q.id, i)}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="exam-finish">
          {!confirmFinish ? (
            <button className="primary" onClick={() => (answered < total ? setConfirmFinish(true) : handleSubmit())} disabled={busy}>
              {busy ? 'Correction…' : "Terminer l'épreuve"}
            </button>
          ) : (
            <span className="history-confirm">
              Il reste {total - answered} question(s) sans réponse. Terminer quand même ?
              <button className="primary" onClick={handleSubmit} disabled={busy}>
                Oui, terminer
              </button>
              <button className="secondary" onClick={() => setConfirmFinish(false)} disabled={busy}>
                Continuer l'épreuve
              </button>
            </span>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- RÉSULTAT FINAL
  if (view === 'final' && finalExam) {
    return (
      <div className="exam-home">
        {lastEpreuve && (
          <p className="eyebrow-free">
            Dernière épreuve terminée : {lastEpreuve.label} —{' '}
            {lastEpreuve.total != null ? `${lastEpreuve.correct}/${lastEpreuve.total}` : `${lastEpreuve.score} / 100`}.
          </p>
        )}
        <ExamSummary exam={finalExam} languageCode={languageCode} />
        <button
          className="primary"
          style={{ marginTop: '1rem' }}
          onClick={() => {
            setFinalExam(null);
            setView('home');
          }}
        >
          Retour à l'examen
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------- ENTRE DEUX ÉPREUVES
  if (view === 'between' && active) {
    const next = active.epreuves[active.current_index];
    const doneCount = active.epreuves.filter((e) => e.status === 'done').length;
    const meta = next ? epreuveMeta(next.key) : undefined;
    return (
      <div className="exam-home">
        <div className="sidebar-label">
          Examen blanc {active.level_code} — {doneCount} / {active.epreuves.length} épreuves faites
        </div>

        {lastEpreuve && (
          <div className="conv-correction exercise-success">
            <div className="conv-correction-label">
              Épreuve terminée : {lastEpreuve.label} —{' '}
              {lastEpreuve.total != null ? `${lastEpreuve.correct} / ${lastEpreuve.total} (${lastEpreuve.score} %)` : `${lastEpreuve.score} / 100`}
            </div>
            <details>
              <summary>Voir la correction de cette épreuve</summary>
              <EpreuveReview epreuve={lastEpreuve} languageCode={languageCode} />
            </details>
          </div>
        )}

        <div className="exam-steps">
          {active.epreuves.map((e, i) => (
            <div key={e.key} className={`exam-step${e.status === 'done' ? ' done' : i === active.current_index ? ' current' : ''}`}>
              {epreuveMeta(e.key)?.emoji} {e.label} {e.status === 'done' ? `— ${e.score} %` : `— ${e.minutes} min`}
            </div>
          ))}
        </div>

        {error && <p className="conv-warning">{error}</p>}

        {next && meta && (
          <>
            <h3 style={{ marginBottom: '0.3rem' }}>
              {meta.emoji} Prochaine épreuve : {next.label} ({next.minutes} min)
            </h3>
            <p className="eyebrow-free">{meta.description}</p>
            <p className="eyebrow-free">
              Une fois l'épreuve lancée, le chrono démarre et la navigation de l'appli est verrouillée jusqu'à la fin de l'épreuve.
              {next.status === 'started' && " Cette épreuve avait été interrompue : elle recommence au début, avec les mêmes questions."}
            </p>
            <div className="exam-actions">
              <button className="primary" onClick={handleBegin} disabled={busy}>
                {busy ? 'Préparation…' : "▶ Commencer l'épreuve"}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setView('home');
                  setLastEpreuve(null);
                }}
                disabled={busy}
              >
                ⏸ Mettre en pause
              </button>
            </div>
            <p className="eyebrow-free">La pause est libre : ton examen est enregistré et le temps de pause ne compte pas.</p>
          </>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- ACCUEIL
  const openHistory = history.find((h) => h.id === openHistoryId) ?? null;
  const doneInActive = active ? active.epreuves.filter((e) => e.status === 'done').length : 0;
  const levelEpreuves = epreuvesForLevel(levelCode);
  const totalMinutes = levelEpreuves.reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="exam-home">
      <p className="eyebrow-free">
        Examen blanc {levelCode} : {levelEpreuves.length} épreuves à la suite (environ {totalMinutes} min au total), chacune avec son chrono. Entre
        deux épreuves, tu peux continuer ou mettre en pause et reprendre plus tard. Pendant une épreuve, tout le reste de l'appli est verrouillé.
        L'écriture et l'oral sont corrigés par l'IA : compte environ 0,05 € pour l'examen complet.
      </p>

      {error && <p className="conv-warning">{error}</p>}

      {active ? (
        <div className="conv-correction">
          <div className="conv-correction-label">
            Examen en cours — {doneInActive} / {active.epreuves.length} épreuves faites
          </div>
          <p className="eyebrow-free">Commencé le {formatDate(active.created_at)}</p>
          <div className="exam-actions">
            <button className="primary" onClick={() => setView('between')}>
              ▶ Reprendre mon examen
            </button>
            {!confirmAbandon ? (
              <button className="secondary" onClick={() => setConfirmAbandon(true)}>
                Abandonner
              </button>
            ) : (
              <span className="history-confirm">
                Abandonner définitivement cet examen ?
                <button className="primary" onClick={handleAbandon}>
                  Oui, abandonner
                </button>
                <button className="secondary" onClick={() => setConfirmAbandon(false)}>
                  Annuler
                </button>
              </span>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="sidebar-label">Ressources disponibles pour ce niveau</div>
          <div className="exam-readiness">
            {readiness.map((r) => (
              <div key={r.key} className="writing-error-row">
                {r.ok ? '✅' : '❌'} {r.label} — <span className="revision-fr">{r.detail}</span>
              </div>
            ))}
          </div>
          <button className="primary" onClick={handleStart} disabled={!ready || busy} style={{ marginTop: '0.8rem' }}>
            {busy ? 'Création…' : "Commencer l'examen blanc"}
          </button>
        </>
      )}

      {history.length > 0 && (
        <div className="quiz-history">
          <div className="sidebar-label">Mes examens blancs</div>
          {history.map((h) => (
            <div key={h.id} className="quiz-history-row">
              <button type="button" className="history-link" onClick={() => setOpenHistoryId(h.id)}>
                {h.total_score} / 100 ({h.level_code}) — {h.passed ? 'réussi ✅' : 'non réussi'} — {new Date(h.created_at).toLocaleDateString('fr-FR')}
              </button>
            </div>
          ))}
        </div>
      )}

      {openHistory && (
        <div className="scores-overlay" onClick={() => setOpenHistoryId(null)}>
          <div className="scores-modal history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scores-header">
              <div className="sidebar-label">Examen du {formatDate(openHistory.created_at)}</div>
              <button type="button" className="secondary" onClick={() => setOpenHistoryId(null)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <ExamSummary exam={openHistory} languageCode={languageCode} />
            <div className="history-actions">
              {confirmDeleteId !== openHistory.id ? (
                <button type="button" className="secondary history-delete" onClick={() => setConfirmDeleteId(openHistory.id)}>
                  🗑️ Supprimer de l'historique
                </button>
              ) : (
                <span className="history-confirm">
                  Supprimer définitivement ?
                  <button type="button" className="primary" onClick={() => handleDeleteHistory(openHistory.id)}>
                    Oui, supprimer
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirmDeleteId(null)}>
                    Annuler
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
