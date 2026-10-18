'use client';

// Module EXERCICES de fin de leçon : 2 jeux tirés au sort parmi plusieurs, construits uniquement sur les mots de la leçon.
// Les jeux proposés varient d'une leçon à l'autre (on évite de reprendre les 2 jeux de la fois précédente).
// Chaque réponse met à jour la maîtrise du mot (mêmes compteurs que l'onglet Jeux).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { recordGameResult } from '../../lib/vocabulary';
import { normalizeForCompare } from '../../lib/textUtils';
import { imageUrl } from '../../lib/imageName';

export type ExerciseItem = {
  id: string;
  source: 'word' | 'verb';
  text: string; // mot dans la langue apprise
  fr: string;
  audio: string | null;
  image: string | null;
};

type GameId = 'fr2target' | 'target2fr' | 'listen' | 'images' | 'memory' | 'scramble' | 'typing' | 'truefalse';

type Ctx = { items: ExerciseItem[]; isJa: boolean };

const QUESTIONS = 6;

// ---------- utilitaires ----------
function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mot à reconstituer : « una sedia » → préfixe « una » + « sedia » à remettre dans l'ordre. null si le mot ne s'y prête pas. */
function scrambleParts(text: string): { prefix: string; word: string } | null {
  const t = text.trim();
  const tokens = t.split(/\s+/);
  let prefix = '';
  let word = t;
  if (tokens.length === 2 && tokens[0].length <= 4) {
    prefix = tokens[0] + ' ';
    word = tokens[1];
  } else if (tokens.length !== 1) return null;
  const letters = Array.from(word);
  if (letters.length < 3 || letters.length > 12) return null;
  if (!/^[\p{L}'’-]+$/u.test(word)) return null;
  if (new Set(letters.map((c) => c.toLowerCase())).size < 3) return null;
  return { prefix, word };
}

/** Réponses acceptées pour un mot saisi : le mot complet, ou sans l'article. */
function acceptedAnswers(text: string): string[] {
  const full = normalizeForCompare(text);
  const tokens = text.trim().split(/\s+/);
  const out = [full];
  if (tokens.length === 2 && tokens[0].length <= 4) out.push(normalizeForCompare(tokens[1]));
  return out;
}

const GAMES: { id: GameId; label: string; hint: string; available: (c: Ctx) => boolean }[] = [
  { id: 'fr2target', label: 'Quel est le mot ?', hint: 'Choisis la bonne traduction.', available: (c) => c.items.length >= 4 },
  { id: 'target2fr', label: 'Que veut dire ce mot ?', hint: 'Choisis le sens en français.', available: (c) => c.items.length >= 4 },
  { id: 'listen', label: 'Écoute et devine', hint: 'Écoute, puis choisis le mot entendu.', available: (c) => c.items.filter((i) => i.audio).length >= 4 },
  { id: 'images', label: 'Quelle image ?', hint: 'Associe le mot à la bonne image.', available: (c) => c.items.filter((i) => i.image).length >= 4 },
  { id: 'memory', label: 'Memory', hint: 'Retrouve les paires mot / traduction.', available: (c) => c.items.length >= 4 },
  { id: 'scramble', label: 'Lettres mélangées', hint: 'Remets les lettres dans l\u2019ordre.', available: (c) => !c.isJa && c.items.filter((i) => scrambleParts(i.text)).length >= 4 },
  { id: 'typing', label: 'Écris le mot', hint: 'Écris le mot à partir de sa traduction.', available: (c) => !c.isJa && c.items.length >= 4 },
  { id: 'truefalse', label: 'Vrai ou faux ?', hint: 'Dis si la traduction proposée est la bonne.', available: (c) => c.items.length >= 4 },
];

const LAST_KEY = 'lesson-exercises-last';

function readLast(): GameId[] {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? '[]');
    return Array.isArray(v) ? (v as GameId[]) : [];
  } catch {
    return [];
  }
}

function pickGames(ctx: Ctx): GameId[] {
  const avail = GAMES.filter((g) => g.available(ctx)).map((g) => g.id);
  const last = readLast();
  const fresh = avail.filter((g) => !last.includes(g));
  const pool = fresh.length >= 2 ? fresh : avail;
  const picked = shuffle(pool).slice(0, 2);
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(picked));
  } catch {
    /* stockage indisponible : sans importance */
  }
  return picked;
}

// ---------- jeux ----------
type GameProps = {
  items: ExerciseItem[];
  isJa: boolean;
  render: (text: string) => ReactNode;
  record: (it: ExerciseItem, ok: boolean) => void;
  play: (url: string | null) => void;
  onFinish: (summary: string) => void;
};

function useAnswerStyle() {
  return (state: 'idle' | 'right' | 'wrong') => (state === 'right' ? 'quiz-option kana-correct' : state === 'wrong' ? 'quiz-option kana-wrong' : 'quiz-option');
}

/** QCM : mot -> traduction, traduction -> mot, écoute -> mot, mot -> image. */
function QcmGame({ mode, items, render, record, play, onFinish }: GameProps & { mode: 'fr2target' | 'target2fr' | 'listen' | 'images' }) {
  const questions = useMemo(() => {
    const base = mode === 'listen' ? items.filter((i) => i.audio) : mode === 'images' ? items.filter((i) => i.image) : items;
    const labelOf = (i: ExerciseItem) => (mode === 'target2fr' ? i.fr : i.text);
    return shuffle(base)
      .slice(0, QUESTIONS)
      .map((answer) => {
        const seen = new Set([labelOf(answer)]);
        const others: ExerciseItem[] = [];
        for (const o of shuffle(mode === 'images' ? base : items)) {
          if (others.length >= 3) break;
          if (o.id === answer.id || seen.has(labelOf(o))) continue;
          seen.add(labelOf(o));
          others.push(o);
        }
        return { answer, options: shuffle([answer, ...others]) };
      });
  }, [items, mode]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const style = useAnswerStyle();
  const q = questions[idx];

  // Écoute : on lance l'audio à l'apparition de chaque question
  useEffect(() => {
    if (mode !== 'listen' || !q) return;
    const t = setTimeout(() => play(q.answer.audio), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, mode]);

  if (!q) return <p className="eyebrow-free">Pas assez de mots pour cet exercice.</p>;

  function choose(o: ExerciseItem) {
    if (picked !== null) return;
    const ok = o.id === q.answer.id;
    setPicked(o.id);
    if (ok) setScore((s) => s + 1);
    record(q.answer, ok);
  }

  function next() {
    if (idx + 1 >= questions.length) onFinish(`${score} / ${questions.length}`);
    else {
      setIdx(idx + 1);
      setPicked(null);
    }
  }

  const prompt =
    mode === 'fr2target' ? (
      <div className="lesson-word-text">{q.answer.fr}</div>
    ) : mode === 'target2fr' ? (
      <div className="lesson-word-text">{render(q.answer.text)}</div>
    ) : mode === 'images' ? (
      <div className="lesson-word-text">{render(q.answer.text)}</div>
    ) : null;

  return (
    <div>
      <p className="eyebrow-free">
        Question {idx + 1} / {questions.length} — score : {score}
      </p>
      <div className="lex-prompt">
        {mode === 'listen' && (
          <button className="play-btn" onClick={() => play(q.answer.audio)} aria-label="Réécouter">
            ▶
          </button>
        )}
        {prompt}
      </div>

      {mode === 'images' ? (
        <div className="lex-img-grid">
          {q.options.map((o) => {
            const state = picked === null ? 'idle' : o.id === q.answer.id ? 'right' : o.id === picked ? 'wrong' : 'idle';
            return (
              <button key={o.id} className={`${style(state)} lex-img-btn`} onClick={() => choose(o)} disabled={picked !== null}>
                {o.image ? <img src={imageUrl(o.image)} alt="" loading="lazy" /> : o.fr}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="quiz-options">
          {q.options.map((o) => {
            const state = picked === null ? 'idle' : o.id === q.answer.id ? 'right' : o.id === picked ? 'wrong' : 'idle';
            return (
              <button key={o.id} className={style(state)} onClick={() => choose(o)} disabled={picked !== null}>
                {mode === 'target2fr' ? o.fr : render(o.text)}
              </button>
            );
          })}
        </div>
      )}

      {picked !== null && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="eyebrow-free">
            {picked === q.answer.id ? '✅ Bravo !' : '❌ '}
            <strong>{render(q.answer.text)}</strong> — {q.answer.fr}
          </p>
          <button className="primary" onClick={next}>
            {idx + 1 >= questions.length ? 'Terminer' : 'Question suivante →'}
          </button>
        </div>
      )}
    </div>
  );
}

function MemoryGame({ items, render, record, onFinish }: GameProps) {
  const pairs = Math.min(6, items.length);
  const deck = useMemo(() => {
    const picked = shuffle(items).slice(0, pairs);
    return shuffle(
      picked.flatMap((w) => [
        { key: `${w.id}-t`, item: w, label: w.text, kind: 't' as const },
        { key: `${w.id}-f`, item: w, label: w.fr, kind: 'f' as const },
      ])
    );
  }, [items, pairs]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);

  function flip(key: string) {
    if (locked || flipped.includes(key) || flipped.length === 2) return;
    const card = deck.find((c) => c.key === key)!;
    if (matched.has(card.item.id)) return;
    const nextFlipped = [...flipped, key];
    setFlipped(nextFlipped);
    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1);
      const a = deck.find((c) => c.key === nextFlipped[0])!;
      const b = deck.find((c) => c.key === nextFlipped[1])!;
      if (a.item.id === b.item.id && a.kind !== b.kind) {
        record(a.item, true);
        setMatched((m) => new Set(m).add(a.item.id));
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

  const done = matched.size === pairs;
  return (
    <div>
      <p className="eyebrow-free">
        Coups : {moves} — paires trouvées : {matched.size} / {pairs}
      </p>
      <div className="memory-grid">
        {deck.map((c) => {
          const open = flipped.includes(c.key) || matched.has(c.item.id);
          return (
            <button key={c.key} className={`memory-card${open ? ' flipped' : ''}${matched.has(c.item.id) ? ' matched' : ''}`} onClick={() => flip(c.key)}>
              {open ? (c.kind === 't' ? render(c.label) : c.label) : '?'}
            </button>
          );
        })}
      </div>
      {done && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="eyebrow-free">✅ {moves} coups pour {pairs} paires.</p>
          <button className="primary" onClick={() => onFinish(`${pairs} paires en ${moves} coups`)}>
            Terminer
          </button>
        </div>
      )}
    </div>
  );
}

function ScrambleGame({ items, record, onFinish }: GameProps) {
  const questions = useMemo(
    () =>
      shuffle(items)
        .map((it) => ({ it, parts: scrambleParts(it.text) }))
        .filter((q): q is { it: ExerciseItem; parts: { prefix: string; word: string } } => q.parts !== null)
        .slice(0, 5)
        .map(({ it, parts }) => {
          const letters = Array.from(parts.word);
          let mixed = shuffle(letters);
          for (let t = 0; t < 10 && mixed.join('') === parts.word; t++) mixed = shuffle(letters);
          return { it, parts, mixed };
        }),
    [items]
  );
  const [idx, setIdx] = useState(0);
  const [used, setUsed] = useState<number[]>([]); // positions des lettres déjà posées
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const q = questions[idx];
  if (!q) return <p className="eyebrow-free">Pas assez de mots pour cet exercice.</p>;

  const built = used.map((i) => q.mixed[i]).join('');

  function press(i: number) {
    if (result || used.includes(i)) return;
    const nextUsed = [...used, i];
    setUsed(nextUsed);
    if (nextUsed.length === q.mixed.length) {
      const attempt = nextUsed.map((k) => q.mixed[k]).join('');
      const ok = attempt.toLowerCase() === q.parts.word.toLowerCase();
      setResult(ok ? 'right' : 'wrong');
      if (ok) setScore((s) => s + 1);
      record(q.it, ok);
    }
  }

  function next() {
    if (idx + 1 >= questions.length) onFinish(`${score} / ${questions.length}`);
    else {
      setIdx(idx + 1);
      setUsed([]);
      setResult(null);
    }
  }

  return (
    <div>
      <p className="eyebrow-free">
        Mot {idx + 1} / {questions.length} — score : {score}
      </p>
      <div className="lex-prompt">
        <div className="lesson-word-text">{q.it.fr}</div>
      </div>
      <div className={`lex-answer${result === 'right' ? ' ok' : result === 'wrong' ? ' ko' : ''}`}>
        {q.parts.prefix}
        {built || '…'}
      </div>
      <div className="lex-letters">
        {q.mixed.map((c, i) => (
          <button key={i} className="quiz-option lex-letter" onClick={() => press(i)} disabled={used.includes(i) || result !== null}>
            {c}
          </button>
        ))}
      </div>
      {!result && used.length > 0 && (
        <button className="conv-mini-btn" style={{ marginTop: '0.5rem' }} onClick={() => setUsed([])}>
          Effacer
        </button>
      )}
      {result && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="eyebrow-free">
            {result === 'right' ? '✅ Bravo !' : '❌ La réponse était : '}
            <strong>{q.it.text}</strong>
          </p>
          <button className="primary" onClick={next}>
            {idx + 1 >= questions.length ? 'Terminer' : 'Mot suivant →'}
          </button>
        </div>
      )}
    </div>
  );
}

function TypingGame({ items, record, onFinish }: GameProps) {
  const questions = useMemo(() => shuffle(items).slice(0, 5), [items]);
  const [idx, setIdx] = useState(0);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const q = questions[idx];
  if (!q) return <p className="eyebrow-free">Pas assez de mots pour cet exercice.</p>;

  function check(giveUp = false) {
    if (result) return;
    const ok = !giveUp && acceptedAnswers(q.text).includes(normalizeForCompare(value));
    setResult(ok ? 'right' : 'wrong');
    if (ok) setScore((s) => s + 1);
    record(q, ok);
  }

  function next() {
    if (idx + 1 >= questions.length) onFinish(`${score} / ${questions.length}`);
    else {
      setIdx(idx + 1);
      setValue('');
      setResult(null);
    }
  }

  return (
    <div>
      <p className="eyebrow-free">
        Mot {idx + 1} / {questions.length} — score : {score}
      </p>
      <div className="lex-prompt">
        <div className="lesson-word-text">{q.fr}</div>
      </div>
      <input
        className="lex-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (result ? next() : check());
        }}
        disabled={result !== null}
        placeholder="Écris le mot…"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {!result ? (
        <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
          <button className="primary" onClick={() => check()} disabled={!value.trim()}>
            Valider
          </button>
          <button className="conv-mini-btn" onClick={() => check(true)}>
            Je ne sais pas
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="eyebrow-free">
            {result === 'right' ? '✅ Bravo !' : '❌ La réponse était : '}
            <strong>{q.text}</strong>
          </p>
          <button className="primary" onClick={next}>
            {idx + 1 >= questions.length ? 'Terminer' : 'Mot suivant →'}
          </button>
        </div>
      )}
    </div>
  );
}

function TrueFalseGame({ items, render, record, onFinish }: GameProps) {
  const questions = useMemo(
    () =>
      shuffle(items)
        .slice(0, 8)
        .map((it) => {
          const makeTrue = Math.random() < 0.5;
          const other = shuffle(items).find((o) => o.id !== it.id && o.fr !== it.fr);
          const shownFr = makeTrue || !other ? it.fr : other.fr;
          return { it, shownFr, isTrue: shownFr === it.fr };
        }),
    [items]
  );
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const q = questions[idx];
  if (!q) return <p className="eyebrow-free">Pas assez de mots pour cet exercice.</p>;

  function reply(v: boolean) {
    if (answer !== null) return;
    setAnswer(v);
    const ok = v === q.isTrue;
    if (ok) setScore((s) => s + 1);
    record(q.it, ok);
  }

  function next() {
    if (idx + 1 >= questions.length) onFinish(`${score} / ${questions.length}`);
    else {
      setIdx(idx + 1);
      setAnswer(null);
    }
  }

  const correct = answer !== null && answer === q.isTrue;
  return (
    <div>
      <p className="eyebrow-free">
        Question {idx + 1} / {questions.length} — score : {score}
      </p>
      <div className="lex-prompt">
        <div className="lesson-word-text">
          {render(q.it.text)} <span className="lesson-word-fr">veut dire</span> « {q.shownFr} »
        </div>
      </div>
      <div className="conv-bubble-actions">
        <button className="primary" onClick={() => reply(true)} disabled={answer !== null}>
          Vrai
        </button>
        <button className="secondary" onClick={() => reply(false)} disabled={answer !== null}>
          Faux
        </button>
      </div>
      {answer !== null && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="eyebrow-free">
            {correct ? '✅ Bravo !' : '❌ '} <strong>{render(q.it.text)}</strong> — {q.it.fr}
          </p>
          <button className="primary" onClick={next}>
            {idx + 1 >= questions.length ? 'Terminer' : 'Question suivante →'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- module ----------
export default function LessonExercises({
  profileId,
  isJa,
  items,
  render,
}: {
  profileId: string;
  isJa: boolean;
  items: ExerciseItem[];
  render: (text: string) => ReactNode;
}) {
  const ctx: Ctx = useMemo(() => ({ items, isJa }), [items, isJa]);
  const [round, setRound] = useState(0);
  const [games, setGames] = useState<GameId[]>(() => pickGames(ctx));
  const [current, setCurrent] = useState(0); // 0, 1 = exercice en cours ; 2 = terminé
  const [summaries, setSummaries] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function play(url: string | null) {
    if (!url) return;
    audioRef.current?.pause();
    const el = new Audio(url);
    audioRef.current = el;
    el.play().catch(() => {});
  }

  function record(it: ExerciseItem, ok: boolean) {
    recordGameResult(profileId, it.id, it.source, ok).catch(() => {});
  }

  function restart() {
    setGames(pickGames(ctx));
    setCurrent(0);
    setSummaries([]);
    setRound((r) => r + 1);
  }

  if (games.length === 0) {
    return (
      <>
        <div className="lesson-card-title">Exercices</div>
        <p className="eyebrow-free">Pas assez de mots dans cette leçon pour proposer des exercices.</p>
      </>
    );
  }

  const meta = (id: GameId) => GAMES.find((g) => g.id === id)!;
  const props: GameProps = {
    items,
    isJa,
    render,
    record,
    play,
    onFinish: (s) => {
      setSummaries((prev) => [...prev, s]);
      setCurrent((c) => c + 1);
    },
  };

  const gameId = games[current];
  let game: ReactNode = null;
  if (gameId) {
    const key = `${round}-${current}-${gameId}`;
    switch (gameId) {
      case 'fr2target':
      case 'target2fr':
      case 'listen':
      case 'images':
        game = <QcmGame key={key} mode={gameId} {...props} />;
        break;
      case 'memory':
        game = <MemoryGame key={key} {...props} />;
        break;
      case 'scramble':
        game = <ScrambleGame key={key} {...props} />;
        break;
      case 'typing':
        game = <TypingGame key={key} {...props} />;
        break;
      case 'truefalse':
        game = <TrueFalseGame key={key} {...props} />;
        break;
    }
  }

  return (
    <>
      <div className="lesson-card-title">Exercices</div>
      {gameId ? (
        <>
          <p className="eyebrow-free">
            Exercice {current + 1} / {games.length} — <strong>{meta(gameId).label}</strong> : {meta(gameId).hint}
          </p>
          {game}
        </>
      ) : (
        <div className="conv-correction exercise-success">
          <div className="conv-correction-label">Exercices terminés</div>
          <div className="conv-correction-text">
            {games.map((g, i) => (
              <div key={g}>
                {meta(g).label} : {summaries[i]}
              </div>
            ))}
          </div>
          <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
            <button className="conv-mini-btn" onClick={restart}>
              🔀 Deux autres exercices
            </button>
          </div>
        </div>
      )}
    </>
  );
}
