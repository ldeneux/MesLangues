'use client';

import { useEffect, useRef, useState } from 'react';
import { getGameItems, recordGameResult, type GameItem } from '../../lib/vocabulary';

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

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
  const [items, setItems] = useState<GameItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
  }, []);

  function startGame() {
    setItems(null);
    setIndex(0);
    setStatus('idle');
    setScore({ correct: 0, total: 0 });
    getGameItems(languageCode, levelCode, 20).then(setItems);
  }

  useEffect(() => {
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const item = items?.[index];

  async function check(answer: string) {
    if (!item) return;
    const success = normalize(answer).includes(normalize(item.target_text));
    setCorrect(success);
    setStatus('checked');
    setTranscript(answer);
    setScore((s) => ({ correct: s.correct + (success ? 1 : 0), total: s.total + 1 }));
    await recordGameResult(profileId, item.id, item.source, success);
  }

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = bcp47;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const text = Array.from(event.results as any)
        .map((r: any) => r[0].transcript)
        .join(' ');
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal) check(text);
    };
    recognition.onerror = () => setStatus((s) => (s === 'listening' ? 'idle' : s));
    recognition.onend = () => setStatus((s) => (s === 'listening' ? 'idle' : s));

    recognitionRef.current = recognition;
    setStatus('listening');
    recognition.start();
  }

  function next() {
    if (!items) return;
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
        Le mode Jeu se joue à l'oral et nécessite la reconnaissance vocale, non disponible sur ce navigateur (essaie
        Chrome ou Edge).
      </p>
    );
  }

  if (items === null) return <p className="eyebrow-free">Préparation du jeu…</p>;

  if (items.length === 0) {
    return (
      <p className="eyebrow-free">
        Pas encore de vocabulaire ni de verbes téléchargés pour jouer — va dans l'onglet "Packs".
      </p>
    );
  }

  if (status === 'finished') {
    return (
      <div className="conv-correction exercise-success">
        <div className="conv-correction-label">Partie terminée</div>
        <div className="conv-correction-text">
          {score.correct} / {score.total} bonnes réponses
        </div>
        <button className="primary" style={{ marginTop: '0.75rem' }} onClick={startGame}>
          Rejouer avec 20 nouveaux mots
        </button>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div>
      <div className="deck-progress">
        {index + 1} / {items.length} — score : {score.correct} / {score.total}
      </div>

      <div className="phrase-card phrase-card-big">
        <p className="eyebrow-free">Traduis à l'oral :</p>
        <div className="phrase-target">{item.translation_fr}</div>

        {status === 'checked' && (
          <div className={correct ? 'conv-correction exercise-success' : 'conv-correction'}>
            <div className="conv-correction-label">{correct ? '✅ Correct' : '✏️ Pas tout à fait'}</div>
            <div className="conv-correction-text">{item.target_text}</div>
            <div className="conv-correction-explanation">Toi : "{transcript}"</div>
            {item.audio_url && (
              <button className="conv-mini-btn" style={{ marginTop: '0.5rem' }} onClick={playAudio}>
                🔊 Écouter la prononciation
              </button>
            )}
          </div>
        )}

        <div className="conv-controls">
          {status !== 'checked' && (
            <button
              className={`mic-btn${status === 'listening' ? ' active' : ''}`}
              onClick={startListening}
              disabled={status === 'listening'}
            >
              {status === 'listening' ? '🎙️ Écoute…' : '🎙️ Répondre'}
            </button>
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
    </div>
  );
}
