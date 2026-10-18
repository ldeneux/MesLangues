'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { boggleScore, generateBoggle, toJeuWords, type BoggleGrid } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

const DURATION = 180; // secondes

export default function GameBoggle(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={15}>
      {(ctx) => <Boggle ctx={ctx} />}
    </WordGameShell>
  );
}

const adjacent = (a: number, b: number, size: number) => {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return a !== b && dr <= 1 && dc <= 1;
};

function Boggle({ ctx }: { ctx: WordGameCtx }) {
  const { pool, lang, record } = ctx;
  const words = useMemo(() => toJeuWords(pool, lang, 3, 10), [pool, lang]);
  const trans = useMemo(() => new Map(pool.map((w) => [w.id, w.translation_fr] as const)), [pool]);

  const [size, setSize] = useState(4);
  const [grid, setGrid] = useState<BoggleGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [path, setPath] = useState<number[]>([]);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const drag = useRef<{ active: boolean; moved: boolean }>({ active: false, moved: false });
  const gridRef = useRef<HTMLDivElement>(null);

  function newGame(s = size) {
    const g = generateBoggle(words, s, 5);
    setFailed(!g);
    setGrid(g);
    setPath([]);
    setFoundWords([]);
    setScore(0);
    setLeft(DURATION);
    setOver(false);
    setMessage(null);
  }
  useEffect(() => newGame(), [words]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!grid || over) return;
    const t = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(t);
  }, [grid, over]);
  useEffect(() => {
    if (left === 0) setOver(true);
  }, [left]);

  if (failed) return <p className="wg-msg">Impossible de construire une grille jouable avec ces mots. Élargis le thème ou le filtre.</p>;
  if (!grid) return <p className="eyebrow-free">Construction de la grille…</p>;

  const cell = size === 4 ? 62 : 52;
  const word = path.map((i) => grid.letters[i]).join('');

  function submit(p: number[]) {
    if (p.length < 3) { setMessage({ text: 'Un mot compte au moins 3 lettres.', ok: false }); setPath([]); return; }
    const w = p.map((i) => grid!.letters[i]).join('');
    const hit = grid!.found.get(w);
    if (!hit) {
      setMessage({ text: `« ${w.toUpperCase()} » : mot hors de ton vocabulaire pour ce thème / niveau (il n'est pas compté, ce n'est pas forcément une faute).`, ok: false });
    } else if (foundWords.includes(w)) {
      setMessage({ text: 'Déjà trouvé.', ok: false });
    } else {
      setFoundWords((f) => [...f, w]);
      setScore((s) => s + boggleScore(w.length));
      record(hit.id, true);
      setMessage({ text: `${hit.display} = ${trans.get(hit.id) ?? ''} (+${boggleScore(w.length)})`, ok: true });
    }
    setPath([]);
  }

  // Toucher successif : ajoute une case voisine ; retoucher une case du chemin le raccourcit jusqu'à elle.
  function tapCell(i: number) {
    if (over) return;
    setMessage(null);
    const k = path.indexOf(i);
    if (k >= 0) { setPath(path.slice(0, k + 1)); return; }
    if (path.length === 0 || adjacent(path[path.length - 1], i, size)) setPath([...path, i]);
    else setPath([i]);
  }
  // Glisser le doigt : facultatif, valide le mot au relâchement
  function cellFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const v = el?.closest('[data-i]')?.getAttribute('data-i');
    return v === null || v === undefined ? null : Number(v);
  }
  function onPointerDown(e: React.PointerEvent) {
    if (over) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    drag.current = { active: path.length === 0 && i !== null, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i === null) return;
    setPath((p) => {
      if (p.length === 0) return [i];
      const last = p[p.length - 1];
      if (i === last) return p;
      if (p.length >= 2 && i === p[p.length - 2]) { drag.current.moved = true; return p.slice(0, -1); }
      if (!p.includes(i) && adjacent(last, i, size)) { drag.current.moved = true; return [...p, i]; }
      return p;
    });
  }
  function onPointerUp() {
    if (drag.current.active && drag.current.moved) submit(path);
    drag.current = { active: false, moved: false };
  }

  const missed = over ? Array.from(grid.found.values()).filter((w) => !foundWords.includes(w.answer)) : [];
  const mm = String(Math.floor(left / 60)).padStart(1, '0') + ':' + String(left % 60).padStart(2, '0');

  return (
    <div>
      <div className="wg-filters">
        <label>
          Grille
          <select value={size} onChange={(e) => { const s = Number(e.target.value); setSize(s); newGame(s); }}>
            <option value={4}>4 × 4</option>
            <option value={5}>5 × 5 (mots plus longs)</option>
          </select>
        </label>
        <span className="wg-note">⏱ {mm} — Score : <b>{score}</b> — {foundWords.length} mot{foundWords.length > 1 ? 's' : ''} sur {grid.found.size} possibles</span>
      </div>
      <p className="wg-note">Relie des lettres voisines (diagonales comprises) pour former un mot de ton vocabulaire : touche les lettres l'une après l'autre puis « Valider », ou glisse le doigt.</p>

      <div className="bg-layout">
        <div>
          <div className="bg-current" aria-live="polite">{word || '…'}</div>
          <div
            ref={gridRef}
            className="lg-grid"
            style={{ gridTemplateColumns: `repeat(${size}, var(--lg-size))`, ['--lg-size' as string]: `${cell}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {grid.letters.map((ch, i) => (
              <button
                key={i}
                data-i={i}
                className={`lg-cell${path.includes(i) ? ' path' : ''}${path[0] === i ? ' start' : ''}${path[path.length - 1] === i ? ' head' : ''}`}
                onClick={() => tapCell(i)}
                disabled={over}
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="wg-bar">
            <button className="primary" onClick={() => submit(path)} disabled={over || path.length === 0}>Valider</button>
            <button className="secondary" onClick={() => setPath([])} disabled={over || path.length === 0}>Effacer</button>
            <button className="secondary" onClick={() => setOver(true)} disabled={over}>Terminer</button>
            <button className="secondary" onClick={() => newGame()}>Nouvelle grille</button>
          </div>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          {message && <p className={`wg-msg${message.ok ? ' ok' : ''}`}>{message.text}</p>}
          <div className="bg-found">
            {foundWords.map((w) => {
              const jw = grid.found.get(w)!;
              return <span key={w}>{jw.display} — {trans.get(jw.id)}</span>;
            })}
          </div>
        </div>
      </div>

      {over && (
        <div>
          <p className="wg-msg ok">Temps écoulé ! Score : {score}. Mots présents que tu n'as pas trouvés :</p>
          <div className="bg-found">
            {missed.length === 0 ? <span>Aucun, tu les as tous trouvés !</span> : missed.map((w) => <span key={w.id} className="missed">{w.display} — {trans.get(w.id)}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
