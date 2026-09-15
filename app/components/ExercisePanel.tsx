'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Phrase } from '../../lib/data';
import { markPhraseSeen } from '../../lib/data';

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
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

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
    const answerWords = answer.split(/\s+/).map(normalizeWord).filter(Boolean);
    const targetWords = cloze!.tokens.map(normalizeWord);
    const foundBlanks = blankWords.filter((w) => answerWords.includes(normalizeWord(w)));
    const matchedTotal = targetWords.filter((w) => answerWords.includes(w)).length;

    setTranscript(answer);
    setStatus('checked');
    return { success: foundBlanks.length === blankWords.length, ratio: matchedTotal / targetWords.length };
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
      setTranscript(text);
      const isFinal = event.results[event.results.length - 1].isFinal;
      if (isFinal) check(text);
    };
    recognition.onerror = () => setStatus((s) => (s === 'listening' ? 'idle' : s));
    recognition.onend = () => setStatus((s) => (s === 'listening' ? 'idle' : s));

    recognitionRef.current = recognition;
    setStatus('listening');
    setTranscript('');
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
  }

  const evaluated = status === 'checked' ? evaluateAnswer() : null;

  function evaluateAnswer() {
    const answerWords = transcript.split(/\s+/).map(normalizeWord).filter(Boolean);
    const foundBlanks = blankWords.filter((w) => answerWords.includes(normalizeWord(w)));
    return { success: foundBlanks.length === blankWords.length, foundCount: foundBlanks.length };
  }

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

        {status === 'checked' && evaluated && (
          <div className={evaluated.success ? 'conv-correction exercise-success' : 'conv-correction'}>
            <div className="conv-correction-label">{evaluated.success ? '✅ Bravo' : '✏️ Pas tout à fait'}</div>
            <div className="conv-correction-text">{phrase.target_text}</div>
            <div className="conv-correction-explanation">
              Toi : "{transcript || typedAnswer}" — mot(s) manquant(s) retrouvé(s) : {evaluated.foundCount} /{' '}
              {blankWords.length}
            </div>
          </div>
        )}

        <div className="conv-controls">
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
        </div>
      </div>

      <div className="deck-nav">
        <button
          className="secondary"
          onClick={() => {
            setStatus('idle');
            setTranscript('');
            setTypedAnswer('');
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