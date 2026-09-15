'use client';

import { useEffect, useState, useTransition } from 'react';
import { LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import { getNextDailyPhrases, type Phrase } from '../../lib/data';
import { useProfile } from './ProfileContext';
import ProfileGate from './ProfileGate';
import Sidebar, { type Tab } from './Sidebar';
import PhraseDeck from './PhraseDeck';
import RevisionPanel from './RevisionPanel';
import PacksPanel from './PacksPanel';
import VocabularyPanel from './VocabularyPanel';

export default function LanguageHub() {
  const { profile, loading } = useProfile();
  const [lang, setLang] = useState<LangCode>('it');
  const [level, setLevel] = useState<LevelCode>('A1');
  const [tab, setTab] = useState<Tab>('today');

  const [todayPhrases, setTodayPhrases] = useState<Phrase[]>([]);
  const [hasReadyPacks, setHasReadyPacks] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (tab !== 'today' || !profile) return;
    setTodayPhrases([]);
    setHasReadyPacks(null);
    startTransition(() => {
      getNextDailyPhrases(profile.id, lang, level).then(({ phrases, hasReadyPacks }) => {
        setTodayPhrases(phrases);
        setHasReadyPacks(hasReadyPacks);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, level, tab, profile?.id]);

  if (loading) return <p className="eyebrow-free">Chargement…</p>;
  if (!profile) return <ProfileGate />;

  return (
    <div className="hub-layout">
      <Sidebar lang={lang} level={level} tab={tab} onLangChange={setLang} onLevelChange={setLevel} onTabChange={setTab} />

      <main className="hub-content">
        {tab === 'today' && (
          <>
            {isPending && todayPhrases.length === 0 && hasReadyPacks === null && (
              <p className="eyebrow-free">Chargement…</p>
            )}
            {!isPending && hasReadyPacks === false && (
              <p className="eyebrow-free">
                Aucun pack téléchargé pour {LEVELS.find((l) => l.code === level)?.label} pour l'instant. Va dans
                l'onglet "Packs" pour en télécharger un.
              </p>
            )}
            {!isPending && hasReadyPacks === true && todayPhrases.length === 0 && (
              <p className="eyebrow-free">
                Tu as vu toutes les phrases disponibles à ce niveau pour l'instant — télécharge un nouveau pack dans
                l'onglet "Packs" pour continuer.
              </p>
            )}
            {todayPhrases.length > 0 && <PhraseDeck phrases={todayPhrases} profileId={profile.id} />}
          </>
        )}

        {tab === 'revision' && <RevisionPanel languageCode={lang} levelCode={level} />}

        {tab === 'packs' && <PacksPanel languageCode={lang} levelCode={level} />}

        {tab === 'vocabulary' && <VocabularyPanel profileId={profile.id} languageCode={lang} levelCode={level} />}
      </main>
    </div>
  );
}
