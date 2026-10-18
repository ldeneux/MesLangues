'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { generateWordSearch, lineCells, toJeuWords, type WsGrid } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

const pastel = (i: number) => `hsl(${(i * 47 + 20) % 360} 72% 82%)`;

export default function GameMotsCaches(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={10}>
      {(ctx) => <WordSearch ctx={ctx} />}
    </WordGameShell>
  );
}

function WordSearch({ ctx }: { ctx: WordGameCtx }) {
  const { pool, lang, record } = ctx;
  const words = useMemo(() => toJeuWords(pool, lang, 3, 10), [pool, lang]);
  const trans = useMemo(() => new Map(pool.map((w) => [w.id, w.translation_fr] as const)), [pool]);

  const [reverse, setReverse] = useState(false);
  const [grid, setGrid] = useState<WsGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [found, setFound] = useState<Set<number>>(new Set()); // indices dans grid.placed
  const [start, setStart] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function newGrid(rev = reverse) {
    const g = generateWordSearch(words, 10, rev);
    setFailed(!g);
    setGrid(g);
    setFound(new Set());
    setStart(null);
    setMessage(null);
  }
  useEffect(() => newGrid(), [words]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="wg-msg">Impossible de construire une grille avec ces mots. Élargis le thème ou le filtre.</p>;
  if (!grid) return <p className="eyebrow-free">Construction de la grille…</p>;

  const size = grid.size <= 10 ? 34 : 29;
  const foundCell = new Map<string, number>();
  grid.placed.forEach((p, i) => {
    if (found.has(i)) p.cells.forEach(([r, c]) => foundCell.set(`${r},${c}`, i));
  });

  function tap(r: number, c: number) {
    if (!start) { setStart([r, c]); setMessage(null); return; }
    if (start[0] === r && start[1] === c) { setStart(null); return; }
    const line = lineCells(start, [r, c]);
    const key = (cells: [number, number][]) => cells.map((x) => x.join(',')).join(';');
    const hit = line ? grid!.placed.findIndex((p, i) => !found.has(i) && (key(p.cells) === key(line) || key([...p.cells].reverse()) === key(line))) : -1;
    if (hit >= 0) {
      const p = grid!.placed[hit];
      setFound((f) => new Set(f).add(hit));
      record(p.id, true);
      setMessage({ text: `Trouvé : ${p.display} (${trans.get(p.id) ?? ''})`, ok: true });
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

  const allFound = found.size === grid.placed.length;

  return (
    <div>
      <div className="wg-filters">
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={reverse} onChange={(e) => { setReverse(e.target.checked); newGrid(e.target.checked); }} />
          Mots aussi à l'envers (plus difficile)
        </label>
      </div>
      <p className="wg-note">
        Mots trouvés : {found.size} / {grid.placed.length}. Touche la <b>première</b> lettre d'un mot, puis sa <b>dernière</b> lettre.
      </p>
      <div className="wg-scroll">
        <div className="lg-grid" style={{ gridTemplateColumns: `repeat(${grid.size}, var(--lg-size))`, ['--lg-size' as string]: `${size}px` }}>
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
      {message && <p className={`wg-msg${message.ok ? ' ok' : ''}`}>{message.text}</p>}
      {allFound && <p className="wg-msg ok">Bravo, tous les mots sont trouvés !</p>}
      <div className="ws-words">
        {grid.placed.map((p, i) => (
          <span key={p.id} className={`ws-word${found.has(i) ? ' found' : ''}`} style={found.has(i) ? { background: pastel(i) } : undefined}>
            {trans.get(p.id)} <span className="wg-note">({p.answer.length})</span>
            {found.has(i) ? ` → ${p.display}` : ''}
          </span>
        ))}
      </div>
      <div className="wg-bar">
        <button className="secondary" onClick={reveal}>Voir la solution</button>
        <button className="primary" onClick={() => newGrid()}>Nouvelle grille</button>
      </div>
    </div>
  );
}
