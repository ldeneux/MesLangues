'use client';

import { useEffect, useRef, useState } from 'react';
import type { KanjiExample, KanjiItem } from '../../lib/kanji';
import { speak } from '../../lib/speech';

// Écoute : un mot est lu (à la demande, jamais automatiquement), tous les kanji du niveau (ou du thème) sont affichés,
// on touche le bon. Fond blanc par défaut ; erreur → rouge ; succès → vert puis mot suivant.
const MAX_TRIES = 3; // essais par mot

type Question = { kanji: KanjiItem; example: KanjiExample; accepted: Set<string> };

function makeQuestion(pool: KanjiItem[], previous?: string): Question | null {
  const candidates = pool.filter((k) => k.examples.length > 0 && k.char !== previous);
  const list = candidates.length > 0 ? candidates : pool.filter((k) => k.examples.length > 0);
  if (list.length === 0) return null;
  const kanji = list[Math.floor(Math.random() * list.length)];
  const example = kanji.examples[Math.floor(Math.random() * kanji.examples.length)];
  // Tous les kanji présents dans le mot (et affichés dans la grille) sont acceptés
  const poolChars = new Set(pool.map((k) => k.char));
  const accepted = new Set(Array.from(example.word).filter((c) => poolChars.has(c)));
  accepted.add(kanji.char);
  return { kanji, example, accepted };
}

export default function KanjiListenGame({ kanjis }: { kanjis: KanjiItem[] }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState<string | null>(null); // kanji affiché en vert
  const [revealed, setRevealed] = useState(false); // vrai si on a montré la réponse après 3 erreurs
  const [showMeaning, setShowMeaning] = useState(false);
  const [score, setScore] = useState({ firstTry: 0, solved: 0, total: 0 });
  const [speechOk, setSpeechOk] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    resetQuestion(makeQuestion(kanjis));
    setScore({ firstTry: 0, solved: 0, total: 0 });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanjis]);

  function resetQuestion(q: Question | null) {
    setQuestion(q);
    setWrong(new Set());
    setSolved(null);
    setRevealed(false);
    setShowMeaning(false);
  }

  function nextAfter(ms: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => resetQuestion(makeQuestion(kanjis, question?.kanji.char)), ms);
  }

  function pick(c: string) {
    if (!question || solved || wrong.has(c)) return;
    if (question.accepted.has(c)) {
      setSolved(c);
      setScore((s) => ({ firstTry: s.firstTry + (wrong.size === 0 ? 1 : 0), solved: s.solved + 1, total: s.total + 1 }));
      nextAfter(1100);
      return;
    }
    const nextWrong = new Set(wrong);
    nextWrong.add(c);
    setWrong(nextWrong);
    if (nextWrong.size >= MAX_TRIES) {
      // Plus d'essais : on montre la bonne réponse en vert, puis mot suivant
      setSolved(question.kanji.char);
      setRevealed(true);
      setScore((s) => ({ ...s, total: s.total + 1 }));
      nextAfter(2200);
    }
  }

  if (kanjis.length < 8) {
    return <p className="eyebrow-free">Il faut au moins 8 kanji pour jouer (change de thème ou télécharge plus de kanji).</p>;
  }
  if (!question) return <p className="eyebrow-free">Aucun mot disponible.</p>;

  const triesLeft = Math.max(0, MAX_TRIES - wrong.size);

  return (
    <div>
      <p className="eyebrow-free">
        Clique sur 🔊 pour entendre un mot, puis touche le bon kanji. Tu as {MAX_TRIES} essais par mot. Score : {score.solved} / {score.total}{' '}
        ({score.firstTry} du premier coup).
      </p>

      <div className="phrase-card phrase-card-big">
        <div className="conv-bubble-actions">
          <button className="primary" onClick={() => setSpeechOk(speak(question.example.reading))}>
            🔊 Écouter le mot
          </button>
          <button className="conv-mini-btn" onClick={() => setShowMeaning((m) => !m)}>
            {showMeaning ? 'Masquer le sens' : 'Indice : afficher le sens'}
          </button>
          <span className="eyebrow-free" style={{ marginBottom: 0 }}>
            Essais restants : {'●'.repeat(triesLeft)}
            {'○'.repeat(MAX_TRIES - triesLeft)}
          </span>
        </div>
        {!speechOk && <p className="conv-warning">Ton navigateur ne propose pas de voix japonaise (essaie Chrome ou Edge).</p>}
        {showMeaning && !solved && <p className="eyebrow-free">Sens : {question.example.meaning_fr}</p>}

        {solved && (
          <p className="eyebrow-free">
            {revealed ? '❌ La réponse était ' : '✅ '}
            <ruby lang="ja">
              {question.example.word}
              <rt>{question.example.reading}</rt>
            </ruby>{' '}
            — {question.example.meaning_fr}
          </p>
        )}

        <div className="kanji-tile-grid">
          {kanjis.map((k) => {
            const state = solved === k.char ? ' right' : wrong.has(k.char) ? ' wrong' : '';
            return (
              <button key={k.id} className={`kanji-tile${state}`} lang="ja" onClick={() => pick(k.char)} disabled={!!solved || wrong.has(k.char)}>
                {k.char}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
