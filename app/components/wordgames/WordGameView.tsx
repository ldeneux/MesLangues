'use client';

// Point d'entrée unique des jeux de mots dans l'onglet JEUX : liste des sous-onglets selon la langue + affichage du jeu choisi.
import type { LangCode, LevelCode } from '../../../lib/constants';
import GameMotsCroises from './GameMotsCroises';
import GameMotsCaches from './GameMotsCaches';
import GameLettresMelangees from './GameLettresMelangees';
import GameBoggle from './GameBoggle';
import GamePhrasesATrous from './GamePhrasesATrous';
import GameMahjongKanji from './GameMahjongKanji';

export type WordGameId = 'mots-croises' | 'mots-caches' | 'lettres-melangees' | 'boggle' | 'phrases-a-trous' | 'mahjong';

export function wordGameTabs(lang: LangCode): { id: WordGameId; label: string }[] {
  if (lang === 'ja') {
    return [
      { id: 'mahjong', label: 'Mahjong kanji' },
      { id: 'phrases-a-trous', label: 'Phrases à trous' },
    ];
  }
  return [
    { id: 'mots-croises', label: 'Mots croisés' },
    { id: 'mots-caches', label: 'Mots cachés' },
    { id: 'lettres-melangees', label: 'Lettres mélangées' },
    { id: 'boggle', label: 'Boggle' },
    { id: 'phrases-a-trous', label: 'Phrases à trous' },
  ];
}

export function isWordGame(tab: string): tab is WordGameId {
  return ['mots-croises', 'mots-caches', 'lettres-melangees', 'boggle', 'phrases-a-trous', 'mahjong'].includes(tab);
}

export default function WordGameView({ game, profileId, lang, level }: { game: WordGameId; profileId: string; lang: LangCode; level: LevelCode }) {
  const p = { profileId, lang, level };
  // Une clé par langue / niveau : tout est rechargé et regénéré quand l'un des deux change
  const key = `${lang}-${level}`;
  switch (game) {
    case 'mots-croises': return <GameMotsCroises key={key} {...p} />;
    case 'mots-caches': return <GameMotsCaches key={key} {...p} />;
    case 'lettres-melangees': return <GameLettresMelangees key={key} {...p} />;
    case 'boggle': return <GameBoggle key={key} {...p} />;
    case 'phrases-a-trous': return <GamePhrasesATrous key={key} {...p} />;
    case 'mahjong': return lang === 'ja' ? <GameMahjongKanji key={key} {...p} /> : null;
  }
}
