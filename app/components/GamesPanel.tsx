'use client';

import { useState } from 'react';
import type { LangCode, LevelCode } from '../../lib/constants';
import GameIntrus from './GameIntrus';
import GamePendu from './GamePendu';
import GameMemory from './GameMemory';
import GameEcouteDevine from './GameEcouteDevine';

type GameTab = 'intrus' | 'pendu' | 'memory' | 'ecoute';

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
      <div className="subtab-row">
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
      </div>

      {tab === 'intrus' && <GameIntrus profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'pendu' && <GamePendu profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'memory' && <GameMemory profileId={profileId} languageCode={lang} levelCode={level} />}
      {tab === 'ecoute' && <GameEcouteDevine profileId={profileId} languageCode={lang} levelCode={level} />}
    </div>
  );
}
