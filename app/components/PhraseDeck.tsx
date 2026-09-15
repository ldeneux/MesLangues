'use client';

import { useEffect, useState } from 'react';
import type { Phrase } from '../../lib/data';
import { markPhraseSeen } from '../../lib/data';

export default function PhraseDeck({
  phrases,
  profileId,
  startIndex = 0,
}: {
  phrases: Phrase[];
  profileId: string;
  startIndex?: number;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, phrases.length - 1));
  const [revealed, setRevealed] = useState(false);
  const [revealedFr, setRevealedFr] = useState(false);
  const phrase = phrases[index];

  // On marque la phrase comme vue par ce profil dès qu'elle s'affiche, et on
  // réinitialise les révélations texte/traduction pour la nouvelle phrase.
  useEffect(() => {
    if (phrase) markPhraseSeen(profileId, phrase.id);
    setRevealed(false);
    setRevealedFr(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  if (!phrase) return null;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(phrases.length - 1, i + 1));

  return (
    <div>
      <div className="deck-progress">
        {index + 1} / {phrases.length}
      </div>

      <div className="phrase-card phrase-card-big" key={phrase.id}>
        {phrase.audio_url ? (
          <audio className="phrase-audio" controls src={phrase.audio_url} />
        ) : (
          <div className="phrase-notes">Audio en cours de génération, réessaie dans une minute.</div>
        )}

        {revealed ? (
          <div className="phrase-target">{phrase.target_text}</div>
        ) : (
          <div className="conv-hidden-text">🔊 (écoute l'audio)</div>
        )}

        {revealedFr && (
          <>
            <div className="phrase-fr">{phrase.translation_fr}</div>
            {phrase.notes && <div className="phrase-notes">{phrase.notes}</div>}
          </>
        )}

        <div className="conv-bubble-actions">
          <button className="conv-mini-btn" onClick={() => setRevealed((r) => !r)}>
            {revealed ? 'Masquer le texte' : 'Afficher le texte'}
          </button>
          <button className="conv-mini-btn" onClick={() => setRevealedFr((r) => !r)}>
            {revealedFr ? 'Masquer la traduction' : 'Afficher la traduction'}
          </button>
        </div>
      </div>

      <div className="deck-nav">
        <button className="secondary" onClick={goPrev} disabled={index === 0}>
          ← Précédent
        </button>
        <button className="primary" onClick={goNext} disabled={index === phrases.length - 1}>
          Suivant →
        </button>
      </div>
    </div>
  );
}
