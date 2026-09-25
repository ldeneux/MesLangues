'use client';

import { useEffect, useRef, useState } from 'react';
import { getGameItems, recordGameResult, type GameItem } from '../../lib/vocabulary';
import { normalizeForCompare as normalize } from '../../lib/textUtils';

const MAX_ATTEMPTS = 3;

type Status = 'idle' | 'listening' | 'checked' | 'finished';

export default function VocabularyGamePanel({
  profileId,
  languageCode,
  levelCode,
  bcp47,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
  bcp47: string;
}) {
  const [reviewMode, setReviewMode] = useState(false);
  const [items, setItems] = useState<GameItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [attempts, setAttempts] = useState(0);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const resultCapturedRef = useRef(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
  }, []);

  function startGame() {
    setItems(null);
    setIndex(0);
    setStatus('idle');
    setAttempts(0);
    attemptsRef.current = 0;
    setScore({ correct: 0, total: 0 });
    getGameItems(languageCode, levelCode, profileId, 20, reviewMode).then(setItems);
  }

  useEffect(() => {
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode, reviewMode]);

  const item = items?.[index];

  async function check(answer: string) {
    if (!item) return;
    const success = answer.trim().length > 0 && normalize(answer).includes(normalize(item.target_text));
    setCorrect(success);
    setStatus('checked');
    setTranscript(answer);
    setScore((s) => ({ correct: s.correct + (success ? 1 : 0), total: s.total + 1 }));
    await recordGameResult(profileId, item.id, item.source, success);
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    resultCapturedRef.current = false;
    const recognition = new SR();
    recognition.lang = bcp47;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const text = Array.from(event.results as any)
        .map((r: any) => r[0].transcript)
        .join(' ');
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal) {
        resultCapturedRef.current = true;
        check(text);
      }
    };

    recognition.onerror = () => {
      if (!resultCapturedRef.current) {
        resultCapturedRef.current = true; // évite un double comptage si onend se déclenche aussi
        handleNoCapture();
      }
    };
    recognition.onend = () => {
      setStatus((s) => (s === 'listening' ? 'idle' : s));
      if (!resultCapturedRef.current) {
        resultCapturedRef.current = true;
        handleNoCapture();
      }
    };

    recognitionRef.current = recognition;
    setStatus('listening');
    recognition.start();
  }

  function handleNoCapture() {
    attemptsRef.current += 1;
    setAttempts(attemptsRef.current);
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      check(''); // micro n'a rien capté après 3 essais — compté comme un échec
    }
  }

  function next() {
    if (!items) return;
    setAttempts(0);
    attemptsRef.current = 0;
    if (index + 1 >= items.length) {
      setStatus('finished');
    } else {
      setIndex((i) => i + 1);
      setStatus('idle');
      setTranscript('');
      setCorrect(null);
    }
  }

  function playAudio() {
    if (!item?.audio_url) return;
    new Audio(item.audio_url).play().catch(() => {});
  }

  if (!recognitionSupported) {
    return (
      <p className="conv-warning">
        Le mode Test se joue à l'oral et nécessite la reconnaissance vocale, non disponible sur ce navigateur (essaie
        Chrome ou Edge).
      </p>
    );
  }

  return (
    <div>
      <div className="conv-bubble-actions" style={{ marginBottom: '1rem' }}>
        <button className={`conv-mini-btn${reviewMode ? ' selected-mini' : ''}`} onClick={() => setReviewMode((r) => !r)}>
          🔁 Révisions (uniquement les mots déjà joués)
        </button>
      </div>

      {items === null && <p className="eyebrow-free">Préparation du jeu…</p>}

      {items && items.length === 0 && (
        <p className="eyebrow-free">
          {reviewMode
            ? "Aucun mot déjà pratiqué pour l'instant — décoche \"Révisions\" pour découvrir de nouveaux mots."
            : 'Pas encore de vocabulaire ni de verbes téléchargés pour jouer — va dans l\'onglet "Packs".'}
        </p>
      )}

      {items && items.length > 0 && status === 'finished' && (
        <div className="conv-correction exercise-success">
          <div className="conv-correction-label">Partie terminée</div>
          <div className="conv-correction-text">
            {score.correct} / {score.total} bonnes réponses
          </div>
          <button className="primary" style={{ marginTop: '0.75rem' }} onClick={startGame}>
            Rejouer avec 20 nouveaux mots
          </button>
        </div>
      )}

      {items && items.length > 0 && status !== 'finished' && item && (
        <>
          <div className="deck-progress">
            {index + 1} / {items.length} — score : {score.correct} / {score.total}
          </div>

          <div className="phrase-card phrase-card-big">
            <p className="eyebrow-free">Traduis à l'oral :</p>
            <div className="phrase-target">{item.translation_fr}</div>

            {status === 'listening' && attempts > 0 && (
              <p className="eyebrow-free">Essai {attempts + 1} / {MAX_ATTEMPTS}…</p>
            )}

            {status === 'checked' && (
              <div className={correct ? 'conv-correction exercise-success' : 'conv-correction'}>
                <div className="conv-correction-label">{correct ? '✅ Correct' : '✏️ Pas tout à fait'}</div>
                <div className="conv-correction-text">{item.target_text}</div>
                <div className="conv-correction-explanation">
                  {transcript ? `Toi : "${transcript}"` : "Le micro n'a rien capté après 3 essais."}
                </div>
                {item.audio_url && (
                  <button className="conv-mini-btn" style={{ marginTop: '0.5rem' }} onClick={playAudio}>
                    🔊 Écouter la prononciation
                  </button>
                )}
              </div>
            )}

            <div className="conv-controls">
              {status !== 'checked' && (
                <>
                  <button
                    className={`mic-btn${status === 'listening' ? ' active' : ''}`}
                    onClick={startListening}
                    disabled={status === 'listening'}
                  >
                    {status === 'listening' ? '🎙️ Écoute…' : '🎙️ Répondre'}
                  </button>
                  <button className="conv-mini-btn" onClick={() => check('')}>
                    Je ne sais pas
                  </button>
                </>
              )}
            </div>
          </div>

          {status === 'checked' && (
            <div className="deck-nav">
              <button className="primary" onClick={next} style={{ width: '100%' }}>
                {index + 1 >= items.length ? 'Voir le score' : 'Mot suivant →'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
