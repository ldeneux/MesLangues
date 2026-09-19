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

const RAFALE_DURATION = 60;

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
  const [rafaleActive, setRafaleActive] = useState(false);
  const [rafaleFinished, setRafaleFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(RAFALE_DURATION);

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
    if (pool && pool.length > 0 && !rafaleActive) newRound(pool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  useEffect(() => {
    if (!rafaleActive) return;
    if (timeLeft <= 0) {
      setRafaleActive(false);
      setRafaleFinished(true);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [rafaleActive, timeLeft]);

  function startRafale() {
    if (!pool) return;
    setScore({ correct: 0, total: 0 });
    setTimeLeft(RAFALE_DURATION);
    setRafaleActive(true);
    setRafaleFinished(false);
    newRound(pool);
  }

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
    if (rafaleActive && pool) {
      setTimeout(() => {
        if (timeLeft > 1) newRound(pool);
      }, 700);
    }
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
      <div className="conv-bubble-actions" style={{ marginBottom: '0.75rem' }}>
        <p className="eyebrow-free" style={{ margin: 0 }}>
          Score : {score.correct} / {score.total}
        </p>
        {!rafaleActive && (
          <button className="conv-mini-btn" onClick={startRafale}>
            ⏱ Rafale (60s)
          </button>
        )}
        {rafaleActive && <span className="mastery-badge">⏱ {timeLeft}s</span>}
      </div>

      {rafaleActive && timeLeft <= 0 ? (
        <div className="conv-correction exercise-success">
          <div className="conv-correction-label">⏱ Temps écoulé</div>
          <div className="conv-correction-text">
            {score.correct} / {score.total} bonnes réponses
          </div>
          <button className="primary" style={{ marginTop: '0.75rem' }} onClick={startRafale}>
            Rejouer une rafale
          </button>
        </div>
      ) : (
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
      )}

      {!rafaleActive && selected !== null && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => pool && newRound(pool)}>
          Suivant →
        </button>
      )}
    </div>
  );
}
