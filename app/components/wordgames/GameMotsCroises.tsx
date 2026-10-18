'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import type { VocabularyWordWithMastery } from '../../../lib/vocabulary';
import { imageUrl } from '../../../lib/imageName';
import { generateCrossword, toJeuWords, cwCells, normLetters, type CwGrid, type CwEntry } from '../../../lib/wordGamesLogic';
import { getWordDefinitions, generateWordDefinitions } from '../../../lib/wordGamesServer';
import WordGameShell, { type WordGameCtx } from './WordGameShell';

type ClueType = 'translation' | 'definition' | 'image';
type Status = 'right' | 'wrong' | 'given' | null;

const pastel = (i: number) => `hsl(${(i * 47 + 20) % 360} 72% 86%)`;
// Coût estimé de la préparation d'une définition (Wikipédia gratuit + traduction Gemini), arrondi large vers le haut
const EUR_PER_DEFINITION = 0.001;

export default function GameMotsCroises(props: { profileId: string; lang: LangCode; level: LevelCode }) {
  return (
    <WordGameShell {...props} minWords={12}>
      {(ctx) => <Crossword ctx={ctx} />}
    </WordGameShell>
  );
}

function Crossword({ ctx }: { ctx: WordGameCtx }) {
  const { pool, lang, record } = ctx;
  const words = useMemo(() => toJeuWords(pool, lang, 3, 9), [pool, lang]);
  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w] as const)), [pool]);

  const [grid, setGrid] = useState<CwGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [letters, setLetters] = useState<string[][]>([]);
  const [status, setStatus] = useState<Status[][]>([]);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [dir, setDir] = useState<'A' | 'D'>('A');
  const [clueType, setClueType] = useState<ClueType>('translation');
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [defs, setDefs] = useState<Record<string, string>>({});
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [defBusy, setDefBusy] = useState(false);
  const [defError, setDefError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function newGrid() {
    const g = generateCrossword(words, 10);
    setFailed(!g);
    setGrid(g);
    setLetters(g ? Array.from({ length: g.rows }, () => Array(g.cols).fill('')) : []);
    setStatus(g ? Array.from({ length: g.rows }, () => Array(g.cols).fill(null)) : []);
    setRecorded(new Set());
    setMessage(null);
    if (g) {
      setSel([g.entries[0].r, g.entries[0].c]);
      setDir(g.entries[0].dir);
    }
  }
  useEffect(newGrid, [words]); // eslint-disable-line react-hooks/exhaustive-deps

  // Définitions déjà en cache pour les mots de la grille (aucun coût)
  useEffect(() => {
    if (!grid || clueType !== 'definition') return;
    getWordDefinitions(grid.entries.map((e) => e.id)).then((r) => {
      if (r.ok) {
        setDefs((d) => ({ ...d, ...r.defs }));
        setTried((t) => new Set([...Array.from(t), ...r.tried]));
        setDefError('');
      } else setDefError((r as { error: string }).error);
    });
  }, [grid, clueType]);

  const entryIdx = useMemo(() => {
    const m = new Map<string, number[]>();
    grid?.entries.forEach((e, i) => cwCells(e).forEach(([r, c]) => m.set(`${r},${c}`, [...(m.get(`${r},${c}`) ?? []), i])));
    return m;
  }, [grid]);

  if (failed) {
    return (
      <p className="wg-msg">
        Impossible de construire une grille avec ces mots (il faut des mots d'un seul tenant de 3 à 9 lettres). Élargis le thème ou le filtre.
      </p>
    );
  }
  if (!grid) return <p className="eyebrow-free">Construction de la grille…</p>;

  const size = grid.cols <= 9 ? 38 : grid.cols <= 11 ? 32 : 28;
  const here = entryIdx.get(`${sel[0]},${sel[1]}`) ?? [];
  const curIdx = here.find((i) => grid.entries[i].dir === dir) ?? here[0];
  const cur: CwEntry | undefined = curIdx !== undefined ? grid.entries[curIdx] : undefined;

  const clueOf = (e: CwEntry) => {
    const w = byId.get(e.id) as VocabularyWordWithMastery | undefined;
    if (!w) return { text: '', img: null as string | null };
    if (clueType === 'image' && w.image) return { text: '', img: w.image };
    if (clueType === 'definition' && defs[e.id]) return { text: defs[e.id], img: null };
    return { text: w.translation_fr, img: null }; // repli sur la traduction
  };
  const fallbackCount = grid.entries.filter((e) => {
    const w = byId.get(e.id);
    return clueType === 'image' ? !w?.image : clueType === 'definition' ? !defs[e.id] : false;
  }).length;
  const toPrepare = clueType === 'definition' ? grid.entries.filter((e) => !tried.has(e.id)) : [];

  function focusInput() {
    inputRef.current?.focus();
  }
  function selectEntry(i: number) {
    const e = grid!.entries[i];
    const empty = cwCells(e).find(([r, c]) => !letters[r][c]);
    setSel(empty ?? [e.r, e.c]);
    setDir(e.dir);
    focusInput();
  }
  function clickCell(r: number, c: number) {
    const idx = entryIdx.get(`${r},${c}`);
    if (!idx) return;
    if (sel[0] === r && sel[1] === c && idx.length > 1) setDir(dir === 'A' ? 'D' : 'A'); // second clic : changement de sens
    else {
      setSel([r, c]);
      if (!idx.some((i) => grid!.entries[i].dir === dir)) setDir(grid!.entries[idx[0]].dir);
    }
    focusInput();
  }
  function step(delta: 1 | -1): [number, number] {
    const [r, c] = sel;
    const nr = dir === 'A' ? r : r + delta, nc = dir === 'A' ? c + delta : c;
    return grid!.cells[nr]?.[nc] ? [nr, nc] : sel;
  }
  function typeLetter(ch: string) {
    const l = normLetters(ch).slice(0, 1);
    if (!l || !grid!.cells[sel[0]][sel[1]]) return;
    setLetters((prev) => prev.map((row, r) => row.map((v, c) => (r === sel[0] && c === sel[1] ? l : v))));
    setStatus((prev) => prev.map((row, r) => row.map((v, c) => (r === sel[0] && c === sel[1] ? null : v))));
    setSel(step(1));
  }
  function backspace() {
    const [r, c] = sel;
    if (letters[r][c]) {
      setLetters((prev) => prev.map((row, rr) => row.map((v, cc) => (rr === r && cc === c ? '' : v))));
    } else {
      const p = step(-1);
      setSel(p);
      setLetters((prev) => prev.map((row, rr) => row.map((v, cc) => (rr === p[0] && cc === p[1] ? '' : v))));
    }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    else if (e.key === 'Enter') { e.preventDefault(); verify(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const [dr, dc] = e.key === 'ArrowRight' ? [0, 1] : e.key === 'ArrowLeft' ? [0, -1] : e.key === 'ArrowDown' ? [1, 0] : [-1, 0];
      const nr = sel[0] + dr, nc = sel[1] + dc;
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
    if (v) typeLetter(v.slice(-1)); // claviers mobiles : pas d'événement de touche exploitable
  }

  function verify() {
    const g = grid!;
    const next: Status[][] = status.map((row) => row.map(() => null));
    let allOk = true;
    const rec = new Set(recorded);
    for (const e of g.entries) {
      let typed = 0, correct = 0;
      for (const [r, c] of cwCells(e)) {
        const v = letters[r][c];
        if (v) {
          typed++;
          if (v === g.cells[r][c]) { correct++; next[r][c] = 'right'; } else next[r][c] = 'wrong';
        }
      }
      const ok = correct === e.len;
      if (!ok) allOk = false;
      // La maîtrise n'est mise à jour qu'une fois par mot et par grille, et seulement pour les mots essayés
      if (typed > 0 && !rec.has(e.id)) {
        rec.add(e.id);
        record(e.id, ok);
      }
    }
    setStatus(next);
    setRecorded(rec);
    setMessage(allOk ? { text: 'Bravo, la grille est complète et juste !', ok: true } : { text: 'Les lettres en rouge barré sont fausses, les vertes sont justes.', ok: false });
  }
  function solution() {
    const g = grid!;
    setLetters(g.cells.map((row) => row.map((ch) => ch ?? '')));
    setStatus(g.cells.map((row) => row.map((ch) => (ch ? 'given' : null))));
    setMessage({ text: 'Solution affichée (la maîtrise des mots non essayés n\'est pas modifiée).', ok: false });
  }

  async function prepareDefinitions() {
    const n = toPrepare.length;
    const eur = Math.max(0.01, Math.ceil(n * EUR_PER_DEFINITION * 100) / 100);
    if (!window.confirm(`Préparer ${n} définition${n > 1 ? 's' : ''} (Wikipédia, puis traduction par Gemini) ?\nCoût estimé : environ ${eur.toFixed(2).replace('.', ',')} € (payé une seule fois : les définitions sont conservées).`)) return;
    setDefBusy(true);
    setDefError('');
    const r = await generateWordDefinitions(toPrepare.map((e) => e.id), lang);
    if (!r.ok) setDefError((r as { error: string }).error);
    else {
      const g = await getWordDefinitions(grid!.entries.map((e) => e.id));
      if (g.ok) {
        setDefs((d) => ({ ...d, ...g.defs }));
        setTried((t) => new Set([...Array.from(t), ...g.tried]));
      }
    }
    setDefBusy(false);
  }

  const bgOf = (r: number, c: number) => {
    const idx = entryIdx.get(`${r},${c}`) ?? [];
    if (idx.length === 1) return pastel(idx[0]);
    if (idx.length > 1) return `linear-gradient(135deg, ${pastel(idx[0])} 50%, ${pastel(idx[1])} 50%)`;
    return 'transparent';
  };
  const entryDone = (e: CwEntry) => cwCells(e).every(([r, c]) => status[r]?.[c] === 'right' || status[r]?.[c] === 'given');

  const clueList = (d: 'A' | 'D') => (
    <div>
      <h4>{d === 'A' ? 'Horizontalement' : 'Verticalement'}</h4>
      {grid.entries.map((e, i) => {
        if (e.dir !== d) return null;
        const cl = clueOf(e);
        return (
          <button
            key={`${e.id}-${d}`}
            className={`cw-clue${i === curIdx ? ' active' : ''}${entryDone(e) ? ' done' : ''}`}
            style={{ ['--clue-color' as string]: pastel(i) }}
            onClick={() => selectEntry(i)}
          >
            <b>{e.number}</b>
            {cl.img && <img src={imageUrl(cl.img)} alt="" />}
            <span>{cl.text || (cl.img ? '' : '—')}</span>
            <span className="wg-note">({e.len})</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="wg-filters">
        <label>
          Type d'indice
          <select value={clueType} onChange={(e) => setClueType(e.target.value as ClueType)}>
            <option value="translation">Traduction (français)</option>
            <option value="definition">Définition (Wikipédia, dans la langue apprise)</option>
            <option value="image">Image</option>
          </select>
        </label>
      </div>
      {clueType !== 'translation' && fallbackCount > 0 && (
        <p className="wg-note">
          {fallbackCount} mot{fallbackCount > 1 ? 's' : ''} sur {grid.entries.length} sans {clueType === 'image' ? 'image' : 'définition'} : indice « traduction » à la place.
        </p>
      )}
      {clueType === 'definition' && toPrepare.length > 0 && (
        <p className="wg-note">
          <button className="secondary" disabled={defBusy} onClick={prepareDefinitions}>
            {defBusy ? 'Préparation…' : `Préparer ${toPrepare.length} définition${toPrepare.length > 1 ? 's' : ''} (≈ ${Math.max(0.01, Math.ceil(toPrepare.length * EUR_PER_DEFINITION * 100) / 100).toFixed(2).replace('.', ',')} €)`}
          </button>
        </p>
      )}
      {defError && <p className="wg-msg">{defError}</p>}

      <input ref={inputRef} className="cw-hidden-input" type="text" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label="Saisie des lettres" onKeyDown={onKeyDown} onInput={onInput} />

      <div className="wg-scroll">
        <div className="cw-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, var(--cw-size))`, ['--cw-size' as string]: `${size}px` }}>
          {grid.cells.map((row, r) =>
            row.map((ch, c) => {
              if (!ch) return <div key={`${r}-${c}`} className="cw-cell empty" />;
              const num = grid.entries.find((e) => e.r === r && e.c === c)?.number;
              const st = status[r]?.[c];
              const inCur = cur ? cwCells(cur).some(([rr, cc]) => rr === r && cc === c) : false;
              return (
                <div key={`${r}-${c}`} className="cw-cell">
                  <button
                    className={`${sel[0] === r && sel[1] === c ? 'sel ' : ''}${inCur ? 'cur ' : ''}${st ?? ''}`}
                    style={{ background: bgOf(r, c) }}
                    onClick={() => clickCell(r, c)}
                    aria-label={num ? `Case ${num}` : 'Case'}
                  >
                    {letters[r]?.[c]}
                  </button>
                  {num && <span className="cw-num">{num}</span>}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="wg-bar">
        <button className="primary" onClick={verify}>Vérifier</button>
        <button className="secondary" onClick={solution}>Voir la solution</button>
        <button className="secondary" onClick={newGrid}>Nouvelle grille</button>
      </div>
      {message && <p className={`wg-msg${message.ok ? ' ok' : ''}`}>{message.text}</p>}
      <p className="wg-note">Touche une case puis tape les lettres (accents inutiles). Touche la même case une 2ᵉ fois pour changer de sens.</p>

      <div className="cw-clues">
        {clueList('A')}
        {clueList('D')}
      </div>
    </div>
  );
}
