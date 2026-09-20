export const LANGS = [
  { code: 'it', label: 'Italien', flag: '🇮🇹', bcp47: 'it-IT' },
  { code: 'es', label: 'Espagnol', flag: '🇪🇸', bcp47: 'es-ES' },
  { code: 'en', label: 'Anglais', flag: '🇺🇸', bcp47: 'en-US' },
  { code: 'ja', label: 'Japonais', flag: '🇯🇵', bcp47: 'ja-JP' },
  { code: 'de', label: 'Allemand', flag: '🇩🇪', bcp47: 'de-DE' },
] as const;

export const LEVELS = [
  { code: 'A1', label: 'A1', subtitle: 'Découverte', color: '#8b7fd6' },
  { code: 'A2', label: 'A2', subtitle: 'Niveau de survie', color: '#22b0c9' },
  { code: 'B1', label: 'B1', subtitle: 'Seuil', color: '#8bc34a' },
  { code: 'B2', label: 'B2', subtitle: 'Utilisateur indépendant', color: '#f5b83d' },
] as const;

export type LangCode = (typeof LANGS)[number]['code'];
export type LevelCode = (typeof LEVELS)[number]['code'];

// ---------------------------------------------------------------------
// Thèmes (pondérés par fréquence d'usage en conversation courante) et
// taille de pack — voir la discussion produit pour le détail des chiffres.
// ---------------------------------------------------------------------
export const THEMES = [
  { code: 'food_restaurant', label: 'Nourriture, boissons, restaurant', weight: 11 },
  { code: 'greetings', label: 'Salutations, politesse, présentations', weight: 10 },
  { code: 'transport', label: 'Transports et déplacements', weight: 9 },
  { code: 'shopping', label: 'Achats et shopping', weight: 8 },
  { code: 'numbers_time', label: 'Nombres, heure, date, argent', weight: 8 },
  { code: 'directions', label: 'Se repérer, directions en ville', weight: 7 },
  { code: 'work_school', label: "Travail, école, quotidien", weight: 7 },
  { code: 'family', label: 'Famille et relations', weight: 6 },
  { code: 'housing', label: 'Logement, hôtel', weight: 6 },
  { code: 'health', label: 'Corps et santé', weight: 6 },
  { code: 'emotions', label: 'Émotions, goûts, opinions simples', weight: 6 },
  { code: 'leisure', label: 'Loisirs, sport, culture', weight: 5 },
  { code: 'technology', label: 'Téléphone et technologie du quotidien', weight: 5 },
  { code: 'emergencies', label: 'Urgences et imprévus', weight: 3 },
  { code: 'weather', label: 'Météo', weight: 3 },
] as const;

export type ThemeCode = (typeof THEMES)[number]['code'];

export const PACK_SIZE = 350;

/**
 * Répartit `total` phrases entre les thèmes au prorata de leur poids, en
 * ajustant le plus gros thème pour que la somme tombe exactement juste.
 */
export function packThemeQuotas(total: number = PACK_SIZE): { code: ThemeCode; label: string; count: number }[] {
  const raw = THEMES.map((t) => ({ ...t, count: Math.round((t.weight / 100) * total) }));
  const diff = total - raw.reduce((sum, t) => sum + t.count, 0);
  if (diff !== 0) {
    const biggest = raw.reduce((a, b) => (b.weight > a.weight ? b : a));
    biggest.count += diff;
  }
  return raw;
}

// Cible cumulée de phrases distinctes pour "être prêt" à chaque niveau —
// dérivée des tailles de vocabulaire CECRL usuelles (~1 phrase ≈ 1 item
// nouveau de vocabulaire/structure).
export const LEVEL_CUMULATIVE_TARGET: Record<LevelCode, number> = {
  A1: 700,
  A2: 1500,
  B1: 2750,
  B2: 4750,
};

export const CONJUGATION_TARGET = 120;

export const GRAMMAR_QUIZ_TARGET_PER_TOPIC = 100;
export const GRAMMAR_QUIZ_DRAW_SIZE = 10;

export const VOCAB_PACK_SIZE = 350;

export const LISTENING_PACK_SIZE = 50;
export const QUESTIONS_PER_ARTICLE = 25;
export const QUIZ_DRAW_SIZE = 5;

export const WRITING_PROMPTS_PER_LEVEL = 30;

export const GRAMMAR_TOPICS = [
  { code: 'articles', label: 'Articles (défini / indéfini)' },
  { code: 'genre_nombre', label: 'Genre et nombre des noms' },
  { code: 'pronoms', label: 'Pronoms personnels' },
  { code: 'present', label: 'Conjugaison de base au présent' },
  { code: 'negation', label: 'La négation' },
  { code: 'adjectifs', label: 'Adjectifs : accord et position' },
  { code: 'questions', label: 'Poser une question' },
  { code: 'prepositions', label: 'Prépositions courantes' },
  { code: 'comparatifs', label: 'Comparatifs et superlatifs' },
  { code: 'passe', label: 'Parler au passé (aperçu)' },
] as const;
