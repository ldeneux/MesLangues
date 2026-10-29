'use client';

import { useEffect, useRef, useState } from 'react';
import { translateReadingSelection, type SelectionTranslation } from '../../lib/readingWordServer';
import { speak } from '../../lib/speech';

export type ReadingSelection = {
  text: string;
  paragraph: number;
  rect: { left: number; right: number; top: number; bottom: number };
};

// Traductions déjà demandées : une même sélection n'est jamais redemandée (session)
const cache = new Map<string, SelectionTranslation>();

/** Infobulle de traduction d'un mot sélectionné dans le texte (Coin lecture). */
export default function ReadingWordPopover({
  sel,
  languageCode,
  bcp47,
  paragraphText,
  paragraphFr,
  onClose,
}: {
  sel: ReadingSelection;
  languageCode: string;
  bcp47: string;
  paragraphText: string;
  paragraphFr: string;
  onClose: () => void;
}) {
  const [res, setRes] = useState<SelectionTranslation | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Même sélection dans le même paragraphe : même réponse (le sens dépend du contexte)
    const key = `${languageCode}|${sel.paragraph}|${sel.text.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit) {
      setRes(hit);
      return;
    }
    setRes(null);
    let alive = true;
    translateReadingSelection(languageCode, sel.text, paragraphText, paragraphFr)
      .then((r) => {
        if (r.ok) cache.set(key, r);
        if (alive) setRes(r);
      })
      .catch((e) => alive && setRes({ ok: false, error: e?.message ?? 'Traduction impossible.' }));
    return () => {
      alive = false;
    };
  }, [sel.text, sel.paragraph, languageCode, paragraphText, paragraphFr]);

  // Fermeture : clic ailleurs, Échap, défilement
  useEffect(() => {
    const down = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const scroll = () => onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('touchstart', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [onClose]);

  const W = 300;
  const centerX = (sel.rect.left + sel.rect.right) / 2;
  const left = Math.max(8, Math.min(centerX - W / 2, (typeof window !== 'undefined' ? window.innerWidth : 1000) - W - 8));
  const above = sel.rect.top > 150; // assez de place au-dessus : on place l'infobulle au-dessus du mot
  const style: React.CSSProperties = above
    ? { left, width: W, bottom: (typeof window !== 'undefined' ? window.innerHeight : 800) - sel.rect.top + 8 }
    : { left, width: W, top: sel.rect.bottom + 8 };

  return (
    <div ref={ref} className="reading-pop" style={style} role="tooltip" onMouseDown={(e) => e.preventDefault()}>
      <div className="reading-pop-head">
        <strong lang={languageCode}>{sel.text}</strong>
        <button className="reading-pop-btn" onClick={() => speak(sel.text, bcp47)} aria-label="Écouter">
          ▶
        </button>
        <button className="reading-pop-btn" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      {res === null ? (
        <div className="reading-pop-wait">Traduction…</div>
      ) : res.ok === false ? (
        <div className="reading-pop-wait">{res.error}</div>
      ) : (
        <>
          <div className="reading-pop-fr">= {res.fr}</div>
          {res.lemma && <div className="reading-pop-note">{res.lemma}</div>}
          {res.info && <div className="reading-pop-note">{res.info}</div>}
          <div className="reading-pop-src">
            {res.source === 'base' ? `Dans ton vocabulaire${res.level ? ` (${res.level})` : ''}` : 'Traduit en contexte (IA)'}
          </div>
        </>
      )}
    </div>
  );
}
