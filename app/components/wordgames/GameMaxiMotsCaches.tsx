'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { generateMaxiWordSearch, lineCells, toJeuWords, type WsGrid } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

const pastel = (i: number) => `hsl(${(i * 47 + 20) % 360} 72% 82%)`;
const GRID = 30;

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

  const [reverse, setReverse] = useState(false);
  const [count, setCount] = useState(60);
  const [grid, setGrid] = useState<WsGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [found, setFound] = useState<Set<number>>(new Set()); // indices dans grid.placed
  const [start, setStart] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [size, setSize] = useState(26);

  function newGrid(rev = reverse, n = count) {
    const g = generateMaxiWordSearch(words, n, GRID, rev);
    setFailed(!g);
    setGrid(g);
    setFound(new Set());
    setStart(null);
    setMessage(null);
  }
  useEffect(() => newGrid(), [words]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div>
      <div className="wg-filters">
        <label>
          Mots dans la grille
          <select
            value={count}
            onChange={(e) => {
              const n = Number(e.target.value);
              setCount(n);
              newGrid(reverse, n);
            }}
          >
            {[30, 45, 60, 80, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={reverse}
            onChange={(e) => {
              setReverse(e.target.checked);
              newGrid(e.target.checked);
            }}
          />
          Mots aussi à l'envers (plus difficile)
        </label>
        <label>
          Cases
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            <option value={20}>Petites</option>
            <option value={26}>Moyennes</option>
            <option value={34}>Grandes</option>
          </select>
        </label>
      </div>
      <p className="wg-note">
        Mots trouvés : <b>{found.size}</b> / {total}. Touche la <b>première</b> lettre d'un mot, puis sa <b>dernière</b> lettre (en ligne droite ou en diagonale).
      </p>
      {message && <p className={`wg-msg${message.ok ? ' ok' : ''}`}>{message.text}</p>}
      {allFound && <p className="wg-msg ok">Bravo, tous les mots sont trouvés !</p>}

      <div className="mxs-layout">
        <div className="mxs-grid-wrap">
          <div className="lg-grid" style={{ gridTemplateColumns: `repeat(${grid.size}, var(--lg-size))`, ['--lg-size' as string]: `${size}px`, fontSize: `${Math.round(size * 0.55)}px` }}>
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

        <aside className="mxs-side">
          <h4>Mots à trouver ({total - found.size} restants)</h4>
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
        </aside>
      </div>

      <div className="wg-bar">
        <button className="secondary" onClick={reveal}>Voir la solution</button>
        <button className="primary" onClick={() => newGrid()}>Nouvelle grille</button>
      </div>
    </div>
  );
}
