'use client';

import { useEffect, useState } from 'react';
import { getVocabularyWords } from '../../lib/vocabulary';
import { getAllReadyPhrases } from '../../lib/data';
import type { LangCode, LevelCode } from '../../lib/constants';

type Item = { id: string; target_text: string; translation_fr: string; audio_url: string | null };
type Round = { item: Item; options: string[]; correctIndex: number };

function buildRound(pool: Item[]): Round | null {
  const withAudio = pool.filter((i) => i.audio_url);
  if (withAudio.length < 4) return null;

  const item = withAudio[Math.floor(Math.random() * withAudio.length)];
  const distractors = withAudio
    .filter((i) => i.id !== item.id && i.translation_fr !== item.translation_fr)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((i) => i.translation_fr);

  const options = [...distractors, item.translation_fr].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(item.translation_fr);
  return { item, options, correctIndex };
}

export default function GameEcouteDevine({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: LangCode;
  levelCode: LevelCode;
}) {
  const [pool, setPool] = useState<Item[] | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setPool(null);
    Promise.all([
      getVocabularyWords(profileId, languageCode, levelCode).catch(() => []),
      getAllReadyPhrases(languageCode, levelCode).catch(() => []),
    ]).then(([words, phrases]) => {
      const merged: Item[] = [
        ...words.map((w) => ({ id: w.id, target_text: w.target_text, translation_fr: w.translation_fr, audio_url: w.audio_url })),
        ...phrases.map((p) => ({ id: p.id, target_text: p.target_text, translation_fr: p.translation_fr, audio_url: p.audio_url })),
      ];
      setPool(merged);
    });
  }, [profileId, languageCode, levelCode]);

  useEffect(() => {
    if (pool && pool.length > 0) newRound(pool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  function newRound(p: Item[]) {
    setSelected(null);
    setRound(buildRound(p));
  }

  function play() {
    if (!round?.item.audio_url) return;
    new Audio(round.item.audio_url).play().catch(() => {});
  }

  function pick(i: number) {
    if (selected !== null || !round) return;
    setSelected(i);
    setScore((s) => ({ correct: s.correct + (i === round.correctIndex ? 1 : 0), total: s.total + 1 }));
  }

  if (pool === null) return <p className="eyebrow-free">Chargement…</p>;
  if (!round) {
    return (
      <p className="eyebrow-free">
        Pas encore assez de vocabulaire/phrases avec audio pour ce jeu — télécharge des packs dans "Packs".
      </p>
    );
  }

  return (
    <div>
      <p className="eyebrow-free">
        Score : {score.correct} / {score.total}
      </p>

      <div className="phrase-card phrase-card-big">
        <p className="eyebrow-free">Écoute et choisis la bonne traduction :</p>
        <div className="conv-controls">
          <button className="mic-btn" onClick={play} aria-label="Écouter">
            🔊
          </button>
        </div>

        <div className="quiz-options" style={{ marginTop: '1rem' }}>
          {round.options.map((opt, i) => {
            const isCorrect = i === round.correctIndex;
            const showResult = selected !== null;
            const cls =
              showResult && i === selected
                ? isCorrect
                  ? 'quiz-option selected game-correct'
                  : 'quiz-option selected game-wrong'
                : showResult && isCorrect
                ? 'quiz-option game-correct'
                : 'quiz-option';
            return (
              <button key={i} className={cls} onClick={() => pick(i)}>
                {opt}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <div className="conv-correction-explanation" style={{ marginTop: '0.75rem' }}>
            C'était : "{round.item.target_text}"
          </div>
        )}
      </div>

      {selected !== null && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => newRound(pool)}>
          Suivant →
        </button>
      )}
    </div>
  );
}
