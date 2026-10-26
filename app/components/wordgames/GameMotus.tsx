'use client';

import './wordgames.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { chars, motusMarks, type LetterEntry, type MotusMark } from '../../../lib/letterGamesLogic';
import { normLetters } from '../../../lib/wordGamesLogic';
import { useLetterDictionary } from './useLetterDictionary';

const TRIES = 6;
const KB_LATIN = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'];

/**
 * Motus : trouve le mot en 6 essais. La première lettre est donnée ; après chaque essai, les lettres bien placées sont en rouge,
 * les lettres mal placées en jaune (rond), les autres restent bleues. Chaque proposition doit être un mot de ta base.
 */
export default function GameMotus({ lang }: { profileId: string; lang: LangCode; level: LevelCode }) {
  const { entries, byAnswer, error } = useLetterDictionary(lang);
  const isJa = lang === 'ja';

  // Longueurs proposées : celles qui ont assez de mots dans la base
  const lengths = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of entries ?? []) {
      const l = chars(e.answer).length;
      m.set(l, (m.get(l) ?? 0) + 1);
    }
    const [lo, hi] = isJa ? [2, 6] : [5, 9];
    return Array.from(m.entries())
      .filter(([l, n]) => l >= lo && l <= hi && n >= 15)
      .map(([l]) => l)
      .sort((a, b) => a - b);
  }, [entries, isJa]);

  const [len, setLen] = useState<number | null>(null);
  const [secret, setSecret] = useState<LetterEntry | null>(null);
  const [typed, setTyped] = useState<string[]>([]); // lettres tapées pour la ligne en cours (la 1re est donnée)
  const [rows, setRows] = useState<{ letters: string[]; marks: MotusMark[] }[]>([]);
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [state, setState] = useState<'play' | 'won' | 'lost'>('play');
  const [stats, setStats] = useState({ played: 0, won: 0, streak: 0 });

  const newWord = useCallback(
    (n: number) => {
      const list = (entries ?? []).filter((e) => chars(e.answer).length === n);
      if (list.length === 0) return;
      const w = list[Math.floor(Math.random() * list.length)];
      setSecret(w);
      setTyped([chars(w.answer)[0]]);
      setRows([]);
      setMsg('');
      setState('play');
    },
    [entries]
  );

  useEffect(() => {
    if (len === null && lengths.length > 0) setLen(lengths.includes(6) ? 6 : lengths[lengths.length - 1]);
  }, [lengths, len]);
  useEffect(() => {
    if (len !== null && entries) newWord(len);
  }, [len, entries, newWord]);

  const first = secret ? chars(secret.answer)[0] : '';
  const n = len ?? 0;

  function addLetter(ch: string) {
    if (state !== 'play') return;
    setMsg('');
    setTyped((t) => (t.length < n ? [...t, ch] : t));
  }
  function backspace() {
    if (state !== 'play') return;
    setTyped((t) => (t.length > 1 ? t.slice(0, -1) : t)); // la première lettre est donnée : on ne l'efface pas
  }

  function submit() {
    if (state !== 'play' || !secret) return;
    if (typed.length < n) return setMsg(`Il faut ${n} lettres.`);
    const guess = typed.join('');
    if (!byAnswer.has(guess)) {
      setMsg(`« ${guess.toUpperCase()} » n'est pas dans la base de mots.`);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    const marks = motusMarks(guess, secret.answer);
    const nextRows = [...rows, { letters: typed, marks }];
    setRows(nextRows);
    setTyped([first]);
    setMsg('');
    if (guess === secret.answer) {
      setState('won');
      setStats((s) => ({ played: s.played + 1, won: s.won + 1, streak: s.streak + 1 }));
    } else if (nextRows.length >= TRIES) {
      setState('lost');
      setStats((s) => ({ played: s.played + 1, won: s.won, streak: 0 }));
    }
  }

  // Clavier physique (langues latines)
  useEffect(() => {
    if (isJa || state !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key.length === 1) {
        const ch = normLetters(e.key);
        if (ch) addLetter(ch);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, rows, state, secret, isJa]);

  // État de chaque lettre pour colorer le clavier : la meilleure information obtenue
  const keyState = useMemo(() => {
    const rank: Record<MotusMark, number> = { absent: 1, present: 2, good: 3 };
    const m = new Map<string, MotusMark>();
    for (const r of rows) r.letters.forEach((ch, i) => {
      const cur = m.get(ch);
      if (!cur || rank[r.marks[i]] > rank[cur]) m.set(ch, r.marks[i]);
    });
    return m;
  }, [rows]);

  const kbRows = useMemo(() => {
    if (!isJa) return KB_LATIN;
    const set = new Set<string>();
    for (const e of entries ?? []) for (const c of chars(e.answer)) set.add(c);
    const all = Array.from(set).sort();
    const out: string[] = [];
    for (let i = 0; i < all.length; i += 10) out.push(all.slice(i, i + 10).join(''));
    return out;
  }, [isJa, entries]);

  if (error) return <p className="conv-warning">{error}</p>;
  if (!entries) return <p className="eyebrow-free">Chargement du dictionnaire…</p>;
  if (lengths.length === 0) {
    return <p className="eyebrow-free">Pas assez de mots dans la base pour jouer au Motus (il faut au moins 15 mots d'une même longueur). Télécharge ou active plus de packs de vocabulaire.</p>;
  }
  if (!secret || len === null) return <p className="eyebrow-free">Chargement…</p>;

  // Lettres bien placées trouvées jusqu'ici : affichées en filigrane sur la ligne en cours (comme à la télévision)
  const known: string[] = chars(secret.answer).map((ch, i) => (i === 0 || rows.some((r) => r.marks[i] === 'good') ? ch : ''));

  return (
    <div>
      <div className="wg-filters">
        <label>
          Longueur du mot
          <select value={len} onChange={(e) => setLen(Number(e.target.value))}>
            {lengths.map((l) => (
              <option key={l} value={l}>
                {l} lettres
              </option>
            ))}
          </select>
        </label>
        <span className="wg-note">
          Parties : {stats.played} · gagnées : {stats.won} · série : {stats.streak}
        </span>
      </div>
      <p className="wg-note">
        Trouve le mot en {TRIES} essais. La première lettre est donnée. <span style={{ color: '#d2362f', fontWeight: 700 }}>Rouge</span> : bien placée ·{' '}
        <span style={{ color: '#b58900', fontWeight: 700 }}>jaune</span> : dans le mot mais ailleurs.
      </p>

      <div className="mt-board">
        {Array.from({ length: TRIES }, (_, ri) => {
          const done = rows[ri];
          const isCurrent = ri === rows.length && state === 'play';
          return (
            <div key={ri} className={`mt-row${isCurrent && shake ? ' shake' : ''}`}>
              {Array.from({ length: n }, (_, ci) => {
                let letter = '';
                let cls = '';
                if (done) {
                  letter = done.letters[ci];
                  cls = done.marks[ci];
                } else if (isCurrent) {
                  if (typed[ci]) letter = typed[ci];
                  else if (known[ci]) {
                    letter = known[ci];
                    cls = 'hint';
                  }
                  if (ci === typed.length) cls += ' cursor';
                } else if (ri > rows.length && ci === 0) {
                  letter = first;
                  cls = 'hint';
                }
                return (
                  <div key={ci} className={`mt-cell ${cls}`}>
                    <span>{letter}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {msg && <p className="wg-msg">{msg}</p>}

      {state === 'play' && (
        <div className="mt-kb">
          {kbRows.map((row, i) => (
            <div key={i} className="mt-kb-row">
              {chars(row).map((ch) => (
                <button key={ch} className={`mt-key ${keyState.get(ch) ?? ''}`} onClick={() => addLetter(ch)}>
                  {ch}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-kb-row">
            <button className="mt-key wide" onClick={backspace}>
              ⌫
            </button>
            <button className="mt-key wide" onClick={submit}>
              Valider
            </button>
          </div>
        </div>
      )}

      {state !== 'play' && (
        <div className={`conv-correction${state === 'won' ? ' exercise-success' : ''}`} style={{ marginTop: '0.75rem' }}>
          <div className="conv-correction-label">{state === 'won' ? `🎉 Trouvé en ${rows.length} essai${rows.length > 1 ? 's' : ''} !` : '❌ Perdu'}</div>
          <div className="conv-correction-text">
            Le mot était <strong>{secret.display}</strong>
            {secret.display.toLowerCase() !== secret.answer ? ` (${secret.answer.toUpperCase()})` : ''} = {secret.fr}
          </div>
          <button className="primary" style={{ marginTop: '0.75rem' }} onClick={() => newWord(len)}>
            Mot suivant
          </button>
        </div>
      )}
      {state === 'play' && (
        <div className="wg-bar">
          <button className="secondary" onClick={() => { setState('lost'); setStats((s) => ({ played: s.played + 1, won: s.won, streak: 0 })); }}>
            Abandonner (voir le mot)
          </button>
        </div>
      )}
    </div>
  );
}
