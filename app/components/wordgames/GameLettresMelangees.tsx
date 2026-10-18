'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { imageUrl } from '../../../lib/imageName';
import { anagramAnswers, normLetters, scrambleLetters, shuffle, toJeuWords, type JeuWord } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

const ROUND = 10;

export default function GameLettresMelangees(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={ROUND}>
      {(ctx) => <Scramble ctx={ctx} />}
    </WordGameShell>
  );
}

type Tile = { id: number; ch: string };
type Res = { word: string; display: string; fr: string; result: 'ok' | 'hint' | 'fail' };

function Scramble({ ctx }: { ctx: WordGameCtx }) {
  const { pool, lang, record } = ctx;
  const words = useMemo(() => toJeuWords(pool, lang, 4, 10).filter((w) => new Set(w.answer).size > 1), [pool, lang]);
  const imgOf = useMemo(() => new Map(pool.map((w) => [w.id, w.image ?? null] as const)), [pool]);
  const frOf = useMemo(() => new Map(pool.map((w) => [w.id, w.translation_fr] as const)), [pool]);

  const [queue, setQueue] = useState<JeuWord[]>([]);
  const [pos, setPos] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [hints, setHints] = useState(0);
  const [state, setState] = useState<'play' | 'right' | 'wrong' | 'revealed'>('play');
  const [results, setResults] = useState<Res[]>([]);
  const [shake, setShake] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function start() {
    const q = shuffle(words).slice(0, ROUND);
    setQueue(q);
    setResults([]);
    setPos(0);
    load(q[0]);
  }
  function load(w: JeuWord | undefined) {
    if (!w) return;
    const s = scrambleLetters(w.answer) ?? w.answer.split('');
    setTiles(s.map((ch, i) => ({ id: i, ch })));
    setSlots(Array(w.answer.length).fill(null));
    setHints(0);
    setState('play');
  }
  useEffect(start, [words]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = queue[pos];
  if (words.length < ROUND) return <p className="wg-msg">Pas assez de mots de 4 à 10 lettres, en un seul mot, pour ce filtre.</p>;
  if (!cur) return <p className="eyebrow-free">Chargement…</p>;
  if (pos >= queue.length) {
    const ok = results.filter((r) => r.result !== 'fail').length;
    return (
      <div>
        <p className="wg-msg ok">Manche terminée : {ok} / {results.length} mots retrouvés.</p>
        <div className="bg-found">
          {results.map((r, i) => (
            <span key={i} className={r.result === 'fail' ? 'missed' : ''}>
              {r.display} — {r.fr} {r.result === 'hint' ? '(avec indice)' : ''}
            </span>
          ))}
        </div>
        <div className="wg-bar"><button className="primary" onClick={start}>Nouvelle manche</button></div>
      </div>
    );
  }

  const used = new Set(slots.filter((s) => s !== null) as number[]);
  const typed = slots.map((s) => (s === null ? '' : tiles[s].ch)).join('');
  const full = slots.every((s) => s !== null);
  const accepted = anagramAnswers(cur.answer, words);

  function place(tileId: number) {
    if (state !== 'play') return;
    const i = slots.findIndex((s) => s === null);
    if (i < 0) return;
    setSlots((s) => s.map((v, k) => (k === i ? tileId : v)));
  }
  function removeSlot(i: number) {
    if (state !== 'play' || i < hints) return;
    setSlots((s) => s.map((v, k) => (k === i ? null : v)));
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || state !== 'play') return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      const last = [...slots].map((s, k) => (s !== null && k >= hints ? k : -1)).filter((k) => k >= 0).pop();
      if (last !== undefined) removeSlot(last);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      check();
    } else if (e.key.length === 1) {
      const l = normLetters(e.key);
      const t = tiles.find((x) => !used.has(x.id) && normLetters(x.ch) === l);
      if (t) { e.preventDefault(); place(t.id); }
    }
  }
  function hint() {
    if (state !== 'play' || hints >= cur.answer.length - 1) return;
    const n = hints + 1;
    // On remet tout à plat puis on pose les n premières lettres justes (verrouillées)
    const pool2 = new Set<number>();
    const next: (number | null)[] = Array(cur.answer.length).fill(null);
    for (let k = 0; k < n; k++) {
      const t = tiles.find((x) => !pool2.has(x.id) && normLetters(x.ch) === cur.answer[k]);
      if (t) { pool2.add(t.id); next[k] = t.id; }
    }
    setSlots(next);
    setHints(n);
  }
  function finish(result: Res['result']) {
    setResults((r) => [...r, { word: cur.answer, display: cur.display, fr: frOf.get(cur.id) ?? '', result }]);
    if (result === 'ok') record(cur.id, true);
    if (result === 'fail') record(cur.id, false);
    // avec indice : la maîtrise n'est pas modifiée
  }
  function check() {
    if (state !== 'play' || !full) return;
    const typedNorm = normLetters(typed);
    if (accepted.has(typedNorm)) {
      setState('right');
      finish(hints > 0 ? 'hint' : 'ok');
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setState('wrong');
      setTimeout(() => setState((s) => (s === 'wrong' ? 'play' : s)), 700);
    }
  }
  function giveUp() {
    if (state !== 'play') return;
    setState('revealed');
    finish('fail');
  }
  function next() {
    const n = pos + 1;
    setPos(n);
    load(queue[n]);
    boxRef.current?.focus();
  }

  const img = imgOf.get(cur.id);
  // Affichage de la solution : on montre le mot d'origine plutôt que de réaffecter les tuiles
  const shown = state === 'revealed' ? cur.display.toUpperCase().split('') : null;

  return (
    <div ref={boxRef} tabIndex={0} onKeyDown={onKey} style={{ outline: 'none' }}>
      <p className="wg-note">Mot {pos + 1} / {queue.length}</p>
      <div className="sc-clue">
        {img && <img src={imageUrl(img)} alt="" />}
        <p className="eyebrow-free" style={{ margin: 0 }}>Indice (français) : <b>{frOf.get(cur.id)}</b> — {cur.answer.length} lettres</p>
      </div>

      <div className="sc-row" style={shake ? { animation: 'mj-shake 0.3s' } : undefined}>
        {slots.map((s, i) => {
          const cls = `sc-slot${s !== null || shown ? ' filled' : ''}${i < hints ? ' locked' : ''}${state === 'right' ? ' right' : ''}${state === 'wrong' ? ' wrong' : ''}`;
          return (
            <button key={i} className={cls} onClick={() => removeSlot(i)} aria-label={`Case ${i + 1}`}>
              {shown ? shown[i] : s !== null ? tiles[s].ch : ''}
            </button>
          );
        })}
      </div>
      <div className="sc-row">
        {tiles.map((t) => (
          <button key={t.id} className="sc-tile" disabled={used.has(t.id) || state !== 'play'} onClick={() => place(t.id)}>
            {t.ch}
          </button>
        ))}
      </div>

      {state === 'right' && <p className="wg-msg ok">Bravo ! {cur.display}</p>}
      {state === 'revealed' && <p className="wg-msg">Le mot était : <b>{cur.display}</b></p>}
      {state === 'wrong' && <p className="wg-msg">Ce n'est pas le bon mot, essaie encore.</p>}

      <div className="wg-bar">
        {state === 'right' || state === 'revealed' ? (
          <button className="primary" onClick={next}>{pos + 1 >= queue.length ? 'Voir le bilan' : 'Mot suivant →'}</button>
        ) : (
          <>
            <button className="primary" onClick={check} disabled={!full}>Vérifier</button>
            <button className="secondary" onClick={hint} disabled={hints >= cur.answer.length - 1}>Indice (+1 lettre)</button>
            <button className="secondary" onClick={() => { setSlots(Array(cur.answer.length).fill(null)); setHints(0); }}>Effacer</button>
            <button className="secondary" onClick={giveUp}>Passer</button>
          </>
        )}
      </div>
      <p className="wg-note">Touche les lettres dans l'ordre (ou tape-les au clavier). Une réussite sans indice améliore ta maîtrise du mot ; avec indice, elle ne change pas.</p>
    </div>
  );
}
