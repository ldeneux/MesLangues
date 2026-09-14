'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getConversationTurn,
  type ConversationTurn,
  type ConversationCorrection,
} from '../../lib/conversation';

type Mode = 'audio' | 'audio_text';
type Status = 'idle' | 'ai_speaking' | 'listening' | 'thinking' | 'error';

type UiTurn =
  | { kind: 'ai'; id: string; text: string; text_fr: string; revealed: boolean; revealedFr: boolean }
  | { kind: 'user'; id: string; text: string }
  | { kind: 'correction'; id: string; correction: ConversationCorrection };

let uid = 0;
const nextId = () => String(uid++);

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

  // Historique "brut" envoyé à l'IA (texte seulement).
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  // Historique enrichi pour l'affichage (traduction, réglages de révélation, corrections).
  const [uiTurns, setUiTurns] = useState<UiTurn[]>([]);

  const [draft, setDraft] = useState('');
  const [liveCaption, setLiveCaption] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [recognitionSupported, setRecognitionSupported] = useState(false);

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

      setUiTurns((prev) => {
        const additions: UiTurn[] = [];
        if (reply.correction.has_error) {
          additions.push({ kind: 'correction', id: nextId(), correction: reply.correction });
        }
        additions.push({
          kind: 'ai',
          id: nextId(),
          text: reply.message,
          text_fr: reply.message_fr,
          revealed: mode === 'audio_text',
          revealedFr: false,
        });
        return [...prev, ...additions];
      });

      setHistory([...nextHistory, { speaker: 'ai', text: reply.message }]);
      await speak(reply.message);
      setStatus('idle');
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Erreur pendant la conversation.');
      setStatus('error');
    }
  }

  function handleStart() {
    setStarted(true);
    setHistory([]);
    setUiTurns([]);
    requestNextTurn([]);
  }

  function handleReset() {
    if (speechSupported) window.speechSynthesis.cancel();
    recognitionRef.current?.stop?.();
    setStarted(false);
    setHistory([]);
    setUiTurns([]);
    setDraft('');
    setLiveCaption('');
    setStatus('idle');
  }

  function submitAnswer(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setDraft('');
    setLiveCaption('');
    setUiTurns((prev) => [...prev, { kind: 'user', id: nextId(), text: clean }]);
    const nextHistory: ConversationTurn[] = [...history, { speaker: 'user', text: clean }];
    setHistory(nextHistory);
    requestNextTurn(nextHistory);
  }

  function toggleReveal(id: string, field: 'revealed' | 'revealedFr') {
    setUiTurns((prev) =>
      prev.map((t) => (t.kind === 'ai' && t.id === id ? { ...t, [field]: !t[field] } : t))
    );
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = bcp47;
    recognition.interimResults = true; // on veut toujours voir le texte pendant qu'on parle
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any)
        .map((r: any) => r[0].transcript)
        .join(' ');
      setLiveCaption(transcript);
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal) {
        if (mode === 'audio') {
          submitAnswer(transcript);
        } else {
          setDraft(transcript);
        }
      }
    };
    recognition.onerror = () => setStatus((s) => (s === 'listening' ? 'idle' : s));
    recognition.onend = () => {
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    setLiveCaption('');
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
    setStatus('idle');
  }

  const canListen = recognitionSupported && status === 'idle';

  if (!started) {
    return (
      <div className="conv-setup">
        <p className="eyebrow-free">
          L'IA discute avec toi en {languageLabel}, s'adapte à tes réponses et corrige tes
          erreurs au fil de la conversation, même quand elle a compris ce que tu voulais dire —
          pour que tu progresses. En mode "Audio", ses questions restent cachées en texte par
          défaut (bouton pour les afficher ou les traduire si besoin) ; en mode "Audio + texte"
          elles s'affichent tout de suite. Tes propres réponses, elles, sont toujours affichées
          en texte.
        </p>

        <div className="level-row">
          <button
            className={`level-btn${mode === 'audio' ? ' active' : ''}`}
            onClick={() => setMode('audio')}
          >
            Audio
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

      <div className="conv-transcript">
        {uiTurns.map((t) => {
          if (t.kind === 'user') {
            return (
              <div key={t.id} className="conv-bubble conv-bubble-user">
                {t.text}
              </div>
            );
          }

          if (t.kind === 'correction') {
            return (
              <div key={t.id} className="conv-correction">
                <div className="conv-correction-label">✏️ Correction</div>
                <div className="conv-correction-text">{t.correction.corrected_text}</div>
                <div className="conv-correction-explanation">{t.correction.explanation_fr}</div>
              </div>
            );
          }

          // t.kind === 'ai'
          return (
            <div key={t.id} className="conv-bubble conv-bubble-ai">
              {t.revealed ? (
                <div>{t.text}</div>
              ) : (
                <div className="conv-hidden-text">🔊 (écoute l'audio)</div>
              )}
              {t.revealedFr && <div className="conv-bubble-translation">🇫🇷 {t.text_fr}</div>}
              <div className="conv-bubble-actions">
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

        {status === 'listening' && liveCaption && (
          <div className="conv-bubble conv-bubble-user conv-bubble-live">{liveCaption}…</div>
        )}
      </div>

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

        {(mode === 'audio_text' || !recognitionSupported) && (
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
