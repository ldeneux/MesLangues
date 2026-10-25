'use client';

import './wordgames.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LangCode, LevelCode } from '../../../lib/constants';
import { chars, makeLetters, wordsFrom } from '../../../lib/letterGamesLogic';
import { normLetters } from '../../../lib/wordGamesLogic';
import { useLetterDictionary } from './useLetterDictionary';

const ROUNDS = 5;
const LETTERS = 10;
const SECONDS = 60;

type Tile = { id: number; ch: string };

/**
 * Le mot le plus long : 10 lettres, 60 secondes, on forme le mot le plus long possible. Seuls les mots de ta base (tous niveaux
 * de la langue) sont acceptés. Une solution existe toujours : les lettres sont tirées à partir d'un mot du dictionnaire.
 */
export default function GameMotPlusLong({ lang }: { profileId: string; lang: LangCode; level: LevelCode }) {
  const { entries, total, byAnswer, error } = useLetterDictionary(lang);
  const [round, setRound] = useState(0); // 0 = pas commencé
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [built, setBuilt] = useState<number[]>([]); // ids des tuiles du mot en cours, dans l'ordre
  const [found, setFound] = useState<string[]>([]); // mots valides trouvés (answer)
  const [msg, setMsg] = useState('');
  const [time, setTime] = useState(SECONDS);
  const [phase, setPhase] = useState<'play' | 'reveal'>('play');
  const [scores, setScores] = useState<{ got: number; max: number }[]>([]);
  const [best, setBest] = useState<ReturnType<typeof wordsFrom>>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const startRound = useCallback(
    (n: number) => {
      if (!entries) return;
      const letters = makeLetters(entries, LETTERS);
      setTiles(letters.map((ch, i) => ({ id: i, ch })));
      setBuilt([]);
      setFound([]);
      setMsg('');
      setTime(SECONDS);
      setPhase('play');
      setBest(wordsFrom(entries, letters));
      setRound(n);
    },
    [entries]
  );

  // Compte à rebours
  useEffect(() => {
    if (round === 0 || phase !== 'play') return;
    if (time <= 0) {
      finishRound();
      return;
    }
    const t = setTimeout(() => setTime((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, round, phase]);

  const current = built.map((id) => tiles.find((t) => t.id === id)!.ch).join('');
  const bestLen = best.length ? chars(best[0].answer).length : 0;
  const gotLen = found.reduce((m, w) => Math.max(m, chars(w).length), 0);

  function finishRound() {
    setScores((s) => [...s, { got: gotLen, max: bestLen }]);
    setPhase('reveal');
  }

  function addTile(id: number) {
    if (phase !== 'play' || built.includes(id)) return;
    setBuilt((b) => [...b, id]);
    setMsg('');
  }
  function backspace() {
    setBuilt((b) => b.slice(0, -1));
    setMsg('');
  }

  function submit() {
    if (phase !== 'play') return;
    const w = current;
    if (chars(w).length < 2) return setMsg('Un mot a au moins 2 lettres.');
    if (found.includes(w)) {
      setBuilt([]);
      return setMsg('Déjà trouvé.');
    }
    if (!byAnswer.has(w)) return setMsg(`« ${w.toUpperCase()} » n'est pas dans la base de mots.`);
    setFound((f) => [...f, w]);
    setBuilt([]);
    setMsg(`✅ ${w.toUpperCase()} : ${chars(w).length} lettres`);
  }

  // Clavier : lettres (langues latines), Retour arrière, Entrée
  useEffect(() => {
    if (round === 0 || phase !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (lang !== 'ja' && e.key.length === 1) {
        const ch = normLetters(e.key);
        if (!ch) return;
        const free = tiles.find((t) => t.ch === ch && !built.includes(t.id));
        if (free) addTile(free.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase, tiles, built, found, lang]);

  if (error) return <p className="conv-warning">{error}</p>;
  if (!entries) return <p className="eyebrow-free">Chargement du dictionnaire…</p>;
  if (entries.length < 30) {
    return <p className="eyebrow-free">Il faut au moins 30 mots jouables dans la langue ({entries.length} pour l'instant, sur {total} mots). Télécharge ou active plus de packs de vocabulaire.</p>;
  }

  if (round === 0) {
    return (
      <div className="lg-intro">
        <p className="eyebrow-free">
          {LETTERS} lettres, {SECONDS} secondes : forme le <strong>mot le plus long</strong> possible, {ROUNDS} manches. Seuls les mots de ta base sont acceptés (
          {entries.length} mots jouables dans cette langue, tous niveaux). {lang === 'ja' ? 'En japonais, les tuiles sont les kana de la lecture du mot.' : 'Tu peux cliquer sur les lettres ou taper au clavier ; les accents ne comptent pas.'}
        </p>
        <button className="primary" onClick={() => { setScores([]); startRound(1); }}>
          Commencer
        </button>
      </div>
    );
  }

  const gameOver = phase === 'reveal' && round >= ROUNDS;
  const totalGot = scores.reduce((s, x) => s + x.got, 0);
  const totalMax = scores.reduce((s, x) => s + x.max, 0);

  return (
    <div ref={wrapRef} className="lg-wrap">
      <div className="lg-top">
        <span className="eyebrow-free" style={{ margin: 0 }}>
          Manche {round} / {ROUNDS}
        </span>
        <span className={`lg-timer${time <= 10 && phase === 'play' ? ' low' : ''}`}>{phase === 'play' ? `${time} s` : 'Temps écoulé'}</span>
        <span className="eyebrow-free" style={{ margin: 0 }}>
          Score : {totalGot} lettres
        </span>
      </div>

      <div className="lg-tiles">
        {tiles.map((t) => (
          <button key={t.id} className={`lg-tile${built.includes(t.id) ? ' used' : ''}`} onClick={() => addTile(t.id)} disabled={phase !== 'play' || built.includes(t.id)}>
            {t.ch.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="lg-built">
        {built.length === 0 ? (
          <span className="lg-placeholder">Ton mot…</span>
        ) : (
          built.map((id) => {
            const t = tiles.find((x) => x.id === id)!;
            return (
              <button key={id} className="lg-tile built" onClick={() => setBuilt((b) => b.filter((x) => x !== id))} disabled={phase !== 'play'}>
                {t.ch.toUpperCase()}
              </button>
            );
          })
        )}
      </div>

      {phase === 'play' && (
        <div className="conv-bubble-actions" style={{ marginTop: '0.75rem' }}>
          <button className="primary" onClick={submit} disabled={built.length < 2}>
            Valider
          </button>
          <button className="conv-mini-btn" onClick={backspace} disabled={built.length === 0}>
            ⌫ Effacer
          </button>
          <button className="conv-mini-btn" onClick={() => setTiles((t) => [...t].sort(() => Math.random() - 0.5))}>
            Mélanger
          </button>
          <button className="conv-mini-btn" onClick={finishRound}>
            Terminer la manche
          </button>
        </div>
      )}
      {msg && <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>{msg}</p>}

      {found.length > 0 && (
        <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>
          Trouvés :{' '}
          {[...found]
            .sort((a, b) => chars(b).length - chars(a).length)
            .map((w) => `${w.toUpperCase()} (${chars(w).length})`)
            .join(' · ')}
        </p>
      )}

      {phase === 'reveal' && (
        <div className="conv-correction" style={{ marginTop: '1rem' }}>
          <div className="conv-correction-label">
            {gotLen === bestLen && bestLen > 0 ? '🎉 Le meilleur mot possible !' : `Ton meilleur mot : ${gotLen} lettres — le maximum était ${bestLen}`}
          </div>
          <div className="conv-correction-text">
            {best.slice(0, 5).map((e) => (
              <div key={e.answer}>
                <strong>{e.answer.toUpperCase()}</strong>
                {e.display.toLowerCase() !== e.answer || lang === 'ja' ? ` (${e.display})` : ''} — {e.fr}
              </div>
            ))}
          </div>
          {!gameOver ? (
            <button className="primary" style={{ marginTop: '0.75rem' }} onClick={() => startRound(round + 1)}>
              Manche suivante →
            </button>
          ) : (
            <>
              <p style={{ margin: '0.75rem 0 0' }}>
                Partie terminée : <strong>{totalGot}</strong> lettres sur un maximum de <strong>{totalMax}</strong>.
              </p>
              <button className="primary" style={{ marginTop: '0.5rem' }} onClick={() => { setScores([]); startRound(1); }}>
                Rejouer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
