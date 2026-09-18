'use client';

import { useEffect, useState } from 'react';
import { getVocabularyWords, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import type { LangCode, LevelCode } from '../../lib/constants';

const MAX_ERRORS = 6;

function normalizeLetter(c: string) {
  return c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function GamePendu({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: LangCode;
  levelCode: LevelCode;
}) {
  const [words, setWords] = useState<VocabularyWordWithMastery[] | null>(null);
  const [word, setWord] = useState<VocabularyWordWithMastery | null>(null);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState(0);
  const [input, setInput] = useState('');

  useEffect(() => {
    setWords(null);
    getVocabularyWords(profileId, languageCode, levelCode)
      .catch(() => [])
      .then((list) => setWords(list ?? []));
  }, [profileId, languageCode, levelCode]);

  useEffect(() => {
    if (words && words.length > 0) newWord(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  function newWord(pool: VocabularyWordWithMastery[]) {
    const candidates = pool.filter((w) => w.target_text.replace(/[^a-zA-ZÀ-ÿ]/g, '').length >= 3);
    if (candidates.length === 0) return;
    setWord(candidates[Math.floor(Math.random() * candidates.length)]);
    setGuessed(new Set());
    setErrors(0);
    setInput('');
  }

  if (words === null) return <p className="eyebrow-free">Chargement…</p>;
  if (words.length === 0) {
    return <p className="eyebrow-free">Pas encore de vocabulaire téléchargé — va dans l'onglet "Packs".</p>;
  }
  if (!word) return <p className="eyebrow-free">Pas de mot assez long trouvé pour ce niveau.</p>;

  const letters = word.target_text.split('');
  const display = letters.map((c) => (/[a-zA-ZÀ-ÿ]/.test(c) ? (guessed.has(normalizeLetter(c)) ? c : '_') : c));
  const won = letters.every((c) => !/[a-zA-ZÀ-ÿ]/.test(c) || guessed.has(normalizeLetter(c)));
  const lost = errors >= MAX_ERRORS;
  const finished = won || lost;

  function guessLetter(raw: string) {
    if (finished) return;
    const letter = normalizeLetter(raw.slice(-1));
    if (!letter || guessed.has(letter)) {
      setInput('');
      return;
    }
    const next = new Set(guessed);
    next.add(letter);
    setGuessed(next);
    setInput('');

    const normalizedWordLetters = letters.filter((c) => /[a-zA-ZÀ-ÿ]/.test(c)).map(normalizeLetter);
    if (!normalizedWordLetters.includes(letter)) {
      setErrors((e) => e + 1);
    }
  }

  return (
    <div>
      <p className="eyebrow-free">Indice (français) : {word.translation_fr}</p>
      <p className="eyebrow-free">
        Erreurs : {errors} / {MAX_ERRORS}
      </p>

      <div className="phrase-card phrase-card-big">
        <div className="phrase-target" style={{ letterSpacing: '0.3em', fontFamily: 'monospace' }}>
          {display.join(' ')}
        </div>

        {finished && (
          <div className={won ? 'conv-correction exercise-success' : 'conv-correction'}>
            <div className="conv-correction-label">{won ? '✅ Gagné' : '💀 Perdu'}</div>
            <div className="conv-correction-text">{word.target_text}</div>
          </div>
        )}

        {!finished && (
          <div className="conv-text-row">
            <input
              className="conv-text-input"
              type="text"
              maxLength={1}
              placeholder="Une lettre…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input) guessLetter(input);
              }}
            />
            <button className="primary" onClick={() => input && guessLetter(input)} disabled={!input}>
              Valider
            </button>
          </div>
        )}
      </div>

      {finished && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => newWord(words)}>
          Mot suivant →
        </button>
      )}
    </div>
  );
}
