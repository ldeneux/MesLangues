'use client';

// Conjugaison d'un verbe : personnes en lignes, temps en colonnes, 2 temps par tableau
// (présent / passé composé, puis futur / imparfait). Même affichage dans l'onglet Conjugaison et dans les leçons.
// Audio : un fichier par temps, lu à 80 % de la vitesse.

import { useRef, useState } from 'react';
import type { ConjugationVerb } from '../../lib/conjugation';
import { splitEnding } from '../../lib/conjugationHighlight';
import { PRONOUNS_FR, TENSE_LABELS, TENSE_TABLES, CONJUGATION_PLAYBACK_RATE, simplifyForm, type TenseKey } from '../../lib/conjugationDisplay';

export default function ConjugationTables({ verb, languageCode }: { verb: ConjugationVerb; languageCode: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  function play(url: string, key: string) {
    audioRef.current?.pause();
    if (playing === key) {
      setPlaying(null);
      return;
    }
    const el = new Audio(url);
    el.defaultPlaybackRate = CONJUGATION_PLAYBACK_RATE;
    el.playbackRate = CONJUGATION_PLAYBACK_RATE;
    audioRef.current = el;
    setPlaying(key);
    el.onended = () => setPlaying((k) => (k === key ? null : k));
    el.play().catch(() => setPlaying(null));
  }

  function cell(tense: TenseKey, i: number) {
    const raw = verb.tenses?.[tense]?.[i];
    if (!raw) return '';
    const form = simplifyForm(raw, languageCode);
    const split = splitEnding(form, languageCode, tense);
    return split ? (
      <>
        {split.stem}
        <mark className="highlight-mark">{split.ending}</mark>
      </>
    ) : (
      form
    );
  }

  return (
    <div className="conj-tables">
      {TENSE_TABLES.map(([a, b]) => (
        <div key={a} className="conj-table-wrap">
          <table className="conj-table">
            <thead>
              <tr>
                <th aria-label="Personne" />
                {[a, b].map((t) => {
                  const url = verb.tense_audio?.[t] ?? null;
                  const key = `${verb.id}-${t}`;
                  return (
                    <th key={t}>
                      <span className="conj-tense-name">{TENSE_LABELS[t]}</span>
                      <button
                        className={`play-btn${playing === key ? ' playing' : ''}`}
                        onClick={() => url && play(url, key)}
                        disabled={!url}
                        aria-label={`Écouter la conjugaison — ${TENSE_LABELS[t]}`}
                      >
                        {playing === key ? '❚❚' : '▶'}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {PRONOUNS_FR.map((p, i) => (
                <tr key={p}>
                  <th scope="row" className="conjugation-pronoun">
                    {p}
                  </th>
                  <td>{cell(a, i)}</td>
                  <td>{cell(b, i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
