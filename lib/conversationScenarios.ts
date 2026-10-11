// Module pur (pas de 'use server') : scénarios de jeu de rôle pour l'onglet
// Conversation. Chaque scénario a un rôle pour l'IA et 2-3 objectifs concrets
// pour l'apprenant (affichés avant la séance, jugés à la fin).

import type { LevelCode } from './constants';

export type ConversationScenario = {
  code: string;
  emoji: string;
  label: string;
  aiRole: string; // rôle joué par l'IA
  situation: string; // contexte (en français, injecté dans le prompt)
  objectives: string[]; // objectifs de l'apprenant, en français
  minLevel: LevelCode; // niveau conseillé (l'IA adapte sa difficulté au niveau choisi, tout reste accessible)
  category: ScenarioCategory;
};

export type ScenarioCategory = 'daily' | 'travel' | 'teen' | 'debate';

export const SCENARIO_CATEGORIES: { code: ScenarioCategory; label: string }[] = [
  { code: 'daily', label: '🏠 Vie quotidienne' },
  { code: 'travel', label: '🧳 Voyage et sorties' },
  { code: 'teen', label: '🎮 Ados et loisirs' },
  { code: 'debate', label: '💬 Débats et avenir' },
];

const LEVEL_ORDER: LevelCode[] = ['A1', 'A2', 'B1', 'B2'];

export const SCENARIOS: ConversationScenario[] = [
  {
    code: 'restaurant', category: 'travel', emoji: '🍽️', label: 'Au restaurant', minLevel: 'A1',
    aiRole: 'serveur ou serveuse',
    situation: "L'apprenant dîne dans un restaurant et passe commande.",
    objectives: ['Commander un plat et une boisson', 'Poser une question sur le menu', "Demander l'addition"],
  },
  {
    code: 'introductions', category: 'daily', emoji: '👋', label: 'Faire connaissance', minLevel: 'A1',
    aiRole: 'une personne rencontrée à une fête',
    situation: "L'apprenant rencontre quelqu'un pour la première fois.",
    objectives: ['Se présenter (nom, âge, ville)', 'Parler de sa famille ou de ses loisirs', 'Poser une question à son interlocuteur'],
  },
  {
    code: 'shopping', category: 'daily', emoji: '🛍️', label: 'Faire des achats', minLevel: 'A1',
    aiRole: 'vendeur ou vendeuse dans une boutique de vêtements',
    situation: "L'apprenant cherche un vêtement dans une boutique.",
    objectives: ['Demander un article précis (taille, couleur)', 'Demander le prix', 'Décider d\'acheter ou non'],
  },
  {
    code: 'directions', category: 'travel', emoji: '🧭', label: 'Demander son chemin', minLevel: 'A1',
    aiRole: 'un passant dans la rue',
    situation: "L'apprenant est perdu en ville et cherche un endroit précis.",
    objectives: ['Demander où se trouve un lieu', "Comprendre l'itinéraire et le reformuler", 'Remercier'],
  },
  {
    code: 'transport', category: 'travel', emoji: '🚆', label: 'Acheter un billet', minLevel: 'A1',
    aiRole: 'employé(e) au guichet de la gare',
    situation: "L'apprenant veut acheter un billet de train ou de bus.",
    objectives: ['Indiquer sa destination', "Préciser l'horaire ou la date", 'Demander le prix et la durée'],
  },
  {
    code: 'hotel', category: 'travel', emoji: '🏨', label: "À l'hôtel", minLevel: 'A2',
    aiRole: "réceptionniste d'un hôtel",
    situation: "L'apprenant arrive à l'hôtel pour s'enregistrer.",
    objectives: ['Donner sa réservation ou demander une chambre', "Poser une question (petit-déjeuner, wifi…)", 'Signaler un petit problème'],
  },
  {
    code: 'health', category: 'daily', emoji: '🩺', label: 'Chez le médecin', minLevel: 'A2',
    aiRole: 'médecin',
    situation: "L'apprenant consulte parce qu'il ne se sent pas bien.",
    objectives: ['Décrire ses symptômes', 'Dire depuis quand', 'Comprendre un conseil et le répéter'],
  },
  {
    code: 'weekend', category: 'teen', emoji: '🗓️', label: 'Parler du week-end', minLevel: 'A2',
    aiRole: 'un(e) collègue ou ami(e)',
    situation: "Discussion informelle sur ce que chacun a fait ou va faire ce week-end.",
    objectives: ['Raconter ce qu\'il a fait (passé)', 'Parler de ses projets (futur)', "Donner son avis"],
  },
  {
    code: 'phone', category: 'daily', emoji: '📱', label: 'Un problème de téléphone', minLevel: 'A2',
    aiRole: "conseiller(ère) du service client d'un opérateur",
    situation: "L'apprenant appelle car son téléphone ou sa connexion a un problème.",
    objectives: ['Expliquer le problème', 'Répondre aux questions du conseiller', 'Se mettre d\'accord sur une solution'],
  },
  {
    code: 'emergency', category: 'travel', emoji: '🚨', label: 'Un imprévu', minLevel: 'A2',
    aiRole: "un agent d'accueil ou un policier",
    situation: "L'apprenant a perdu son portefeuille ou son sac et demande de l'aide.",
    objectives: ['Expliquer ce qui est arrivé', "Décrire l'objet perdu", 'Donner ses coordonnées'],
  },
  {
    code: 'job_interview', category: 'debate', emoji: '💼', label: "Entretien d'embauche", minLevel: 'B1',
    aiRole: 'recruteur ou recruteuse',
    situation: "L'apprenant passe un entretien pour un petit job.",
    objectives: ['Parler de son parcours ou de ses études', 'Expliquer pourquoi il veut ce poste', 'Poser une question sur le poste'],
  },
  {
    code: 'debate_social', category: 'debate', emoji: '💬', label: 'Débat : les réseaux sociaux', minLevel: 'B1',
    aiRole: 'un(e) ami(e) qui a un avis différent',
    situation: "Discussion d'opinion : les réseaux sociaux sont-ils bons ou mauvais pour les jeunes ?",
    objectives: ['Donner son opinion avec une raison', 'Réagir à un argument opposé', 'Conclure'],
  },
  {
    code: 'debate_travel', category: 'debate', emoji: '✈️', label: 'Débat : voyager aujourd\'hui', minLevel: 'B1',
    aiRole: 'un(e) ami(e) curieux(se)',
    situation: "Discussion d'opinion : faut-il voyager moins loin pour protéger la planète ?",
    objectives: ['Exposer son point de vue', 'Donner un exemple personnel', 'Nuancer ou proposer un compromis'],
  },
  {
    code: 'debate_remote', category: 'debate', emoji: '🏠', label: 'Débat : le télétravail', minLevel: 'B2',
    aiRole: 'un(e) collègue sceptique',
    situation: "Discussion d'opinion : le télétravail est-il l'avenir du travail ?",
    objectives: ['Défendre une position avec des arguments', 'Répondre à une objection', 'Proposer une solution équilibrée'],
  },

  // --- Ajouts : idées pour les ados et la vie de tous les jours ---
  { code: 'cafe', category: 'daily', emoji: '☕', label: 'Au café ou à la boulangerie', minLevel: 'A1', aiRole: 'serveur ou boulanger',
    situation: "L'apprenant commande une boisson et quelque chose à manger.",
    objectives: ['Commander une boisson', 'Choisir quelque chose à manger', 'Payer'] },
  { code: 'school_day', category: 'teen', emoji: '🏫', label: 'Ma journée à l\'école', minLevel: 'A1', aiRole: 'un(e) camarade de classe',
    situation: "Deux élèves parlent de leur journée à l'école.",
    objectives: ['Dire quelles matières il aime ou n\'aime pas', 'Parler d\'un(e) professeur(e) ou d\'un(e) ami(e)', 'Dire ce qu\'il fait à la récré'] },
  { code: 'family', category: 'daily', emoji: '👨‍👩‍👧', label: 'Parler de ma famille', minLevel: 'A1', aiRole: 'un(e) ami(e) curieux(se)',
    situation: "L'apprenant présente sa famille à un(e) ami(e).",
    objectives: ['Dire qui est dans sa famille', 'Décrire une personne (âge, caractère)', 'Dire ce qu\'ils aiment faire ensemble'] },
  { code: 'pets', category: 'teen', emoji: '🐶', label: 'Mon animal préféré', minLevel: 'A1', aiRole: 'un(e) ami(e) qui adore les animaux',
    situation: "Discussion sur les animaux de compagnie (ou l'animal dont on rêve).",
    objectives: ['Dire quel animal il a ou voudrait avoir', 'Le décrire', 'Expliquer pourquoi il l\'aime'] },
  { code: 'hobbies', category: 'teen', emoji: '🎨', label: 'Mes loisirs', minLevel: 'A1', aiRole: 'un(e) ami(e) qui cherche une activité',
    situation: "On parle de ce qu'on aime faire pendant son temps libre.",
    objectives: ['Dire deux loisirs qu\'il pratique', 'Dire à quelle fréquence', 'Proposer une activité à faire ensemble'] },
  { code: 'videogames', category: 'teen', emoji: '🎮', label: 'Jeux vidéo', minLevel: 'A1', aiRole: 'un(e) ami(e) gamer',
    situation: "Discussion sur les jeux vidéo préférés.",
    objectives: ['Dire à quel jeu il joue', 'Expliquer ce qu\'il aime dans ce jeu', 'Proposer de jouer ensemble'] },
  { code: 'music', category: 'teen', emoji: '🎧', label: 'Ma musique préférée', minLevel: 'A1', aiRole: 'un(e) ami(e) qui aime la musique',
    situation: "On échange sur les chanteurs, groupes et styles de musique préférés.",
    objectives: ['Dire quel style ou quel artiste il aime', 'Dire quand il écoute de la musique', 'Recommander une chanson'] },
  { code: 'weather', category: 'daily', emoji: '☀️', label: 'Parler de la météo', minLevel: 'A1', aiRole: 'un(e) voisin(e) sympathique',
    situation: "Petite conversation sur le temps qu'il fait et les saisons.",
    objectives: ['Dire quel temps il fait', 'Dire sa saison préférée', 'Dire ce qu\'il fait quand il pleut ou qu\'il fait beau'] },
  { code: 'food_fav', category: 'daily', emoji: '🍕', label: 'Mes plats préférés', minLevel: 'A1', aiRole: 'un(e) ami(e) gourmand(e)',
    situation: "Discussion sur ce qu'on aime manger et ce qu'on déteste.",
    objectives: ['Dire ce qu\'il aime et n\'aime pas', 'Décrire son plat préféré', 'Proposer un repas à partager'] },
  { code: 'birthday', category: 'teen', emoji: '🎂', label: 'Organiser une fête d\'anniversaire', minLevel: 'A1', aiRole: 'un(e) ami(e) qui aide à organiser',
    situation: "L'apprenant prépare une fête d'anniversaire avec un(e) ami(e).",
    objectives: ['Dire la date et le nombre d\'invités', 'Choisir quoi manger et boire', 'Proposer une activité ou de la musique'] },
  { code: 'friends_outing', category: 'teen', emoji: '🎳', label: 'Organiser une sortie entre amis', minLevel: 'A2', aiRole: 'un(e) ami(e) indécis(e)',
    situation: "Deux amis cherchent une activité pour samedi (cinéma, bowling, parc…).",
    objectives: ['Proposer une activité', 'Accepter ou refuser poliment une idée', 'Fixer l\'heure et le lieu'] },
  { code: 'social_apps', category: 'teen', emoji: '📲', label: 'Mes applis et réseaux', minLevel: 'A2', aiRole: 'un(e) ami(e) toujours sur son téléphone',
    situation: "On parle des applis et réseaux sociaux utilisés au quotidien.",
    objectives: ['Dire quelles applis il utilise', 'Dire combien de temps il y passe', 'Donner un avantage ou un inconvénient'] },
  { code: 'sport_match', category: 'teen', emoji: '⚽', label: 'Parler de sport', minLevel: 'A2', aiRole: 'un(e) supporter',
    situation: "Discussion sur un sport pratiqué ou un match regardé récemment.",
    objectives: ['Dire quel sport il pratique ou suit', 'Raconter un match ou un entraînement', 'Dire son équipe ou son sportif préféré'] },
  { code: 'movies', category: 'teen', emoji: '🎬', label: 'Un film ou une série', minLevel: 'A2', aiRole: 'un(e) ami(e) cinéphile',
    situation: "On échange sur un film ou une série vu récemment.",
    objectives: ['Dire le titre et de quoi ça parle', 'Donner son avis', 'Recommander (ou déconseiller) à l\'autre'] },
  { code: 'holidays', category: 'travel', emoji: '🏖️', label: 'Mes dernières vacances', minLevel: 'A2', aiRole: 'un(e) ami(e) qui veut des nouvelles',
    situation: "L'apprenant raconte ses dernières vacances.",
    objectives: ['Dire où il est allé et avec qui', 'Raconter ce qu\'il a fait (passé)', 'Dire ce qu\'il a préféré'] },
  { code: 'exchange_item', category: 'daily', emoji: '🔄', label: 'Échanger un article', minLevel: 'A2', aiRole: 'vendeur ou vendeuse au service client',
    situation: "L'apprenant veut échanger ou rendre un vêtement qui ne va pas.",
    objectives: ['Expliquer le problème (taille, défaut…)', 'Dire ce qu\'il souhaite (échange, remboursement)', 'Se mettre d\'accord'] },
  { code: 'moving_school', category: 'teen', emoji: '🎒', label: 'Nouvel(le) élève', minLevel: 'A2', aiRole: 'un(e) nouvel(le) élève qui vient d\'arriver',
    situation: "L'apprenant accueille un(e) nouvel(le) élève et lui explique le collège ou le lycée.",
    objectives: ['Se présenter et l\'accueillir', 'Expliquer où sont les lieux importants', 'Donner un conseil'] },
  { code: 'future_plans', category: 'debate', emoji: '🚀', label: 'Mes projets d\'avenir', minLevel: 'B1', aiRole: 'un(e) conseiller(ère) d\'orientation',
    situation: "Discussion sur le métier ou les études que l'apprenant imagine.",
    objectives: ['Dire ce qu\'il aimerait faire plus tard', 'Expliquer pourquoi', 'Parler d\'un obstacle et de comment le dépasser'] },
  { code: 'debate_homework', category: 'debate', emoji: '📚', label: 'Débat : faut-il supprimer les devoirs ?', minLevel: 'B1', aiRole: 'un(e) ami(e) qui n\'est pas d\'accord',
    situation: "Discussion d'opinion : les devoirs à la maison sont-ils utiles ?",
    objectives: ['Donner son avis avec une raison', 'Répondre à un argument opposé', 'Proposer une alternative'] },
  { code: 'debate_gaming', category: 'debate', emoji: '🕹️', label: 'Débat : les jeux vidéo, un problème ?', minLevel: 'B1', aiRole: 'un parent inquiet',
    situation: "Discussion d'opinion : les jeux vidéo sont-ils bons ou mauvais pour les jeunes ?",
    objectives: ['Défendre son point de vue', 'Rassurer ou nuancer', 'Trouver un compromis (temps de jeu)'] },
  { code: 'debate_phones_school', category: 'debate', emoji: '📵', label: 'Débat : téléphones interdits à l\'école ?', minLevel: 'B1', aiRole: 'un(e) professeur(e)',
    situation: "Discussion d'opinion : faut-il interdire le téléphone portable au collège et au lycée ?",
    objectives: ['Donner son opinion', 'Donner un exemple concret', 'Répondre à une objection'] },
  { code: 'debate_ai', category: 'debate', emoji: '🤖', label: 'Débat : l\'IA à l\'école', minLevel: 'B2', aiRole: 'un(e) enseignant(e) curieux(se)',
    situation: "Discussion d'opinion : les élèves devraient-ils utiliser l'intelligence artificielle pour leurs devoirs ?",
    objectives: ['Défendre une position argumentée', 'Répondre à une objection', 'Proposer des règles d\'usage'] },
  { code: 'debate_env', category: 'debate', emoji: '🌍', label: 'Débat : agir pour la planète', minLevel: 'B2', aiRole: 'un(e) ami(e) sceptique',
    situation: "Discussion d'opinion : les gestes individuels suffisent-ils à protéger l'environnement ?",
    objectives: ['Exposer sa position', 'Donner un exemple concret', 'Nuancer et conclure'] },
];

/** Tous les scénarios restent accessibles (l'IA adapte sa difficulté au niveau choisi) ; on les trie par niveau conseillé. */
export function scenariosForLevel(levelCode: string): ConversationScenario[] {
  return [...SCENARIOS].sort((a, b) => LEVEL_ORDER.indexOf(a.minLevel) - LEVEL_ORDER.indexOf(b.minLevel));
}

/** true si le scénario est conseillé pour un niveau supérieur à celui de l'apprenant */
export function isAboveLevel(s: ConversationScenario, levelCode: string): boolean {
  return LEVEL_ORDER.indexOf(s.minLevel) > LEVEL_ORDER.indexOf(levelCode as LevelCode);
}

export function getScenario(code: string | null | undefined): ConversationScenario | null {
  if (!code) return null;
  return SCENARIOS.find((s) => s.code === code) ?? null;
}

export const FREE_THEME_CODE = 'free';
export const CUSTOM_THEME_CODE = 'custom';
export const CUSTOM_THEME_MAX_CHARS = 80;
