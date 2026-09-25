// Module pur (pas de 'use server') : importable côté client (compteur de
// mots en direct) ET côté serveur (calcul de la note). "Gemini juge (des
// sous-notes par critère), le code calcule la note finale" — pour que deux
// textes de longueur différente n'obtiennent jamais la même note par
// coïncidence, et que l'exigence monte avec le niveau CECRL.

export const RUBRIC_VERSION = 'w1';

export type CriterionKey = 'task' | 'grammar' | 'vocabulary' | 'coherence';

export const CRITERIA: Record<CriterionKey, string> = {
  task: 'Réalisation de la tâche',
  grammar: 'Grammaire et conjugaison',
  vocabulary: 'Vocabulaire',
  coherence: 'Cohérence et orthographe',
};

export const LEVEL_WEIGHTS: Record<string, Record<CriterionKey, number>> = {
  A1: { task: 0.35, grammar: 0.2, vocabulary: 0.25, coherence: 0.2 },
  A2: { task: 0.3, grammar: 0.25, vocabulary: 0.25, coherence: 0.2 },
  B1: { task: 0.25, grammar: 0.25, vocabulary: 0.25, coherence: 0.25 },
  B2: { task: 0.2, grammar: 0.3, vocabulary: 0.25, coherence: 0.25 },
};

// Tolérance aux erreurs par niveau (plus haut = plus tolérant). Utilisé
// pour plafonner "grammar"/"vocabulary" selon la densité d'erreurs — un
// même texte est donc jugé plus sévèrement en B2 qu'en A1.
const LEVEL_ERROR_TOLERANCE: Record<string, number> = { A1: 1.6, A2: 1.3, B1: 1.0, B2: 0.7 };

export type WritingError = {
  category:
    | 'grammar'
    | 'conjugation'
    | 'preposition'
    | 'article'
    | 'word_order'
    | 'vocabulary'
    | 'false_friend'
    | 'spelling'
    | 'punctuation';
  severity: 'minor' | 'major';
  original: string;
  correction: string;
  explanation_fr: string;
};

const JA_CHARS_PER_WORD = 3; // hypothèse à ajuster si besoin

/**
 * Compte la longueur d'un texte de façon utilisable pour toutes les
 * écritures : mots séparés par des espaces pour les langues latines, mais
 * caractères pour le japonais (pas d'espaces entre les mots). La ponctuation
 * isolée ("." tout seul) ne compte pas.
 */
export function countLength(text: string, languageCode: string): { count: number; unit: 'mots' | 'caractères' } {
  if (languageCode === 'ja') {
    const chars = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
    return { count: chars, unit: 'caractères' };
  }
  const words = (text.match(/[\p{L}\p{N}]+(?:[''-][\p{L}\p{N}]+)*/gu) ?? []).length;
  return { count: words, unit: 'mots' };
}

/** Convertit une fourchette de mots en fourchette équivalente pour le japonais. */
export function adjustedRange(minWords: number, maxWords: number, languageCode: string): [number, number] {
  if (languageCode === 'ja') return [minWords * JA_CHARS_PER_WORD, maxWords * JA_CHARS_PER_WORD];
  return [minWords, maxWords];
}

function densityCap(
  errors: WritingError[],
  categories: WritingError['category'][],
  wordCount: number,
  tolerance: number
): number {
  const weighted = errors
    .filter((e) => categories.includes(e.category))
    .reduce((sum, e) => sum + (e.severity === 'major' ? 1 : 0.5), 0);
  const density = (weighted / Math.max(wordCount, 10)) * 10;

  if (density <= 0.5 * tolerance) return 5;
  if (density <= 1.0 * tolerance) return 4;
  if (density <= 1.6 * tolerance) return 3;
  if (density <= 2.4 * tolerance) return 2;
  return 1;
}

export type ComputeInput = {
  levelCode: string;
  languageCode: string;
  subScores: Record<CriterionKey, number>; // 0-5, venant de Gemini
  justifications: Record<CriterionKey, string>;
  errors: WritingError[];
  pointsCovered: boolean[];
  offTopic: boolean;
  wrongLanguage: boolean;
  text: string;
  minWords: number;
  maxWords: number;
};

export type ComputeResult = {
  score: number;
  criteria: Record<CriterionKey, { score: number; max: 5; justification: string; capped_by?: string }>;
  penalties: { lengthPct: number; caps: string[] };
  wordCount: number;
  lengthUnit: 'mots' | 'caractères';
};

/**
 * Fonction pure et déterministe : mêmes entrées -> toujours la même note.
 * C'est ELLE qui calcule le score final sur 100, pas Gemini (qui ne fournit
 * que des sous-notes 0-5 par critère + la liste des erreurs).
 */
export function computeWritingScore(input: ComputeInput): ComputeResult {
  const weights = LEVEL_WEIGHTS[input.levelCode] ?? LEVEL_WEIGHTS.A1;
  const tolerance = LEVEL_ERROR_TOLERANCE[input.levelCode] ?? LEVEL_ERROR_TOLERANCE.A1;
  const { count: wordCount, unit } = countLength(input.text, input.languageCode);
  const [adjMin, adjMax] = adjustedRange(input.minWords, input.maxWords, input.languageCode);

  const caps: string[] = [];
  const criteria = {} as ComputeResult['criteria'];

  for (const key of Object.keys(CRITERIA) as CriterionKey[]) {
    let score = Math.max(0, Math.min(5, Math.round(input.subScores[key] ?? 0)));
    let cappedBy: string | undefined;

    if (key === 'grammar') {
      const cap = densityCap(
        input.errors,
        ['grammar', 'conjugation', 'preposition', 'article', 'word_order'],
        wordCount,
        tolerance
      );
      if (score > cap) {
        score = cap;
        cappedBy = "trop d'erreurs pour ce niveau";
      }
    }
    if (key === 'vocabulary') {
      const cap = densityCap(input.errors, ['vocabulary', 'false_friend'], wordCount, tolerance * 1.3);
      if (score > cap) {
        score = cap;
        cappedBy = 'vocabulaire trop approximatif pour ce niveau';
      }
    }
    if (key === 'task' && input.pointsCovered.length > 0) {
      const covered = input.pointsCovered.filter(Boolean).length;
      const ratio = covered / input.pointsCovered.length;
      if (ratio === 0 && score > 1) {
        score = 1;
        cappedBy = 'aucun point de la consigne abordé';
      } else if (ratio < 0.5 && score > 2) {
        score = 2;
        cappedBy = 'moins de la moitié des points de la consigne abordés';
      }
    }
    if (key === 'task' && wordCount < 0.5 * adjMin && score > 2) {
      score = 2;
      cappedBy = 'texte trop court pour être évalué correctement';
    }

    if (cappedBy) caps.push(`${CRITERIA[key]} : ${cappedBy}`);
    criteria[key] = { score, max: 5, justification: input.justifications[key] ?? '', capped_by: cappedBy };
  }

  let raw = 0;
  for (const key of Object.keys(CRITERIA) as CriterionKey[]) {
    raw += weights[key] * criteria[key].score;
  }
  raw = (raw / 5) * 100;

  // Pénalité de longueur : proportionnelle à l'écart relatif, plafonnée à
  // -10% de la note (pas une chute brutale pour 1 mot de trop).
  let lengthPct = 0;
  if (wordCount > adjMax) {
    lengthPct = Math.min(10, ((wordCount - adjMax) / adjMax) * 100 * 0.4);
  } else if (wordCount < adjMin) {
    lengthPct = Math.min(10, ((adjMin - wordCount) / Math.max(adjMin, 1)) * 100 * 0.4);
  }

  let score = raw * (1 - lengthPct / 100);

  if (input.offTopic) score = Math.min(score, 20);
  if (input.wrongLanguage) score = Math.min(score, 10);

  score = Math.round(Math.max(0, Math.min(100, score)));

  return {
    score,
    criteria,
    penalties: { lengthPct: Math.round(lengthPct * 10) / 10, caps },
    wordCount,
    lengthUnit: unit,
  };
}
