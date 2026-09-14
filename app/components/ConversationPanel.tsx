'use client';

import { useEffect, useRef, useState } from 'react';
import { getConversationTurn, type ConversationTurn } from '../../lib/conversation';

type Mode = 'audio' | 'audio_text';
type Status = 'idle' | 'ai_speaking' | 'listening' | 'thinking' | 'error';

export default function ConversationPanel({
  languageCode,
  languageLabel,
  levelCode,
  bcp47,
}: {
  languageCode: string;
  languageLabel: string;
  levelCode: string;
  bcp47: string;
}) {
  const [mode, setMode] = useState<Mode>('audio_text');
  const [theme, setTheme] = useState('');
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [lastFeedback, setLastFeedback] = useState('');
  const [draft, setDraft] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [recognitionSupported, setRecognitionSupported] = useState(false);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
  }, []);

  // Coupe la synthèse vocale en quittant l'onglet/le composant.
  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
      recognitionRef.current?.stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function requestNextTurn(nextHistory: ConversationTurn[]) {
    setStatus('thinking');
    setErrorMsg('');
    try {
      const reply = await getConversationTurn(languageCode, levelCode, nextHistory, theme || undefined);
      const updated: ConversationTurn[] = [...nextHistory, { speaker: 'ai', text: reply.message }];
      setTurns(updated);
      setLastFeedback(reply.feedback_fr);
      await speak(reply.message);
      setStatus('idle');
    } catch (e: any) {
      setErrorMsg(e.message ?? "Erreur pendant la conversation.");
      setStatus('error');
    }
  }

  function handleStart() {
    setStarted(true);
    setTurns([]);
    setLastFeedback('');
    requestNextTurn([]);
  }

  function handleReset() {
    if (speechSupported) window.speechSynthesis.cancel();
    recognitionRef.current?.stop?.();
    setStarted(false);
    setTurns([]);
    setDraft('');
    setLastFeedback('');
    setStatus('idle');
  }

  function submitAnswer(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setDraft('');
    const updated: ConversationTurn[] = [...turns, { speaker: 'user', text: clean }];
    setTurns(updated);
    requestNextTurn(updated);
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = bcp47;
    recognition.interimResults = mode === 'audio_text';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any)
        .map((r: any) => r[0].transcript)
        .join(' ');
      if (mode === 'audio_text') {
        setDraft(transcript);
      } else {
        // Mode audio uniquement : dès que la reconnaissance a un résultat
        // final, on l'envoie directement, pas d'étape d'édition.
        const isFinal = event.results[event.results.length - 1].isFinal;
        if (isFinal) submitAnswer(transcript);
      }
    };
    recognition.onerror = () => setStatus((s) => (s === 'listening' ? 'idle' : s));
    recognition.onend = () => {
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
    setStatus('idle');
  }

  const canListen = recognitionSupported && (status === 'idle');

  if (!started) {
    return (
      <div className="conv-setup">
        <p className="eyebrow-free">
          L'IA discute avec toi en {languageLabel}, s'adapte à tes réponses et te relance
          naturellement. En mode "Audio uniquement" tout se passe à la voix ; en mode
          "Audio + texte" tu vois aussi la transcription et peux répondre au clavier.
        </p>

        <div className="level-row">
          <button
            className={`level-btn${mode === 'audio' ? ' active' : ''}`}
            onClick={() => setMode('audio')}
          >
            Audio uniquement
          </button>
          <button
            className={`level-btn${mode === 'audio_text' ? ' active' : ''}`}
            onClick={() => setMode('audio_text')}
          >
            Audio + texte
          </button>
        </div>

        <input
          className="conv-theme-input"
          type="text"
          placeholder="Sujet de la conversation (optionnel)"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        />

        {!speechSupported && (
          <p className="conv-warning">
            Ton navigateur ne gère pas la synthèse vocale : la conversation se fera en texte
            seulement.
          </p>
        )}
        {!recognitionSupported && (
          <p className="conv-warning">
            Ton navigateur ne gère pas la reconnaissance vocale (fonctionne mieux sur Chrome) :
            tu pourras répondre au clavier.
          </p>
        )}

        <button className="primary" onClick={handleStart}>
          Démarrer la conversation
        </button>
      </div>
    );
  }

  return (
    <div className="conv-live">
      <div className="conv-status">
        {status === 'ai_speaking' && "🔊 L'IA parle…"}
        {status === 'thinking' && "💭 L'IA réfléchit…"}
        {status === 'listening' && "🎙️ Je t'écoute…"}
        {status === 'idle' && 'À toi de répondre'}
        {status === 'error' && `⚠️ ${errorMsg}`}
      </div>

      {mode === 'audio_text' && (
        <div className="conv-transcript">
          {turns.map((t, i) => (
            <div key={i} className={`conv-bubble conv-bubble-${t.speaker}`}>
              {t.text}
            </div>
          ))}
          {lastFeedback && <div className="conv-feedback">💡 {lastFeedback}</div>}
        </div>
      )}

      {mode === 'audio' && (
        <>
          {turns.length > 0 && (
            <div className="phrase-card phrase-card-big">
              <div className="phrase-target">{turns[turns.length - 1].text}</div>
            </div>
          )}
          {lastFeedback && <div className="conv-feedback">💡 {lastFeedback}</div>}
        </>
      )}

      <div className="conv-controls">
        {recognitionSupported ? (
          <button
            className={`mic-btn${status === 'listening' ? ' active' : ''}`}
            onClick={status === 'listening' ? stopListening : startListening}
            disabled={!canListen && status !== 'listening'}
          >
            {status === 'listening' ? '⏹ Stop' : '🎙️ Parler'}
          </button>
        ) : (
          <span className="eyebrow-free">Réponds au clavier ci-dessous.</span>
        )}

        {mode === 'audio_text' && (
          <div className="conv-text-row">
            <input
              className="conv-text-input"
              type="text"
              placeholder="Ta réponse…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAnswer(draft);
              }}
            />
            <button className="primary" onClick={() => submitAnswer(draft)} disabled={!draft.trim()}>
              Envoyer
            </button>
          </div>
        )}
      </div>

      <button className="secondary conv-reset" onClick={handleReset}>
        Recommencer
      </button>
    </div>
  );
}
