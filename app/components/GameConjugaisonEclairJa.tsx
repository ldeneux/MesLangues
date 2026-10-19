'use client';

import { useEffect, useState } from 'react';
import { getConjugationVerbs, type ConjugationVerb } from '../../lib/conjugation';
import { recordGameResult } from '../../lib/vocabulary';
import { conjugateJapaneseVerb, JA_LEVEL_ORDER, type JaFormRow, type JaLevel } from '../../lib/japaneseVerbs';

// Conjugaison éclair en japonais : on donne un verbe et une forme (ex. « Familier : négatif »), on choisit la bonne forme.
type Round = { verb: ConjugationVerb; target: JaFormRow; options: string[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(verbs: ConjugationVerb[], levelCode: string): Round | null {
  const limit = Math.max(0, JA_LEVEL_ORDER.indexOf(levelCode as JaLevel));
  for (let tries = 0; tries < 20; tries++) {
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    if (!verb.ja_data) continue;
    const rows = conjugateJapaneseVerb(verb.infinitive, verb.ja_data.reading, verb.ja_data.group);
    const allowed = rows.filter((r) => JA_LEVEL_ORDER.indexOf(r.level) <= limit && r.id !== 'dict');
    if (allowed.length < 4) continue;
    const target = allowed[Math.floor(Math.random() * allowed.length)];
    const distractors = shuffle(rows.filter((r) => r.written !== target.written)).slice(0, 3).map((r) => r.written);
    if (distractors.length < 3) continue;
    return { verb, target, options: shuffle([target.written, ...distractors]) };
  }
  return null;
}

export default function GameConjugaisonEclairJa({ profileId, levelCode }: { profileId: string; levelCode: string }) {
  const [verbs, setVerbs] = useState<ConjugationVerb[] | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    getConjugationVerbs('ja', levelCode, true)
      .catch(() => [])
      .then((list) => {
        setVerbs(list);
        if (list.length > 0) setRound(buildRound(list, levelCode));
      });
  }, [levelCode]);

  if (verbs === null) return <p className="eyebrow-free">Chargement…</p>;
  if (verbs.length === 0) {
    return <p className="eyebrow-free">Pas encore de verbes téléchargés — va dans l'onglet "Packs", bloc « Verbes ».</p>;
  }
  if (!round) return <p className="eyebrow-free">Pas assez de formes disponibles à ton niveau pour ce jeu.</p>;

  async function choose(opt: string) {
    if (!round || picked) return;
    setPicked(opt);
    const ok = opt === round.target.written;
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
    try {
      await recordGameResult(profileId, round.verb.id, 'verb', ok);
    } catch {
      /* non bloquant */
    }
  }

  return (
    <div>
      <p className="eyebrow-free">
        Score : {score.correct} / {score.total}
      </p>
      <div className="phrase-card phrase-card-big">
        <p className="eyebrow-free">Mets ce verbe à la forme demandée :</p>
        <div className="phrase-target" lang="ja">
          {round.verb.infinitive} <span className="revision-fr">({round.verb.translation_fr})</span>
        </div>
        <p className="eyebrow-free">
          {round.target.label_fr} — <span lang="ja">{round.target.term_jp}</span>
        </p>

        <div className="quiz-options kana-quiz-options">
          {round.options.map((o) => {
            const state = picked ? (o === round.target.written ? ' kana-correct' : o === picked ? ' kana-wrong' : '') : '';
            return (
              <button key={o} className={`quiz-option${state}`} disabled={!!picked} lang="ja" onClick={() => choose(o)}>
                {o}
              </button>
            );
          })}
        </div>

        {picked && (
          <>
            <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
              {picked === round.target.written ? '✅ Correct' : '✏️ Pas tout à fait'} — lecture : {round.target.reading}
            </p>
            <button
              className="primary"
              onClick={() => {
                setPicked(null);
                setRound(buildRound(verbs, levelCode));
              }}
            >
              Suivant →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
