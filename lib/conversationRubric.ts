// Module pur (pas de 'use server') : barème de la note de Conversation.
// Même principe que l'Écriture : "Gemini juge, le code calcule". Gemini ne
// donne que des sous-notes 0-5 (interaction, grammaire, vocabulaire) ; la
// 4e critère (aisance / développement) est calculé entièrement par le code
// à partir de la longueur réelle des réponses, et la note finale sur 100 est
// déterministe (mêmes entrées -> même note).

import { countLength, adjustedRange, densityCap, LEVEL_ERROR_TOLERANCE, type WritingError } from './writingRubric';

export const CONV_RUBRIC_VERSION = 'c1';

export type ConvCriterionKey = 'interaction' | 'grammar' | 'vocabulary' | 'development';

export const CONV_CRITERIA: Record<ConvCriterionKey, string> = {
  interaction: 'Interaction et pertinence',
  grammar: 'Grammaire et conjugaison',
  vocabulary: 'Vocabulaire',
  development: 'Aisance et développement',
};

export const CONV_LEVEL_WEIGHTS: Record<string, Record<ConvCriterionKey, number>> = {
  A1: { interaction: 0.35, grammar: 0.2, vocabulary: 0.2, development: 0.25 },
  A2: { interaction: 0.3, grammar: 0.25, vocabulary: 0.2, development: 0.25 },
  B1: { interaction: 0.25, grammar: 0.25, vocabulary: 0.25, development: 0.25 },
  B2: { interaction: 0.2, grammar: 0.3, vocabulary: 0.25, development: 0.25 },
};

// Longueur moyenne attendue d'une réponse (en mots ; convertie en caractères pour le japonais)
const TARGET_WORDS_PER_TURN: Record<string, number> = { A1: 5, A2: 8, B1: 12, B2: 18 };

// En dessous de ce nombre de réponses, la note est réduite (une conversation de
// 3 échanges ne peut pas valoir une de 10).
const FULL_PARTICIPATION_TURNS = 6;
export const MIN_TURNS_TO_FINISH = 2;

export type ConvComputeInput = {
  levelCode: string;
  languageCode: string;
  subScores: Record<'interaction' | 'grammar' | 'vocabulary', number>; // 0-5, venant de Gemini
  justifications: Partial<Record<ConvCriterionKey, string>>;
  errors: WritingError[]; // erreurs relevées pendant la conversation (déjà filtrées)
  objectivesCovered: boolean[];
  userTexts: string[];
  wrongLanguageTurns: number; // nombre de réponses écrites dans la mauvaise langue
  offTopic: boolean;
};

export type ConvComputeResult = {
  score: number;
  criteria: Record<ConvCriterionKey, { score: number; max: 5; justification: string; capped_by?: string }>;
  penalties: { participationPct: number; caps: string[] };
  userTurns: number;
  avgLength: number;
  lengthUnit: 'mots' | 'caractères';
};

function developmentScore(avgLen: number, target: number): number {
  if (target <= 0) return 0;
  const ratio = avgLen / target;
  if (ratio >= 1) return 5;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.4) return 2;
  if (ratio >= 0.2) return 1;
  return 0;
}

export function computeConversationScore(input: ConvComputeInput): ConvComputeResult {
  const weights = CONV_LEVEL_WEIGHTS[input.levelCode] ?? CONV_LEVEL_WEIGHTS.A1;
  const tolerance = LEVEL_ERROR_TOLERANCE[input.levelCode] ?? LEVEL_ERROR_TOLERANCE.A1;
  const userTurns = input.userTexts.length;

  const lengths = input.userTexts.map((t) => countLength(t, input.languageCode));
  const unit = lengths[0]?.unit ?? (input.languageCode === 'ja' ? 'caractères' : 'mots');
  const totalLength = lengths.reduce((s, l) => s + l.count, 0);
  const avgLength = userTurns > 0 ? totalLength / userTurns : 0;

  const baseWords = TARGET_WORDS_PER_TURN[input.levelCode] ?? TARGET_WORDS_PER_TURN.A1;
  const [target] = adjustedRange(baseWords, baseWords, input.languageCode);

  const caps: string[] = [];
  const criteria = {} as ConvComputeResult['criteria'];

  const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n ?? 0)));

  // Interaction (jugée par Gemini, plafonnée par les objectifs atteints)
  {
    let score = clamp(input.subScores.interaction);
    let cappedBy: string | undefined;
    if (input.objectivesCovered.length > 0) {
      const ratio = input.objectivesCovered.filter(Boolean).length / input.objectivesCovered.length;
      if (ratio === 0 && score > 1) {
        score = 1;
        cappedBy = 'aucun objectif de la situation atteint';
      } else if (ratio < 0.5 && score > 2) {
        score = 2;
        cappedBy = "moins de la moitié des objectifs atteints";
      }
    }
    if (cappedBy) caps.push(`${CONV_CRITERIA.interaction} : ${cappedBy}`);
    criteria.interaction = { score, max: 5, justification: input.justifications.interaction ?? '', capped_by: cappedBy };
  }

  // Grammaire (jugée par Gemini, plafonnée par la densité d'erreurs relevées)
  {
    let score = clamp(input.subScores.grammar);
    let cappedBy: string | undefined;
    const cap = densityCap(
      input.errors,
      ['grammar', 'conjugation', 'preposition', 'article', 'word_order'],
      totalLength,
      tolerance
    );
    if (score > cap) {
      score = cap;
      cappedBy = "trop d'erreurs pour ce niveau";
      caps.push(`${CONV_CRITERIA.grammar} : ${cappedBy}`);
    }
    criteria.grammar = { score, max: 5, justification: input.justifications.grammar ?? '', capped_by: cappedBy };
  }

  // Vocabulaire
  {
    let score = clamp(input.subScores.vocabulary);
    let cappedBy: string | undefined;
    const cap = densityCap(input.errors, ['vocabulary', 'false_friend'], totalLength, tolerance * 1.3);
    if (score > cap) {
      score = cap;
      cappedBy = 'vocabulaire trop approximatif pour ce niveau';
      caps.push(`${CONV_CRITERIA.vocabulary} : ${cappedBy}`);
    }
    criteria.vocabulary = { score, max: 5, justification: input.justifications.vocabulary ?? '', capped_by: cappedBy };
  }

  // Aisance et développement : 100 % calculé par le code
  {
    const score = developmentScore(avgLength, target);
    const shown = Math.round(avgLength * 10) / 10;
    criteria.development = {
      score,
      max: 5,
      justification: `Longueur moyenne de tes réponses : ${shown} ${unit} (repère pour ce niveau : environ ${target}).`,
    };
  }

  let raw = 0;
  (Object.keys(CONV_CRITERIA) as ConvCriterionKey[]).forEach((key) => {
    raw += weights[key] * criteria[key].score;
  });
  raw = (raw / 5) * 100;

  // Pénalité de participation : jusqu'à -30 % si la séance est très courte
  let participationPct = 0;
  if (userTurns < FULL_PARTICIPATION_TURNS) {
    participationPct = Math.min(30, ((FULL_PARTICIPATION_TURNS - userTurns) / FULL_PARTICIPATION_TURNS) * 30);
  }

  let score = raw * (1 - participationPct / 100);

  const wrongRatio = userTurns > 0 ? input.wrongLanguageTurns / userTurns : 0;
  if (wrongRatio >= 0.5) {
    score = Math.min(score, 10);
    caps.push('Au moins la moitié des réponses ne sont pas dans la langue étudiée');
  } else if (wrongRatio >= 0.25) {
    score = Math.min(score, 40);
    caps.push('Plusieurs réponses ne sont pas dans la langue étudiée');
  }
  if (input.offTopic) {
    score = Math.min(score, 20);
    caps.push("Conversation hors sujet ou sans réponses sérieuses");
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  return {
    score,
    criteria,
    penalties: { participationPct: Math.round(participationPct * 10) / 10, caps },
    userTurns,
    avgLength: Math.round(avgLength * 10) / 10,
    lengthUnit: unit,
  };
}
