'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Phrase } from '../../lib/data';
import { markPhraseSeen } from '../../lib/data';

const MAX_ATTEMPTS = 3;

function normalizeWord(w: string) {
  return w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

type Cloze = { tokens: string[]; blankIndices: number[] };

function buildCloze(text: string): Cloze | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return null;
  const blankCount = tokens.length >= 10 ? 2 : 1;

  const indices = new Set<number>();
  while (indices.size < blankCount) {
    indices.add(Math.floor(Math.random() * tokens.length));
  }
  return { tokens, blankIndices: Array.from(indices) };
}

type Status = 'idle' | 'listening' | 'checked';

export default function ExercisePanel({
  phrases,
  profileId,
  bcp47,
}: {
  phrases: Phrase[];
  profileId: string;
  bcp47: string;
}) {
  const eligible = useMemo(() => phrases.filter((p) => p.target_text.split(/\s+/).filter(Boolean).length >= 5), [
    phrases,
  ]);

  const [index, setIndex] = useState(0);
  const [cloze, setCloze] = useState<Cloze | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [gaveUp, setGaveUp] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const resultCapturedRef = useRef(false);
  const attemptsRef = useRef(0);

  const phrase = eligible[index];

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
  }, []);

  useEffect(() => {
    if (phrase) {
      setCloze(buildCloze(phrase.target_text));
      setStatus('idle');
      setTranscript('');
      setTypedAnswer('');
      setGaveUp(false);
      setAttempts(0);
      attemptsRef.current = 0;
      markPhraseSeen(profileId, phrase.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  if (!phrase || !cloze) {
    return (
      <p className="eyebrow-free">
        Pas assez de phrases avec au moins 5 mots dans la file du jour pour faire un exercice à trous pour
        l'instant.
      </p>
    );
  }

  const maskedDisplay = cloze.tokens
    .map((t, i) => (cloze.blankIndices.includes(i) ? '▁▁▁▁▁' : t))
    .join(' ');

  const blankWords = cloze.blankIndices.map((i) => cloze.tokens[i]);

  function check(answer: string) {
    setTranscript(answer);
    setStatus('checked');
  }

  function giveUp() {
    setGaveUp(true);
    setTranscript('');
    setStatus('checked');
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
      setTranscript(text);
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal) {
        resultCapturedRef.current = true;
        check(text);
      }
    };
    recognition.onerror = () => {
      if (!resultCapturedRef.current) {
        resultCapturedRef.current = true;
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
    setTranscript('');
    recognition.start();
  }

  function handleNoCapture() {
    attemptsRef.current += 1;
    setAttempts(attemptsRef.current);
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      check(''); // micro n'a rien capté après 3 essais — compté comme raté
    }
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
  }

  const evaluated =
    status === 'checked' && !gaveUp
      ? (() => {
          const answerWords = transcript.split(/\s+/).map(normalizeWord).filter(Boolean);
          const foundBlanks = blankWords.filter((w) => answerWords.includes(normalizeWord(w)));
          return { success: foundBlanks.length === blankWords.length, foundCount: foundBlanks.length };
        })()
      : null;

  function next() {
    setIndex((i) => Math.min(eligible.length - 1, i + 1));
  }

  return (
    <div>
      <div className="deck-progress">
        {index + 1} / {eligible.length}
      </div>

      <div className="phrase-card phrase-card-big">
        {phrase.audio_url ? (
          <audio className="phrase-audio" controls src={phrase.audio_url} />
        ) : (
          <div className="phrase-notes">Audio en cours de génération.</div>
        )}

        <div className="phrase-target">{maskedDisplay}</div>
        <p className="eyebrow-free">
          Écoute puis répète la phrase entière à voix haute, en incluant le(s) mot(s) manquant(s) (▁▁▁▁▁).
        </p>

        {status === 'listening' && attempts > 0 && (
          <p className="eyebrow-free">Essai {attempts + 1} / {MAX_ATTEMPTS}…</p>
        )}

        {status === 'checked' && (
          <div
            className={
              gaveUp ? 'conv-correction' : evaluated?.success ? 'conv-correction exercise-success' : 'conv-correction'
            }
          >
            <div className="conv-correction-label">
              {gaveUp ? '💡 Solution' : evaluated?.success ? '✅ Bravo' : '✏️ Pas tout à fait'}
            </div>
            <div className="conv-correction-text">{phrase.target_text}</div>
            {!gaveUp && (
              <div className="conv-correction-explanation">
                {transcript ? `Toi : "${transcript}"` : "Le micro n'a rien capté après 3 essais."} — mot(s)
                manquant(s) retrouvé(s) : {evaluated?.foundCount ?? 0} / {blankWords.length}
              </div>
            )}
          </div>
        )}

        <div className="conv-controls">
          {status !== 'checked' && (
            <>
              {recognitionSupported ? (
                <button
                  className={`mic-btn${status === 'listening' ? ' active' : ''}`}
                  onClick={status === 'listening' ? stopListening : startListening}
                >
                  {status === 'listening' ? '⏹ Stop' : '🎙️ Répéter'}
                </button>
              ) : (
                <div className="conv-text-row">
                  <input
                    className="conv-text-input"
                    type="text"
                    placeholder="Tape la phrase complète…"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') check(typedAnswer);
                    }}
                  />
                  <button className="primary" onClick={() => check(typedAnswer)} disabled={!typedAnswer.trim()}>
                    Vérifier
                  </button>
                </div>
              )}
              <button className="conv-mini-btn" onClick={giveUp}>
                Je ne sais pas
              </button>
            </>
          )}
        </div>
      </div>

      <div className="deck-nav">
        <button
          className="secondary"
          onClick={() => {
            setStatus('idle');
            setTranscript('');
            setTypedAnswer('');
            setGaveUp(false);
            setAttempts(0);
            attemptsRef.current = 0;
          }}
        >
          Réessayer
        </button>
        <button className="primary" onClick={next} disabled={index === eligible.length - 1}>
          Phrase suivante →
        </button>
      </div>
    </div>
  );
}
