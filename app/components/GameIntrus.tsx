'use client';

import { useEffect, useState } from 'react';
import { getVocabularyWords, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import { THEMES, type LangCode, type LevelCode } from '../../lib/constants';

type Round = { options: VocabularyWordWithMastery[]; oddIndex: number; themeLabel: string };

function buildRound(words: VocabularyWordWithMastery[]): Round | null {
  const byTheme = new Map<string, VocabularyWordWithMastery[]>();
  for (const w of words) {
    if (!byTheme.has(w.theme_code)) byTheme.set(w.theme_code, []);
    byTheme.get(w.theme_code)!.push(w);
  }
  const eligibleThemes = Array.from(byTheme.entries()).filter(([, list]) => list.length >= 3);
  if (eligibleThemes.length < 2) return null;

  const [mainTheme, mainWords] = eligibleThemes[Math.floor(Math.random() * eligibleThemes.length)];
  const shuffledMain = [...mainWords].sort(() => Math.random() - 0.5).slice(0, 3);

  const otherThemes = eligibleThemes.filter(([code]) => code !== mainTheme);
  const [, otherWords] = otherThemes[Math.floor(Math.random() * otherThemes.length)];
  const oddWord = otherWords[Math.floor(Math.random() * otherWords.length)];

  const options = [...shuffledMain, oddWord].sort(() => Math.random() - 0.5);
  const oddIndex = options.findIndex((w) => w.id === oddWord.id);
  const themeLabel = THEMES.find((t) => t.code === mainTheme)?.label ?? mainTheme;

  return { options, oddIndex, themeLabel };
}

export default function GameIntrus({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: LangCode;
  levelCode: LevelCode;
}) {
  const [words, setWords] = useState<VocabularyWordWithMastery[] | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setWords(null);
    getVocabularyWords(profileId, languageCode, levelCode)
      .catch(() => [])
      .then((list) => setWords(list ?? []));
  }, [profileId, languageCode, levelCode]);

  useEffect(() => {
    if (words && words.length > 0) newRound(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  function newRound(pool: VocabularyWordWithMastery[]) {
    setSelected(null);
    setRound(buildRound(pool));
  }

  function pick(i: number) {
    if (selected !== null || !round) return;
    setSelected(i);
    setScore((s) => ({ correct: s.correct + (i === round.oddIndex ? 1 : 0), total: s.total + 1 }));
  }

  if (words === null) return <p className="eyebrow-free">Chargement…</p>;

  if (words.length < 6) {
    return (
      <p className="eyebrow-free">
        Pas encore assez de vocabulaire varié pour ce jeu — télécharge au moins un pack de vocabulaire dans "Packs".
      </p>
    );
  }

  if (!round) {
    return <p className="eyebrow-free">Pas assez de thèmes différents représentés pour lancer une manche.</p>;
  }

  return (
    <div>
      <p className="eyebrow-free">
        Score : {score.correct} / {score.total} — thème : <strong>{round.themeLabel}</strong>
      </p>
      <p className="eyebrow-free">Trouve l'intrus (le mot qui n'appartient pas à ce thème) :</p>

      <div className="revision-grid">
        {round.options.map((w, i) => {
          const isOdd = i === round.oddIndex;
          const showResult = selected !== null;
          const cardClass =
            showResult && i === selected
              ? isOdd
                ? 'revision-card game-correct'
                : 'revision-card game-wrong'
              : showResult && isOdd
              ? 'revision-card game-correct'
              : 'revision-card';
          return (
            <button key={w.id} className={cardClass} onClick={() => pick(i)} style={{ textAlign: 'left' }}>
              <div className="revision-card-text">
                <div className="revision-target">{w.target_text}</div>
                <div className="revision-fr">{w.translation_fr}</div>
              </div>
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => newRound(words)}>
          Manche suivante →
        </button>
      )}
    </div>
  );
}
