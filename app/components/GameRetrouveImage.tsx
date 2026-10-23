'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getVocabularyWords, recordGameResult, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import { imageUrl } from '../../lib/imageName';
import type { LangCode, LevelCode } from '../../lib/constants';
import JapaneseRuby from './JapaneseRuby';
import { useJapaneseReadings } from './useJapaneseReadings';

const GRID_SIZE = 25; // grille 5 × 5
const MAX_TRIES = 2;

type Cell = { word: VocabularyWordWithMastery; image: string };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 25 mots au hasard parmi ceux qui ont une image (une seule fois chaque fichier image, pour qu'une case = un seul mot). */
function buildCells(words: VocabularyWordWithMastery[]): Cell[] {
  const usedImages = new Set<string>();
  const cells: Cell[] = [];
  for (const w of shuffle(words.filter((x) => x.image))) {
    if (usedImages.has(w.image!)) continue;
    usedImages.add(w.image!);
    cells.push({ word: w, image: w.image! });
    if (cells.length === GRID_SIZE) break;
  }
  return cells;
}

export default function GameRetrouveImage({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: LangCode;
  levelCode: LevelCode;
}) {
  const [words, setWords] = useState<VocabularyWordWithMastery[] | null>(null);
  const [error, setError] = useState('');
  const [cells, setCells] = useState<Cell[]>([]); // la grille (ordre d'affichage)
  const [order, setOrder] = useState<number[]>([]); // ordre des questions (indices dans `cells`)
  const [step, setStep] = useState(0); // question en cours
  const [wrong, setWrong] = useState<number[]>([]); // cases déjà essayées à tort pour CETTE question
  const [revealed, setRevealed] = useState(false); // question terminée (trouvé ou 2 essais épuisés)
  const [outcome, setOutcome] = useState<Record<number, 'ok' | 'ko'>>({}); // résultat par case
  const [playing, setPlaying] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const isJa = languageCode === 'ja';

  useEffect(() => {
    setWords(null);
    setError('');
    getVocabularyWords(profileId, languageCode, levelCode)
      .then((list) => setWords(list ?? []))
      .catch((e: any) => {
        setError(e?.message ?? 'Erreur de chargement du vocabulaire.');
        setWords([]);
      });
  }, [profileId, languageCode, levelCode]);

  const withImage = useMemo(() => (words ?? []).filter((w) => w.image), [words]);
  const distinctImages = useMemo(() => new Set(withImage.map((w) => w.image)).size, [withImage]);

  useEffect(() => {
    if (words && distinctImages >= GRID_SIZE) startGame(words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  function startGame(pool: VocabularyWordWithMastery[]) {
    const c = buildCells(pool);
    setCells(c);
    setOrder(shuffle(c.map((_, i) => i)));
    setStep(0);
    setWrong([]);
    setRevealed(false);
    setOutcome({});
  }

  const finished = cells.length > 0 && step >= cells.length;
  const targetIdx = !finished && order.length > 0 ? order[step] : -1;
  const target = targetIdx >= 0 ? cells[targetIdx].word : null;

  // Japonais : furigana du mot à trouver (lectures en cache ou demandées à la volée)
  const { readings } = useJapaneseReadings(isJa && target ? [target.target_text] : [], isJa && !!target);

  // Au dévoilement, le focus va sur « Suivant » (Entrée enchaîne)
  useEffect(() => {
    if (revealed) nextRef.current?.focus();
  }, [revealed]);

  function playTarget() {
    if (!target?.audio_url) return;
    setPlaying(true);
    const el = new Audio(target.audio_url);
    el.onended = () => setPlaying(false);
    el.play().catch(() => setPlaying(false));
  }

  function settle(idx: number, success: boolean) {
    setOutcome((o) => ({ ...o, [idx]: success ? 'ok' : 'ko' }));
    setRevealed(true);
    // Même suivi de maîtrise que les autres jeux de vocabulaire (non bloquant)
    recordGameResult(profileId, cells[idx].word.id, 'word', success).catch(() => {});
  }

  function clickCell(i: number) {
    if (revealed || finished || outcome[i] || wrong.includes(i)) return;
    if (i === targetIdx) {
      settle(targetIdx, true);
      return;
    }
    const nextWrong = [...wrong, i];
    setWrong(nextWrong);
    if (nextWrong.length >= MAX_TRIES) settle(targetIdx, false);
  }

  function next() {
    setStep((s) => s + 1);
    setWrong([]);
    setRevealed(false);
  }

  if (words === null) return <p className="eyebrow-free">Chargement…</p>;
  if (error) return <p className="conv-warning">{error}</p>;
  if (distinctImages < GRID_SIZE) {
    return (
      <p className="eyebrow-free">
        Pas encore assez de mots illustrés à ce niveau : {distinctImages} / {GRID_SIZE} (une grille de {GRID_SIZE} images est nécessaire). Ajoute des images dans
        public/image_webp, ou télécharge plus de vocabulaire dans l'onglet « Packs ».
      </p>
    );
  }

  const score = Object.values(outcome).filter((o) => o === 'ok').length;

  return (
    <div>
      {!finished && target ? (
        <>
          <p className="eyebrow-free">
            Mot {step + 1} / {cells.length} — trouvés : {score}
          </p>

          <div className="lex-prompt find-prompt">
            <button
              className={`play-btn${playing ? ' playing' : ''}`}
              onClick={playTarget}
              disabled={!target.audio_url}
              aria-label="Écouter"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <span className="lesson-word-text find-word">
              {isJa && readings[target.target_text] ? (
                <JapaneseRuby ruby={readings[target.target_text].ruby} />
              ) : (
                <span lang={isJa ? 'ja' : undefined}>{target.target_text}</span>
              )}
            </span>
            {!revealed && (
              <span className="eyebrow-free" style={{ margin: 0 }}>
                {MAX_TRIES - wrong.length} essai{MAX_TRIES - wrong.length > 1 ? 's' : ''} restant{MAX_TRIES - wrong.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="conv-correction exercise-success" style={{ marginBottom: '1rem' }}>
          <div className="conv-correction-label">{score === cells.length ? '🎉 Parfait !' : '✅ Terminé'}</div>
          <div className="conv-correction-text">
            {score} / {cells.length} images retrouvées
          </div>
        </div>
      )}

      <div className="find-grid">
        {cells.map((c, i) => {
          const isTarget = i === targetIdx;
          const state = outcome[i] ?? (wrong.includes(i) ? 'wrong' : undefined);
          const showAnswer = revealed && isTarget; // case bonne mise en évidence au dévoilement
          return (
            <button
              key={c.word.id}
              className={`find-cell${state === 'ok' ? ' found' : ''}${state === 'ko' ? ' missed' : ''}${state === 'wrong' ? ' wrong' : ''}${
                showAnswer ? ' answer' : ''
              }`}
              onClick={() => clickCell(i)}
              disabled={finished || revealed || !!outcome[i] || wrong.includes(i)}
              aria-label={revealed || finished || outcome[i] ? c.word.translation_fr : `Image ${i + 1}`}
            >
              <img src={imageUrl(c.image)} alt="" draggable={false} />
            </button>
          );
        })}
      </div>

      {revealed && target && (
        <div className={`conv-correction find-reveal${outcome[targetIdx] === 'ok' ? ' exercise-success' : ''}`} style={{ marginTop: '1rem' }}>
          <div className="conv-correction-label">{outcome[targetIdx] === 'ok' ? '✅ Bien joué' : '❌ Raté'}</div>
          <div className="conv-correction-text">
            <strong lang={isJa ? 'ja' : undefined}>{target.target_text}</strong> — {target.translation_fr}
          </div>
          <button ref={nextRef} className="primary" style={{ marginTop: '0.75rem' }} onClick={next}>
            {step + 1 >= cells.length ? 'Voir le résultat' : 'Suivant →'}
          </button>
        </div>
      )}

      {finished && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => startGame(words)}>
          Rejouer avec une nouvelle grille
        </button>
      )}
      {!finished && !revealed && (
        <button className="secondary" style={{ marginTop: '1rem' }} onClick={() => startGame(words)}>
          Nouvelle grille
        </button>
      )}
    </div>
  );
}
