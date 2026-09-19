'use client';

import { useEffect, useState } from 'react';
import { getVocabularyWords, recordGameResult, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import type { LangCode, LevelCode } from '../../lib/constants';

const ARTICLES_BY_LANG: Record<string, string[]> = {
  it: ["un'", 'uno', 'una', 'un', "l'", 'lo', 'la', 'gli', 'il', 'le', 'i'],
  es: ['unas', 'unos', 'una', 'las', 'los', 'el', 'la', 'un'],
  de: ['einer', 'einem', 'einen', 'eines', 'eine', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein'],
  en: ['the', 'an', 'a'],
};

function detectArticle(text: string, lang: string): { article: string; rest: string } | null {
  const candidates = ARTICLES_BY_LANG[lang];
  if (!candidates) return null;
  const lower = text.toLowerCase();
  for (const article of candidates) {
    if (lower.startsWith(article)) {
      const after = text.slice(article.length);
      if (article.endsWith("'") || after.startsWith(' ')) {
        return { article: text.slice(0, article.length), rest: after.replace(/^\s+/, '') };
      }
    }
  }
  return null;
}

type Round = {
  word: VocabularyWordWithMastery;
  article: string;
  rest: string;
  options: string[];
  correctIndex: number;
};

export default function GameChasseArticles({
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
      .then((list) => setWords((list ?? []).filter((w) => w.word_type === 'nom')));
  }, [profileId, languageCode, levelCode]);

  useEffect(() => {
    if (words && words.length > 0) newRound(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  function newRound(pool: VocabularyWordWithMastery[]) {
    setSelected(null);

    const candidates = ARTICLES_BY_LANG[languageCode];
    if (!candidates) {
      setRound(null);
      return;
    }

    const eligible = pool
      .map((w) => {
        const detected = detectArticle(w.target_text, languageCode);
        return detected ? { word: w, ...detected } : null;
      })
      .filter((x): x is { word: VocabularyWordWithMastery; article: string; rest: string } => x !== null);

    if (eligible.length === 0) {
      setRound(null);
      return;
    }

    const picked = eligible[Math.floor(Math.random() * eligible.length)];
    const distractors = candidates
      .filter((a) => a.toLowerCase() !== picked.article.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [...distractors, picked.article].sort(() => Math.random() - 0.5);
    const correctIndex = options.findIndex((a) => a.toLowerCase() === picked.article.toLowerCase());

    setRound({ word: picked.word, article: picked.article, rest: picked.rest, options, correctIndex });
  }

  async function pick(i: number) {
    if (selected !== null || !round) return;
    setSelected(i);
    const success = i === round.correctIndex;
    setScore((s) => ({ correct: s.correct + (success ? 1 : 0), total: s.total + 1 }));
    await recordGameResult(profileId, round.word.id, 'word', success);
  }

  if (words === null) return <p className="eyebrow-free">Chargement…</p>;

  if (!ARTICLES_BY_LANG[languageCode]) {
    return <p className="eyebrow-free">Ce jeu ne s'applique pas à cette langue (pas d'article grammatical de ce type).</p>;
  }

  if (words.length === 0) {
    return <p className="eyebrow-free">Pas encore de noms de vocabulaire téléchargés — va dans l'onglet "Packs".</p>;
  }

  if (!round) {
    return <p className="eyebrow-free">Aucun mot avec article détecté pour l'instant.</p>;
  }

  return (
    <div>
      <p className="eyebrow-free">
        Score : {score.correct} / {score.total}
      </p>

      <div className="phrase-card phrase-card-big">
        <p className="eyebrow-free">Quel est le bon article ?</p>
        <div className="phrase-target">
          ___ {round.rest} <span className="revision-fr">({round.word.translation_fr})</span>
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
      </div>

      {selected !== null && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => newRound(words)}>
          Suivant →
        </button>
      )}
    </div>
  );
}
