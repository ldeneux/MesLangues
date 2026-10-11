// Module pur (pas de 'use server') : structure de l'examen blanc, importable
// côté client (affichage) ET côté serveur (création / notation).

export type EpreuveKey = 'listening' | 'reading' | 'grammar' | 'writing' | 'speaking';

export type EpreuveMeta = {
  key: EpreuveKey;
  label: string;
  emoji: string;
  description: string;
  minutes: number;
};

// Durée de l'écriture : même budget que l'onglet Écriture (WRITING_TIME_BUDGET_MINUTES : 10 / 15 / 20 / 25 min).
const WRITING_MINUTES: Record<string, number> = { A1: 10, A2: 15, B1: 20, B2: 25 };
export const SPEAKING_MINUTES = 10;

const BASE_EPREUVES: Omit<EpreuveMeta, 'minutes'>[] = [
  {
    key: 'listening',
    label: 'Compréhension orale',
    emoji: '🎧',
    description: "Tu écoutes un document (2 écoutes maximum), puis tu réponds aux questions. Le texte n'est pas affiché.",
  },
  {
    key: 'reading',
    label: 'Compréhension écrite',
    emoji: '📖',
    description: 'Tu lis un texte, puis tu réponds aux questions.',
  },
  {
    key: 'grammar',
    label: 'Grammaire et lexique',
    emoji: '✏️',
    description: 'Des questions de grammaire, puis des questions de vocabulaire.',
  },
  {
    key: 'writing',
    label: 'Production écrite',
    emoji: '📝',
    description: "Tu rédiges un texte à partir d'une consigne. Il est corrigé et noté (même barème que l'onglet Écriture).",
  },
  {
    key: 'speaking',
    label: 'Production orale',
    emoji: '🗣️',
    description: "Tu mènes une conversation (10 échanges maximum) dans une situation imposée. Elle est corrigée et notée (même barème que l'onglet Conversation).",
  },
];

/** Épreuves de l'examen blanc pour un niveau (la durée de l'écriture dépend du niveau). */
export function epreuvesForLevel(levelCode: string): EpreuveMeta[] {
  return BASE_EPREUVES.map((e) => ({
    ...e,
    minutes: e.key === 'writing' ? WRITING_MINUTES[levelCode] ?? 15 : e.key === 'speaking' ? SPEAKING_MINUTES : 10,
  }));
}

export function epreuveMeta(key: string): EpreuveMeta | undefined {
  return epreuvesForLevel('A1').find((e) => e.key === key);
}

export const COMPREHENSION_QUESTIONS = 8; // par épreuve de compréhension
export const GRAMMAR_QUESTIONS = 8;
export const LEXICON_QUESTIONS = 8;
export const MIN_COMPREHENSION_QUESTIONS = 5; // un article avec moins de questions n'est pas retenu
export const LISTENING_MAX_PLAYS = 2;

// Réussite inspirée des épreuves de type DELF : moyenne >= 50 % ET au moins 20 % à chaque épreuve
// (barème interne à l'appli, pas une équivalence officielle).
export const EXAM_PASS_TOTAL = 50;
export const EXAM_MIN_PER_EPREUVE = 20;

// Niveau minimal de ressources pour pouvoir passer l'examen (vérifié avant le départ)
export const MIN_ARTICLES_FOR_EXAM = 2;
export const MIN_GRAMMAR_QUESTIONS_FOR_EXAM = 16;
export const MIN_WORDS_FOR_EXAM = 20;
export const MIN_WRITING_PROMPTS_FOR_EXAM = 1;

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}
