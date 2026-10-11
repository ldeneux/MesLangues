'use client';

import '../conversation-exam.css';
import { useEffect, useRef, useState } from 'react';
import HighlightText from './HighlightText';
import ConversationHistory from './ConversationHistory';
import LanguageInput from './LanguageInput';
import ConversationFeedback, { ConversationTranscript } from './ConversationFeedback';
import {
  getConversationTurn,
  finishConversation,
  getConversationHistory,
  deleteConversationResult,
  type LogTurn,
  type WrapUp,
  type ConversationRecord,
} from '../../lib/conversation';
import {
  scenariosForLevel,
  isAboveLevel,
  SCENARIO_CATEGORIES,
  type ScenarioCategory,
  getScenario,
  FREE_THEME_CODE,
  CUSTOM_THEME_CODE,
  CUSTOM_THEME_MAX_CHARS,
} from '../../lib/conversationScenarios';
import {
  budgetState,
  formatEur,
  CONVERSATION_BUDGET_EUR,
  CONVERSATION_ESTIMATED_EUR,
  CONVERSATION_MAX_EXCHANGES,
} from '../../lib/conversationBudget';
import { MIN_TURNS_TO_FINISH } from '../../lib/conversationRubric';

type Mode = 'audio' | 'audio_text' | 'text';
type Phase = 'setup' | 'live' | 'finishing' | 'result';
type Status = 'idle' | 'ai_speaking' | 'listening' | 'thinking' | 'error';
type ThemeKind = 'scenario' | 'free' | 'custom';

type UiTurn = LogTurn & { id: string; revealed?: boolean; revealedFr?: boolean };

let uid = 0;
const nextId = () => String(uid++);

// Retire les champs d'affichage avant d'envoyer / enregistrer
function toLog(turns: UiTurn[]): LogTurn[] {
  return turns.map(({ id, revealed, revealedFr, ...t }) => t);
}

export default function ConversationPanel({
  profileId,
  languageCode,
  languageLabel,
  levelCode,
  bcp47,
  exam,
}: {
  profileId: string;
  languageCode: string;
  languageLabel: string;
  levelCode: string;
  bcp47: string;
  // Mode « épreuve d'examen » : situation imposée, pas d'historique ni d'abandon ; onDone reçoit la séance notée
  // (ou null si le temps est écoulé sans séance terminée).
  exam?: { scenarioCode: string; expired: boolean; onDone: (record: ConversationRecord | null) => void };
}) {
  const allScenarios = scenariosForLevel(levelCode);

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<Mode>('audio_text');
  const [themeKind, setThemeKind] = useState<ThemeKind>('scenario');
  const [scenarioCode, setScenarioCode] = useState(exam?.scenarioCode ?? allScenarios[0]?.code ?? FREE_THEME_CODE);
  const [categoryFilter, setCategoryFilter] = useState<'all' | ScenarioCategory>('all');
  const [customTheme, setCustomTheme] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [spentUsd, setSpentUsd] = useState(0);
  const [wrapUp, setWrapUp] = useState<WrapUp>('none');
  const [draft, setDraft] = useState('');
  const [liveCaption, setLiveCaption] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [retryAction, setRetryAction] = useState<null | (() => void)>(null);

  const [result, setResult] = useState<ConversationRecord | null>(null);
  const [records, setRecords] = useState<ConversationRecord[]>([]);
  const [historyError, setHistoryError] = useState('');

  const recognitionRef = useRef<any>(null);
  const spentRef = useRef(0); // cumul du coût réel, lisible dans les callbacks asynchrones
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [recognitionSupported, setRecognitionSupported] = useState(false);

  // Thème effectivement utilisé pour la séance
  const activeScenarioCode = themeKind === 'scenario' ? scenarioCode : themeKind === 'custom' ? CUSTOM_THEME_CODE : FREE_THEME_CODE;
  const activeCustom = themeKind === 'custom' ? customTheme.trim() : '';
  const selectedScenario = themeKind === 'scenario' ? getScenario(scenarioCode) : null;

  const visibleScenarios = allScenarios.filter((sc) => categoryFilter === 'all' || sc.category === categoryFilter);
  const textOnly = mode === 'text'; // mode silencieux : ni voix de l'IA, ni micro

  const userTurns = turns.filter((t) => t.speaker === 'user').length;
  const budget = budgetState(spentUsd, userTurns);
  const ended = wrapUp === 'final' && status !== 'thinking' && turns.length > 0 && turns[turns.length - 1].speaker === 'ai';
  const canFinish = userTurns >= MIN_TURNS_TO_FINISH && status !== 'thinking' && phase === 'live';

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
  }, []);

  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
      recognitionRef.current?.stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory() {
    if (exam) return; // pas d'historique pendant l'examen
    const r = await getConversationHistory(profileId, languageCode);
    if (r.ok) {
      setRecords(r.records);
      setHistoryError('');
    } else {
      setHistoryError((r as { error: string }).error);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, languageCode]);

  async function handleDeleteRecord(id: string) {
    const r = await deleteConversationResult(profileId, id);
    if (!r.ok) throw new Error((r as { error: string }).error);
    setRecords((prev) => prev.filter((x) => x.id !== id));
  }

  function speak(text: string): Promise<void> {
    if (!speechSupported) return Promise.resolve();
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = bcp47;
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang === bcp47) || voices.find((v) => v.lang.startsWith(bcp47.slice(0, 2)));
      if (match) utter.voice = match;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      setStatus('ai_speaking');
      window.speechSynthesis.speak(utter);
    });
  }

  // Demande le prochain tour de l'IA pour le journal `currentTurns`
  async function requestTurn(currentTurns: UiTurn[]) {
    setStatus('thinking');
    setErrorMsg('');
    setRetryAction(null);

    const r = await getConversationTurn({
      languageCode,
      levelCode,
      history: currentTurns.map((t) => ({ speaker: t.speaker, text: t.text })),
      scenarioCode: activeScenarioCode,
      customTheme: activeCustom || undefined,
      spentUsd: spentRef.current,
    });

    if (!r.ok) {
      setErrorMsg((r as { error: string }).error);
      setStatus('error');
      setRetryAction(() => () => requestTurn(currentTurns));
      return;
    }

    const { reply, costUsd, wrapUp: nextWrapUp } = r;
    spentRef.current += costUsd;
    setSpentUsd(spentRef.current);
    setWrapUp(nextWrapUp);

    // La correction est rattachée à la dernière réponse de l'apprenant
    const updated: UiTurn[] = currentTurns.map((t, i) =>
      i === currentTurns.length - 1 && t.speaker === 'user'
        ? { ...t, correction: reply.correction, errors: reply.errors, wrong_language: reply.wrong_language }
        : t
    );
    updated.push({
      id: nextId(),
      speaker: 'ai',
      text: reply.message,
      text_fr: reply.message_fr,
      revealed: mode !== 'audio',
      revealedFr: false,
    });
    setTurns(updated);

    if (!textOnly) await speak(reply.message);
    setStatus('idle');
  }

  function handleStart() {
    if (themeKind === 'custom' && !customTheme.trim()) return;
    spentRef.current = 0;
    setSpentUsd(0);
    setWrapUp('none');
    setTurns([]);
    setResult(null);
    setDraft('');
    setLiveCaption('');
    setPhase('live');
    requestTurn([]);
  }

  function stopAudio() {
    if (speechSupported) window.speechSynthesis.cancel();
    recognitionRef.current?.stop?.();
  }

  function handleReset() {
    stopAudio();
    setPhase('setup');
    setTurns([]);
    setResult(null);
    setDraft('');
    setLiveCaption('');
    setStatus('idle');
    setErrorMsg('');
    setRetryAction(null);
    loadHistory();
  }

  function submitAnswer(text: string) {
    const clean = text.trim();
    if (!clean || ended || status === 'thinking' || budget.level === 'stop') return;
    setDraft('');
    setLiveCaption('');
    const nextTurns: UiTurn[] = [...turns, { id: nextId(), speaker: 'user', text: clean }];
    setTurns(nextTurns);
    requestTurn(nextTurns);
  }

  async function handleFinish() {
    stopAudio();
    setPhase('finishing');
    setErrorMsg('');
    setRetryAction(null);
    const r = await finishConversation({
      profileId,
      languageCode,
      levelCode,
      scenarioCode: activeScenarioCode,
      customTheme: activeCustom || undefined,
      transcript: toLog(turns),
      spentUsd: spentRef.current,
    });
    if (!r.ok) {
      setErrorMsg((r as { error: string }).error);
      setPhase('live');
      setStatus('error');
      setRetryAction(() => () => handleFinish());
      return;
    }
    setResult(r.record);
    setStatus('idle');
    if (exam) {
      exam.onDone(r.record);
      return;
    }
    setPhase('result');
    loadHistory();
  }

  // Examen : le temps est écoulé -> on termine la séance si elle est assez avancée, sinon l'épreuve vaut 0
  useEffect(() => {
    if (!exam?.expired || phase === 'finishing' || phase === 'result') return;
    if (phase === 'live' && userTurns >= MIN_TURNS_TO_FINISH) handleFinish();
    else exam.onDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.expired]);

  function toggleReveal(id: string, field: 'revealed' | 'revealedFr') {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: !t[field] } : t)));
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = bcp47;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any)
        .map((r: any) => r[0].transcript)
        .join(' ');
      setLiveCaption(transcript);
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal) {
        if (mode === 'audio') submitAnswer(transcript);
        else setDraft(transcript);
      }
    };
    recognition.onerror = () => setStatus((s) => (s === 'listening' ? 'idle' : s));
    recognition.onend = () => setStatus((s) => (s === 'listening' ? 'idle' : s));

    recognitionRef.current = recognition;
    setStatus('listening');
    setLiveCaption('');
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
    setStatus('idle');
  }

  const micAvailable = recognitionSupported && !textOnly;
  const canListen = micAvailable && status === 'idle' && !ended && budget.level !== 'stop';

  // ------------------------------------------------------------ SETUP (examen)
  if (phase === 'setup' && exam) {
    return (
      <div className="conv-setup">
        <div className="sidebar-label">Situation imposée</div>
        {selectedScenario && (
          <div className="conv-objectives">
            <div className="conv-scenario-btn selected" style={{ display: 'inline-block', cursor: 'default' }}>
              {selectedScenario.emoji} {selectedScenario.label}
            </div>
            <div className="sidebar-label" style={{ marginTop: '0.6rem' }}>Tes objectifs</div>
            <ul>
              {selectedScenario.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
            <p className="eyebrow-free" style={{ marginBottom: 0 }}>
              L'IA joue : {selectedScenario.aiRole}. {CONVERSATION_MAX_EXCHANGES} échanges maximum.
            </p>
          </div>
        )}
        <div className="level-row">
          <button className={`level-btn${mode === 'audio' ? ' active' : ''}`} onClick={() => setMode('audio')}>Audio</button>
          <button className={`level-btn${mode === 'audio_text' ? ' active' : ''}`} onClick={() => setMode('audio_text')}>Audio + texte</button>
          <button className={`level-btn${mode === 'text' ? ' active' : ''}`} onClick={() => setMode('text')}>Texte seul</button>
        </div>
        <p className="conv-cost-note">
          💶 Coût estimé ≈ {formatEur(CONVERSATION_ESTIMATED_EUR)} (plafond {formatEur(CONVERSATION_BUDGET_EUR)}). Le chrono de l'épreuve tourne déjà.
        </p>
        <button className="primary" onClick={handleStart}>
          Démarrer la conversation
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------ SETUP
  if (phase === 'setup') {
    return (
      <div className="conv-setup">
        <p className="eyebrow-free">
          Une vraie conversation en {languageLabel} : l'IA joue un rôle, s'adapte à tes réponses et corrige tes erreurs au
          fil de l'échange, même quand elle a compris. À la fin, tu reçois une correction détaillée et une note sur 100,
          qui compte dans « Mes scores ». Ta conversation est conservée dans l'historique.
        </p>

        <div className="level-row">
          <button className={`level-btn${mode === 'audio' ? ' active' : ''}`} onClick={() => setMode('audio')}>
            Audio
          </button>
          <button className={`level-btn${mode === 'audio_text' ? ' active' : ''}`} onClick={() => setMode('audio_text')}>
            Audio + texte
          </button>
          <button className={`level-btn${mode === 'text' ? ' active' : ''}`} onClick={() => setMode('text')}>
            Texte seul
          </button>
        </div>
        {textOnly && (
          <p className="eyebrow-free">Mode silencieux, façon chat : pas de voix, pas de micro, tu écris tes réponses (idéal pour réviser sans bruit).</p>
        )}

        <div className="sidebar-label" style={{ marginTop: '1rem' }}>De quoi veux-tu parler ?</div>
        <div className="level-row">
          <button className={`level-btn${themeKind === 'scenario' ? ' active' : ''}`} onClick={() => setThemeKind('scenario')}>
            🎭 Une situation
          </button>
          <button className={`level-btn${themeKind === 'free' ? ' active' : ''}`} onClick={() => setThemeKind('free')}>
            💬 Discussion libre
          </button>
          <button className={`level-btn${themeKind === 'custom' ? ' active' : ''}`} onClick={() => setThemeKind('custom')}>
            ✏️ Mon sujet
          </button>
        </div>

        {themeKind === 'scenario' && (
          <>
            <div className="level-row" style={{ marginTop: '0.6rem' }}>
              <button className={`conv-mini-btn${categoryFilter === 'all' ? ' active' : ''}`} onClick={() => setCategoryFilter('all')}>
                Tous ({allScenarios.length})
              </button>
              {SCENARIO_CATEGORIES.map((c) => (
                <button
                  key={c.code}
                  className={`conv-mini-btn${categoryFilter === c.code ? ' active' : ''}`}
                  onClick={() => setCategoryFilter(c.code)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="conv-scenario-grid">
              {visibleScenarios.map((sc) => (
                <button
                  key={sc.code}
                  className={`conv-scenario-btn${scenarioCode === sc.code ? ' selected' : ''}`}
                  onClick={() => setScenarioCode(sc.code)}
                >
                  <span className="conv-scenario-emoji">{sc.emoji}</span> {sc.label}
                  {isAboveLevel(sc, levelCode) && <span className="conv-scenario-level"> · dès {sc.minLevel}</span>}
                </button>
              ))}
            </div>
            {selectedScenario && (
              <div className="conv-objectives">
                <div className="sidebar-label">Tes objectifs</div>
                <ul>
                  {selectedScenario.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
                <p className="eyebrow-free" style={{ marginBottom: 0 }}>
                  L'IA joue : {selectedScenario.aiRole}. Les objectifs sont jugés à la fin.
                </p>
              </div>
            )}
          </>
        )}
        {themeKind === 'free' && (
          <p className="eyebrow-free">L'IA choisit un sujet de la vie courante et te lance la conversation.</p>
        )}
        {themeKind === 'custom' && (
          <input
            className="conv-theme-input"
            type="text"
            maxLength={CUSTOM_THEME_MAX_CHARS}
            placeholder="Ton sujet (ex. mon dernier voyage, le foot, mon métier…)"
            value={customTheme}
            onChange={(e) => setCustomTheme(e.target.value)}
          />
        )}

        <p className="conv-cost-note">
          💶 Séance de {CONVERSATION_MAX_EXCHANGES} échanges maximum — coût estimé ≈ {formatEur(CONVERSATION_ESTIMATED_EUR)}, plafond{' '}
          {formatEur(CONVERSATION_BUDGET_EUR)}. Le coût réel s'affiche en direct pendant la conversation, et l'IA te prévient quand il
          faut conclure.
        </p>

        {!textOnly && !speechSupported && (
          <p className="conv-warning">Ton navigateur ne gère pas la synthèse vocale : la conversation se fera en texte seulement.</p>
        )}
        {!textOnly && !recognitionSupported && (
          <p className="conv-warning">
            Ton navigateur ne gère pas la reconnaissance vocale (fonctionne mieux sur Chrome) : tu pourras répondre au clavier.
          </p>
        )}

        <button className="primary" onClick={handleStart} disabled={themeKind === 'custom' && !customTheme.trim()}>
          Démarrer la conversation
        </button>

        {historyError && <p className="conv-warning" style={{ marginTop: '1rem' }}>{historyError}</p>}
        <ConversationHistory records={records} onDelete={handleDeleteRecord} />
      </div>
    );
  }

  // ----------------------------------------------------------------- RESULT
  if (phase === 'result' && result) {
    return (
      <div className="conv-live">
        <div className="sidebar-label">Conversation terminée — {result.theme_label}</div>
        <ConversationTranscript record={result} />
        <ConversationFeedback record={result} />
        <button className="primary conv-reset" onClick={handleReset}>
          Nouvelle conversation
        </button>
        <ConversationHistory records={records} onDelete={handleDeleteRecord} />
      </div>
    );
  }

  // ------------------------------------------------------------ LIVE / FINISHING
  const meterPercent = Math.min(100, Math.round(budget.ratio * 100)); // la barre est pleine quand le budget des échanges est épuisé (la correction finale est réservée)
  const finishing = phase === 'finishing';

  return (
    <div className="conv-live">
      <div className="conv-meter">
        <div className="conv-meter-head">
          <span>
            Échange {Math.min(userTurns, CONVERSATION_MAX_EXCHANGES)} / {CONVERSATION_MAX_EXCHANGES}
          </span>
          <span>
            Coût : {formatEur(budget.spentEur)} / {formatEur(CONVERSATION_BUDGET_EUR)}
          </span>
        </div>
        <div className="conv-meter-track">
          <div
            className={`conv-meter-fill${budget.level === 'soon' ? ' warn' : budget.level === 'final' || budget.level === 'stop' ? ' alert' : ''}`}
            style={{ width: `${meterPercent}%` }}
          />
        </div>
      </div>

      {budget.level === 'soon' && !ended && (
        <p className="conv-banner conv-banner-soon">💡 Il reste peu d'échanges : pense à conclure la conversation.</p>
      )}
      {budget.level === 'final' && !ended && (
        <p className="conv-banner conv-banner-soon">⏳ Dernier échange : la prochaine réponse de l'IA conclura la conversation.</p>
      )}
      {(ended || budget.level === 'stop') && (
        <p className="conv-banner conv-banner-final">
          ⏳ La conversation est terminée (limite d'échanges ou de budget atteinte). Clique sur « Voir ma correction et ma note ».
        </p>
      )}

      <div className="conv-status">
        {finishing && '📝 Correction en cours…'}
        {!finishing && status === 'ai_speaking' && "🔊 L'IA parle…"}
        {!finishing && status === 'thinking' && "💭 L'IA réfléchit…"}
        {!finishing && status === 'listening' && "🎙️ Je t'écoute…"}
        {!finishing && status === 'idle' && !ended && 'À toi de répondre'}
        {!finishing && status === 'error' && `⚠️ ${errorMsg}`}
      </div>
      {status === 'error' && retryAction && (
        <button className="secondary" style={{ marginBottom: '0.8rem' }} onClick={retryAction}>
          Réessayer
        </button>
      )}

      <div className="conv-transcript">
        {turns.map((t) => {
          if (t.speaker === 'user') {
            return (
              <div key={t.id}>
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
          }
          return (
            <div key={t.id} className="conv-bubble conv-bubble-ai">
              {t.revealed ? <div>{t.text}</div> : <div className="conv-hidden-text">🔊 (écoute l'audio)</div>}
              {t.revealedFr && <div className="conv-bubble-translation">🇫🇷 {t.text_fr}</div>}
              <div className="conv-bubble-actions">
                {!textOnly && (
                  <button className="conv-mini-btn" onClick={() => speak(t.text).then(() => setStatus('idle'))}>
                    🔊 Réécouter
                  </button>
                )}
                <button className="conv-mini-btn" onClick={() => toggleReveal(t.id, 'revealed')}>
                  {t.revealed ? 'Masquer le texte' : 'Afficher le texte'}
                </button>
                <button className="conv-mini-btn" onClick={() => toggleReveal(t.id, 'revealedFr')}>
                  {t.revealedFr ? 'Masquer la traduction' : 'Traduire'}
                </button>
              </div>
            </div>
          );
        })}

        {status === 'listening' && liveCaption && <div className="conv-bubble conv-bubble-user conv-bubble-live">{liveCaption}…</div>}
      </div>

      {!ended && budget.level !== 'stop' && (
        <div className="conv-controls">
          {micAvailable ? (
            <button
              className={`mic-btn${status === 'listening' ? ' active' : ''}`}
              onClick={status === 'listening' ? stopListening : startListening}
              disabled={!canListen && status !== 'listening'}
            >
              {status === 'listening' ? '⏹ Stop' : '🎙️ Parler'}
            </button>
          ) : (
            !textOnly && <span className="eyebrow-free">Réponds au clavier ci-dessous.</span>
          )}

          {(mode !== 'audio' || !recognitionSupported) && (
            <div className="conv-text-row">
              <LanguageInput
                languageCode={languageCode}
                value={draft}
                onChange={setDraft}
                rows={2}
                compact
                placeholder="Ta réponse… (Entrée pour envoyer)"
                disabled={status === 'thinking' || finishing}
                onEnter={(v) => submitAnswer(v)}
              />
              <button className="primary" onClick={() => submitAnswer(draft)} disabled={!draft.trim() || status === 'thinking' || finishing}>
                Envoyer
              </button>
            </div>
          )}
        </div>
      )}

      <div className="conv-finish-row">
        <button className={ended || budget.level === 'stop' ? 'primary' : 'secondary'} onClick={handleFinish} disabled={!canFinish || finishing}>
          {finishing ? 'Correction…' : 'Voir ma correction et ma note'}
        </button>
        {userTurns < MIN_TURNS_TO_FINISH && (
          <span className="eyebrow-free" style={{ margin: 0 }}>
            (après {MIN_TURNS_TO_FINISH} réponses minimum)
          </span>
        )}
        {!exam && (
          <button className="secondary conv-reset" onClick={handleReset} disabled={finishing}>
            Abandonner
          </button>
        )}
      </div>
    </div>
  );
}
