'use client';

import { useState } from 'react';
import { LANGS, type LangCode, type LevelCode } from '../../lib/constants';
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
import WritingPanel from './WritingPanel';
import ConversationPanel from './ConversationPanel';
import KanaPanel from './KanaPanel';
import KanjiPanel from './KanjiPanel';
import ErrorBoundary from './ErrorBoundary';

export default function LanguageHub() {
  const { profile, loading } = useProfile();
  const [lang, setLang] = useState<LangCode>('it');
  const [level, setLevel] = useState<LevelCode>('A1');
  const [tab, setTab] = useState<Tab>('today');

  function handleLangChange(l: LangCode) {
    setLang(l);
    if (l !== 'ja' && (tab === 'kana' || tab === 'kanji')) setTab('today'); // Kana et Kanji n'existent qu'en japonais
  }

  if (loading) return <p className="eyebrow-free">Chargement…</p>;
  if (!profile) return <ProfileGate />;

  return (
    <>
      <TopBar lang={lang} level={level} onLangChange={handleLangChange} onLevelChange={setLevel} />
      <div className="hub-layout">
        <Sidebar tab={tab} onTabChange={setTab} showKana={lang === 'ja'} showKanji={lang === 'ja'} />

        <main className="hub-content">
          <ErrorBoundary key={`${tab}-${lang}-${level}`} label={tab}>
          {tab === 'kana' && lang === 'ja' && <KanaPanel />}
          {tab === 'kanji' && lang === 'ja' && <KanjiPanel profileId={profile.id} levelCode={level} />}
          {tab === 'today' && <LearnPanel profileId={profile.id} lang={lang} level={level} />}
          {tab === 'revision' && <RevisionPanel languageCode={lang} levelCode={level} />}
          {tab === 'packs' && <PacksPanel languageCode={lang} levelCode={level} />}
          {tab === 'vocabulary' && <VocabularyPanel profileId={profile.id} languageCode={lang} levelCode={level} />}
          {tab === 'grammar' && <GrammarPanel profileId={profile.id} languageCode={lang} />}
          {tab === 'conjugation' && <ConjugationPanel languageCode={lang} levelCode={level} />}
          {tab === 'writing' && <WritingPanel profileId={profile.id} languageCode={lang} levelCode={level} />}
          {tab === 'conversation' && (
            <ConversationPanel
              profileId={profile.id}
              languageCode={lang}
              languageLabel={LANGS.find((l) => l.code === lang)?.label.toLowerCase() ?? lang}
              levelCode={level}
              bcp47={LANGS.find((l) => l.code === lang)?.bcp47 ?? 'en-US'}
            />
          )}
          {tab === 'games' && <GamesPanel profileId={profile.id} lang={lang} level={level} />}
        </ErrorBoundary>
        </main>
      </div>
    </>
  );
}
