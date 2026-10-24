'use client';

import { useState } from 'react';
import { LANGS } from '../../lib/constants';
import type { DictionaryResult, DictionaryEntry } from '../../lib/dictionary';
import { imageUrl } from '../../lib/imageName';
import { speak } from '../../lib/speech';
import { stripRuby } from '../../lib/japanese';
import FlagIcon from './FlagIcon';
import JapaneseRuby from './JapaneseRuby';

/**
 * Image du mot + ses traductions dans les 5 langues (avec ▶). Partagé par la fenêtre « Chercher un mot » et la fenêtre
 * de suppression d'un mot. `highlightCode` met une langue en évidence ; `loading` affiche l'attente.
 */
export default function WordTranslations({
  result,
  loading = false,
  waitLabel = 'Traduction…',
  highlightCode,
  highlightBadge,
  fallbackImage,
}: {
  result: DictionaryResult | null;
  loading?: boolean;
  waitLabel?: string;
  highlightCode?: string;
  highlightBadge?: string;
  fallbackImage?: string | null;
}) {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const image = result?.image ?? fallbackImage ?? null;

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
    <div className="search-body">
      <div className="search-image">
        {image ? <img src={imageUrl(image)} alt={result?.french ?? ''} /> : <span className="search-image-empty">{loading ? '…' : ''}</span>}
      </div>

      <div className="search-rows">
        {LANGS.map((l) => {
          const entry = result?.entries[l.code] ?? null;
          const highlighted = highlightCode === l.code;
          return (
            <div key={l.code} className="search-row">
              <span className="search-flag" title={l.label}>
                <FlagIcon code={l.code} />
              </span>
              <div className={`search-cell${entry ? '' : ' empty'}${highlighted ? ' highlight' : ''}`}>
                {loading ? (
                  <span className="search-wait">{waitLabel}</span>
                ) : entry ? (
                  <>
                    <span className="search-cell-text">
                      {l.code === 'ja' && entry.ruby ? <JapaneseRuby ruby={entry.ruby} /> : <span lang={l.code}>{entry.text}</span>}
                      {l.code === 'ja' && entry.romaji && <span className="search-romaji">{entry.romaji}</span>}
                    </span>
                    {entry.source === 'ia' && (
                      <span className="search-badge" title="Traduit à la demande : ce mot n'est pas dans ton vocabulaire">
                        IA
                      </span>
                    )}
                    {highlighted && highlightBadge && <span className="search-badge search-badge-danger">{highlightBadge}</span>}
                  </>
                ) : (
                  <span className="search-wait">—</span>
                )}
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
  );
}
