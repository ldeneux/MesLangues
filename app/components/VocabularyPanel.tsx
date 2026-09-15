'use client';

import { useEffect, useState } from 'react';
import { getVocabulary, type VocabularyEntry } from '../../lib/data';
import { THEMES } from '../../lib/constants';

export default function VocabularyPanel({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
}) {
  const [entries, setEntries] = useState<VocabularyEntry[] | null>(null);
  const [themeFilter, setThemeFilter] = useState<string>('all');

  useEffect(() => {
    setEntries(null);
    getVocabulary(profileId, languageCode, levelCode).then(setEntries);
  }, [profileId, languageCode, levelCode]);

  if (entries === null) return <p className="eyebrow-free">Chargement du vocabulaire…</p>;

  if (entries.length === 0) {
    return (
      <p className="eyebrow-free">
        Aucune phrase vue pour l'instant à ce niveau — elles apparaîtront ici au fur et à mesure des séances de
        "Phrases du jour".
      </p>
    );
  }

  const filtered = themeFilter === 'all' ? entries : entries.filter((e) => e.theme_code === themeFilter);
  const usedThemeCodes = new Set(entries.map((e) => e.theme_code).filter(Boolean));
  const availableThemes = THEMES.filter((t) => usedThemeCodes.has(t.code));

  return (
    <div>
      <p className="eyebrow-free">{entries.length} phrases vues à ce niveau.</p>

      <div className="date-chips">
        <button className={`date-chip${themeFilter === 'all' ? ' active' : ''}`} onClick={() => setThemeFilter('all')}>
          Tous les thèmes
        </button>
        {availableThemes.map((t) => (
          <button
            key={t.code}
            className={`date-chip${themeFilter === t.code ? ' active' : ''}`}
            onClick={() => setThemeFilter(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="revision-grid">
        {filtered.map((e) => (
          <div key={e.id} className="revision-card">
            <div className="revision-card-text">
              <div className="revision-target">{e.target_text}</div>
              <div className="revision-fr">{e.translation_fr}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
