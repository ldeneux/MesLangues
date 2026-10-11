// Module pur : budget d'une séance de conversation et suivi du coût en direct.
// Importable côté client (compteur, bannières) ET côté serveur (garde-fou).

import { USD_TO_EUR } from './pricing';

export const CONVERSATION_MAX_EXCHANGES = 10; // messages de l'apprenant (chacun reçoit une réponse)
export const CONVERSATION_BUDGET_EUR = 0.05;
export const CONVERSATION_BUDGET_USD = CONVERSATION_BUDGET_EUR / USD_TO_EUR;

// Réserve pour la correction finale : toujours disponible, même si les échanges
// consomment tout le reste. À calibrer avec les coûts réels affichés dans l'historique.
export const FINAL_CORRECTION_RESERVE_USD = 0.009;
export const TURNS_BUDGET_USD = CONVERSATION_BUDGET_USD - FINAL_CORRECTION_RESERVE_USD;

// Estimation affichée avant de démarrer (ordre de grandeur, à confirmer par les mesures réelles).
export const CONVERSATION_ESTIMATED_EUR = 0.04;

export type BudgetLevel = 'ok' | 'soon' | 'final' | 'stop';

export type BudgetState = {
  level: BudgetLevel;
  ratio: number; // part du budget des échanges déjà consommée (0-1+)
  spentEur: number;
  budgetEur: number;
  exchangesLeft: number;
};

/**
 * - ok    : tout va bien
 * - soon  : à partir de 70 % du budget ou 8 échanges → l'IA prépare la conclusion
 * - final : à partir de 90 % du budget ou 10 échanges → dernière réplique de l'IA
 * - stop  : budget des échanges épuisé → plus de nouveau message, on passe à la correction
 */
export function budgetState(spentUsd: number, userTurns: number): BudgetState {
  const ratio = spentUsd / TURNS_BUDGET_USD;
  let level: BudgetLevel = 'ok';
  if (ratio >= 1) level = 'stop';
  else if (ratio >= 0.9 || userTurns >= CONVERSATION_MAX_EXCHANGES) level = 'final';
  else if (ratio >= 0.7 || userTurns >= CONVERSATION_MAX_EXCHANGES - 2) level = 'soon';

  return {
    level,
    ratio,
    spentEur: spentUsd * USD_TO_EUR,
    budgetEur: CONVERSATION_BUDGET_EUR,
    exchangesLeft: Math.max(0, CONVERSATION_MAX_EXCHANGES - userTurns),
  };
}

export function formatEur(eur: number): string {
  return `${eur.toFixed(3).replace('.', ',')} €`;
}
