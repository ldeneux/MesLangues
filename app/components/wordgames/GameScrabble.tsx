'use client';

import './wordgames.css';
import { useMemo, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { BOARD, CENTER, RACK_SIZE, BINGO_BONUS, buildBag, emptyBoard, evaluateMove, premiumAt, wordsFrom, type Board, type LetterEntry } from '../../../lib/letterGamesLogic';
import { useLetterDictionary } from './useLetterDictionary';

type RackTile = { id: number; ch: string };
type LogItem = { words: { answer: string; points: number; display: string; fr: string }[]; total: number; bingo: boolean };

const PREM_LABEL: Record<string, string> = { TW: 'M×3', DW: 'M×2', TL: 'L×3', DL: 'L×2' };

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Scrabble solo avec les mots de ta base (tous niveaux de la langue) : plateau 15×15 avec cases bonus, chevalet de 7 lettres,
 * les mots formés (principal et croisés) doivent tous être dans le dictionnaire. Le sac de lettres et la valeur des lettres
 * sont déduits des mots de la langue.
 */
export default function GameScrabble({ lang }: { profileId: string; lang: LangCode; level: LevelCode }) {
  const { entries, total, byAnswer, keys, error } = useLetterDictionary(lang);
  const [phase, setPhase] = useState<'setup' | 'play' | 'end'>('setup');
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [bag, setBag] = useState<string[]>([]);
  const [rack, setRack] = useState<RackTile[]>([]);
  const [pending, setPending] = useState<Record<string, number>>({}); // "r,c" → id de la tuile du chevalet
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [log, setLog] = useState<LogItem[]>([]);
  const [msg, setMsg] = useState('');
  const [hints, setHints] = useState<LetterEntry[] | null>(null);
  const [nextId, setNextId] = useState(0);

  const { values, baseBag } = useMemo(() => {
    if (!entries || entries.length === 0) return { values: {} as Record<string, number>, baseBag: [] as string[] };
    const b = buildBag(entries);
    return { values: b.values, baseBag: b.bag };
  }, [entries]);

  const placedIds = new Set(Object.values(pending));
  const rackVisible = rack.filter((t) => !placedIds.has(t.id));

  function draw(currentBag: string[], currentRack: RackTile[], startId: number) {
    const nb = currentBag.slice();
    const nr = currentRack.slice();
    let id = startId;
    while (nr.length < RACK_SIZE && nb.length > 0) nr.push({ id: id++, ch: nb.pop()! });
    return { bag: nb, rack: nr, nextId: id };
  }

  function newGame() {
    const d = draw(shuffled(baseBag), [], 0);
    setBoard(emptyBoard());
    setBag(d.bag);
    setRack(d.rack);
    setNextId(d.nextId);
    setPending({});
    setSelected(null);
    setScore(0);
    setLog([]);
    setMsg('');
    setHints(null);
    setPhase('play');
  }

  function clickRack(id: number) {
    setSelected((s) => (s === id ? null : id));
    setMsg('');
  }

  function clickCell(r: number, c: number) {
    if (phase !== 'play' || board[r][c] !== null) return;
    const key = `${r},${c}`;
    if (pending[key] !== undefined) {
      // reprend la lettre posée
      setPending((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      return;
    }
    if (selected === null) return setMsg('Choisis d\'abord une lettre de ton chevalet.');
    setPending((p) => ({ ...p, [key]: selected }));
    setSelected(null);
    setMsg('');
  }

  function recall() {
    setPending({});
    setSelected(null);
    setMsg('');
  }

  function submit() {
    const placed = Object.entries(pending).map(([k, id]) => {
      const [r, c] = k.split(',').map(Number);
      return { r, c, ch: rack.find((t) => t.id === id)!.ch };
    });
    const res = evaluateMove(board, placed, keys, values);
    if (res.ok === false) return setMsg(res.error);

    const nb = board.map((row) => row.slice());
    for (const p of placed) nb[p.r][p.c] = p.ch;
    const remaining = rack.filter((t) => !placedIds.has(t.id));
    const d = draw(bag, remaining, nextId);

    setBoard(nb);
    setBag(d.bag);
    setRack(d.rack);
    setNextId(d.nextId);
    setPending({});
    setSelected(null);
    setHints(null);
    setScore((s) => s + res.total);
    setLog((l) => [
      ...l,
      {
        words: res.words.map((w) => ({ answer: w.answer, points: w.points, display: byAnswer.get(w.answer)?.display ?? w.answer, fr: byAnswer.get(w.answer)?.fr ?? '' })),
        total: res.total,
        bingo: res.bingo,
      },
    ]);
    setMsg(`✅ ${res.words.map((w) => w.answer.toUpperCase()).join(' + ')} : ${res.total} points${res.bingo ? ` (dont ${BINGO_BONUS} de bonus pour les 7 lettres !)` : ''}`);
    if (d.rack.length === 0) setPhase('end');
  }

  function pass() {
    recall();
    setMsg('Tour passé.');
  }

  function exchange() {
    recall();
    if (bag.length < RACK_SIZE) return setMsg('Le sac est trop vide pour échanger.');
    const pool = shuffled([...bag, ...rack.map((t) => t.ch)]);
    const d = draw(pool, [], nextId);
    setBag(d.bag);
    setRack(d.rack);
    setNextId(d.nextId);
    setHints(null);
    setMsg('Chevalet échangé (le tour est passé).');
  }

  function showHints() {
    setHints(wordsFrom(entries ?? [], rackVisible.map((t) => t.ch)).slice(0, 6));
  }

  if (error) return <p className="conv-warning">{error}</p>;
  if (!entries) return <p className="eyebrow-free">Chargement du dictionnaire…</p>;
  if (entries.length < 100) {
    return <p className="eyebrow-free">Il faut au moins 100 mots jouables dans la langue pour un Scrabble ({entries.length} pour l'instant, sur {total} mots). Télécharge ou active plus de packs de vocabulaire.</p>;
  }

  if (phase === 'setup') {
    return (
      <div className="lg-intro">
        <p className="eyebrow-free">
          Scrabble en solo avec <strong>{entries.length} mots</strong> de ta base (tous niveaux de la langue). Pose des lettres sur le plateau pour former des mots ; tous les mots
          formés, y compris les mots croisés, doivent être dans la base. Les lettres rares valent plus de points, les cases colorées multiplient la valeur. Les {RACK_SIZE} lettres posées d'un coup
          rapportent {BINGO_BONUS} points de bonus. {lang === 'ja' ? 'En japonais, les tuiles sont les kana de la lecture du mot.' : 'Les accents ne comptent pas.'}
        </p>
        <button className="primary" onClick={newGame}>
          Commencer une partie
        </button>
      </div>
    );
  }

  const pendingCount = Object.keys(pending).length;

  return (
    <div className="sc-wrap">
      <div className="lg-top">
        <span className="eyebrow-free" style={{ margin: 0 }}>
          Score : <strong>{score}</strong>
        </span>
        <span className="eyebrow-free" style={{ margin: 0 }}>
          Sac : {bag.length} lettre{bag.length > 1 ? 's' : ''} · {log.length} coup{log.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="sc-board" role="grid">
        {board.map((row, r) =>
          row.map((ch, c) => {
            const key = `${r},${c}`;
            const pendId = pending[key];
            const pendCh = pendId !== undefined ? rack.find((t) => t.id === pendId)?.ch : undefined;
            const prem = premiumAt(r, c);
            const letter = ch ?? pendCh ?? null;
            return (
              <button
                key={key}
                className={`sc-cell${prem ? ` prem-${prem}` : ''}${ch ? ' fixed' : ''}${pendCh ? ' pending' : ''}${r === CENTER && c === CENTER && !letter ? ' center' : ''}`}
                onClick={() => clickCell(r, c)}
                disabled={phase !== 'play' || ch !== null}
                aria-label={letter ? letter : `case ${r + 1}-${c + 1}`}
              >
                {letter ? (
                  <>
                    {letter.toUpperCase()}
                    <sub>{values[letter] ?? ''}</sub>
                  </>
                ) : r === CENTER && c === CENTER ? (
                  '★'
                ) : prem ? (
                  <span className="sc-prem">{PREM_LABEL[prem]}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {phase === 'play' && (
        <>
          <div className="sc-rack">
            {rackVisible.map((t) => (
              <button key={t.id} className={`sc-tile${selected === t.id ? ' selected' : ''}`} onClick={() => clickRack(t.id)}>
                {t.ch.toUpperCase()}
                <sub>{values[t.ch] ?? ''}</sub>
              </button>
            ))}
            {rackVisible.length === 0 && <span className="lg-placeholder">Chevalet vide</span>}
          </div>

          <div className="conv-bubble-actions" style={{ marginTop: '0.75rem' }}>
            <button className="primary" onClick={submit} disabled={pendingCount === 0}>
              Valider le mot
            </button>
            <button className="conv-mini-btn" onClick={recall} disabled={pendingCount === 0}>
              Reprendre mes lettres
            </button>
            <button className="conv-mini-btn" onClick={() => setRack((r) => shuffled(r))}>
              Mélanger
            </button>
            <button className="conv-mini-btn" onClick={showHints}>
              💡 Mots possibles
            </button>
            <button className="conv-mini-btn" onClick={exchange} disabled={bag.length < RACK_SIZE}>
              Échanger
            </button>
            <button className="conv-mini-btn" onClick={pass}>
              Passer
            </button>
            <button className="conv-mini-btn" onClick={() => setPhase('end')}>
              Terminer
            </button>
          </div>
        </>
      )}

      {msg && <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>{msg}</p>}

      {hints && phase === 'play' && (
        <div className="conv-correction" style={{ marginTop: '0.5rem' }}>
          <div className="conv-correction-label">Mots possibles avec ton chevalet (sans le plateau)</div>
          <div className="conv-correction-text">
            {hints.length === 0
              ? 'Aucun mot : essaie « Échanger ».'
              : hints.map((e) => (
                  <div key={e.answer}>
                    <strong>{e.answer.toUpperCase()}</strong> — {e.fr}
                  </div>
                ))}
          </div>
        </div>
      )}

      {phase === 'end' && (
        <div className="conv-correction exercise-success" style={{ marginTop: '1rem' }}>
          <div className="conv-correction-label">Partie terminée : {score} points en {log.length} coup{log.length > 1 ? 's' : ''}</div>
          <div className="conv-correction-text">
            {log.length === 0
              ? 'Aucun mot posé.'
              : log.map((l, i) => (
                  <div key={i}>
                    {l.words.map((w) => `${w.answer.toUpperCase()}${w.fr ? ` (${w.fr})` : ''}`).join(' + ')} — <strong>{l.total}</strong>
                    {l.bingo ? ' ⭐' : ''}
                  </div>
                ))}
          </div>
          <button className="primary" style={{ marginTop: '0.75rem' }} onClick={newGame}>
            Nouvelle partie
          </button>
        </div>
      )}
    </div>
  );
}
