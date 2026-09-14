'use client';

import { useState } from 'react';
import type { Phrase } from '../../lib/data';

export default function PhraseDeck({
  phrases,
  startIndex = 0,
}: {
  phrases: Phrase[];
  startIndex?: number;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, phrases.length - 1));
  const phrase = phrases[index];

  if (!phrase) return null;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(phrases.length - 1, i + 1));

  return (
    <div>
      <div className="deck-progress">
        {index + 1} / {phrases.length}
      </div>

      <div className="phrase-card phrase-card-big" key={phrase.id}>
        <div className="phrase-target">{phrase.target_text}</div>
        <div className="phrase-fr">{phrase.translation_fr}</div>
        {phrase.notes && <div className="phrase-notes">{phrase.notes}</div>}
        {phrase.audio_url ? (
          <audio className="phrase-audio" controls autoPlay src={phrase.audio_url} />
        ) : (
          <div className="phrase-notes">Audio en cours de génération, réessaie dans une minute.</div>
        )}
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
