'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { getAllReadyPhrases } from '../../../lib/data';
import { normalizeForCompare } from '../../../lib/textUtils';
import { buildClozeItems, makeChoices, shuffle, type ClozeItem } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

const ROUND = 10;

export default function GamePhrasesATrous(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={5}>
      {(ctx) => <Cloze ctx={ctx} />}
    </WordGameShell>
  );
}

type Mode = 'choice' | 'typed';

function Cloze({ ctx }: { ctx: WordGameCtx }) {
  const { pool, all, lang, level, record } = ctx;
  const isJa = lang === 'ja';
  const [phrases, setPhrases] = useState<Awaited<ReturnType<typeof getAllReadyPhrases>> | null>(null);
  const [mode, setMode] = useState<Mode>('choice');
  const [queue, setQueue] = useState<ClozeItem[]>([]);
  const [choicesFor, setChoicesFor] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<string | null>(null); // réponse donnée (null = pas encore répondu)
  const [typed, setTyped] = useState('');
  const [results, setResults] = useState<{ ok: boolean; text: string; fr: string }[]>([]);

  useEffect(() => {
    getAllReadyPhrases(lang, level)
      .catch(() => [])
      .then((p) => setPhrases(p ?? []));
  }, [lang, level]);

  const built = useMemo(
    () => (phrases ? buildClozeItems(phrases, pool, lang) : { items: [] as ClozeItem[], coveredWordIds: new Set<string>() }),
    [phrases, pool, lang]
  );

  function start() {
    const q = shuffle(built.items).slice(0, ROUND);
    setQueue(q);
    setPos(0);
    setResults([]);
    prepare(q[0]);
  }
  function prepare(item: ClozeItem | undefined) {
    setPicked(null);
    setTyped('');
    setChoicesFor(item ? makeChoices(item, all, lang) : []);
  }
  useEffect(() => {
    if (phrases) start();
  }, [built]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phrases === null) return <p className="eyebrow-free">Chargement des phrases…</p>;
  if (built.items.length === 0) {
    return (
      <p className="wg-msg">
        Aucune phrase téléchargée ne contient un mot de ce thème / filtre. Télécharge des phrases dans l'onglet « Packs », ou élargis le filtre.
        <br />
        <span className="wg-note">{phrases.length} phrase(s) disponible(s) au total.</span>
      </p>
    );
  }

  const cur = queue[pos];
  const coverage = (
    <p className="wg-note">
      {built.items.length} phrase{built.items.length > 1 ? 's' : ''} jouable{built.items.length > 1 ? 's' : ''} — {built.coveredWordIds.size} mot{built.coveredWordIds.size > 1 ? 's' : ''} sur {pool.length} apparaissent dans au moins une phrase.
    </p>
  );

  if (!cur) return <p className="eyebrow-free">Chargement…</p>;
  if (pos >= queue.length) {
    const ok = results.filter((r) => r.ok).length;
    return (
      <div>
        <p className="wg-msg ok">Manche terminée : {ok} / {results.length} bonnes réponses.</p>
        <div className="bg-found">
          {results.map((r, i) => (
            <span key={i} className={r.ok ? '' : 'missed'}>{r.text}</span>
          ))}
        </div>
        {coverage}
        <div className="wg-bar"><button className="primary" onClick={start}>Nouvelle manche</button></div>
      </div>
    );
  }

  const choiceMode = isJa || mode === 'choice';
  const answered = picked !== null;
  const correct = answered && (choiceMode ? picked === cur.expected : normalizeForCompare(picked!) === normalizeForCompare(cur.expected));

  function answer(value: string) {
    if (answered) return;
    const ok = choiceMode ? value === cur.expected : normalizeForCompare(value) === normalizeForCompare(cur.expected);
    setPicked(value);
    record(cur.word.id, ok);
    setResults((r) => [...r, { ok, text: `${cur.before}${cur.expected}${cur.after}`.trim(), fr: cur.translation_fr }]);
  }
  function next() {
    const n = pos + 1;
    setPos(n);
    prepare(queue[n]);
  }

  return (
    <div>
      {!isJa && (
        <div className="wg-filters">
          <label>
            Réponse
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="choice">Choix multiple (4 propositions)</option>
              <option value="typed">Saisie libre (plus difficile)</option>
            </select>
          </label>
        </div>
      )}
      <p className="wg-note">Phrase {pos + 1} / {queue.length}</p>
      <div className="phrase-card phrase-card-big">
        <p className="cz-sentence">
          {cur.before}
          <span className={`cz-blank${answered ? (correct ? ' right' : ' wrong') : ''}`}>
            {answered ? cur.expected : '\u00a0\u00a0\u00a0\u00a0\u00a0'}
          </span>
          {cur.after}
        </p>
        <p className="eyebrow-free">Traduction : {cur.translation_fr}</p>
      </div>

      {choiceMode ? (
        <div className="cz-choices">
          {choicesFor.map((c) => (
            <button
              key={c}
              disabled={answered}
              className={answered ? (c === cur.expected ? 'right' : c === picked ? 'wrong' : '') : ''}
              onClick={() => answer(c)}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div className="conv-text-row">
          <input
            className="conv-text-input"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Le mot manquant…"
            value={typed}
            disabled={answered}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) answer(typed.trim()); }}
          />
          <button className="primary" disabled={answered || !typed.trim()} onClick={() => answer(typed.trim())}>Valider</button>
        </div>
      )}

      {answered && (
        <div className={correct ? 'wg-msg ok' : 'wg-msg'}>
          {correct ? '✅ Bien joué !' : <>❌ Le mot manquant était : <b>{cur.expected}</b></>}
        </div>
      )}
      <div className="wg-bar">
        {answered && cur.audio_url && (
          <button className="secondary" onClick={() => new Audio(cur.audio_url!).play().catch(() => {})}>🔊 Écouter la phrase</button>
        )}
        {answered && <button className="primary" onClick={next}>{pos + 1 >= queue.length ? 'Voir le bilan' : 'Phrase suivante →'}</button>}
      </div>
      {coverage}
    </div>
  );
}
