'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getKanjiList,
  getKanjiProgress,
  recordKanjiAnswer,
  type KanjiItem,
  type KanjiProgressMap,
} from '../../lib/kanji';
import { speak } from '../../lib/speech';
import KanjiStrokes from './KanjiStrokes';
import KanjiDraw from './KanjiDraw';
import KanjiListenGame from './KanjiListenGame';
import WriteMode, { type WriteItem } from './WriteMode';
import { kanaToRomaji, toHiragana } from '../../lib/japanese';
import { KANJI_CATEGORIES } from '../../lib/constants';

type QType = 'meaning' | 'reading' | 'listen';
type QuizMode = QType | 'mixed';
type Scope = 'all' | 'todo';
type Question = {
  type: QType;
  kanji: KanjiItem;
  prompt: string; // glyph / mot à lire
  speakText?: string;
  options: string[];
  answer: string;
};

const cleanKana = (s: string) => s.replace(/[.\-]/g, '');
const showKun = (s: string) => s.replace(/\./g, '·');

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isMastered(p?: { success: number; fail: number }) {
  if (!p) return false;
  const total = p.success + p.fail;
  return total >= 1 && p.success / total >= 0.9;
}

function pickOptions(correct: string, candidates: string[]): string[] {
  const others = shuffle(Array.from(new Set(candidates.filter((c) => c && c !== correct)))).slice(0, 3);
  return shuffle([correct, ...others]);
}

function buildQuestions(pool: KanjiItem[], all: KanjiItem[], mode: QuizMode, n = 10): Question[] {
  const types: QType[] = ['meaning', 'reading', 'listen'];
  return shuffle(pool)
    .slice(0, n)
    .map((k) => {
      const type: QType = mode === 'mixed' ? types[Math.floor(Math.random() * 3)] : mode;
      const ex = k.examples[Math.floor(Math.random() * k.examples.length)];
      if (type === 'meaning') {
        return {
          type,
          kanji: k,
          prompt: k.char,
          options: pickOptions(k.meaning_fr, all.map((o) => o.meaning_fr)),
          answer: k.meaning_fr,
        };
      }
      if (type === 'reading') {
        const readings = all.flatMap((o) => o.examples.map((e) => e.reading));
        return { type, kanji: k, prompt: ex.word, options: pickOptions(ex.reading, readings), answer: ex.reading };
      }
      const words = all.flatMap((o) => o.examples.map((e) => e.word));
      return { type, kanji: k, prompt: '', speakText: ex.reading, options: pickOptions(ex.word, words), answer: ex.word };
    });
}

export default function KanjiPanel({ profileId, levelCode }: { profileId: string; levelCode: string }) {
  const [kanjis, setKanjis] = useState<KanjiItem[] | null>(null);
  const [progress, setProgress] = useState<KanjiProgressMap>({});
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'quiz' | 'listen' | 'write'>('list');
  const [category, setCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [speechOk, setSpeechOk] = useState(true);

  // Quiz
  const [mode, setMode] = useState<QuizMode>('mixed');
  const [scope, setScope] = useState<Scope>('all');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    setKanjis(null);
    setSelectedId(null);
    setQuestions(null);
    setError('');
    Promise.all([getKanjiList(levelCode), getKanjiProgress(profileId)])
      .then(([list, prog]) => {
        setKanjis(list);
        setProgress(prog);
      })
      .catch((e: any) => setError(e?.message ?? 'Erreur de chargement des kanji.'));
  }, [levelCode, profileId]);

  const masteredCount = useMemo(() => (kanjis ?? []).filter((k) => isMastered(progress[k.id])).length, [kanjis, progress]);

  // Filtre par thème (fiches, quiz et écoute)
  const visible = useMemo(
    () => (kanjis ?? []).filter((k) => category === 'all' || k.category === category),
    [kanjis, category]
  );
  // Mode Écrire : audio d'une lecture du kanji (kun'yomi de préférence), sens et rōmaji en aides facultatives
  const writeItems: WriteItem[] = useMemo(
    () =>
      visible.map((k) => {
        const reading = k.kunyomi[0] ? cleanKana(k.kunyomi[0]) : k.onyomi[0] ? cleanKana(k.onyomi[0]) : '';
        return {
          id: k.id,
          chars: [k.char],
          display: k.char,
          romaji: reading ? kanaToRomaji(toHiragana(reading)) : '',
          speakText: reading || k.char,
          hint: k.meaning_fr,
        };
      }),
    [visible]
  );
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of kanjis ?? []) if (k.category) counts.set(k.category, (counts.get(k.category) ?? 0) + 1);
    return KANJI_CATEGORIES.filter((c) => counts.has(c.code)).map((c) => ({ ...c, count: counts.get(c.code) ?? 0 }));
  }, [kanjis]);

  function play(text: string) {
    setSpeechOk(speak(cleanKana(text)));
  }

  function startQuiz() {
    const all = kanjis ?? [];
    const inTheme = category === 'all' ? all : all.filter((k) => k.category === category);
    const base = inTheme.length >= 1 ? inTheme : all;
    const pool = scope === 'todo' ? base.filter((k) => !isMastered(progress[k.id])) : base;
    setQuestions(buildQuestions(pool.length >= 1 ? pool : base, all, mode));
    setQIndex(0);
    setPicked(null);
    setScore(0);
  }

  function choose(opt: string) {
    const q = questions?.[qIndex];
    if (!q || picked) return;
    setPicked(opt);
    const ok = opt === q.answer;
    if (ok) setScore((s) => s + 1);
    setProgress((prev) => {
      const cur = prev[q.kanji.id] ?? { success: 0, fail: 0 };
      return { ...prev, [q.kanji.id]: { success: cur.success + (ok ? 1 : 0), fail: cur.fail + (ok ? 0 : 1) } };
    });
    recordKanjiAnswer(profileId, q.kanji.id, ok).catch(() => {});
  }

  if (error) return <p className="conv-warning">{error}</p>;
  if (kanjis === null) return <p className="eyebrow-free">Chargement…</p>;
  if (kanjis.length === 0) {
    return (
      <p className="eyebrow-free">
        Aucun kanji téléchargé pour ce niveau — va dans l'onglet "Packs" et clique sur "Télécharger" dans la section Kanji.
      </p>
    );
  }

  const selected = kanjis.find((k) => k.id === selectedId) ?? null;
  const navList = selected && visible.includes(selected) ? visible : kanjis;
  const selIndex = selected ? navList.indexOf(selected) : -1;

  return (
    <div>
      <p className="eyebrow-free">
        {masteredCount} / {kanjis.length} kanji acquis à ce niveau (au moins 90 % de bonnes réponses au quiz).
      </p>

      <div className="cascade-row">
        <button className={`conv-mini-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>
          Fiches
        </button>
        <button className={`conv-mini-btn${view === 'quiz' ? ' active' : ''}`} onClick={() => setView('quiz')}>
          Quiz
        </button>
        <button className={`conv-mini-btn${view === 'listen' ? ' active' : ''}`} onClick={() => setView('listen')}>
          Écoute
        </button>
        <button className={`conv-mini-btn${view === 'write' ? ' active' : ''}`} onClick={() => setView('write')}>
          Écrire
        </button>
        {availableCategories.length > 0 && (
          <select
            className="cascade-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSelectedId(null);
              setQuestions(null);
            }}
          >
            <option value="all">Tous les thèmes ({kanjis.length})</option>
            {availableCategories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        )}
      </div>
      {availableCategories.length === 0 && (
        <p className="eyebrow-free">
          Pour filtrer par thème : onglet Packs → Kanji → « Classer par thème » (migration 018 à exécuter avant).
        </p>
      )}

      {!speechOk && <p className="conv-warning">Ton navigateur ne propose pas de voix japonaise (essaie Chrome ou Edge).</p>}

      {view === 'list' && !selected && (
        <div className="kanji-grid">
          {visible.map((k) => (
            <button key={k.id} className={`kanji-cell${isMastered(progress[k.id]) ? ' mastered' : ''}`} onClick={() => setSelectedId(k.id)}>
              <span className="kanji-cell-glyph" lang="ja">
                {k.char}
              </span>
              <span className="kana-romaji">{k.meaning_fr}</span>
            </button>
          ))}
        </div>
      )}

      {view === 'list' && selected && (
        <div className="phrase-card phrase-card-big">
          <div className="cascade-row">
            <button className="conv-mini-btn" onClick={() => setSelectedId(null)}>
              ← Tous les kanji
            </button>
            <span style={{ flex: 1 }} />
            <button className="conv-mini-btn" disabled={selIndex === 0} onClick={() => setSelectedId(navList[selIndex - 1].id)}>
              ←
            </button>
            <button className="conv-mini-btn" disabled={selIndex === navList.length - 1} onClick={() => setSelectedId(navList[selIndex + 1].id)}>
              →
            </button>
          </div>

          <div className="kanji-detail-head">
            <div className="kanji-big" lang="ja">
              {selected.char}
            </div>
            <div>
              <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.2rem' }}>
                {selected.meaning_fr}
              </div>
              {isMastered(progress[selected.id]) && <span className="pack-status pack-status-ready">Acquis</span>}
            </div>
          </div>

          <KanjiStrokes char={selected.char} />
          <KanjiDraw char={selected.char} />

          <div className="sidebar-label" style={{ marginTop: '1rem' }}>
            Lectures
          </div>
          <div className="kanji-readings">
            {selected.onyomi.length > 0 && (
              <div>
                <span className="revision-fr">On'yomi (lecture chinoise, dans les mots composés) : </span>
                {selected.onyomi.map((r) => (
                  <button key={r} className="conv-mini-btn" onClick={() => play(r)}>
                    🔊 {r}
                  </button>
                ))}
              </div>
            )}
            {selected.kunyomi.length > 0 && (
              <div>
                <span className="revision-fr">Kun'yomi (lecture japonaise, seul ou avec okurigana) : </span>
                {selected.kunyomi.map((r) => (
                  <button key={r} className="conv-mini-btn" onClick={() => play(r)}>
                    🔊 {showKun(r)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-label" style={{ marginTop: '1rem' }}>
            Mots d'exemple
          </div>
          {selected.examples.map((e, i) => (
            <div key={i} className="kanji-example">
              <ruby lang="ja" className="kanji-example-word">
                {e.word}
                <rt>{e.reading}</rt>
              </ruby>
              <span className="revision-fr">{e.meaning_fr}</span>
              <button className="conv-mini-btn" onClick={() => play(e.reading)}>
                🔊
              </button>
            </div>
          ))}
          <p className="eyebrow-free" style={{ marginTop: '1rem' }}>
            Tracés : KanjiVG (CC BY-SA 3.0).
          </p>
        </div>
      )}

      {view === 'listen' && <KanjiListenGame kanjis={visible} />}

      {view === 'write' && (
        <WriteMode key={category} items={writeItems} flagPrefix="kanji" hintLabel="Sens" hintDefault={true} />
      )}

      {view === 'quiz' && (
        <div className="phrase-card phrase-card-big">
          {questions === null && (
            <>
              <div className="cascade-row">
                <select className="cascade-select" value={mode} onChange={(e) => setMode(e.target.value as QuizMode)}>
                  <option value="mixed">Mélange</option>
                  <option value="meaning">Kanji → sens</option>
                  <option value="reading">Mot → lecture</option>
                  <option value="listen">J'écoute → je choisis le mot</option>
                </select>
                <select className="cascade-select" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                  <option value="all">Tous les kanji</option>
                  <option value="todo">Seulement ceux pas encore acquis</option>
                </select>
              </div>
              {kanjis.length < 4 ? (
                <p className="conv-warning">Il faut au moins 4 kanji téléchargés pour lancer un quiz.</p>
              ) : (
                <button className="primary" onClick={startQuiz}>
                  Commencer (10 questions)
                </button>
              )}
            </>
          )}

          {questions && qIndex < questions.length && (
            <>
              <div className="deck-progress">
                Question {qIndex + 1} / {questions.length}
              </div>
              {(() => {
                const q = questions[qIndex];
                return (
                  <>
                    {q.type === 'listen' ? (
                      <button className="secondary" onClick={() => play(q.speakText ?? '')}>
                        🔊 Écouter
                      </button>
                    ) : (
                      <div className="kanji-quiz-prompt" lang="ja">
                        {q.prompt}
                      </div>
                    )}
                    <div className="quiz-options kana-quiz-options">
                      {q.options.map((o) => {
                        const state = picked ? (o === q.answer ? ' kana-correct' : o === picked ? ' kana-wrong' : '') : '';
                        return (
                          <button key={o} className={`quiz-option${state}`} onClick={() => choose(o)} disabled={!!picked} lang={q.type === 'meaning' ? undefined : 'ja'}>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                    {picked && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <p className="eyebrow-free">
                          {picked === q.answer ? '✅ Bien joué !' : `❌ Bonne réponse : ${q.answer}`} — {q.kanji.char} ({q.kanji.meaning_fr})
                        </p>
                        <button
                          className="primary"
                          onClick={() => {
                            setPicked(null);
                            setQIndex((i) => i + 1);
                          }}
                        >
                          {qIndex + 1 < questions.length ? 'Suivant →' : 'Voir mon score'}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}

          {questions && qIndex >= questions.length && (
            <div className="conv-correction exercise-success">
              <div className="conv-correction-label">Score</div>
              <div className="conv-correction-text">
                {score} / {questions.length} bonnes réponses
              </div>
              <button className="conv-mini-btn" style={{ marginTop: '0.5rem' }} onClick={startQuiz}>
                Rejouer
              </button>{' '}
              <button className="conv-mini-btn" onClick={() => setQuestions(null)}>
                Changer de réglages
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
