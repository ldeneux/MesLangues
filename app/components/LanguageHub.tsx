'use client';

import { useState } from 'react';
import { type LangCode, type LevelCode } from '../../lib/constants';
import { useProfile } from './ProfileContext';
import ProfileGate from './ProfileGate';
import TopBar from './TopBar';
import Sidebar, { type Tab } from './Sidebar';
import LearnPanel from './LearnPanel';
import RevisionPanel from './RevisionPanel';
import PacksPanel from './PacksPanel';
import VocabularyPanel from './VocabularyPanel';
import GrammarPanel from './GrammarPanel';
import ConjugationPanel from './ConjugationPanel';
import GamesPanel from './GamesPanel';

export default function LanguageHub() {
  const { profile, loading } = useProfile();
  const [lang, setLang] = useState<LangCode>('it');
  const [level, setLevel] = useState<LevelCode>('A1');
  const [tab, setTab] = useState<Tab>('today');

  if (loading) return <p className="eyebrow-free">Chargement…</p>;
  if (!profile) return <ProfileGate />;

  return (
    <>
      <TopBar />
      <div className="hub-layout">
        <Sidebar
          lang={lang}
          level={level}
          tab={tab}
          onLangChange={setLang}
          onLevelChange={setLevel}
          onTabChange={setTab}
        />

        <main className="hub-content">
          {tab === 'today' && <LearnPanel profileId={profile.id} lang={lang} level={level} />}
          {tab === 'revision' && <RevisionPanel languageCode={lang} levelCode={level} />}
          {tab === 'packs' && <PacksPanel languageCode={lang} levelCode={level} />}
          {tab === 'vocabulary' && <VocabularyPanel profileId={profile.id} languageCode={lang} levelCode={level} />}
          {tab === 'grammar' && <GrammarPanel languageCode={lang} />}
          {tab === 'conjugation' && <ConjugationPanel languageCode={lang} />}
          {tab === 'games' && <GamesPanel profileId={profile.id} lang={lang} level={level} />}
        </main>
      </div>
    </>
  );
}
