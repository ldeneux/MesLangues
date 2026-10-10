'use client';

import { useEffect, useState } from 'react';
import { getGrammarTopic } from '../../lib/grammar';

// Jeu japonais (remplace la Chasse aux articles) : retrouver la particule manquante,
// à partir des exemples des fiches de grammaire déjà téléchargées.
const PARTICLE_TOPICS = ['ja_wa_ga', 'ja_particles', 'ja_no_to_mo_ka', 'ja_desu', 'ja_arimasu', 'ja_kosoado'];
const BASE_OPTIONS = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'の', 'も', 'か'];
const KNOWN = new Set([...BASE_OPTIONS, 'や', 'から', 'まで', 'より']);

type Q = { sentence: string; fr: string; answer: string; options: string[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(pool: { target: string; fr: string }[], n = 10): Q[] {
  const out: Q[] = [];
  for (const ex of shuffle(pool)) {
    const m = ex.target.match(/\*\*([^*]+)\*\*/);
    if (!m || !KNOWN.has(m[1])) continue;
    const answer = m[1];
    const sentence = ex.target.replace(m[0], '＿＿').replace(/\*\*/g, '');
    const others = shuffle(BASE_OPTIONS.filter((p) => p !== answer)).slice(0, 3);
    out.push({ sentence, fr: ex.fr.replace(/\*\*/g, ''), answer, options: shuffle([answer, ...others]) });
    if (out.length >= n) break;
  }
  return out;
}

export default function GameParticules({ languageCode }: { languageCode: string }) {
  const [pool, setPool] = useState<{ target: string; fr: string }[] | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    setPool(null);
    Promise.all(PARTICLE_TOPICS.map((c) => getGrammarTopic(languageCode, c).catch(() => null))).then((topics) => {
      const examples = topics.flatMap((t) => (t ? t.examples : []));
      setPool(examples);
    });
  }, [languageCode]);

  useEffect(() => {
    if (pool) start(pool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  function start(p: { target: string; fr: string }[]) {
    setQuestions(buildQuestions(p));
    setIndex(0);
    setPicked(null);
    setScore(0);
  }

  if (pool === null) return <p className="eyebrow-free">Chargement…</p>;
  if (questions.length < 3) {
    return (
      <p className="eyebrow-free">
        Pas encore assez de phrases : télécharge les fiches de grammaire japonaises (onglet Packs, « Grammaire et conjugaison »).
      </p>
    );
  }

  const q = questions[index];
  const finished = index >= questions.length;

  return (
    <div>
      <p className="eyebrow-free">Retrouve la particule (は, が, を, に, で…) qui manque dans la phrase.</p>

      {!finished && q && (
        <div className="phrase-card phrase-card-big">
          <div className="deck-progress">
            {index + 1} / {questions.length} — score : {score}
          </div>
          <div className="kanji-quiz-prompt" style={{ fontSize: '2rem' }} lang="ja">
            {q.sentence}
          </div>
          <p className="eyebrow-free" style={{ textAlign: 'center' }}>
            {q.fr}
          </p>
          <div className="quiz-options kana-quiz-options">
            {q.options.map((o) => {
              const state = picked ? (o === q.answer ? ' kana-correct' : o === picked ? ' kana-wrong' : '') : '';
              return (
                <button
                  key={o}
                  className={`quiz-option${state}`}
                  disabled={!!picked}
                  lang="ja"
                  onClick={() => {
                    setPicked(o);
                    if (o === q.answer) setScore((s) => s + 1);
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {picked && (
            <button
              className="primary"
              style={{ marginTop: '0.75rem' }}
              onClick={() => {
                setPicked(null);
                setIndex((i) => i + 1);
              }}
            >
              {index + 1 < questions.length ? 'Suivant →' : 'Voir mon score'}
            </button>
          )}
        </div>
      )}

      {finished && (
        <div className="conv-correction exercise-success">
          <div className="conv-correction-label">Score</div>
          <div className="conv-correction-text">
            {score} / {questions.length} bonnes réponses
          </div>
          <button className="conv-mini-btn" style={{ marginTop: '0.5rem' }} onClick={() => pool && start(pool)}>
            Rejouer
          </button>
        </div>
      )}
    </div>
  );
}
