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
  const phrase = phrases[index];

  // On marque la phrase comme vue par ce profil dès qu'elle s'affiche —
  // c'est ce qui alimente le vocabulaire appris et fait avancer la file de
  // "Phrases du jour".
  useEffect(() => {
    if (phrase) markPhraseSeen(profileId, phrase.id);
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
