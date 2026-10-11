'use client';

import '../conversation-exam.css';
import { useLayoutEffect, useRef, useState } from 'react';
import JapaneseInput from './JapaneseInput';

// Caractères spéciaux par langue (l'anglais américain n'en a pas besoin)
const SPECIAL_CHARS: Record<string, string[]> = {
  es: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'],
  de: ['ä', 'ö', 'ü', 'ß'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
};
const NO_CASE = ['ß', '¿', '¡']; // pas de version majuscule utile

/**
 * Zone de saisie adaptée à la langue étudiée :
 * - japonais : rōmaji → kana + palette de kana (JapaneseInput) ;
 * - espagnol, allemand, italien : barre de touches pour les accents et caractères spéciaux
 *   (utile sur mobile ou avec un clavier français) ;
 * - anglais : zone de saisie simple.
 * Entrée envoie (si onEnter est fourni), Maj+Entrée = retour à la ligne.
 */
export default function LanguageInput({
  languageCode,
  value,
  onChange,
  rows = 6,
  placeholder,
  disabled = false,
  onEnter,
  compact = false,
}: {
  languageCode: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  onEnter?: (finalValue: string) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  const [upper, setUpper] = useState(false);

  useLayoutEffect(() => {
    if (caretRef.current !== null && ref.current) {
      ref.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  if (languageCode === 'ja') {
    return (
      <JapaneseInput
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder ?? 'ここに書いてください… (écris ici, en rōmaji ou en kana)'}
        disabled={disabled}
        onEnter={onEnter}
        compact={compact}
      />
    );
  }

  const chars = SPECIAL_CHARS[languageCode] ?? [];

  function insert(ch: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    caretRef.current = start + ch.length;
    onChange(value.slice(0, start) + ch + value.slice(end));
    el?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!onEnter || e.key !== 'Enter' || e.shiftKey || (e.nativeEvent as any).isComposing) return;
    e.preventDefault();
    onEnter(value);
  }

  return (
    <div className="lang-input">
      <textarea
        ref={ref}
        className={compact ? 'conv-text-input conv-textarea' : 'writing-textarea'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Écris ta réponse ici…'}
        rows={rows}
        lang={languageCode}
        spellCheck={false}
        autoCorrect="off"
      />
      {chars.length > 0 && (
        <div className="char-bar" aria-label="Accents et caractères spéciaux">
          <button type="button" className={`conv-mini-btn${upper ? ' active' : ''}`} onClick={() => setUpper((u) => !u)} title="Majuscules">
            ⇧ Maj
          </button>
          {chars.map((c) => {
            const shown = upper && !NO_CASE.includes(c) ? c.toUpperCase() : c;
            return (
              <button key={c} type="button" className="char-key" disabled={disabled} onClick={() => insert(shown)}>
                {shown}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
