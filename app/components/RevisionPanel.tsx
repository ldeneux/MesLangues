'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Phrase, ReadyPack } from '../../lib/data';
import { getBrowsablePacks, getPhrasesByPack } from '../../lib/data';
import { THEMES } from '../../lib/constants';

export default function RevisionPanel({
  languageCode,
  levelCode,
}: {
  languageCode: string;
  levelCode: string;
}) {
  const [packs, setPacks] = useState<ReadyPack[] | null>(null);
  const [selectedPack, setSelectedPack] = useState<ReadyPack | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setPacks(null);
    setSelectedPack(null);
    setPhrases([]);
    getBrowsablePacks(languageCode, levelCode).then((res) => {
      setPacks(res);
      if (res[0]) selectPack(res[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  function selectPack(pack: ReadyPack) {
    setSelectedPack(pack);
    setPhrases([]);
    setThemeFilter('all');
    startTransition(() => {
      getPhrasesByPack(pack.id).then(setPhrases);
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

  if (packs === null) {
    return <p className="eyebrow-free">Chargement des révisions…</p>;
  }

  if (packs.length === 0) {
    return (
      <p className="eyebrow-free">
        Aucun pack prêt pour ce niveau pour l'instant — télécharge-en un depuis l'onglet "Packs".
      </p>
    );
  }

  const filteredPhrases =
    themeFilter === 'all' ? phrases : phrases.filter((p) => p.theme_code === themeFilter);
  const usedThemeCodes = new Set(phrases.map((p) => p.theme_code).filter(Boolean));
  const availableThemes = THEMES.filter((t) => usedThemeCodes.has(t.code));

  return (
    <div>
      <div className="date-chips">
        {packs.map((p) => (
          <button
            key={p.id}
            className={`date-chip${selectedPack?.id === p.id ? ' active' : ''}`}
            onClick={() => selectPack(p)}
          >
            Pack {p.pack_number}
          </button>
        ))}
      </div>

      {phrases.length > 0 && (
        <div className="cascade-row">
          <select className="cascade-select" value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
            <option value="all">Tous les thèmes</option>
            {availableThemes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} style={{ display: 'none' }} />

      {isPending && phrases.length === 0 ? (
        <p className="eyebrow-free">Chargement des phrases…</p>
      ) : (
        <div className="revision-grid">
          {filteredPhrases.map((p) => (
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
