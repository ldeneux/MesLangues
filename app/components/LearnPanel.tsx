'use client';

import { useEffect, useState, useTransition } from 'react';
import { LANGS, LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import { getNextDailyPhrases, type Phrase } from '../../lib/data';
import PhraseDeck from './PhraseDeck';
import ExercisePanel from './ExercisePanel';
import ListeningPanel from './ListeningPanel';

type SubTab = 'audio' | 'exercise' | 'listening';

export default function LearnPanel({
  profileId,
  lang,
  level,
}: {
  profileId: string;
  lang: LangCode;
  level: LevelCode;
}) {
  const [subTab, setSubTab] = useState<SubTab>('audio');
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [hasReadyPacks, setHasReadyPacks] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPhrases([]);
    setHasReadyPacks(null);
    startTransition(() => {
      getNextDailyPhrases(profileId, lang, level).then(({ phrases, hasReadyPacks }) => {
        setPhrases(phrases);
        setHasReadyPacks(hasReadyPacks);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, level, profileId]);

  const bcp47 = LANGS.find((l) => l.code === lang)?.bcp47 ?? 'en-GB';

  return (
    <div>
      <div className="subtab-row">
        <button className={`subtab-btn${subTab === 'audio' ? ' active' : ''}`} onClick={() => setSubTab('audio')}>
          Audio seul
        </button>
        <button
          className={`subtab-btn${subTab === 'exercise' ? ' active' : ''}`}
          onClick={() => setSubTab('exercise')}
        >
          Exercice
        </button>
        <button
          className={`subtab-btn${subTab === 'listening' ? ' active' : ''}`}
          onClick={() => setSubTab('listening')}
        >
          Écoute
        </button>
      </div>

      {subTab === 'listening' ? (
        <ListeningPanel profileId={profileId} languageCode={lang} levelCode={level} />
      ) : (
        <>
          {isPending && phrases.length === 0 && hasReadyPacks === null && (
            <p className="eyebrow-free">Chargement…</p>
          )}
          {!isPending && hasReadyPacks === false && (
            <p className="eyebrow-free">
              Aucun pack téléchargé pour {LEVELS.find((l) => l.code === level)?.label} pour l'instant. Va dans
              l'onglet "Packs" pour en télécharger un.
            </p>
          )}
          {!isPending && hasReadyPacks === true && phrases.length === 0 && (
            <p className="eyebrow-free">
              Tu as vu toutes les phrases disponibles à ce niveau pour l'instant — télécharge un nouveau pack dans
              l'onglet "Packs" pour continuer.
            </p>
          )}
          {phrases.length > 0 && subTab === 'audio' && <PhraseDeck phrases={phrases} profileId={profileId} />}
          {phrases.length > 0 && subTab === 'exercise' && (
            <ExercisePanel phrases={phrases} profileId={profileId} bcp47={bcp47} />
          )}
        </>
      )}
    </div>
  );
}
