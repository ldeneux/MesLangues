'use client';

import { useState } from 'react';
import type { LangCode, LevelCode } from '../../lib/constants';
import GameIntrus from './GameIntrus';
import GamePendu from './GamePendu';
import GameMemory from './GameMemory';
import GameEcouteDevine from './GameEcouteDevine';
import GameChasseArticles from './GameChasseArticles';
import GameConjugaisonEclair from './GameConjugaisonEclair';
import GameConjugaisonEclairJa from './GameConjugaisonEclairJa';
import GameLectureEclair from './GameLectureEclair';
import GameParticules from './GameParticules';

type GameTab = 'intrus' | 'pendu' | 'memory' | 'ecoute' | 'articles' | 'conjugaison' | 'lecture' | 'particules';

export default function GamesPanel({
  profileId,
  lang,
  level,
}: {
  profileId: string;
  lang: LangCode;
  level: LevelCode;
}) {
  const [tab, setTab] = useState<GameTab>('intrus');
  const isJa = lang === 'ja';
  // Japonais : pas de lettres ni d'articles → le Pendu et la Chasse aux articles sont remplacés par des jeux de kana, kanji et particules

  return (
    <div>
      <div className="subtab-row" style={{ flexWrap: 'wrap' }}>
        <button className={`subtab-btn${tab === 'intrus' ? ' active' : ''}`} onClick={() => setTab('intrus')}>
          Intrus
        </button>
        {!isJa && (
          <button className={`subtab-btn${tab === 'pendu' ? ' active' : ''}`} onClick={() => setTab('pendu')}>
            Pendu
          </button>
        )}
        <button className={`subtab-btn${tab === 'memory' ? ' active' : ''}`} onClick={() => setTab('memory')}>
          Memory
        </button>
        <button className={`subtab-btn${tab === 'ecoute' ? ' active' : ''}`} onClick={() => setTab('ecoute')}>
          Écoute et devine
        </button>
        {!isJa && (
          <button className={`subtab-btn${tab === 'articles' ? ' active' : ''}`} onClick={() => setTab('articles')}>
            Chasse aux articles
          </button>
        )}
        {isJa && (
          <>
            <button className={`subtab-btn${tab === 'lecture' ? ' active' : ''}`} onClick={() => setTab('lecture')}>
              Lecture éclair
            </button>
            <button className={`subtab-btn${tab === 'particules' ? ' active' : ''}`} onClick={() => setTab('particules')}>
              Chasse aux particules
            </button>
          </>
        )}
        <button
          className={`subtab-btn${tab === 'conjugaison' ? ' active' : ''}`}
          onClick={() => setTab('conjugaison')}
        >
          Conjugaison éclair
        </button>
      </div>

      {tab === 'intrus' && <GameIntrus profileId={profileId} languageCode={lang} levelCode={level} />}
      {!isJa && tab === 'pendu' && <GamePendu profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'memory' && <GameMemory profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'ecoute' && <GameEcouteDevine profileId={profileId} languageCode={lang} levelCode={level} />}
      {!isJa && tab === 'articles' && <GameChasseArticles profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'conjugaison' &&
        (isJa ? (
          <GameConjugaisonEclairJa profileId={profileId} levelCode={level} />
        ) : (
          <GameConjugaisonEclair profileId={profileId} languageCode={lang} />
        ))}
      {isJa && tab === 'lecture' && <GameLectureEclair levelCode={level} />}
      {isJa && tab === 'particules' && <GameParticules languageCode={lang} />}
    </div>
  );
}
