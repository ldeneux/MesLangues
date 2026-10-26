'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { generateMaxiWordSearch, lineCells, toJeuWords, type WsGrid } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

const pastel = (i: number) => `hsl(${(i * 47 + 20) % 360} 72% 82%)`;
const GRID = 30;
const MAX_WORDS = 100; // le maximum de mots que la grille peut contenir, plafonné à 100
const GAP = 3; // écart entre les cases (voir .lg-grid)
const MIN_SIDE = 230; // largeur minimale réservée à la liste des mots à droite

/**
 * Maxi mots cachés 30×30 : les mots à trouver restent en LANGUE ÉTRANGÈRE (liste à droite de la grille) ; la traduction
 * française s'affiche quand un mot est trouvé.
 */
export default function GameMaxiMotsCaches(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={30}>
      {(ctx) => <MaxiSearch ctx={ctx} />}
    </WordGameShell>
  );
}

function MaxiSearch({ ctx }: { ctx: WordGameCtx }) {
  const { pool, lang, record } = ctx;
  const words = useMemo(() => toJeuWords(pool, lang, 3, 14), [pool, lang]);
  const trans = useMemo(() => new Map(pool.map((w) => [w.id, w.translation_fr] as const)), [pool]);

  const [grid, setGrid] = useState<WsGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [found, setFound] = useState<Set<number>>(new Set()); // indices dans grid.placed
  const [start, setStart] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [size, setSize] = useState(30);
  const wrapRef = useRef<HTMLDivElement>(null);

  function newGrid() {
    // mots dans les 8 sens (à l'envers aussi), autant que la grille peut en contenir (100 au plus)
    const g = generateMaxiWordSearch(words, MAX_WORDS, GRID, true);
    setFailed(!g);
    setGrid(g);
    setFound(new Set());
    setStart(null);
    setMessage(null);
  }
  useEffect(() => newGrid(), [words]); // eslint-disable-line react-hooks/exhaustive-deps

  // Taille des cases : la plus grande qui fait tenir la grille entière dans la largeur, sans ascenseur ; la liste prend le reste
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => {
      const W = el.clientWidth;
      const narrow = W < 760; // petit écran : liste sous la grille, la grille occupe toute la largeur
      const avail = narrow ? W - 8 : W - MIN_SIDE - 16 - 8;
      const s = Math.floor((avail - (GRID - 1) * GAP) / GRID);
      setSize(Math.max(narrow ? 18 : 24, Math.min(44, s)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid]);

  const foundCell = useMemo(() => {
    const m = new Map<string, number>();
    grid?.placed.forEach((p, i) => {
      if (found.has(i)) p.cells.forEach(([r, c]) => m.set(`${r},${c}`, i));
    });
    return m;
  }, [grid, found]);

  if (failed) return <p className="wg-msg">Impossible de construire une grille avec ces mots (il faut au moins 10 mots d'un seul tenant de 3 à 14 lettres). Élargis le thème ou le filtre.</p>;
  if (!grid) return <p className="eyebrow-free">Construction de la grille…</p>;

  function tap(r: number, c: number) {
    if (!start) {
      setStart([r, c]);
      setMessage(null);
      return;
    }
    if (start[0] === r && start[1] === c) {
      setStart(null);
      return;
    }
    const line = lineCells(start, [r, c]);
    const key = (cells: [number, number][]) => cells.map((x) => x.join(',')).join(';');
    const hit = line ? grid!.placed.findIndex((p, i) => !found.has(i) && (key(p.cells) === key(line) || key([...p.cells].reverse()) === key(line))) : -1;
    if (hit >= 0) {
      const p = grid!.placed[hit];
      setFound((f) => new Set(f).add(hit));
      record(p.id, true);
      setMessage({ text: `Trouvé : ${p.display} = ${trans.get(p.id) ?? ''}`, ok: true });
      setStart(null);
    } else {
      setMessage({ text: 'Ce n\'est pas un mot de la liste. Choisis une autre première lettre.', ok: false });
      setStart([r, c]); // la dernière case touchée devient un nouveau départ
    }
  }

  function reveal() {
    setFound(new Set(grid!.placed.map((_, i) => i)));
    setMessage({ text: 'Tous les mots sont révélés (la maîtrise n\'est pas modifiée pour ceux que tu n\'as pas trouvés).', ok: false });
  }

  const total = grid.placed.length;
  const allFound = found.size === total;
  // Liste à droite : alphabétique, en langue étrangère ; la traduction n'apparaît qu'une fois le mot trouvé
  const order = grid.placed.map((_, i) => i).sort((a, b) => grid.placed[a].answer.localeCompare(grid.placed[b].answer));

  const gridPx = GRID * size + (GRID - 1) * GAP + 8;

  return (
    <div ref={wrapRef}>
      {message && <p className={`wg-msg${message.ok ? ' ok' : ''}`} style={{ marginTop: 0 }}>{message.text}</p>}
      {allFound && <p className="wg-msg ok">Bravo, tous les mots sont trouvés !</p>}

      <div className="mxs-layout">
        <div className="mxs-grid-wrap">
          <div className="lg-grid" style={{ gridTemplateColumns: `repeat(${grid.size}, var(--lg-size))`, ['--lg-size' as string]: `${size}px`, margin: 0 }}>
            {grid.cells.map((row, r) =>
              row.map((ch, c) => {
                const f = foundCell.get(`${r},${c}`);
                const isStart = start && start[0] === r && start[1] === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    className={`lg-cell${isStart ? ' start' : ''}`}
                    style={f !== undefined ? { background: pastel(f) } : undefined}
                    onClick={() => tap(r, c)}
                    aria-label={`Ligne ${r + 1}, colonne ${c + 1}, lettre ${ch}`}
                  >
                    {ch}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="mxs-side" style={{ maxHeight: gridPx }}>
          <div className="mxs-actions">
            <button className="secondary" onClick={reveal}>Voir la solution</button>
            <button className="primary" onClick={() => newGrid()}>Nouvelle grille</button>
          </div>
          <p className="wg-note" style={{ margin: '0.4rem 0' }}>
            <b>{found.size}</b> / {total} trouvés. Touche la <b>première</b> puis la <b>dernière</b> lettre d'un mot (ligne droite ou diagonale, dans les deux sens).
          </p>
          <div className="mxs-words">
            {order.map((i) => {
              const p = grid.placed[i];
              const isFound = found.has(i);
              return (
                <div key={p.id} className={`mxs-word${isFound ? ' found' : ''}`} style={isFound ? { background: pastel(i) } : undefined}>
                  <b>{isFound ? p.display : p.display.toLowerCase()}</b> <span className="wg-note">({p.answer.length})</span>
                  {isFound && <div className="mxs-fr">= {trans.get(p.id)}</div>}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
