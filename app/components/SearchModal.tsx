'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LANGS } from '../../lib/constants';
import { suggestFrenchWords, lookupFrenchWord, type DictionaryResult, type DictionaryEntry } from '../../lib/dictionary';
import { imageUrl } from '../../lib/imageName';
import { speak } from '../../lib/speech';
import FlagIcon from './FlagIcon';
import JapaneseRuby from './JapaneseRuby';
import { stripRuby } from '../../lib/japanese';

/**
 * Recherche d'un mot : on tape en français, les 5 langues se remplissent à la sortie de la saisie.
 *  - dès qu'on tape, les cellules des autres langues sont vidées et la saisie est complétée automatiquement
 *    (la partie proposée est sélectionnée : Retour arrière ou une autre touche la remplace) ;
 *  - en quittant la saisie (Tab, clic ailleurs, Entrée) : traduction + image du mot à gauche des traductions.
 */
export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSel = useRef<[number, number] | null>(null); // sélection à rétablir après l'auto-complétion
  const typedRef = useRef(''); // dernière saisie réelle de l'utilisateur (sans la partie complétée)
  const deletingRef = useRef(false);
  const suggestSeq = useRef(0);
  const lookupSeq = useRef(0);
  const lastLookedUp = useRef('');
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Applique la sélection de la partie auto-complétée une fois le champ re-rendu.
  useLayoutEffect(() => {
    if (pendingSel.current && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(pendingSel.current[0], pendingSel.current[1]);
    }
    pendingSel.current = null;
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const inputType = (e.nativeEvent as InputEvent).inputType ?? '';
    deletingRef.current = inputType.startsWith('delete');
    typedRef.current = value;
    setText(value);
    // Nouvelle saisie : les cellules des autres langues sont vidées
    lookupSeq.current++;
    lastLookedUp.current = '';
    setResult(null);
    setLoading(false);
    setError('');

    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const q = value.trim();
    if (!q) {
      suggestSeq.current++;
      setSuggestions([]);
      return;
    }
    const seq = ++suggestSeq.current;
    suggestTimer.current = setTimeout(async () => {
      try {
        const list = await suggestFrenchWords(q);
        if (seq !== suggestSeq.current) return; // une saisie plus récente a pris le relais
        setSuggestions(list);
        // Auto-complétion en ligne : seulement si la saisie n'a pas bougé, qu'on n'est pas en train d'effacer
        // et que la meilleure proposition commence exactement par ce qui est tapé.
        const top = list.find((s) => s.toLowerCase().startsWith(value.toLowerCase()) && s.length > value.length);
        if (top && !deletingRef.current && inputRef.current && inputRef.current.value === value) {
          const completed = value + top.slice(value.length);
          pendingSel.current = [value.length, completed.length];
          setText(completed);
        }
      } catch {
        if (seq === suggestSeq.current) setSuggestions([]);
      }
    }, 140);
  }

  async function runLookup(raw: string) {
    const q = raw.trim();
    if (!q || q === lastLookedUp.current) return;
    lastLookedUp.current = q;
    const seq = ++lookupSeq.current;
    setLoading(true);
    setError('');
    setResult(null);
    setSuggestions([]);
    try {
      const r = await lookupFrenchWord(q);
      if (seq !== lookupSeq.current) return;
      setResult(r);
      lastLookedUp.current = r.french; // évite une 2e recherche à la prochaine sortie de saisie
      setText(r.french); // forme de la base (article compris)
    } catch (e: any) {
      if (seq !== lookupSeq.current) return;
      setError(e?.message ?? 'Recherche impossible.');
    } finally {
      if (seq === lookupSeq.current) setLoading(false);
    }
  }

  function pick(s: string) {
    setText(s);
    typedRef.current = s;
    runLookup(s);
  }

  function play(code: string, entry: DictionaryEntry, bcp47: string) {
    setPlayingKey(code);
    if (entry.audio_url) {
      const el = new Audio(entry.audio_url);
      el.onended = () => setPlayingKey(null);
      el.play().catch(() => setPlayingKey(null));
    } else {
      // Mot traduit à la demande : pas de fichier audio, on utilise la voix du navigateur
      speak(entry.ruby ? stripRuby(entry.ruby) : entry.text, bcp47);
      setTimeout(() => setPlayingKey(null), 900);
    }
  }

  return (
    <div className="scores-overlay" onClick={onClose}>
      <div className="scores-modal search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scores-header">
          <h2 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>Chercher un mot</h2>
          <button className="conv-mini-btn" onClick={onClose}>
            Fermer ✕
          </button>
        </div>

        <div className="search-input-row">
          <span className="search-flag">
            <FlagIcon code="fr" />
          </span>
          <div className="search-input-wrap">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Un mot en français…"
              value={text}
              onChange={handleChange}
              onBlur={() => runLookup(text)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runLookup(text);
                  inputRef.current?.blur();
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Mot en français"
            />
            {suggestions.length > 0 && !loading && !result && (
              <div className="search-suggest">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="search-suggest-item"
                    onMouseDown={(e) => e.preventDefault()} // garde le focus : sinon la sortie de saisie lancerait une recherche avant le clic
                    onClick={() => pick(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <p className="conv-warning">{error}</p>}

        <div className="search-body">
          <div className="search-image">
            {result?.image ? <img src={imageUrl(result.image)} alt={result.french} /> : <span className="search-image-empty">{loading ? '…' : ''}</span>}
          </div>

          <div className="search-rows">
            {LANGS.map((l) => {
              const entry = result?.entries[l.code] ?? null;
              return (
                <div key={l.code} className="search-row">
                  <span className="search-flag" title={l.label}>
                    <FlagIcon code={l.code} />
                  </span>
                  <div className={`search-cell${entry ? '' : ' empty'}`}>
                    {loading ? (
                      <span className="search-wait">Traduction…</span>
                    ) : entry ? (
                      <>
                        <span className="search-cell-text">
                          {l.code === 'ja' && entry.ruby ? <JapaneseRuby ruby={entry.ruby} /> : <span lang={l.code}>{entry.text}</span>}
                          {l.code === 'ja' && entry.romaji && <span className="search-romaji">{entry.romaji}</span>}
                        </span>
                        {entry.source === 'ia' && <span className="search-badge" title="Traduit à la demande : ce mot n'est pas dans ton vocabulaire">IA</span>}
                      </>
                    ) : null}
                  </div>
                  <button
                    className={`play-btn${playingKey === l.code ? ' playing' : ''}`}
                    onClick={() => entry && play(l.code, entry, l.bcp47)}
                    disabled={!entry}
                    aria-label={`Écouter en ${l.label.toLowerCase()}`}
                  >
                    {playingKey === l.code ? '❚❚' : '▶'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <p className="eyebrow-free" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Tape un mot, puis quitte la saisie (Tab ou Entrée) pour voir les traductions. Les mots déjà dans ton vocabulaire viennent de la base ; les autres sont
          traduits à la demande (étiquette « IA », rien n'est enregistré).
        </p>
      </div>
    </div>
  );
}
