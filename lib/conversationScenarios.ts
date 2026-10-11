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
  minLevel: LevelCode;
};

const LEVEL_ORDER: LevelCode[] = ['A1', 'A2', 'B1', 'B2'];

export const SCENARIOS: ConversationScenario[] = [
  {
    code: 'restaurant', emoji: '🍽️', label: 'Au restaurant', minLevel: 'A1',
    aiRole: 'serveur ou serveuse',
    situation: "L'apprenant dîne dans un restaurant et passe commande.",
    objectives: ['Commander un plat et une boisson', 'Poser une question sur le menu', "Demander l'addition"],
  },
  {
    code: 'introductions', emoji: '👋', label: 'Faire connaissance', minLevel: 'A1',
    aiRole: 'une personne rencontrée à une fête',
    situation: "L'apprenant rencontre quelqu'un pour la première fois.",
    objectives: ['Se présenter (nom, âge, ville)', 'Parler de sa famille ou de ses loisirs', 'Poser une question à son interlocuteur'],
  },
  {
    code: 'shopping', emoji: '🛍️', label: 'Faire des achats', minLevel: 'A1',
    aiRole: 'vendeur ou vendeuse dans une boutique de vêtements',
    situation: "L'apprenant cherche un vêtement dans une boutique.",
    objectives: ['Demander un article précis (taille, couleur)', 'Demander le prix', 'Décider d\'acheter ou non'],
  },
  {
    code: 'directions', emoji: '🧭', label: 'Demander son chemin', minLevel: 'A1',
    aiRole: 'un passant dans la rue',
    situation: "L'apprenant est perdu en ville et cherche un endroit précis.",
    objectives: ['Demander où se trouve un lieu', "Comprendre l'itinéraire et le reformuler", 'Remercier'],
  },
  {
    code: 'transport', emoji: '🚆', label: 'Acheter un billet', minLevel: 'A1',
    aiRole: 'employé(e) au guichet de la gare',
    situation: "L'apprenant veut acheter un billet de train ou de bus.",
    objectives: ['Indiquer sa destination', "Préciser l'horaire ou la date", 'Demander le prix et la durée'],
  },
  {
    code: 'hotel', emoji: '🏨', label: "À l'hôtel", minLevel: 'A2',
    aiRole: "réceptionniste d'un hôtel",
    situation: "L'apprenant arrive à l'hôtel pour s'enregistrer.",
    objectives: ['Donner sa réservation ou demander une chambre', "Poser une question (petit-déjeuner, wifi…)", 'Signaler un petit problème'],
  },
  {
    code: 'health', emoji: '🩺', label: 'Chez le médecin', minLevel: 'A2',
    aiRole: 'médecin',
    situation: "L'apprenant consulte parce qu'il ne se sent pas bien.",
    objectives: ['Décrire ses symptômes', 'Dire depuis quand', 'Comprendre un conseil et le répéter'],
  },
  {
    code: 'weekend', emoji: '🗓️', label: 'Parler du week-end', minLevel: 'A2',
    aiRole: 'un(e) collègue ou ami(e)',
    situation: "Discussion informelle sur ce que chacun a fait ou va faire ce week-end.",
    objectives: ['Raconter ce qu\'il a fait (passé)', 'Parler de ses projets (futur)', "Donner son avis"],
  },
  {
    code: 'phone', emoji: '📱', label: 'Un problème de téléphone', minLevel: 'A2',
    aiRole: "conseiller(ère) du service client d'un opérateur",
    situation: "L'apprenant appelle car son téléphone ou sa connexion a un problème.",
    objectives: ['Expliquer le problème', 'Répondre aux questions du conseiller', 'Se mettre d\'accord sur une solution'],
  },
  {
    code: 'emergency', emoji: '🚨', label: 'Un imprévu', minLevel: 'A2',
    aiRole: "un agent d'accueil ou un policier",
    situation: "L'apprenant a perdu son portefeuille ou son sac et demande de l'aide.",
    objectives: ['Expliquer ce qui est arrivé', "Décrire l'objet perdu", 'Donner ses coordonnées'],
  },
  {
    code: 'job_interview', emoji: '💼', label: "Entretien d'embauche", minLevel: 'B1',
    aiRole: 'recruteur ou recruteuse',
    situation: "L'apprenant passe un entretien pour un petit job.",
    objectives: ['Parler de son parcours ou de ses études', 'Expliquer pourquoi il veut ce poste', 'Poser une question sur le poste'],
  },
  {
    code: 'debate_social', emoji: '💬', label: 'Débat : les réseaux sociaux', minLevel: 'B1',
    aiRole: 'un(e) ami(e) qui a un avis différent',
    situation: "Discussion d'opinion : les réseaux sociaux sont-ils bons ou mauvais pour les jeunes ?",
    objectives: ['Donner son opinion avec une raison', 'Réagir à un argument opposé', 'Conclure'],
  },
  {
    code: 'debate_travel', emoji: '✈️', label: 'Débat : voyager aujourd\'hui', minLevel: 'B1',
    aiRole: 'un(e) ami(e) curieux(se)',
    situation: "Discussion d'opinion : faut-il voyager moins loin pour protéger la planète ?",
    objectives: ['Exposer son point de vue', 'Donner un exemple personnel', 'Nuancer ou proposer un compromis'],
  },
  {
    code: 'debate_remote', emoji: '🏠', label: 'Débat : le télétravail', minLevel: 'B2',
    aiRole: 'un(e) collègue sceptique',
    situation: "Discussion d'opinion : le télétravail est-il l'avenir du travail ?",
    objectives: ['Défendre une position avec des arguments', 'Répondre à une objection', 'Proposer une solution équilibrée'],
  },
];

export function scenariosForLevel(levelCode: string): ConversationScenario[] {
  const idx = LEVEL_ORDER.indexOf(levelCode as LevelCode);
  return SCENARIOS.filter((s) => LEVEL_ORDER.indexOf(s.minLevel) <= (idx < 0 ? 0 : idx));
}

export function getScenario(code: string | null | undefined): ConversationScenario | null {
  if (!code) return null;
  return SCENARIOS.find((s) => s.code === code) ?? null;
}

export const FREE_THEME_CODE = 'free';
export const CUSTOM_THEME_CODE = 'custom';
export const CUSTOM_THEME_MAX_CHARS = 80;
