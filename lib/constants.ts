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

// ---------------------------------------------------------------------
// Thèmes SUPPLÉMENTAIRES réservés au vocabulaire (pas aux phrases, leçons, conjugaison, rédaction…, qui restent sur
// THEMES ci-dessus). Ils servent de réserve : quand les 15 thèmes principaux n'ont plus de mots nouveaux à proposer,
// la génération d'un pack de vocabulaire continue sur ces thèmes pour atteindre les 350 mots.
// ---------------------------------------------------------------------
export const EXTRA_VOCAB_THEMES = [
  { code: 'clothing', label: 'Vêtements et accessoires' },
  { code: 'home_objects', label: 'Maison, meubles et objets du quotidien' },
  { code: 'animals', label: 'Animaux' },
  { code: 'nature', label: 'Nature, plantes et paysages' },
  { code: 'jobs', label: 'Métiers et professions' },
  { code: 'school_study', label: 'Études, cours et matières' },
  { code: 'travel_tourism', label: 'Voyage, vacances et tourisme' },
  { code: 'sports', label: 'Sports et activités physiques' },
  { code: 'arts_media', label: 'Musique, cinéma, arts et médias' },
  { code: 'money_bank', label: 'Argent, banque et paiements' },
  { code: 'character', label: 'Caractère, qualités et défauts' },
  { code: 'appearance', label: 'Description physique et apparence' },
  { code: 'cooking', label: 'Cuisine, recettes et ingrédients' },
  { code: 'city_services', label: 'Ville, commerces et services publics' },
  { code: 'admin', label: 'Administration, courrier et démarches' },
  { code: 'environment', label: 'Environnement et écologie' },
  { code: 'adjectives_opposites', label: 'Adjectifs courants et contraires' },
  { code: 'time_quantity', label: 'Temps, fréquence et quantités' },
  { code: 'useful_expressions', label: 'Mots de liaison et expressions utiles' },
  { code: 'celebrations', label: 'Fêtes, traditions et événements' },
  { code: 'society_news', label: 'Société, actualité et vie publique' },
] as const;

/** Tous les thèmes du vocabulaire : les 15 principaux (avec quotas) puis les thèmes de réserve. */
export const VOCAB_THEMES: readonly { code: string; label: string }[] = [
  ...THEMES.map((t) => ({ code: t.code as string, label: t.label as string })),
  ...EXTRA_VOCAB_THEMES,
];

export function vocabThemeLabel(code: string): string {
  if (code === 'verbes') return 'Verbes';
  return VOCAB_THEMES.find((t) => t.code === code)?.label ?? code;
}

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

// OBJECTIF par langue et par niveau, en nombre de packs (1 pack = 350 phrases ou 350 mots), identique pour les
// phrases et le vocabulaire : A1 = 4 packs, A2 = 4, B1 = 5, B2 = 5. Éléments NOUVEAUX à chaque niveau (pas cumulés) :
// 1400 + 1400 + 1750 + 1750 = 6300 en tout pour une langue.
export const LEVEL_PACK_COUNT: Record<LevelCode, number> = {
  A1: 4,
  A2: 4,
  B1: 5,
  B2: 5,
};

// Cible d'éléments (phrases ou mots) propres à chaque niveau : 1400 / 1400 / 1750 / 1750.
// (Nom conservé : « LEVEL_CUMULATIVE_TARGET » est utilisé partout ; la valeur est désormais PAR NIVEAU.)
export const LEVEL_CUMULATIVE_TARGET: Record<LevelCode, number> = {
  A1: LEVEL_PACK_COUNT.A1 * 350,
  A2: LEVEL_PACK_COUNT.A2 * 350,
  B1: LEVEL_PACK_COUNT.B1 * 350,
  B2: LEVEL_PACK_COUNT.B2 * 350,
};

// Verbes : 120 par langue ET par niveau (chaque niveau a ses propres verbes ; la grammaire, elle, est commune à tous les niveaux).
export const CONJUGATION_TARGET = 120;

export const GRAMMAR_QUIZ_TARGET_PER_TOPIC = 30;
export const GRAMMAR_QUIZ_DRAW_SIZE = 10;

export const VOCAB_PACK_SIZE = 350;

export const LISTENING_PACK_SIZE = 50;

// Objectif d'articles d'écoute par langue et par niveau : A1 = 100, A2 = 100, B1 = 150, B2 = 200
// (2 / 2 / 3 / 4 packs de 50 articles). Indépendant des objectifs de phrases et de vocabulaire, qui ont changé.
const LISTENING_PACK_COUNT: Record<LevelCode, number> = { A1: 2, A2: 2, B1: 3, B2: 4 };
export const LISTENING_LEVEL_TARGET: Record<LevelCode, number> = {
  A1: LISTENING_PACK_COUNT.A1 * LISTENING_PACK_SIZE,
  A2: LISTENING_PACK_COUNT.A2 * LISTENING_PACK_SIZE,
  B1: LISTENING_PACK_COUNT.B1 * LISTENING_PACK_SIZE,
  B2: LISTENING_PACK_COUNT.B2 * LISTENING_PACK_SIZE,
};
// Banque de questions par article (5 sont tirées au hasard à chaque quiz).
export const QUESTIONS_PER_ARTICLE = 25;
export const QUIZ_DRAW_SIZE = 5;

export const WRITING_PROMPTS_PER_LEVEL = 30;

// Budget de temps indicatif pour la rédaction, par niveau (minutes) —
// inspiré des durées d'épreuve DELF/DALF, pris large ("temps min").
export const WRITING_TIME_BUDGET_MINUTES: Record<string, number> = {
  A1: 10,
  A2: 15,
  B1: 20,
  B2: 25,
};

export const DOMAIN_WEIGHTS = {
  listening: 0.22,
  phrases: 0.18,
  vocabulary: 0.17,
  writing: 0.13,
  conjugation: 0.1,
  grammar: 0.1,
  conversation: 0.1,
};

// Conversation : nombre de situations différentes (scénarios, discussion libre…)
// réussies (dernière note >= 70) pour considérer le domaine "acquis" au niveau.
export const CONVERSATION_TARGET_THEMES = 6;
export const CONVERSATION_MASTERY_SCORE = 70;

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


// ---------------------------------------------------------
// Grammaire : thèmes par langue. Les thèmes ci-dessus (articles, genre, accord…) n'ont aucun sens
// en japonais (pas d'articles, de genre ni d'accords) : le japonais a ses propres fiches.
// ---------------------------------------------------------
export type GrammarTopicMeta = { code: string; label: string; level?: string; hint?: string };

export const JA_GRAMMAR_TOPICS: GrammarTopicMeta[] = [
  { code: 'ja_desu', level: 'A1', label: 'です / じゃありません : dire « c\'est… » (A1)', hint: "phrases nominales : AはBです, négation じゃありません / ではありません, passé でした, question か, politesse de base" },
  { code: 'ja_wa_ga', level: 'A1', label: 'Les particules は et が : thème et sujet (A1)', hint: "は marque le thème (ce dont on parle), が le sujet ; différences de sens, cas typiques (nouvelle information, question avec だれ/なに, 好き/できる)" },
  { code: 'ja_particles', level: 'A1', label: 'Les particules を, に, で, へ (A1)', hint: "を complément d'objet ; に destination/temps/lieu d'existence ; で lieu de l'action/moyen ; へ direction ; exemples avec verbes courants" },
  { code: 'ja_no_to_mo_ka', level: 'A1', label: 'の, と, も, か : possession, « et », « aussi », question (A1)', hint: "の possession/apposition ; と « et » entre noms et « avec » ; も « aussi » ; か question ; や « et (liste non exhaustive) »" },
  { code: 'ja_kosoado', level: 'A1', label: 'これ・それ・あれ, この・その・あの, ここ・そこ・あそこ (A1)', hint: "démonstratifs de proximité (moi / toi / loin des deux), pronoms vs adjectifs, lieux, どれ・どの・どこ" },
  { code: 'ja_arimasu', level: 'A1', label: 'あります / います : exister, se trouver (A1)', hint: "あります (choses) vs います (êtres animés), particule に pour le lieu, lieux relatifs (上・下・前・後ろ・となり), négation ありません/いません" },
  { code: 'ja_masu', level: 'A1', label: 'Le verbe poli en ます : présent, négatif, passé (A1)', hint: "ordre sujet-objet-verbe, ます / ません / ました / ませんでした, ましょう et ませんか pour inviter, présent = futur" },
  { code: 'ja_adjectives', level: 'A2', label: 'Adjectifs en い et en な (A2)', hint: "adjectifs en い (négatif くない, passé かった) et en な (な devant un nom, じゃない, だった), adverbes く/に, adjectif + です" },
  { code: 'ja_te_form', level: 'A2', label: 'La forme en て : enchaîner, demander, être en train de (A2)', hint: "formation par groupe, 〜てください, 〜ています (action en cours / état), enchaîner des actions avec て, 〜てもいいです, 〜てはいけません" },
  { code: 'ja_plain_form', level: 'A2', label: 'La forme familière : dictionnaire, ない, た (A2)', hint: "différence poli / familier, forme du dictionnaire, ない, た, なかった, adjectifs et です au style familier, quand l'utiliser" },
  { code: 'ja_tai_mashou', level: 'A2', label: 'Vouloir, proposer, avoir l\'intention : 〜たい, 〜ましょう, 〜つもり (A2)', hint: "〜たい (vouloir faire, が/を), 〜ましょう/〜ませんか, 〜つもりです, 〜ほうがいい, 〜でしょう" },
  { code: 'ja_counters', level: 'A2', label: 'Nombres et compteurs : 〜つ, 〜人, 〜個, 〜枚… (A2)', hint: "nombres, compteurs courants (つ, 人, 個, 枚, 本, 台, 回, 歳), place du compteur dans la phrase, lectures irrégulières (一人, 二人, 三本)" },
  { code: 'ja_conditional', level: 'B1', label: 'La condition : 〜たら, 〜ば, 〜と, 〜なら (B1)', hint: "quatre façons d'exprimer « si/quand », formation et différences de nuance" },
  { code: 'ja_potential_passive', level: 'B1', label: 'Le potentiel et le passif (B1)', hint: "forme potentielle (pouvoir) par groupe, が avec le potentiel, passif (られる) pour subir ou pour le passif neutre, agent avec に" },
  { code: 'ja_causative_keigo', level: 'B2', label: 'Le causatif et la politesse élevée (敬語) (B2)', hint: "causatif (faire faire / laisser faire), causatif-passif (être forcé), sonkeigo (お〜になる, なさる, いらっしゃる), kenjōgo (お〜する, いたす, 参る), quand les employer" },
];

export function grammarTopicsFor(languageCode: string): readonly GrammarTopicMeta[] {
  return languageCode === 'ja' ? JA_GRAMMAR_TOPICS : GRAMMAR_TOPICS;
}

// Catégories de kanji (filtre « thème » de l'onglet Kanji). Distinctes des thèmes de vocabulaire :
// un kanji se range par sens (nature, corps, temps…), pas par situation (restaurant, hôtel…).
export const KANJI_CATEGORIES = [
  { code: 'numbers', label: 'Nombres et quantités' },
  { code: 'time', label: 'Temps et calendrier' },
  { code: 'nature', label: 'Nature et météo' },
  { code: 'animals_plants', label: 'Animaux et plantes' },
  { code: 'body', label: 'Corps et santé' },
  { code: 'people', label: 'Personnes et famille' },
  { code: 'school', label: 'École, langue et communication' },
  { code: 'places', label: 'Lieux, ville et pays' },
  { code: 'transport', label: 'Déplacement et transport' },
  { code: 'food', label: 'Nourriture et boissons' },
  { code: 'colors_size', label: 'Couleurs, tailles et positions' },
  { code: 'actions', label: 'Actions et verbes courants' },
  { code: 'society', label: 'Travail, société et argent' },
  { code: 'objects', label: 'Objets, maison et vêtements' },
  { code: 'abstract', label: 'Idées, sentiments et qualités' },
] as const;
