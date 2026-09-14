'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Phrase, PhraseSetInfo } from '../../lib/data';
import { getAvailableDates, getPhrasesBySetId } from '../../lib/data';

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function RevisionPanel({
  languageCode,
  levelCode,
}: {
  languageCode: string;
  levelCode: string;
}) {
  const [dates, setDates] = useState<PhraseSetInfo[] | null>(null);
  const [selectedSet, setSelectedSet] = useState<PhraseSetInfo | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Recharge la liste des dates à chaque changement de langue/niveau,
  // et sélectionne automatiquement la plus récente.
  useEffect(() => {
    setDates(null);
    setSelectedSet(null);
    setPhrases([]);
    getAvailableDates(languageCode, levelCode).then((res) => {
      setDates(res);
      if (res[0]) selectSet(res[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  function selectSet(set: PhraseSetInfo) {
    setSelectedSet(set);
    setPhrases([]);
    startTransition(() => {
      getPhrasesBySetId(set.id).then(setPhrases);
    });
  }

  function play(phrase: Phrase) {
    if (!phrase.audio_url) return;
    setPlayingId(phrase.id);
    const el = audioRef.current;
    if (el) {
      el.src = phrase.audio_url;
      el.play().catch(() => {});
    }
  }

  if (dates === null) {
    return <p className="eyebrow-free">Chargement des révisions…</p>;
  }

  if (dates.length === 0) {
    return <p className="eyebrow-free">Aucun lot généré pour ce niveau pour l'instant.</p>;
  }

  return (
    <div>
      <div className="date-chips">
        {dates.map((d) => (
          <button
            key={d.id}
            className={`date-chip${selectedSet?.id === d.id ? ' active' : ''}`}
            onClick={() => selectSet(d)}
          >
            {formatDate(d.set_date)}
          </button>
        ))}
      </div>

      {selectedSet?.theme && <p className="eyebrow-free">Thème : {selectedSet.theme}</p>}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} style={{ display: 'none' }} />

      {isPending && phrases.length === 0 ? (
        <p className="eyebrow-free">Chargement des phrases…</p>
      ) : (
        <div className="revision-grid">
          {phrases.map((p) => (
            <div key={p.id} className="revision-card">
              <button
                className={`play-btn${playingId === p.id ? ' playing' : ''}`}
                onClick={() => play(p)}
                disabled={!p.audio_url}
                aria-label="Écouter"
              >
                {playingId === p.id ? '❚❚' : '▶'}
              </button>
              <div className="revision-card-text">
                <div className="revision-target">{p.target_text}</div>
                <div className="revision-fr">{p.translation_fr}</div>
                {p.notes && <div className="revision-notes">{p.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
