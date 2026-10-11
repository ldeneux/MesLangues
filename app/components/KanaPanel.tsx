'use client';

import { useMemo, useState } from 'react';
import { KANA_SECTIONS, toKatakana, type KanaEntry } from '../../lib/japanese';
import { speak } from '../../lib/speech';
import KanjiStrokes from './KanjiStrokes';
import KanjiDraw from './KanjiDraw';
import WriteMode, { type WriteItem } from './WriteMode';

type SectionKey = 'base' | 'daku' | 'yoon';
type PoolKey = SectionKey | 'all';
type QuizMode = 'read' | 'listen';
type Question = { target: KanaEntry; options: KanaEntry[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function poolFor(key: PoolKey): KanaEntry[] {
  const sections = key === 'all' ? KANA_SECTIONS : KANA_SECTIONS.filter((s) => s.key === key);
  const seen = new Set<string>();
  const out: KanaEntry[] = [];
  for (const s of sections)
    for (const r of s.rows)
      for (const e of r)
        if (e && !e.rare && !seen.has(e.romaji)) {
          seen.add(e.romaji);
          out.push(e);
        }
  return out;
}

function buildQuiz(pool: KanaEntry[], n = 10): Question[] {
  return shuffle(pool)
    .slice(0, n)
    .map((target) => {
      const others = shuffle(pool.filter((e) => e.romaji !== target.romaji)).slice(0, 3);
      return { target, options: shuffle([target, ...others]) };
    });
}

export default function KanaPanel() {
  const [kata, setKata] = useState(false);
  const [section, setSection] = useState<SectionKey>('base');
  const [view, setView] = useState<'table' | 'quiz' | 'write'>('table');
  const [selected, setSelected] = useState<KanaEntry | null>(null);
  const [writePool, setWritePool] = useState<PoolKey>('base');
  const [speechOk, setSpeechOk] = useState(true);

  // Quiz
  const [quizMode, setQuizMode] = useState<QuizMode>('read');
  const [poolKey, setPoolKey] = useState<PoolKey>('base');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const show = (h: string) => (kata ? toKatakana(h) : h);
  const current = KANA_SECTIONS.find((s) => s.key === section)!;
  const poolSize = useMemo(() => poolFor(poolKey).length, [poolKey]);

  // Mode Écrire : un signe = 1 caractère, ou 2 pour une combinaison (き + ゃ)
  const writeItems: WriteItem[] = useMemo(
    () =>
      poolFor(writePool).map((e) => {
        const glyph = kata ? toKatakana(e.hira) : e.hira;
        return { id: e.romaji, chars: Array.from(glyph), display: glyph, romaji: e.romaji, speakText: glyph };
      }),
    [writePool, kata]
  );

  function play(text: string) {
    setSpeechOk(speak(text));
  }

  function startQuiz() {
    setQuestions(buildQuiz(poolFor(poolKey)));
    setQIndex(0);
    setPicked(null);
    setScore(0);
  }

  const q = questions && qIndex < questions.length ? questions[qIndex] : null;
  const finished = questions !== null && qIndex >= questions.length;

  function choose(romaji: string) {
    if (!q || picked) return;
    setPicked(romaji);
    if (romaji === q.target.romaji) setScore((s) => s + 1);
  }

  function next() {
    setPicked(null);
    setQIndex((i) => i + 1);
  }

  return (
    <div>
      <p className="eyebrow-free">
        Les kana sont les 2 alphabets de base du japonais (hiragana et katakana, 46 signes chacun). Clique sur un signe
        pour l'entendre, voir l'ordre des traits et t'entraîner à l'écrire. L'onglet « Écrire » te fait dessiner les signes sans aide.
      </p>

      <div className="cascade-row">
        <button className={`conv-mini-btn${!kata ? ' active' : ''}`} onClick={() => setKata(false)}>
          ひらがな hiragana
        </button>
        <button className={`conv-mini-btn${kata ? ' active' : ''}`} onClick={() => setKata(true)}>
          カタカナ katakana
        </button>
        <span style={{ flex: 1 }} />
        <button className={`conv-mini-btn${view === 'table' ? ' active' : ''}`} onClick={() => setView('table')}>
          Tableau
        </button>
        <button className={`conv-mini-btn${view === 'quiz' ? ' active' : ''}`} onClick={() => setView('quiz')}>
          Quiz
        </button>
        <button className={`conv-mini-btn${view === 'write' ? ' active' : ''}`} onClick={() => setView('write')}>
          Écrire
        </button>
      </div>

      {!speechOk && (
        <p className="conv-warning">Ton navigateur ne propose pas de voix japonaise (essaie Chrome ou Edge).</p>
      )}

      {view === 'table' && (
        <div className="phrase-card phrase-card-big">
          <div className="cascade-row">
            {KANA_SECTIONS.map((s) => (
              <button key={s.key} className={`conv-mini-btn${section === s.key ? ' active' : ''}`} onClick={() => setSection(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="kana-grid" style={{ gridTemplateColumns: `repeat(${current.columns}, minmax(0, 1fr))` }}>
            {current.rows.flatMap((r, ri) =>
              r.map((e, ci) =>
                e ? (
                  <button
                    key={`${ri}-${ci}`}
                    className={`kana-cell${selected?.romaji === e.romaji ? ' selected' : ''}`}
                    onClick={() => {
                      play(show(e.hira));
                      setSelected(e);
                    }}
                  >
                    <span className="kana-glyph" lang="ja">
                      {show(e.hira)}
                    </span>
                    <span className="kana-romaji">{e.romaji}</span>
                  </button>
                ) : (
                  <span key={`${ri}-${ci}`} />
                )
              )
            )}
          </div>
          {selected && (
            <div className="kana-detail">
              <div className="kana-detail-head">
                <span className="kana-detail-glyph" lang="ja">
                  {show(selected.hira)}
                </span>
                <span className="kana-detail-romaji">{selected.romaji}</span>
                <button className="secondary" onClick={() => play(show(selected.hira))}>
                  🔊 Écouter
                </button>
                <button className="conv-mini-btn" onClick={() => setSelected(null)}>
                  Fermer
                </button>
              </div>
              {Array.from(show(selected.hira)).map((c, i, arr) => (
                <div key={`${selected.romaji}-${i}`}>
                  {arr.length > 1 && (
                    <div className="sidebar-label" style={{ marginTop: '1rem' }}>
                      {i === 0 ? '1er signe' : '2e signe (petit)'} : {c}
                    </div>
                  )}
                  <KanjiStrokes char={c} />
                  <KanjiDraw char={c} />
                </div>
              ))}
              <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>Tracés : KanjiVG (CC BY-SA 3.0).</p>
            </div>
          )}
          {section === 'daku' && (
            <p className="eyebrow-free">Les deux dernières cases de la ligne « da » (ぢ, づ) se prononcent comme じ et ず et sont rares.</p>
          )}
        </div>
      )}

      {view === 'write' && (
        <>
          <div className="cascade-row">
            <select className="cascade-select" value={writePool} onChange={(e) => setWritePool(e.target.value as PoolKey)}>
              <option value="base">Base</option>
              <option value="daku">Sons voisés</option>
              <option value="yoon">Combinaisons (2 cases)</option>
              <option value="all">Tout</option>
            </select>
          </div>
          <WriteMode key={`${writePool}-${kata}`} items={writeItems} flagPrefix="kana" />
        </>
      )}

      {view === 'quiz' && (
        <div className="phrase-card phrase-card-big">
          {questions === null && (
            <>
              <div className="cascade-row">
                <select className="cascade-select" value={quizMode} onChange={(e) => setQuizMode(e.target.value as QuizMode)}>
                  <option value="read">Lecture : je vois le kana, je choisis le son</option>
                  <option value="listen">Écoute : j'entends, je choisis le kana</option>
                </select>
                <select className="cascade-select" value={poolKey} onChange={(e) => setPoolKey(e.target.value as PoolKey)}>
                  <option value="base">Base</option>
                  <option value="daku">Sons voisés</option>
                  <option value="yoon">Combinaisons</option>
                  <option value="all">Tout</option>
                </select>
              </div>
              <p className="eyebrow-free">10 questions tirées parmi {poolSize} kana. Le score de ce quiz n'est pas enregistré.</p>
              <button className="primary" onClick={startQuiz}>
                Commencer
              </button>
            </>
          )}

          {q && (
            <>
              <div className="deck-progress">
                Question {qIndex + 1} / {questions!.length}
              </div>
              {quizMode === 'read' ? (
                <div className="kana-quiz-glyph" lang="ja">
                  {show(q.target.hira)}
                </div>
              ) : (
                <button className="secondary" onClick={() => play(show(q.target.hira))}>
                  🔊 Écouter
                </button>
              )}

              <div className="quiz-options kana-quiz-options">
                {q.options.map((o) => {
                  const state = picked ? (o.romaji === q.target.romaji ? ' kana-correct' : o.romaji === picked ? ' kana-wrong' : '') : '';
                  return (
                    <button key={o.romaji} className={`quiz-option${state}`} onClick={() => choose(o.romaji)} disabled={!!picked}>
                      {quizMode === 'read' ? o.romaji : <span lang="ja" style={{ fontSize: '1.6rem' }}>{show(o.hira)}</span>}
                    </button>
                  );
                })}
              </div>

              {picked && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p className="eyebrow-free">
                    {picked === q.target.romaji ? '✅ Bien joué !' : `❌ C'était ${show(q.target.hira)} (${q.target.romaji}).`}
                  </p>
                  <button className="primary" onClick={next}>
                    {qIndex + 1 < questions!.length ? 'Suivant →' : 'Voir mon score'}
                  </button>
                </div>
              )}
            </>
          )}

          {finished && (
            <div className="conv-correction exercise-success">
              <div className="conv-correction-label">Score</div>
              <div className="conv-correction-text">
                {score} / {questions!.length} bonnes réponses
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
