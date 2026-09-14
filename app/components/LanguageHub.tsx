'use client';

import { useEffect, useState, useTransition } from 'react';
import { LANGS, LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import { getTodaySet, type Phrase, type PhraseSetInfo } from '../../lib/data';
import PhraseDeck from './PhraseDeck';
import RevisionPanel from './RevisionPanel';

type Tab = 'today' | 'revision';

export default function LanguageHub() {
  const [lang, setLang] = useState<LangCode>(LANGS[0].code);
  const [level, setLevel] = useState<LevelCode>(LEVELS[0].code);
  const [tab, setTab] = useState<Tab>('today');

  const [todaySet, setTodaySet] = useState<PhraseSetInfo | null>(null);
  const [todayPhrases, setTodayPhrases] = useState<Phrase[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (tab !== 'today') return;
    setTodaySet(null);
    setTodayPhrases([]);
    startTransition(() => {
      getTodaySet(lang, level).then(({ phraseSet, phrases }) => {
        setTodaySet(phraseSet);
        setTodayPhrases(phrases);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, level, tab]);

  return (
    <div>
      <h1>Frasi</h1>

      <div className="flag-row">
        {LANGS.map((l) => (
          <button
            key={l.code}
            className={`flag-btn${lang === l.code ? ' active' : ''}`}
            onClick={() => setLang(l.code)}
            aria-label={l.label}
          >
            <span className="flag">{l.flag}</span>
            <span className="flag-label">{l.label}</span>
          </button>
        ))}
      </div>

      <div className="level-row">
        {LEVELS.map((lv) => (
          <button
            key={lv.code}
            className={`level-btn${level === lv.code ? ' active' : ''}`}
            onClick={() => setLevel(lv.code)}
          >
            {lv.label}
          </button>
        ))}
      </div>

      <div className="tab-row">
        <button
          className={`tab-btn${tab === 'today' ? ' active' : ''}`}
          onClick={() => setTab('today')}
        >
          Phrases du jour
        </button>
        <button
          className={`tab-btn${tab === 'revision' ? ' active' : ''}`}
          onClick={() => setTab('revision')}
        >
          Révision
        </button>
      </div>

      <div className="tab-content">
        {tab === 'today' && (
          <>
            {isPending && todayPhrases.length === 0 && (
              <p className="eyebrow-free">Chargement…</p>
            )}
            {!isPending && !todaySet && (
              <p className="eyebrow-free">
                Aucun lot généré pour aujourd'hui en {LEVELS.find((l) => l.code === level)?.label}.
                Le cron quotidien s'en charge automatiquement, ou déclenche-le manuellement via{' '}
                <code>/api/generate-daily?language={lang}&level={level}&secret=...</code>.
              </p>
            )}
            {todaySet?.theme && <p className="eyebrow-free">Thème du jour : {todaySet.theme}</p>}
            {todayPhrases.length > 0 && <PhraseDeck phrases={todayPhrases} />}
          </>
        )}

        {tab === 'revision' && <RevisionPanel languageCode={lang} levelCode={level} />}
      </div>
    </div>
  );
}
