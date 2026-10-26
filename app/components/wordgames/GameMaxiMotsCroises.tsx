'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { imageUrl } from '../../../lib/imageName';
import { generateCrossword, toJeuWords, cwCells, normLetters, type CwGrid, type CwEntry } from '../../../lib/wordGamesLogic';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

type Status = 'wrong' | 'given' | null;

const MAX_DIM = 30;

/**
 * Maxi mots croisés 30×30 « à placer » : les mots à trouver restent en LANGUE ÉTRANGÈRE (liste classée par longueur) ;
 * la traduction française n'apparaît qu'une fois le mot trouvé. On tape les lettres dans la grille, ou on touche un mot
 * de la liste pour le placer dans la case sélectionnée.
 */
export default function GameMaxiMotsCroises(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={40}>
      {(ctx) => <Maxi ctx={ctx} />}
    </WordGameShell>
  );
}

function Maxi({ ctx }: { ctx: WordGameCtx }) {
  const { pool, lang, record } = ctx;
  const words = useMemo(() => toJeuWords(pool, lang, 3, 12), [pool, lang]);
  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w] as const)), [pool]);

  const [grid, setGrid] = useState<CwGrid | null>(null);
  const [building, setBuilding] = useState(true);
  const [failed, setFailed] = useState(false);
  const [letters, setLetters] = useState<string[][]>([]);
  const [status, setStatus] = useState<Status[][]>([]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false); // solution affichée : plus de détection ni de suivi de maîtrise
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [dir, setDir] = useState<'A' | 'D'>('A');
  const [size, setSize] = useState(24);
  const [msg, setMsg] = useState('');
  const [lastFound, setLastFound] = useState<{ display: string; fr: string; image: string | null } | null>(null);
  const [showImage, setShowImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function newGrid() {
    setBuilding(true);
    setGrid(null);
    // laisse le navigateur afficher « Construction… » avant le calcul (environ une demi-seconde)
    setTimeout(() => {
      const g = generateCrossword(words, 300, MAX_DIM, 4);
      const ok = !!g && g.entries.length >= 10;
      setFailed(!ok);
      setGrid(ok ? g : null);
      setLetters(ok ? Array.from({ length: g!.rows }, () => Array(g!.cols).fill('')) : []);
      setStatus(ok ? Array.from({ length: g!.rows }, () => Array(g!.cols).fill(null)) : []);
      setFound(new Set());
      setRevealed(false);
      setMsg('');
      setLastFound(null);
      setShowImage(false);
      if (ok) {
        setSel([g!.entries[0].r, g!.entries[0].c]);
        setDir(g!.entries[0].dir);
      }
      setBuilding(false);
    }, 30);
  }
  useEffect(newGrid, [words]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryIdx = useMemo(() => {
    const m = new Map<string, number[]>();
    grid?.entries.forEach((e, i) => cwCells(e).forEach(([r, c]) => m.set(`${r},${c}`, [...(m.get(`${r},${c}`) ?? []), i])));
    return m;
  }, [grid]);

  // Détection : un mot dont toutes les lettres sont justes est « trouvé » (la traduction s'affiche, la maîtrise progresse)
  useEffect(() => {
    if (!grid || revealed) return;
    const newly = grid.entries.filter((e) => !found.has(e.id) && cwCells(e).every(([r, c]) => letters[r]?.[c] === grid.cells[r][c]));
    if (newly.length === 0) return;
    setFound((prev) => {
      const next = new Set(prev);
      newly.forEach((e) => next.add(e.id));
      return next;
    });
    newly.forEach((e) => record(e.id, true));
    const last = newly[newly.length - 1];
    const w = byId.get(last.id);
    setLastFound({ display: last.display, fr: w?.translation_fr ?? '', image: w?.image ?? null });
    setStatus((prev) => prev.map((row) => row.map((v) => (v === 'wrong' ? null : v))));
  }, [letters]); // eslint-disable-line react-hooks/exhaustive-deps

  const foundCells = useMemo(() => {
    const s = new Set<string>();
    grid?.entries.forEach((e) => {
      if (found.has(e.id) || revealed) cwCells(e).forEach(([r, c]) => s.add(`${r},${c}`));
    });
    return s;
  }, [grid, found, revealed]);

  if (building) return <p className="eyebrow-free">Construction de la grille 30×30…</p>;
  if (failed || !grid) {
    return (
      <p className="wg-msg">
        Impossible de construire une grille avec ces mots (il faut des mots d'un seul tenant de 3 à 12 lettres, assez nombreux). Élargis le thème ou le filtre.
      </p>
    );
  }

  const here = entryIdx.get(`${sel[0]},${sel[1]}`) ?? [];
  const curIdx = here.find((i) => grid.entries[i].dir === dir) ?? here[0];
  const cur: CwEntry | undefined = curIdx !== undefined ? grid.entries[curIdx] : undefined;
  const curCells = cur ? cwCells(cur) : [];

  // Motif de la case sélectionnée : lettres déjà posées ou imposées par les mots qui la croisent
  const pattern = cur ? curCells.map(([r, c]) => letters[r][c] || '') : [];
  const candidates = cur
    ? grid.entries.filter((x) => x.len === cur.len && !found.has(x.id) && pattern.every((ch, k) => !ch || ch === x.answer[k]))
    : [];

  function focusInput() {
    inputRef.current?.focus();
  }
  function selectEntry(i: number) {
    const e = grid!.entries[i];
    const empty = cwCells(e).find(([r, c]) => !letters[r][c]);
    setSel(empty ?? [e.r, e.c]);
    setDir(e.dir);
    setShowImage(false);
    focusInput();
  }
  function clickCell(r: number, c: number) {
    const idx = entryIdx.get(`${r},${c}`);
    if (!idx) return;
    if (sel[0] === r && sel[1] === c && idx.length > 1) setDir(dir === 'A' ? 'D' : 'A');
    else {
      setSel([r, c]);
      if (!idx.some((i) => grid!.entries[i].dir === dir)) setDir(grid!.entries[idx[0]].dir);
    }
    setShowImage(false);
    focusInput();
  }
  function step(delta: 1 | -1): [number, number] {
    const [r, c] = sel;
    const nr = dir === 'A' ? r : r + delta;
    const nc = dir === 'A' ? c + delta : c;
    return grid!.cells[nr]?.[nc] ? [nr, nc] : sel;
  }
  function setLetter(r: number, c: number, v: string) {
    setLetters((prev) => prev.map((row, rr) => (rr === r ? row.map((x, cc) => (cc === c ? v : x)) : row)));
    setStatus((prev) => prev.map((row, rr) => (rr === r ? row.map((x, cc) => (cc === c ? null : x)) : row)));
  }
  function typeLetter(ch: string) {
    const l = normLetters(ch).slice(0, 1);
    if (!l || !grid!.cells[sel[0]][sel[1]] || revealed) return;
    setLetter(sel[0], sel[1], l);
    setSel(step(1));
  }
  function backspace() {
    const [r, c] = sel;
    if (letters[r][c]) setLetter(r, c, '');
    else {
      const p = step(-1);
      setSel(p);
      setLetter(p[0], p[1], '');
    }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      verify();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const [dr, dc] = e.key === 'ArrowRight' ? [0, 1] : e.key === 'ArrowLeft' ? [0, -1] : e.key === 'ArrowDown' ? [1, 0] : [-1, 0];
      const nr = sel[0] + dr;
      const nc = sel[1] + dc;
      if (grid!.cells[nr]?.[nc]) {
        setSel([nr, nc]);
        const idx = entryIdx.get(`${nr},${nc}`) ?? [];
        const want = dr === 0 ? 'A' : 'D';
        if (idx.some((i) => grid!.entries[i].dir === want)) setDir(want);
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      if (here.length > 1) setDir(dir === 'A' ? 'D' : 'A');
    } else if (e.key.length === 1) {
      e.preventDefault();
      typeLetter(e.key);
    }
  }
  function onInput(e: React.FormEvent<HTMLInputElement>) {
    const v = e.currentTarget.value;
    e.currentTarget.value = '';
    if (v) typeLetter(v.slice(-1)); // claviers mobiles
  }

  // Touche un mot de la liste : il est placé dans la case sélectionnée si la longueur correspond
  function placeWord(w: CwEntry) {
    if (!cur) return setMsg('Touche d\'abord une case de la grille.');
    if (revealed || found.has(w.id)) return;
    if (w.len !== cur.len) return setMsg(`Ce mot a ${w.len} lettres, la case sélectionnée en demande ${cur.len}.`);
    setMsg('');
    setLetters((prev) => {
      const next = prev.map((row) => row.slice());
      curCells.forEach(([r, c], k) => (next[r][c] = w.answer[k]));
      return next;
    });
    setStatus((prev) => {
      const next = prev.map((row) => row.slice());
      curCells.forEach(([r, c]) => (next[r][c] = null));
      return next;
    });
  }

  function verify() {
    const next: Status[][] = status.map((row) => row.map(() => null));
    let wrong = 0;
    for (const e of grid!.entries) {
      if (found.has(e.id)) continue;
      for (const [r, c] of cwCells(e)) {
        const v = letters[r][c];
        if (v && v !== grid!.cells[r][c]) {
          next[r][c] = 'wrong';
          wrong++;
        }
      }
    }
    setStatus(next);
    setMsg(wrong ? `${wrong} lettre${wrong > 1 ? 's' : ''} fausse${wrong > 1 ? 's' : ''} (en rouge).` : found.size === grid!.entries.length ? '' : 'Aucune lettre fausse pour l\'instant.');
  }
  function hint() {
    if (!cur || revealed) return;
    const cell = curCells.find(([r, c]) => letters[r][c] !== grid!.cells[r][c]);
    if (!cell) return setMsg('Ce mot est déjà complet.');
    setLetter(cell[0], cell[1], grid!.cells[cell[0]][cell[1]]!);
    setStatus((prev) => prev.map((row, rr) => (rr === cell[0] ? row.map((x, cc) => (cc === cell[1] ? 'given' : x)) : row)));
  }
  function solution() {
    setLetters(grid!.cells.map((row) => row.map((ch) => ch ?? '')));
    setStatus(grid!.cells.map((row) => row.map((ch) => (ch ? 'given' : null))));
    setRevealed(true);
    setMsg('Solution affichée (la maîtrise des mots non trouvés n\'est pas modifiée).');
  }

  const total = grid.entries.length;
  const doneAll = found.size === total;
  const sizes = [18, 24, 32];

  // Liste des mots, classée par longueur décroissante puis alphabétique
  const byLen = new Map<number, CwEntry[]>();
  for (const e of grid.entries) byLen.set(e.len, [...(byLen.get(e.len) ?? []), e]);
  const lens = Array.from(byLen.keys()).sort((a, b) => b - a);

  const curWord = cur ? byId.get(cur.id) : undefined;

  return (
    <div>
      <div className="wg-bar" style={{ marginTop: 0 }}>
        <span className="eyebrow-free" style={{ margin: 0 }}>
          <strong>{found.size}</strong> / {total} mots trouvés · grille {grid.cols}×{grid.rows}
        </span>
        <label className="wg-note" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          Cases
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s === 18 ? 'Petites' : s === 24 ? 'Moyennes' : 'Grandes'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lastFound && (
        <p className="eyebrow-free" style={{ margin: '0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {lastFound.image && <img src={imageUrl(lastFound.image)} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />}
          <span>
            ✅ <strong>{lastFound.display}</strong> = {lastFound.fr}
          </span>
        </p>
      )}

      <input ref={inputRef} className="cw-hidden-input" type="text" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label="Saisie des lettres" onKeyDown={onKeyDown} onInput={onInput} />

      <div className="wg-scroll maxi-scroll">
        <div className="cw-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, var(--cw-size))`, ['--cw-size' as string]: `${size}px` }}>
          {grid.cells.map((row, r) =>
            row.map((ch, c) => {
              if (!ch) return <div key={`${r}-${c}`} className="cw-cell empty" />;
              const num = grid.entries.find((e) => e.r === r && e.c === c)?.number;
              const st = status[r]?.[c];
              const inCur = curCells.some(([rr, cc]) => rr === r && cc === c);
              const isFound = foundCells.has(`${r},${c}`);
              return (
                <div key={`${r}-${c}`} className="cw-cell">
                  <button
                    className={`${sel[0] === r && sel[1] === c ? 'sel ' : ''}${inCur ? 'cur ' : ''}${isFound ? 'right ' : ''}${st ?? ''}`}
                    style={{ background: isFound ? '#dcebd6' : inCur ? '#fff3cf' : '#fff' }}
                    onClick={() => clickCell(r, c)}
                    aria-label={num ? `Case ${num}` : 'Case'}
                  >
                    {letters[r]?.[c]}
                  </button>
                  {num && size >= 24 && <span className="cw-num">{num}</span>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {cur && (
        <div className="maxi-current">
          <div>
            <strong>Mot n° {cur.number}</strong> · {cur.dir === 'A' ? 'horizontal' : 'vertical'} · {cur.len} lettres :{' '}
            <span className="maxi-pattern">{pattern.map((ch) => (ch ? ch.toUpperCase() : '_')).join(' ')}</span>
          </div>
          {!found.has(cur.id) && !revealed && (
            <div className="maxi-cands">
              {candidates.length === 0 ? (
                <span className="wg-note">Aucun mot de la liste ne correspond : une lettre est fausse ici ou dans un mot qui croise.</span>
              ) : (
                <>
                  <span className="wg-note">Mots possibles ({candidates.length}) :</span>
                  {candidates.slice(0, 14).map((x) => (
                    <button key={x.id} className="maxi-chip" onClick={() => placeWord(x)}>
                      {x.display}
                    </button>
                  ))}
                  {candidates.length > 14 && <span className="wg-note">… tape des lettres pour réduire la liste</span>}
                </>
              )}
            </div>
          )}
          {found.has(cur.id) && curWord && (
            <div className="wg-note">
              ✅ {cur.display} = {curWord.translation_fr}
            </div>
          )}
          {!found.has(cur.id) && !revealed && curWord?.image && (
            <div>
              <button className="secondary" onClick={() => setShowImage((v) => !v)}>
                {showImage ? 'Masquer l\'image' : '💡 Voir l\'image du mot'}
              </button>
              {showImage && <img src={imageUrl(curWord.image)} alt="" style={{ width: 90, height: 90, objectFit: 'contain', marginLeft: '0.6rem', verticalAlign: 'middle' }} />}
            </div>
          )}
        </div>
      )}

      <div className="wg-bar">
        <button className="primary" onClick={verify}>Vérifier</button>
        <button className="secondary" onClick={hint} disabled={!cur || revealed}>Une lettre</button>
        <button className="secondary" onClick={solution}>Voir la solution</button>
        <button className="secondary" onClick={newGrid}>Nouvelle grille</button>
      </div>
      {doneAll && <p className="wg-msg ok">Bravo, tous les mots sont trouvés !</p>}
      {msg && <p className="wg-msg">{msg}</p>}
      <p className="wg-note">
        Touche une case puis tape les lettres (accents inutiles), ou touche un mot de la liste pour le placer. Touche la même case une 2ᵉ fois pour changer de sens. La
        traduction apparaît quand le mot est trouvé.
      </p>

      <h4 style={{ margin: '1rem 0 0.3rem' }}>Mots à trouver</h4>
      <div className="maxi-bank">
        {lens.map((len) => (
          <div key={len} className="maxi-bank-group">
            <div className="maxi-bank-title">{len} lettres</div>
            {byLen
              .get(len)!
              .slice()
              .sort((a, b) => a.answer.localeCompare(b.answer))
              .map((e) => {
                const isFound = found.has(e.id) || revealed;
                const w = byId.get(e.id);
                const i = grid.entries.indexOf(e);
                return (
                  <button key={e.id} className={`maxi-word${isFound ? ' found' : ''}${i === curIdx ? ' active' : ''}`} onClick={() => (isFound ? selectEntry(i) : placeWord(e))} title={isFound ? 'Voir dans la grille' : 'Placer dans la case sélectionnée'}>
                    <b>{e.display}</b>
                    {isFound && w && <span> — {w.translation_fr}</span>}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
