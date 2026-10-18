'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { getCachedJaReadings } from '../../../lib/wordGamesServer';
import { buildMahjong, isTileFree, mjFindPair, type MjTile } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

export default function GameMahjongKanji(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={10}>
      {(ctx) => <Mahjong ctx={ctx} />}
    </WordGameShell>
  );
}

const HAN = /\p{Script=Han}/u;
const HIRA = /^[\u3041-\u3096ー]+$/;
const W = 54, H = 62, GAP = 6, LIFT = 5;

function fontFor(t: MjTile): string {
  const n = t.label.length;
  if (t.kind === 'kanji') return n <= 1 ? '1.7rem' : n === 2 ? '1.35rem' : n === 3 ? '1.05rem' : '0.85rem';
  return n <= 3 ? '1.05rem' : n <= 5 ? '0.85rem' : '0.7rem';
}

function Mahjong({ ctx }: { ctx: WordGameCtx }) {
  const { pool, record } = ctx;
  const [big, setBig] = useState(false);
  const [readings, setReadings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [tiles, setTiles] = useState<MjTile[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [nope, setNope] = useState<number[]>([]);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [buildError, setBuildError] = useState(false);

  const kanjiWords = useMemo(() => pool.filter((w) => HAN.test(w.target_text)), [pool]);

  // Lectures déjà en cache (table ja_readings) : aucun appel payant. Les mots sans lecture connue sont écartés du jeu.
  useEffect(() => {
    setReadings(null);
    getCachedJaReadings(kanjiWords.map((w) => w.target_text)).then((r) => {
      if (r.ok) { setReadings(r.readings); setError(''); } else { setReadings({}); setError((r as { error: string }).error); }
    });
  }, [kanjiWords]);

  const candidates = useMemo(() => {
    if (!readings) return [];
    // Mots sans kanji (katakana, déjà en hiragana) exclus ; lecture en hiragana pur, sans rōmaji ; formes courtes pour tenir sur une tuile
    return kanjiWords
      .map((w) => ({ id: w.id, kanji: w.target_text, reading: readings[w.target_text] ?? '' }))
      .filter((w) => HIRA.test(w.reading) && w.kanji !== w.reading && w.kanji.length <= 5 && w.reading.length <= 7);
  }, [kanjiWords, readings]);

  function newGame(b = big) {
    const t = buildMahjong(candidates, b);
    setBuildError(!t);
    setTiles(t ?? []);
    setTotal(t?.length ?? 0);
    setSel(null);
    setHint([]);
    setNope([]);
    setFailed(new Set());
    setMessage('');
  }
  useEffect(() => {
    if (readings) newGame();
  }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps

  if (readings === null) return <p className="eyebrow-free">Chargement des lectures…</p>;
  const need = big ? 16 : 10;
  if (buildError || candidates.length < need) {
    return (
      <div>
        <div className="wg-filters">
          <label>
            Taille
            <select value={big ? 'L' : 'S'} onChange={(e) => { const b = e.target.value === 'L'; setBig(b); }}>
              <option value="S">Petite (10 paires)</option>
              <option value="L">Grande (16 paires, 2 étages)</option>
            </select>
          </label>
        </div>
        <p className="wg-msg">
          {error || `Il faut au moins ${need} mots à kanji avec une lecture connue (et des lectures toutes différentes, pour éviter les homophones) : il y en a ${candidates.length} avec ce filtre.`}
        </p>
      </div>
    );
  }

  const cols = big ? 6 : 5, rows = 4;
  const width = cols * (W + GAP) + LIFT * 2, height = rows * (H + GAP) + LIFT * 2;
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const free = new Set(tiles.filter((t) => isTileFree(t, tiles)).map((t) => t.id));

  function click(t: MjTile) {
    setHint([]);
    setMessage('');
    if (!free.has(t.id)) { flash([t.id]); return; }
    if (sel === null) { setSel(t.id); return; }
    if (sel === t.id) { setSel(null); return; }
    const a = byId.get(sel)!;
    if (a.wordId === t.wordId && a.kind !== t.kind) {
      setTiles((cur) => cur.filter((x) => x.id !== a.id && x.id !== t.id));
      setSel(null);
      record(t.wordId, true);
      if (tiles.length - 2 === 0) setMessage('Bravo, plateau vidé !');
    } else {
      if (!failed.has(a.wordId)) {
        setFailed((f) => new Set(f).add(a.wordId));
        record(a.wordId, false); // une seule erreur comptée par mot et par partie
      }
      flash([a.id, t.id]);
      setSel(t.id);
      setMessage('Ces deux tuiles ne vont pas ensemble : un kanji se range avec sa lecture en hiragana.');
    }
  }
  function flash(ids: number[]) {
    setNope(ids);
    setTimeout(() => setNope([]), 350);
  }
  function showHint() {
    const p = mjFindPair(tiles);
    setHint(p ? [p[0].id, p[1].id] : []);
  }

  const done = tiles.length === 0;

  return (
    <div>
      <div className="wg-filters">
        <label>
          Taille
          <select value={big ? 'L' : 'S'} onChange={(e) => { const b = e.target.value === 'L'; setBig(b); newGame(b); }}>
            <option value="S">Petite (10 paires)</option>
            <option value="L">Grande (16 paires, 2 étages)</option>
          </select>
        </label>
        <span className="wg-note">Paires restantes : {tiles.length / 2} / {total / 2}</span>
      </div>
      <p className="wg-note">
        Retire les paires <b>kanji ↔ lecture en hiragana</b>. Une tuile est libre s'il n'y a rien dessus et si l'un de ses côtés (gauche ou droite) est dégagé. La partie peut toujours être terminée.
      </p>

      <div className="wg-scroll">
        <div className="mj-board" style={{ width, height, ['--mj-w' as string]: `${W}px`, ['--mj-h' as string]: `${H}px` }}>
          {[...tiles].sort((a, b) => a.z - b.z).map((t) => (
            <button
              key={t.id}
              className={`mj-tile ${t.kind}${free.has(t.id) ? '' : ' blocked'}${sel === t.id ? ' selected' : ''}${hint.includes(t.id) ? ' hint' : ''}${nope.includes(t.id) ? ' nope' : ''}`}
              style={{ left: LIFT * 2 + t.c * (W + GAP) - t.z * LIFT, top: LIFT * 2 + t.r * (H + GAP) - t.z * LIFT, zIndex: t.z * 10 + 1, fontSize: fontFor(t) }}
              onClick={() => click(t)}
              aria-label={t.kind === 'kanji' ? `Kanji ${t.label}` : `Lecture ${t.label}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {message && <p className={`wg-msg${done ? ' ok' : ''}`}>{message}</p>}
      <div className="wg-bar">
        <button className="secondary" onClick={showHint} disabled={done}>Indice</button>
        <button className="primary" onClick={() => newGame()}>Nouvelle partie</button>
      </div>
    </div>
  );
}
