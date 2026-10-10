'use client';

import { useEffect, useRef, useState } from 'react';
import { KANA_SECTIONS, toKatakana } from '../../lib/japanese';
import { getKanjiList, type KanjiItem } from '../../lib/kanji';

// Jeu japonais : lecture éclair de kana ou de mots de kanji, 60 secondes.
type Source = 'hira' | 'kata' | 'kanji';
type Q = { prompt: string; answer: string; options: string[] };

const DURATION = 60;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const KANA_POOL = (() => {
  const seen = new Set<string>();
  const out: { hira: string; romaji: string }[] = [];
  for (const s of KANA_SECTIONS)
    for (const r of s.rows)
      for (const e of r)
        if (e && !e.rare && !seen.has(e.romaji)) {
          seen.add(e.romaji);
          out.push({ hira: e.hira, romaji: e.romaji });
        }
  return out;
})();

function makeQuestion(source: Source, kanji: KanjiItem[]): Q {
  if (source === 'kanji') {
    const words = kanji.flatMap((k) => k.examples);
    const ex = words[Math.floor(Math.random() * words.length)];
    const others = shuffle(Array.from(new Set(words.map((w) => w.reading).filter((r) => r !== ex.reading)))).slice(0, 3);
    return { prompt: ex.word, answer: ex.reading, options: shuffle([ex.reading, ...others]) };
  }
  const target = KANA_POOL[Math.floor(Math.random() * KANA_POOL.length)];
  const others = shuffle(KANA_POOL.filter((k) => k.romaji !== target.romaji)).slice(0, 3);
  return {
    prompt: source === 'kata' ? toKatakana(target.hira) : target.hira,
    answer: target.romaji,
    options: shuffle([target.romaji, ...others.map((o) => o.romaji)]),
  };
}

export default function GameLectureEclair({ levelCode }: { levelCode: string }) {
  const [source, setSource] = useState<Source>('hira');
  const [kanji, setKanji] = useState<KanjiItem[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [q, setQ] = useState<Q | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [flash, setFlash] = useState<'ok' | 'ko' | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getKanjiList(levelCode)
      .then(setKanji)
      .catch(() => setKanji([]));
  }, [levelCode]);

  const bestKey = `ja-lecture-best-${source}`;
  useEffect(() => {
    try {
      const v = localStorage.getItem(bestKey);
      setBest(v ? Number(v) : null);
    } catch {
      setBest(null);
    }
  }, [bestKey, finished]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const kanjiReady = kanji.flatMap((k) => k.examples).length >= 8;

  function start() {
    setScore({ correct: 0, total: 0 });
    setTimeLeft(DURATION);
    setFinished(false);
    setFlash(null);
    setQ(makeQuestion(source, kanji));
    setRunning(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  // Meilleur score mémorisé quand la partie se termine
  useEffect(() => {
    if (!finished) return;
    try {
      const prev = Number(localStorage.getItem(bestKey) ?? 0);
      if (score.correct > prev) localStorage.setItem(bestKey, String(score.correct));
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function answer(opt: string) {
    if (!q || !running) return;
    const ok = opt === q.answer;
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
    setFlash(ok ? 'ok' : 'ko');
    setQ(makeQuestion(source, kanji));
  }

  return (
    <div>
      <p className="eyebrow-free">
        Lis le plus de kana (ou de mots) possible en {DURATION} secondes : choisis la bonne prononciation.
      </p>

      {!running && (
        <div className="cascade-row">
          <select className="cascade-select" value={source} onChange={(e) => setSource(e.target.value as Source)}>
            <option value="hira">Hiragana → rōmaji</option>
            <option value="kata">Katakana → rōmaji</option>
            <option value="kanji">Mots de kanji → lecture en kana</option>
          </select>
          <button className="primary" onClick={start} disabled={source === 'kanji' && !kanjiReady}>
            {finished ? 'Rejouer' : 'Commencer'}
          </button>
        </div>
      )}
      {source === 'kanji' && !kanjiReady && !running && (
        <p className="conv-warning">Télécharge d'abord les kanji de ce niveau (onglet Packs) pour jouer avec les mots de kanji.</p>
      )}

      {finished && (
        <div className="conv-correction exercise-success">
          <div className="conv-correction-label">Temps écoulé</div>
          <div className="conv-correction-text">
            {score.correct} bonnes réponses sur {score.total}
          </div>
          {best !== null && <p className="eyebrow-free">Meilleur score sur ce mode : {best}</p>}
        </div>
      )}

      {running && q && (
        <div className={`phrase-card phrase-card-big${flash === 'ok' ? ' flash-ok' : flash === 'ko' ? ' flash-ko' : ''}`}>
          <div className="deck-progress">
            ⏱ {timeLeft} s — score : {score.correct} / {score.total}
          </div>
          <div className="kanji-quiz-prompt" lang="ja">
            {q.prompt}
          </div>
          <div className="quiz-options kana-quiz-options">
            {q.options.map((o) => (
              <button key={o} className="quiz-option" onClick={() => answer(o)} lang={source === 'kanji' ? 'ja' : undefined}>
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
