import type { CSSProperties } from 'react';
import { EXTRA_THEMES, THEME_OVERRIDES, THEME_ORDER } from './themes.extra';

// Habillages (thèmes) de l'écran d'accueil de l'animateur.
// Un thème = une image de fond + les zones où se placent les écrans (en % de l'image)
// + les images des modes (« planètes ») et des boutons (« plates »).
// Le thème « espace » reprend exactement l'habillage historique : rien ne change tant qu'on ne choisit pas autre chose.

export type ThemeId = string; // 'espace', 'jungle', 'marins'… : voir THEMES
export type ModeId = 'classique' | 'defi' | 'survie' | 'participatif' | 'camembert';

export type PlateId =
  | 'fusee' // démarrer la partie
  | 'suivante' // question suivante
  | 'stats'
  | 'parametrage'
  | 'progression'
  | 'nouvelle'
  | 'quitter'
  | 'plein'
  | 'valider'
  | 'annuler'
  | 'profil';

// Zone rectangulaire, en % de la scène
export type Rect = { left: number; top: number; width: number; height: number };

export type PlateDef = {
  src: string | null; // null = pas d'image (le décor porte déjà le cadre), seul le contenu est affiché
  ratio: number; // largeur / hauteur de l'image
  scale?: number; // multiplicateur de la hauteur demandée (défaut 1)
  boxStyle?: CSSProperties; // habillage CSS du bouton lui-même (utile quand il n'y a pas d'image)
};

export type FrameDef = { src: string; ratio: number; width: number /* en cqw */ };

export type Theme = {
  id: ThemeId;
  layout?: 'stage' | 'sober'; // 'sober' : disposition sobre sans décor (components/SoberConsole.tsx) ; sinon scène cockpit à zones
  label: string;
  emoji: string;
  description: string;
  preview: string;
  stage: { src: string; ratio: number; bg: string };
  stageByMode?: Partial<Record<ModeId, { src: string }>>; // fond différent selon le mode de jeu actif (même ratio que `stage`) ; `stage` sert de repli
  zones: {
    teams: Rect; // écran gauche : liste des équipes
    teamCount: Rect; // petit afficheur : nombre d'équipes
    join: Rect; // écran droit : QR / explication
    code: Rect; // petit afficheur : code de la partie
    hub: Rect; // hublot central : modes ou jeu
    bar: Rect; // pupitre des boutons
    profile: { left: number; top: number }; // bandeau du profil : centre horizontal et haut, en %
    modes?: Rect; // icônes des modes (indépendantes du hublot) ; par défaut, calée sur le haut du hublot
  };
  hubStyle?: CSSProperties; // fond du hublot central quand le décor n'en fournit pas
  sidePanelStyle?: CSSProperties; // fond des panneaux gauche/droite quand le décor est trop clair pour le texte
  joinPadTop: number; // cqw : espace au-dessus du QR
  qrWidth: number; // cqw
  bar: { background: string; border: string; boxShadow: string };
  planets: Record<ModeId, { src: string | null; width: number /* cqw */ }>;
  plates: Record<PlateId, PlateDef>;
  frames: { progress: FrameDef; msg: FrameDef };
};

export const rectStyle = (r: Rect) => ({ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` });

// ───────────────────────── Espace (habillage d'origine) ─────────────────────────
const espacePlate = (id: string, ratio: number): PlateDef => ({ src: `/ui/plate-${id}.webp`, ratio });

const espace: Theme = {
  id: 'espace',
  label: 'Espace',
  emoji: '🚀',
  description: 'Le cockpit spatial d’origine.',
  preview: '/themes/espace/preview.webp',
  stage: { src: '/cockpit.webp', ratio: 1536 / 944, bg: '#03040c' },
  zones: {
    teams: { left: 1.6, top: 14.3, width: 13.4, height: 26.5 },
    teamCount: { left: 2, top: 42.3, width: 13, height: 3.6 },
    join: { left: 84.6, top: 14.3, width: 14, height: 26.5 },
    code: { left: 85.3, top: 42.3, width: 13, height: 3.6 },
    hub: { left: 20, top: 11.7, width: 60, height: 33.9 },
    bar: { left: 7, top: 88.6, width: 86, height: 9.6 },
    profile: { left: 50, top: 2.2 },
  },
  joinPadTop: 3.4,
  qrWidth: 8,
  bar: {
    background: 'linear-gradient(180deg, rgba(8,16,55,0.55), rgba(4,8,30,0.75))',
    border: '1px solid rgba(90,140,255,0.35)',
    boxShadow: '0 0 1.5cqw rgba(40,90,220,0.3), inset 0 0.1cqw 0.3cqw rgba(140,180,255,0.2)',
  },
  planets: {
    classique: { src: '/planets/classique.png', width: 11.2 },
    defi: { src: '/planets/defi.png', width: 8.2 },
    survie: { src: '/planets/survie.png', width: 8.6 },
    participatif: { src: '/planets/participatif.png', width: 10.9 },
    camembert: { src: '/planets/camembert.png', width: 8.2 },
  },
  plates: {
    fusee: espacePlate('fusee', 1.28),
    suivante: espacePlate('suivante', 1.28),
    stats: espacePlate('stats', 1.284),
    parametrage: espacePlate('parametrage', 1.292),
    progression: espacePlate('progression', 1.292),
    nouvelle: espacePlate('nouvelle', 1.304),
    quitter: espacePlate('quitter', 1.28),
    plein: espacePlate('plein', 1.321),
    valider: espacePlate('valider', 1.317),
    annuler: espacePlate('annuler', 1.308),
    profil: { src: '/ui/banner-profil.webp', ratio: 7.33 },
  },
  frames: {
    progress: { src: '/ui/frame-espace.webp', ratio: 1400 / 788, width: 76 },
    msg: { src: '/ui/frame-terre.webp', ratio: 1400 / 788, width: 54 },
  },
};

// ───────────────────────── Jungle ─────────────────────────
const C_jungle = '/themes/jungle';
const jungleGlass = {
  background: 'linear-gradient(180deg, rgba(6,28,14,0.72), rgba(6,28,14,0.8))',
  border: '2px solid rgba(160,230,110,0.65)',
  boxShadow: '0 0 2cqw rgba(160,230,110,0.28), inset 0 0 1.4cqw rgba(160,230,110,0.16)',
};

const jungle: Theme = {
  id: 'jungle',
  label: 'Jungle',
  emoji: '🌴',
  description: 'Un cockpit rouillé envahi par la jungle : lianes, toucan et temples perdus.',
  preview: `${C_jungle}/preview.webp`,
  stage: { src: `${C_jungle}/stage.webp`, ratio: 1.7768, bg: '#0a1a0c' },
  zones: {
    teams: { left: 3.4, top: 49.5, width: 14, height: 24 },
    teamCount: { left: 3.4, top: 74.4, width: 14, height: 3.5 },
    join: { left: 82.9, top: 49.5, width: 13.8, height: 24.5 },
    code: { left: 82.9, top: 74.4, width: 13.8, height: 3.5 },
    hub: { left: 22, top: 14, width: 56, height: 42 },
    bar: { left: 19, top: 82, width: 62, height: 15 },
    profile: { left: 50, top: 3.2 },
  },
  hubStyle: { background: 'radial-gradient(ellipse at center, rgba(6,28,12,0.6) 0%, rgba(6,28,12,0.36) 55%, rgba(6,28,12,0) 100%)', textShadow: '0 1px 4px rgba(0,20,4,0.95), 0 0 10px rgba(0,20,4,0.8)' },
  joinPadTop: 2.2,
  qrWidth: 8.6,
  bar: { ...jungleGlass, background: 'linear-gradient(180deg, rgba(6,28,14,0.62), rgba(6,28,14,0.78))' },
  planets: {
    classique: { src: `${C_jungle}/icons/classique.webp`, width: 7.9 },
    defi: { src: `${C_jungle}/icons/defi.webp`, width: 8.5 },
    survie: { src: `${C_jungle}/icons/survie.webp`, width: 9.2 },
    participatif: { src: `${C_jungle}/icons/participatif.webp`, width: 8.6 },
    camembert: { src: `${C_jungle}/icons/camembert.webp`, width: 8.6 },
  },
  plates: {
    fusee: { src: `${C_jungle}/icons/fusee.webp`, ratio: 0.957, scale: 1.3 },
    suivante: { src: `${C_jungle}/icons/suivante.webp`, ratio: 0.903, scale: 1.3 },
    stats: { src: `${C_jungle}/icons/stats.webp`, ratio: 0.942, scale: 1.3 },
    parametrage: { src: `${C_jungle}/icons/parametrage.webp`, ratio: 0.942, scale: 1.3 },
    progression: { src: `${C_jungle}/icons/progression.webp`, ratio: 0.977, scale: 1.3 },
    nouvelle: { src: `${C_jungle}/icons/nouvelle.webp`, ratio: 0.973, scale: 1.3 },
    quitter: { src: `${C_jungle}/icons/quitter.webp`, ratio: 1.0, scale: 1.3 },
    plein: { src: `${C_jungle}/icons/plein.webp`, ratio: 1.0, scale: 1.3 },
    valider: { src: `${C_jungle}/icons/valider.webp`, ratio: 0.955, scale: 1.3 },
    annuler: { src: `${C_jungle}/icons/annuler.webp`, ratio: 1.0, scale: 1.3 },
    profil: { src: null, ratio: 6.33, boxStyle: { ...jungleGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${C_jungle}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${C_jungle}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Fonds marins ─────────────────────────
const M = '/themes/marins';
const mIcon = (name: string, ratio = 1, scale = 1.3): PlateDef => ({ src: `${M}/icons/${name}.webp`, ratio, scale });
const marinGlass = {
  background: 'linear-gradient(180deg, rgba(4,26,54,0.72), rgba(3,16,38,0.8))',
  border: '2px solid rgba(90,210,255,0.6)',
  boxShadow: '0 0 2cqw rgba(40,170,255,0.35), inset 0 0 1.4cqw rgba(120,220,255,0.18)',
};

const marins: Theme = {
  id: 'marins',
  label: 'Fonds marins',
  emoji: '🐠',
  description: 'Une cité engloutie, des rayons de lumière et des récifs colorés.',
  preview: `${M}/preview.webp`,
  stage: { src: `${M}/stage.webp`, ratio: 1672 / 941, bg: '#04223f' },
  zones: {
    teams: { left: 3.1, top: 30, width: 14.2, height: 29 },
    teamCount: { left: 3.1, top: 60.3, width: 14.2, height: 3.6 },
    join: { left: 82.8, top: 30, width: 14.2, height: 29.5 },
    code: { left: 82.8, top: 61, width: 14.2, height: 3.6 },
    hub: { left: 22, top: 17, width: 56, height: 36 },
    bar: { left: 19, top: 82.5, width: 62, height: 14.5 },
    profile: { left: 50, top: 3.5 },
  },
  // Pas de grand écran central dans le décor : simple halo sombre, sans bord, pour garder le texte lisible
  hubStyle: {
    background: 'radial-gradient(ellipse at center, rgba(2,22,48,0.5) 0%, rgba(2,22,48,0.3) 55%, rgba(2,22,48,0) 100%)',
    textShadow: '0 1px 4px rgba(0,20,50,0.95), 0 0 10px rgba(0,20,50,0.8)',
  },
  joinPadTop: 2.2,
  qrWidth: 8.6,
  bar: { ...marinGlass, background: 'linear-gradient(180deg, rgba(4,26,54,0.62), rgba(3,16,38,0.78))' },
  planets: {
    classique: { src: `${M}/icons/ancre.webp`, width: 8.0 },
    defi: { src: `${M}/icons/requin.webp`, width: 9.5 },
    survie: { src: `${M}/icons/bouteille.webp`, width: 8.5 },
    participatif: { src: `${M}/icons/poissons.webp`, width: 9.6 },
    camembert: { src: `${M}/icons/nautile.webp`, width: 9.2 },
  },
  plates: {
    fusee: mIcon('plongeur', 0.982),
    suivante: mIcon('harpon', 0.987),
    stats: mIcon('nemo', 0.982),
    parametrage: mIcon('oursin', 0.996),
    progression: mIcon('coffre', 0.987),
    nouvelle: mIcon('coquillage', 0.987),
    quitter: mIcon('pieuvre', 0.996),
    valider: mIcon('valider'),
    annuler: mIcon('annuler'),
    plein: mIcon('plein'),
    // Pas de cadre dans le décor : le bandeau du profil est un panneau vitré
    profil: { src: null, ratio: 6.2, boxStyle: { ...marinGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${M}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${M}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Égypte ─────────────────────────
const G = '/themes/egypte';
const gIcon = (name: string, ratio: number, scale = 1.3): PlateDef => ({ src: `${G}/icons/${name}.webp`, ratio, scale });
const egypteGlass = {
  background: 'linear-gradient(180deg, rgba(34,20,8,0.72), rgba(24,13,5,0.8))',
  border: '2px solid rgba(235,180,70,0.7)',
  boxShadow: '0 0 2cqw rgba(255,180,60,0.3), inset 0 0 1.4cqw rgba(255,210,120,0.18)',
};

const egypte: Theme = {
  id: 'egypte',
  label: 'Égypte',
  emoji: '🏺',
  description: 'Un temple au bord du Nil : colonnes, hiéroglyphes et lumière dorée.',
  preview: `${G}/preview.webp`,
  stage: { src: `${G}/stage.webp`, ratio: 1672 / 941, bg: '#2a1706' },
  zones: {
    teams: { left: 5.9, top: 31, width: 13.6, height: 32 },
    teamCount: { left: 5.9, top: 65.5, width: 13.6, height: 3.6 },
    join: { left: 80.7, top: 31, width: 14, height: 32.5 },
    code: { left: 81, top: 65.5, width: 13.6, height: 3.6 },
    hub: { left: 22, top: 17, width: 56, height: 36 },
    bar: { left: 19, top: 82.5, width: 62, height: 14.5 },
    profile: { left: 50, top: 3.5 },
  },
  // Décor très lumineux : halo brun un peu plus marqué, toujours sans bord
  hubStyle: {
    background: 'radial-gradient(ellipse at center, rgba(34,18,4,0.64) 0%, rgba(34,18,4,0.44) 55%, rgba(34,18,4,0) 100%)',
    textShadow: '0 1px 4px rgba(20,8,0,0.95), 0 0 10px rgba(20,8,0,0.8)',
  },
  // Les stèles sont en pierre claire : on fonce le fond pour le texte clair
  sidePanelStyle: { background: 'rgba(30,16,6,0.74)', border: '1px solid rgba(235,180,70,0.55)', borderRadius: '0.8cqw' },
  joinPadTop: 2.2,
  qrWidth: 8.6,
  bar: { ...egypteGlass, background: 'linear-gradient(180deg, rgba(34,20,8,0.6), rgba(24,13,5,0.78))' },
  planets: {
    classique: { src: `${G}/icons/ankh.webp`, width: 8.6 },
    defi: { src: `${G}/icons/lionne.webp`, width: 8.7 },
    survie: { src: `${G}/icons/oeil.webp`, width: 9.8 },
    participatif: { src: `${G}/icons/papyrus_mains.webp`, width: 9.8 },
    camembert: { src: `${G}/icons/roue.webp`, width: 9.7 },
  },
  plates: {
    fusee: gIcon('faucon', 1.031),
    suivante: gIcon('porte_ouverte', 0.95),
    stats: gIcon('papyrus_faucon', 1.027),
    parametrage: gIcon('scarabee', 0.939),
    progression: gIcon('pyramide', 0.962),
    nouvelle: gIcon('coffre', 1.007),
    quitter: gIcon('porte', 0.886),
    valider: gIcon('valider', 1),
    annuler: gIcon('annuler', 1),
    plein: gIcon('plein', 1),
    profil: { src: null, ratio: 6.2, boxStyle: { ...egypteGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${G}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${G}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Arts ─────────────────────────
const C_art = '/themes/art';
const artGlass = {
  background: 'linear-gradient(180deg, rgba(40,28,68,0.72), rgba(40,28,68,0.8))',
  border: '2px solid rgba(214,164,244,0.65)',
  boxShadow: '0 0 2cqw rgba(214,164,244,0.28), inset 0 0 1.4cqw rgba(214,164,244,0.16)',
};

const art: Theme = {
  id: 'art',
  label: 'Arts',
  emoji: '🎨',
  description: 'Le Louvre en couleurs : pyramide de verre, Joconde, Victoire de Samothrace et couronne royale.',
  preview: `${C_art}/preview.webp`,
  stage: { src: `${C_art}/stage.webp`, ratio: 1672 / 941, bg: '#4a8be8' },
  zones: {
    teams: { left: 2.2, top: 22, width: 15, height: 38 },
    teamCount: { left: 2.2, top: 62, width: 15, height: 4.6 },
    join: { left: 82.8, top: 22, width: 15, height: 38 },
    code: { left: 82.8, top: 62, width: 15, height: 4.6 },
    hub: { left: 22, top: 11, width: 56, height: 52 },
    bar: { left: 19, top: 81, width: 62, height: 15 },
    profile: { left: 50, top: 3.2 },
  },
  hubStyle: { background: 'linear-gradient(180deg, rgba(40,28,68,0.9), rgba(40,28,68,0.93))', border: '2px solid rgba(214,164,244,0.75)', borderRadius: '1.8cqw', boxShadow: '0 0 2cqw rgba(190,130,230,0.35)' },
  sidePanelStyle: { background: 'rgba(40,28,68,0.9)', border: '1px solid rgba(214,164,244,0.6)', borderRadius: '0.8cqw' },
  joinPadTop: 1.6,
  qrWidth: 7,
  bar: { ...artGlass, background: 'linear-gradient(180deg, rgba(40,28,68,0.62), rgba(40,28,68,0.78))' },
  planets: {
    classique: { src: `${C_art}/icons/classique.webp`, width: 8.1 },
    defi: { src: `${C_art}/icons/defi.webp`, width: 8.1 },
    survie: { src: `${C_art}/icons/survie.webp`, width: 8.1 },
    participatif: { src: `${C_art}/icons/participatif.webp`, width: 8.1 },
    camembert: { src: `${C_art}/icons/camembert.webp`, width: 8.1 },
  },
  plates: {
    fusee: { src: `${C_art}/icons/fusee.webp`, ratio: 1.054, scale: 1.3 },
    suivante: { src: `${C_art}/icons/suivante.webp`, ratio: 1.202, scale: 1.3 },
    stats: { src: `${C_art}/icons/stats.webp`, ratio: 0.978, scale: 1.3 },
    parametrage: { src: `${C_art}/icons/parametrage.webp`, ratio: 0.978, scale: 1.3 },
    progression: { src: `${C_art}/icons/progression.webp`, ratio: 1.404, scale: 1.3 },
    nouvelle: { src: `${C_art}/icons/nouvelle.webp`, ratio: 0.837, scale: 1.3 },
    quitter: { src: `${C_art}/icons/quitter.webp`, ratio: 0.962, scale: 1.3 },
    plein: { src: `${C_art}/icons/plein.webp`, ratio: 1.0, scale: 1.3 },
    valider: { src: `${C_art}/icons/valider.webp`, ratio: 1.25, scale: 1.3 },
    annuler: { src: `${C_art}/icons/annuler.webp`, ratio: 1.0, scale: 1.3 },
    profil: { src: null, ratio: 6.33, boxStyle: { ...artGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${C_art}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${C_art}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Inventions ─────────────────────────
const C_inventions = '/themes/inventions';
const inventionsGlass = {
  background: 'linear-gradient(180deg, rgba(36,22,10,0.72), rgba(36,22,10,0.8))',
  border: '2px solid rgba(220,150,70,0.65)',
  boxShadow: '0 0 2cqw rgba(220,150,70,0.28), inset 0 0 1.4cqw rgba(220,150,70,0.16)',
};

const inventions: Theme = {
  id: 'inventions',
  label: 'Inventions',
  emoji: '⚙️',
  description: 'Un atelier steampunk : engrenages, tuyaux de cuivre et éclairs.',
  preview: `${C_inventions}/preview.webp`,
  stage: { src: `${C_inventions}/stage.webp`, ratio: 1.7917, bg: '#241608' },
  zones: {
    teams: { left: 8.2, top: 30.5, width: 12.4, height: 28 },
    teamCount: { left: 8.2, top: 60, width: 12.4, height: 4.6 },
    join: { left: 79, top: 34.8, width: 13.8, height: 25 },
    code: { left: 79, top: 60.2, width: 13.8, height: 4.6 },
    hub: { left: 24, top: 20, width: 52, height: 46 },
    bar: { left: 19, top: 82, width: 62, height: 15 },
    profile: { left: 50, top: 3.2 },
  },
  hubStyle: { background: 'radial-gradient(ellipse at center, rgba(32,18,6,0.8) 0%, rgba(32,18,6,0.52) 55%, rgba(32,18,6,0) 100%)', textShadow: '0 1px 4px rgba(20,8,0,0.95), 0 0 10px rgba(20,8,0,0.8)' },
  sidePanelStyle: { background: 'rgba(36,22,10,0.84)', border: '1px solid rgba(220,150,70,0.6)', borderRadius: '0.8cqw' },
  joinPadTop: 2.2,
  qrWidth: 8,
  bar: { ...inventionsGlass, background: 'linear-gradient(180deg, rgba(36,22,10,0.62), rgba(36,22,10,0.78))' },
  planets: {
    classique: { src: `${C_inventions}/icons/classique.webp`, width: 7.4 },
    defi: { src: `${C_inventions}/icons/defi.webp`, width: 7.8 },
    survie: { src: `${C_inventions}/icons/survie.webp`, width: 8.6 },
    participatif: { src: `${C_inventions}/icons/participatif.webp`, width: 8.1 },
    camembert: { src: `${C_inventions}/icons/camembert.webp`, width: 8.5 },
  },
  plates: {
    fusee: { src: `${C_inventions}/icons/fusee.webp`, ratio: 0.984, scale: 1.3 },
    suivante: { src: `${C_inventions}/icons/suivante.webp`, ratio: 0.933, scale: 1.3 },
    stats: { src: `${C_inventions}/icons/stats.webp`, ratio: 1.004, scale: 1.3 },
    parametrage: { src: `${C_inventions}/icons/parametrage.webp`, ratio: 0.983, scale: 1.3 },
    progression: { src: `${C_inventions}/icons/progression.webp`, ratio: 0.979, scale: 1.3 },
    nouvelle: { src: `${C_inventions}/icons/nouvelle.webp`, ratio: 0.988, scale: 1.3 },
    quitter: { src: `${C_inventions}/icons/quitter.webp`, ratio: 0.975, scale: 1.3 },
    plein: { src: `${C_inventions}/icons/plein.webp`, ratio: 1.0, scale: 1.3 },
    valider: { src: `${C_inventions}/icons/valider.webp`, ratio: 0.96, scale: 1.3 },
    annuler: { src: `${C_inventions}/icons/annuler.webp`, ratio: 1.0, scale: 1.3 },
    profil: { src: null, ratio: 6.33, boxStyle: { ...inventionsGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${C_inventions}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${C_inventions}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Sciences ─────────────────────────
const C_sciences = '/themes/sciences';
const sciencesGlass = {
  background: 'linear-gradient(180deg, rgba(10,22,44,0.72), rgba(10,22,44,0.8))',
  border: '2px solid rgba(90,255,170,0.65)',
  boxShadow: '0 0 2cqw rgba(90,255,170,0.28), inset 0 0 1.4cqw rgba(90,255,170,0.16)',
};

const sciences: Theme = {
  id: 'sciences',
  label: 'Sciences',
  emoji: '🧪',
  description: 'Un laboratoire aux couleurs néon. (Fond blanc provisoire.)',
  preview: `${C_sciences}/preview.webp`,
  stage: { src: '/themes/blanc/stage.webp', ratio: 1.7768, bg: '#ffffff' },
  zones: {
    teams: { left: 3, top: 20, width: 15, height: 38 },
    teamCount: { left: 3, top: 60, width: 15, height: 4 },
    join: { left: 82, top: 20, width: 15, height: 38 },
    code: { left: 82, top: 60, width: 15, height: 4 },
    hub: { left: 22, top: 14, width: 56, height: 44 },
    bar: { left: 19, top: 80, width: 62, height: 15 },
    profile: { left: 50, top: 3.2 },
  },
  hubStyle: { background: 'linear-gradient(180deg, rgba(10,22,44,0.94), rgba(10,22,44,0.96))', border: '2px solid rgba(90,255,170,0.65)', borderRadius: '1.8cqw', boxShadow: '0 0 2cqw rgba(60,230,160,0.3)' },
  sidePanelStyle: { background: 'rgba(10,22,44,0.94)', border: '1px solid rgba(90,255,170,0.55)', borderRadius: '0.8cqw' },
  joinPadTop: 2.2,
  qrWidth: 8.6,
  bar: { ...sciencesGlass, background: 'linear-gradient(180deg, rgba(10,22,44,0.62), rgba(10,22,44,0.78))' },
  planets: {
    classique: { src: `${C_sciences}/icons/classique.webp`, width: 5.6 },
    defi: { src: `${C_sciences}/icons/defi.webp`, width: 9.1 },
    survie: { src: `${C_sciences}/icons/survie.webp`, width: 9.3 },
    participatif: { src: `${C_sciences}/icons/participatif.webp`, width: 9.3 },
    camembert: { src: `${C_sciences}/icons/camembert.webp`, width: 8.9 },
  },
  plates: {
    fusee: { src: `${C_sciences}/icons/fusee.webp`, ratio: 0.992, scale: 1.3 },
    suivante: { src: `${C_sciences}/icons/suivante.webp`, ratio: 0.996, scale: 1.3 },
    stats: { src: `${C_sciences}/icons/stats.webp`, ratio: 0.979, scale: 1.3 },
    parametrage: { src: `${C_sciences}/icons/parametrage.webp`, ratio: 0.975, scale: 1.3 },
    progression: { src: `${C_sciences}/icons/progression.webp`, ratio: 0.983, scale: 1.3 },
    nouvelle: { src: `${C_sciences}/icons/nouvelle.webp`, ratio: 1.009, scale: 1.3 },
    quitter: { src: `${C_sciences}/icons/quitter.webp`, ratio: 0.979, scale: 1.3 },
    plein: { src: `${C_sciences}/icons/plein.webp`, ratio: 1.0, scale: 1.3 },
    valider: { src: `${C_sciences}/icons/valider.webp`, ratio: 0.98, scale: 1.3 },
    annuler: { src: `${C_sciences}/icons/annuler.webp`, ratio: 0.979, scale: 1.3 },
    profil: { src: null, ratio: 6.33, boxStyle: { ...sciencesGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${C_sciences}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${C_sciences}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Centre de la Terre ─────────────────────────
const C_terre = '/themes/terre';
const terreGlass = {
  background: 'linear-gradient(180deg, rgba(4,18,34,0.78), rgba(2,10,24,0.88))',
  border: '2px solid rgba(90,220,255,0.7)',
  boxShadow: '0 0 2cqw rgba(60,200,255,0.3), inset 0 0 1.4cqw rgba(90,220,255,0.14)',
};

const terre: Theme = {
  id: 'terre',
  label: 'Centre de la Terre',
  emoji: '🌋',
  description: 'Une caverne bioluminescente : peintures lumineuses, cristaux, plantes carnivores et ptérodactyle.',
  preview: `${C_terre}/preview.webp`,
  stage: { src: `${C_terre}/stage.webp`, ratio: 1672 / 941, bg: '#030c1a' },
  zones: {
    teams: { left: 2.2, top: 22, width: 15, height: 38 },
    teamCount: { left: 2.2, top: 62, width: 15, height: 4.6 },
    join: { left: 82.8, top: 22, width: 15, height: 38 },
    code: { left: 82.8, top: 62, width: 15, height: 4.6 },
    hub: { left: 22, top: 11, width: 56, height: 52 },
    bar: { left: 19, top: 81, width: 62, height: 15 },
    profile: { left: 50, top: 3.2 },
  },
  hubStyle: { background: 'linear-gradient(180deg, rgba(4,18,34,0.9), rgba(2,10,24,0.94))', border: '2px solid rgba(90,220,255,0.7)', borderRadius: '1.8cqw', boxShadow: '0 0 2cqw rgba(60,200,255,0.35)' },
  sidePanelStyle: { background: 'rgba(4,18,34,0.9)', border: '1px solid rgba(90,220,255,0.6)', borderRadius: '0.8cqw' },
  joinPadTop: 2.2,
  qrWidth: 8.6,
  bar: { ...terreGlass, background: 'linear-gradient(180deg, rgba(4,18,34,0.62), rgba(2,10,24,0.8))' },
  planets: {
    classique: { src: `${C_terre}/icons/classique.webp`, width: 8.4 },
    defi: { src: `${C_terre}/icons/defi.webp`, width: 8.4 },
    survie: { src: `${C_terre}/icons/survie.webp`, width: 8.4 },
    participatif: { src: `${C_terre}/icons/participatif.webp`, width: 8.4 },
    camembert: { src: `${C_terre}/icons/camembert.webp`, width: 8.4 },
  },
  plates: {
    fusee: { src: `${C_terre}/icons/fusee.webp`, ratio: 0.862, scale: 1.3 },
    suivante: { src: `${C_terre}/icons/suivante.webp`, ratio: 1.532, scale: 1.3 },
    stats: { src: `${C_terre}/icons/stats.webp`, ratio: 0.965, scale: 1.3 },
    parametrage: { src: `${C_terre}/icons/parametrage.webp`, ratio: 1.048, scale: 1.3 },
    progression: { src: `${C_terre}/icons/progression.webp`, ratio: 0.974, scale: 1.3 },
    nouvelle: { src: `${C_terre}/icons/nouvelle.webp`, ratio: 0.667, scale: 1.3 },
    quitter: { src: `${C_terre}/icons/quitter.webp`, ratio: 0.978, scale: 1.3 },
    plein: { src: `${C_terre}/icons/plein.webp`, ratio: 1.0, scale: 1.3 },
    valider: { src: `${C_terre}/icons/valider.webp`, ratio: 1.183, scale: 1.3 },
    annuler: { src: `${C_terre}/icons/annuler.webp`, ratio: 1.006, scale: 1.3 },
    profil: { src: null, ratio: 6.33, boxStyle: { ...terreGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${C_terre}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${C_terre}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

// ───────────────────────── Fantasy ─────────────────────────
const C_fantasy = '/themes/fantasy';
const fantasyGlass = {
  background: 'linear-gradient(180deg, rgba(24,12,48,0.72), rgba(24,12,48,0.8))',
  border: '2px solid rgba(200,150,255,0.65)',
  boxShadow: '0 0 2cqw rgba(200,150,255,0.28), inset 0 0 1.4cqw rgba(200,150,255,0.16)',
};

const fantasy: Theme = {
  id: 'fantasy',
  label: 'Fantasy',
  emoji: '🐉',
  description: 'Un royaume enchanté : dragon, licorne et ruines flottantes.',
  preview: `${C_fantasy}/preview.webp`,
  stage: { src: `${C_fantasy}/stage.webp`, ratio: 1.7917, bg: '#1a1038' },
  zones: {
    teams: { left: 11, top: 31.5, width: 9.8, height: 28 },
    teamCount: { left: 11, top: 60.5, width: 9.8, height: 3.8 },
    join: { left: 79, top: 34.8, width: 13.8, height: 25 },
    code: { left: 79, top: 60.2, width: 13.8, height: 4.6 },
    hub: { left: 25, top: 22, width: 52, height: 46 },
    bar: { left: 19, top: 82, width: 62, height: 15 },
    profile: { left: 50, top: 3.2 },
  },
  hubStyle: { background: 'radial-gradient(ellipse at center, rgba(22,10,48,0.8) 0%, rgba(22,10,48,0.52) 55%, rgba(22,10,48,0) 100%)', textShadow: '0 1px 4px rgba(10,0,30,0.95), 0 0 10px rgba(10,0,30,0.8)' },
  sidePanelStyle: { background: 'rgba(24,12,48,0.82)', border: '1px solid rgba(200,150,255,0.6)', borderRadius: '0.8cqw' },
  joinPadTop: 2.2,
  qrWidth: 8,
  bar: { ...fantasyGlass, background: 'linear-gradient(180deg, rgba(24,12,48,0.62), rgba(24,12,48,0.78))' },
  planets: {
    classique: { src: `${C_fantasy}/icons/classique.webp`, width: 7.9 },
    defi: { src: `${C_fantasy}/icons/defi.webp`, width: 6.7 },
    survie: { src: `${C_fantasy}/icons/survie.webp`, width: 8.6 },
    participatif: { src: `${C_fantasy}/icons/participatif.webp`, width: 10.4 },
    camembert: { src: `${C_fantasy}/icons/camembert.webp`, width: 9.0 },
  },
  plates: {
    fusee: { src: `${C_fantasy}/icons/fusee.webp`, ratio: 0.847, scale: 1.3 },
    suivante: { src: `${C_fantasy}/icons/suivante.webp`, ratio: 1.004, scale: 1.3 },
    stats: { src: `${C_fantasy}/icons/stats.webp`, ratio: 0.992, scale: 1.3 },
    parametrage: { src: `${C_fantasy}/icons/parametrage.webp`, ratio: 0.979, scale: 1.3 },
    progression: { src: `${C_fantasy}/icons/progression.webp`, ratio: 0.996, scale: 1.3 },
    nouvelle: { src: `${C_fantasy}/icons/nouvelle.webp`, ratio: 1.215, scale: 1.3 },
    quitter: { src: `${C_fantasy}/icons/quitter.webp`, ratio: 0.983, scale: 1.3 },
    plein: { src: `${C_fantasy}/icons/plein.webp`, ratio: 1.0, scale: 1.3 },
    valider: { src: `${C_fantasy}/icons/valider.webp`, ratio: 0.847, scale: 1.3 },
    annuler: { src: `${C_fantasy}/icons/annuler.webp`, ratio: 1.0, scale: 1.3 },
    profil: { src: null, ratio: 6.33, boxStyle: { ...fantasyGlass, borderRadius: '1.6cqw' } },
  },
  frames: {
    progress: { src: `${C_fantasy}/frame.webp`, ratio: 1400 / 614, width: 80 },
    msg: { src: `${C_fantasy}/frame.webp`, ratio: 1400 / 614, width: 62 },
  },
};

export const THEMES: Record<ThemeId, Theme> = { espace, jungle, marins, egypte, art, inventions, sciences, terre, fantasy };
export const DEFAULT_THEME_ID: ThemeId = 'defaut'; // habillage « Défaut » (sobre) : le premier du choix
export const THEME_STORAGE_KEY = 'quiz-party-theme';

// ── Habillages complémentaires et remplacements (lib/themes.extra.ts) ──
const registry = THEMES as Record<string, Theme>;
for (const [id, patch] of Object.entries(THEME_OVERRIDES)) {
  const base = registry[id];
  if (base) registry[id] = { ...base, ...patch, zones: { ...base.zones, ...(patch.zones ?? {}) } } as Theme;
}
Object.assign(registry, EXTRA_THEMES);
export const THEME_LIST: Theme[] = [...THEME_ORDER, ...Object.keys(registry).filter((k) => !THEME_ORDER.includes(k))]
  .map((k) => registry[k])
  .filter(Boolean);
