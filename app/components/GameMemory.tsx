'use client';

import { useEffect, useState } from 'react';
import { getVocabularyWords, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import type { LangCode, LevelCode } from '../../lib/constants';

const PAIR_COUNT = 6;

type Card = { key: string; wordId: string; label: string; kind: 'target' | 'fr' };

function buildDeck(words: VocabularyWordWithMastery[]): Card[] {
  const picked = [...words].sort(() => Math.random() - 0.5).slice(0, PAIR_COUNT);
  const cards: Card[] = [];
  picked.forEach((w) => {
    cards.push({ key: `${w.id}-target`, wordId: w.id, label: w.target_text, kind: 'target' });
    cards.push({ key: `${w.id}-fr`, wordId: w.id, label: w.translation_fr, kind: 'fr' });
  });
  return cards.sort(() => Math.random() - 0.5);
}

export default function GameMemory({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: LangCode;
  levelCode: LevelCode;
}) {
  const [words, setWords] = useState<VocabularyWordWithMastery[] | null>(null);
  const [deck, setDeck] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setWords(null);
    getVocabularyWords(profileId, languageCode, levelCode)
      .catch(() => [])
      .then((list) => setWords(list ?? []));
  }, [profileId, languageCode, levelCode]);

  useEffect(() => {
    if (words && words.length > 0) startGame(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  function startGame(pool: VocabularyWordWithMastery[]) {
    setDeck(buildDeck(pool));
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setLocked(false);
  }

  function flip(card: Card) {
    if (locked || flipped.includes(card.key) || matched.has(card.wordId) || flipped.length === 2) return;
    const next = [...flipped, card.key];
    setFlipped(next);

    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [firstKey, secondKey] = next;
      const first = deck.find((c) => c.key === firstKey)!;
      const second = deck.find((c) => c.key === secondKey)!;

      if (first.wordId === second.wordId) {
        setMatched((m) => new Set(m).add(first.wordId));
        setFlipped([]);
      } else {
        setLocked(true);
        setTimeout(() => {
          setFlipped([]);
          setLocked(false);
        }, 900);
      }
    }
  }

  if (words === null) return <p className="eyebrow-free">Chargement…</p>;
  if (words.length < PAIR_COUNT) {
    return (
      <p className="eyebrow-free">
        Pas encore assez de vocabulaire ({PAIR_COUNT} mots minimum) — va dans l'onglet "Packs".
      </p>
    );
  }

  const done = matched.size === PAIR_COUNT;

  return (
    <div>
      <p className="eyebrow-free">
        Coups : {moves} — paires trouvées : {matched.size} / {PAIR_COUNT}
      </p>

      <div className="memory-grid">
        {deck.map((card) => {
          const isFlipped = flipped.includes(card.key) || matched.has(card.wordId);
          return (
            <button
              key={card.key}
              className={`memory-card${isFlipped ? ' flipped' : ''}${matched.has(card.wordId) ? ' matched' : ''}`}
              onClick={() => flip(card)}
            >
              {isFlipped ? card.label : '?'}
            </button>
          );
        })}
      </div>

      {done && (
        <div className="conv-correction exercise-success" style={{ marginTop: '1rem' }}>
          <div className="conv-correction-label">✅ Terminé</div>
          <div className="conv-correction-text">
            {moves} coups pour {PAIR_COUNT} paires
          </div>
        </div>
      )}

      <button className="primary" style={{ marginTop: '1rem' }} onClick={() => startGame(words)}>
        {done ? 'Rejouer' : 'Nouvelle grille'}
      </button>
    </div>
  );
}
