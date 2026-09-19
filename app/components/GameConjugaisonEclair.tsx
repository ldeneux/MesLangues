'use client';

import { useEffect, useState } from 'react';
import { getConjugationVerbs, type ConjugationVerb } from '../../lib/conjugation';
import { recordGameResult } from '../../lib/vocabulary';
import type { LangCode } from '../../lib/constants';

const PRONOUNS_FR = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
const TENSE_LABELS: Record<string, string> = {
  present: 'présent',
  futur: 'futur simple',
  passe_compose: 'passé composé',
  imparfait: 'imparfait',
};
const TENSES = Object.keys(TENSE_LABELS);

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

type Round = { verb: ConjugationVerb; tense: string; pronounIndex: number; answer: string };

function buildRound(verbs: ConjugationVerb[]): Round | null {
  const eligible = verbs.filter((v) => TENSES.some((t) => (v.tenses as any)?.[t]?.length === 6));
  if (eligible.length === 0) return null;
  const verb = eligible[Math.floor(Math.random() * eligible.length)];
  const availableTenses = TENSES.filter((t) => (verb.tenses as any)?.[t]?.length === 6);
  const tense = availableTenses[Math.floor(Math.random() * availableTenses.length)];
  const pronounIndex = Math.floor(Math.random() * 6);
  const answer = (verb.tenses as any)[tense][pronounIndex];
  return { verb, tense, pronounIndex, answer };
}

export default function GameConjugaisonEclair({
  profileId,
  languageCode,
}: {
  profileId: string;
  languageCode: LangCode;
}) {
  const [verbs, setVerbs] = useState<ConjugationVerb[] | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setVerbs(null);
    getConjugationVerbs(languageCode)
      .catch(() => [])
      .then(setVerbs);
  }, [languageCode]);

  useEffect(() => {
    if (verbs && verbs.length > 0) newRound(verbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verbs]);

  function newRound(pool: ConjugationVerb[]) {
    setInput('');
    setChecked(null);
    setRound(buildRound(pool));
  }

  async function submit() {
    if (!round || checked !== null) return;
    const success = normalize(input) === normalize(round.answer);
    setChecked(success);
    setScore((s) => ({ correct: s.correct + (success ? 1 : 0), total: s.total + 1 }));
    await recordGameResult(profileId, round.verb.id, 'verb', success);
  }

  if (verbs === null) return <p className="eyebrow-free">Chargement…</p>;
  if (verbs.length === 0) {
    return <p className="eyebrow-free">Pas encore de verbes téléchargés — va dans l'onglet "Packs".</p>;
  }
  if (!round) return <p className="eyebrow-free">Pas assez de verbes complets pour ce jeu.</p>;

  return (
    <div>
      <p className="eyebrow-free">
        Score : {score.correct} / {score.total}
      </p>

      <div className="phrase-card phrase-card-big">
        <p className="eyebrow-free">Conjugue :</p>
        <div className="phrase-target">
          {round.verb.infinitive} — {PRONOUNS_FR[round.pronounIndex]} — {TENSE_LABELS[round.tense]}
        </div>

        {checked !== null && (
          <div className={checked ? 'conv-correction exercise-success' : 'conv-correction'}>
            <div className="conv-correction-label">{checked ? '✅ Correct' : '✏️ Pas tout à fait'}</div>
            <div className="conv-correction-text">{round.answer}</div>
          </div>
        )}

        {checked === null && (
          <div className="conv-text-row">
            <input
              className="conv-text-input"
              type="text"
              placeholder="Ta réponse…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <button className="primary" onClick={submit} disabled={!input.trim()}>
              Valider
            </button>
          </div>
        )}
      </div>

      {checked !== null && (
        <button className="primary" style={{ marginTop: '1rem' }} onClick={() => newRound(verbs)}>
          Suivant →
        </button>
      )}
    </div>
  );
}
