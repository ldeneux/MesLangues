'use client';

import { useEffect, useState } from 'react';
import type { Phrase } from '../../lib/data';
import { markPhraseSeen } from '../../lib/data';
import { getJapaneseReadings, type JaReading } from '../../lib/japaneseReadings';
import JapaneseRuby from './JapaneseRuby';

// Petit réglage mémorisé dans le navigateur (furigana / rōmaji)
function usePersistentFlag(key: string): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      setValue(localStorage.getItem(key) === '1');
    } catch {
      /* stockage indisponible : on garde la valeur par défaut */
    }
  }, [key]);
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* ignoré */
    }
  };
  return [value, set];
}

export default function PhraseDeck({
  phrases,
  profileId,
  startIndex = 0,
  languageCode,
}: {
  phrases: Phrase[];
  profileId: string;
  startIndex?: number;
  languageCode?: string;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, phrases.length - 1));
  const [revealed, setRevealed] = useState(false);
  const [revealedFr, setRevealedFr] = useState(false);
  const phrase = phrases[index];

  const isJa = languageCode === 'ja';
  const [furigana, setFurigana] = usePersistentFlag('ja-furigana');
  const [romaji, setRomaji] = usePersistentFlag('ja-romaji');
  const [readings, setReadings] = useState<Record<string, JaReading>>({});
  const [readingError, setReadingError] = useState('');

  // On marque la phrase comme vue par ce profil dès qu'elle s'affiche, et on
  // réinitialise les révélations texte/traduction pour la nouvelle phrase.
  useEffect(() => {
    if (phrase) markPhraseSeen(profileId, phrase.id);
    setRevealed(false);
    setRevealedFr(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase?.id]);

  // Japonais : lectures de la phrase courante + des 3 suivantes (cache en base, Gemini seulement si manquantes)
  useEffect(() => {
    if (!isJa || !(furigana || romaji)) return;
    const upcoming = phrases
      .slice(index, index + 4)
      .map((p) => p.target_text)
      .filter((t) => !readings[t]);
    if (upcoming.length === 0) return;
    let cancelled = false;
    setReadingError('');
    getJapaneseReadings(upcoming)
      .then((r) => {
        if (!cancelled) setReadings((prev) => ({ ...prev, ...r }));
      })
      .catch((e: any) => {
        if (!cancelled) setReadingError(e?.message ?? 'Lectures indisponibles.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, furigana, romaji, isJa]);

  if (!phrase) return null;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(phrases.length - 1, i + 1));
  const reading = isJa ? readings[phrase.target_text] : undefined;

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
          <>
            <div className="phrase-target" lang={isJa ? 'ja' : undefined}>
              {isJa && furigana && reading ? <JapaneseRuby ruby={reading.ruby} /> : phrase.target_text}
            </div>
            {isJa && romaji && reading?.romaji && <div className="phrase-notes">{reading.romaji}</div>}
          </>
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
          {isJa && (
            <>
              <button className={`conv-mini-btn${furigana ? ' active' : ''}`} onClick={() => setFurigana(!furigana)}>
                Furigana : {furigana ? 'oui' : 'non'}
              </button>
              <button className={`conv-mini-btn${romaji ? ' active' : ''}`} onClick={() => setRomaji(!romaji)}>
                Rōmaji : {romaji ? 'oui' : 'non'}
              </button>
            </>
          )}
        </div>
        {isJa && (furigana || romaji) && revealed && !reading && !readingError && <p className="eyebrow-free">Chargement des lectures…</p>}
        {readingError && <p className="conv-warning">{readingError}</p>}
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
