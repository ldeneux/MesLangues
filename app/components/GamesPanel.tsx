'use client';

import { useState } from 'react';
import type { LangCode, LevelCode } from '../../lib/constants';
import GameIntrus from './GameIntrus';
import GamePendu from './GamePendu';
import GameMemory from './GameMemory';
import GameEcouteDevine from './GameEcouteDevine';
import GameChasseArticles from './GameChasseArticles';
import GameConjugaisonEclair from './GameConjugaisonEclair';

type GameTab = 'intrus' | 'pendu' | 'memory' | 'ecoute' | 'articles' | 'conjugaison';

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

  return (
    <div>
      <div className="subtab-row" style={{ flexWrap: 'wrap' }}>
        <button className={`subtab-btn${tab === 'intrus' ? ' active' : ''}`} onClick={() => setTab('intrus')}>
          Intrus
        </button>
        <button className={`subtab-btn${tab === 'pendu' ? ' active' : ''}`} onClick={() => setTab('pendu')}>
          Pendu
        </button>
        <button className={`subtab-btn${tab === 'memory' ? ' active' : ''}`} onClick={() => setTab('memory')}>
          Memory
        </button>
        <button className={`subtab-btn${tab === 'ecoute' ? ' active' : ''}`} onClick={() => setTab('ecoute')}>
          Écoute et devine
        </button>
        <button className={`subtab-btn${tab === 'articles' ? ' active' : ''}`} onClick={() => setTab('articles')}>
          Chasse aux articles
        </button>
        <button
          className={`subtab-btn${tab === 'conjugaison' ? ' active' : ''}`}
          onClick={() => setTab('conjugaison')}
        >
          Conjugaison éclair
        </button>
      </div>

      {tab === 'intrus' && <GameIntrus profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'pendu' && <GamePendu profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'memory' && <GameMemory profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'ecoute' && <GameEcouteDevine profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'articles' && <GameChasseArticles profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'conjugaison' && <GameConjugaisonEclair profileId={profileId} languageCode={lang} />}
    </div>
  );
}
