'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LANGS, LEVELS } from '../../lib/constants';
import { suggestFrenchWords, lookupFrenchWord, addWordToVocabulary, type DictionaryResult, type AddWordResult } from '../../lib/dictionary';
import FlagIcon from './FlagIcon';
import WordTranslations from './WordTranslations';

/**
 * Recherche d'un mot : on tape en français, les 5 langues se remplissent à la sortie de la saisie.
 *  - dès qu'on tape, les cellules des autres langues sont vidées et la saisie est complétée automatiquement
 *    (la partie proposée est sélectionnée : Retour arrière ou une autre touche la remplace) ;
 *  - en quittant la saisie (Tab, clic ailleurs, Entrée) : traduction + image du mot à gauche des traductions.
 */
export default function SearchModal({ onClose, defaultLevel = 'A1' }: { onClose: () => void; defaultLevel?: string }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addLevel, setAddLevel] = useState(defaultLevel);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<AddWordResult | null>(null);

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
    setAdded(null);
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
    setAdded(null);
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

  async function handleAdd() {
    if (!result) return;
    setAdding(true);
    setError('');
    try {
      setAdded(await addWordToVocabulary(result, effectiveLevel));
    } catch (e: any) {
      setError(e?.message ?? "Ajout impossible.");
    } finally {
      setAdding(false);
    }
  }

  function pick(s: string) {
    setText(s);
    typedRef.current = s;
    runLookup(s);
  }

  // État du mot par rapport au vocabulaire : inconnu / connu en partie (à compléter) / complet
  const langLabel = (c: string) => LANGS.find((l) => l.code === c)?.label ?? c;
  const known = !!result && result.level !== null;
  const missingCodes = result ? LANGS.map((l) => l.code as string).filter((c) => result.entries[c]?.source !== 'base') : [];
  const complete = known && missingCodes.length === 0;
  const effectiveLevel = known ? result!.level! : addLevel; // un mot connu garde son niveau (le plus bas où il existe)

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

        <WordTranslations result={result} loading={loading} />

        {result && !loading && Object.values(result.entries).some(Boolean) && (
          <div className="search-add">
            {added ? (
              <p className="search-add-done">
                ✅ {added.added.length > 0 ? `Ajouté au niveau ${effectiveLevel} : ${added.added.map(langLabel).join(', ')}` : 'Rien de nouveau à ajouter'}
                {added.skipped.filter((x) => x.reason !== 'déjà dans le vocabulaire').length > 0 && (
                  <span className="eyebrow-free" style={{ display: 'block', margin: '0.25rem 0 0' }}>
                    Non ajouté :{' '}
                    {added.skipped
                      .filter((x) => x.reason !== 'déjà dans le vocabulaire')
                      .map((x) => `${langLabel(x.code)} (${x.reason})`)
                      .join(', ')}
                  </span>
                )}
                {added.audioFailed.length > 0 && (
                  <span className="eyebrow-free" style={{ display: 'block', margin: '0.25rem 0 0' }}>
                    Audio manquant ({added.audioFailed.map(langLabel).join(', ')}) : à compléter depuis l'onglet Packs.
                  </span>
                )}
              </p>
            ) : complete ? (
              <p className="search-add-done">✔ Déjà dans ton vocabulaire dans les 5 langues (niveau {result.level}).</p>
            ) : known ? (
              <>
                <span className="search-add-label">
                  Dans ton vocabulaire au niveau {result.level} — il manque : {missingCodes.map(langLabel).join(', ')}
                </span>
                <button className="primary" onClick={handleAdd} disabled={adding}>
                  {adding ? 'Mise à jour…' : `🔄 Mettre à jour (${missingCodes.length} langue${missingCodes.length > 1 ? 's' : ''})`}
                </button>
              </>
            ) : (
              <>
                <label className="search-add-label">
                  Mot absent de ton vocabulaire. Ajouter aux 5 langues, niveau
                  <select className="cascade-select" value={addLevel} onChange={(e) => setAddLevel(e.target.value)} disabled={adding}>
                    {LEVELS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label} — {l.subtitle}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" onClick={handleAdd} disabled={adding}>
                  {adding ? 'Ajout en cours…' : '➕ Ajouter au vocabulaire'}
                </button>
              </>
            )}
          </div>
        )}

        <p className="eyebrow-free" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Tape un mot, puis quitte la saisie (Tab ou Entrée) pour voir les traductions. Les mots déjà dans ton vocabulaire viennent de la base ; les autres sont
          traduits à la demande (étiquette « IA ») ; ils ne sont enregistrés que si tu cliques sur « Ajouter au vocabulaire ».
        </p>
      </div>
    </div>
  );
}
