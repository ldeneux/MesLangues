// Fonds d'écran par équipe (écrans joueurs), rangés PAR THÈME : deux thèmes peuvent avoir une équipe du même nom
// (ex. « Les Pharaons » en Égypte et en Arts) sans confusion.
// Les fichiers sont dans /public/bg/<thème>/ (comme les avatars dans /public/avatars/<thème>/) :
// - portrait : téléphone (et tablette en portrait)
// - landscape : PC / tablette en paysage
// Un seul des deux suffit : l'autre format est alors obtenu en recadrant l'image fournie.
// - contentTop : hauteur (en vh) réservée en haut en mode portrait, pour que le texte
//   ne recouvre pas l'emblème de l'équipe
// - shade : voile sombre posé sur l'image (0 à 1) pour garder le texte clair lisible ; à augmenter pour un fond très lumineux
// Pour ajouter une équipe : déposer les images dans /public/bg/<thème>/ puis ajouter une ligne ici
// (clé 1 = identifiant du thème, clé 2 = nom exact de l'équipe dans lib/teamPresets.ts).
export type TeamBg = { portrait?: string; landscape?: string; contentTop?: string; shade?: number };

// Les deux formats : <thème>/<slug>-portrait.webp et <thème>/<slug>-paysage.webp
const bg = (theme: string, slug: string, contentTop = '9vh'): TeamBg => ({
  portrait: `/bg/${theme}/${slug}-portrait.webp`,
  landscape: `/bg/${theme}/${slug}-paysage.webp`,
  contentTop,
});

const jungle = (slug: string, shade: number): TeamBg => ({ ...bg('jungle', slug, '5vh'), shade });
const art = (slug: string, shade = 0.5): TeamBg => ({ ...bg('art', slug, '5vh'), shade });

export const TEAM_BACKGROUNDS: Record<string, Record<string, TeamBg>> = {
  // Espace : fonds sombres, le voile par défaut suffit
  espace: {
    'Les Explorateurs Cosmiques': bg('espace', 'explorateurs'),
    'Les Novas': bg('espace', 'nova'),
    'Galaxie': bg('espace', 'galaxie'),
    'Les Lunaires': bg('espace', 'lune'),
    'Les Saturniens': bg('espace', 'saturne'),
    'Les Martiens': bg('espace', 'martiens'),
    'Les Astronautes': bg('espace', 'astronautes'),
    'Les Météores': bg('espace', 'meteores'),
    'Zénith': bg('espace', 'zenith'),
    'Orion': bg('espace', 'orion'),
    'Les Chevaucheurs d’Étoiles': bg('espace', 'chevaucheurs'),
    // Nébuleuses : version paysage seule, la version portrait en est recadrée
    'Les Nébuleuses': { landscape: '/bg/espace/nebuleuses-paysage.webp', contentTop: '9vh' },
  },
  // Fonds marins (l'emblème n'est pas en haut : peu de place à réserver)
  marins: {
    'Les Chevaliers du Corail': bg('marins', 'coral-knights', '5vh'),
    'Les Serpents des Abysses': bg('marins', 'abyss-serpents', '5vh'),
    'Les Gardiens des Perles': bg('marins', 'pearl-keepers', '5vh'),
    'Les Gardiens des Marées': bg('marins', 'tide-guardians', '5vh'),
    'Les Krakens': bg('marins', 'kraken-squad', '5vh'),
    'La Tribu des Lanternes': bg('marins', 'sea-lantern-tribe', '5vh'),
    'Les Chevaucheurs de Requins': bg('marins', 'sharkriders', '5vh'),
    'Les Rangers des Bulles': bg('marins', 'bubble-rangers', '5vh'),
    'La Force du Trident': bg('marins', 'trident-force', '5vh'),
    'L’Équipage des Étoiles de Mer': bg('marins', 'starfish-crew', '5vh'),
    'Le Clan des Coquillages': bg('marins', 'deepshell-clan', '5vh'),
    'Les Esprits Manta': bg('marins', 'manta-spirits', '5vh'),
  },
  // Jungle : fonds assez sombres, voile (shade) plus ou moins marqué selon la luminosité de la trouée de lumière ;
  // Les Esprits de la Jungle, Les Grenouilles du Tonnerre et Les Chasseurs de Fleurs : fonds à venir (écran standard)
  jungle: {
    'La Fureur des Jaguars': jungle('jaguars', 0.2),
    'La Tribu des Lianes': jungle('lianes', 0.5),
    'Les Serpents d’Émeraude': jungle('serpents', 0.15),
    'Les Gardiens du Totem': jungle('totem', 0.2),
    'Les Perroquets': jungle('perroquets', 0.4),
    'Le Clan du Bambou': jungle('bambou', 0.45),
    'Les Coureurs de Lianes': jungle('coureurs-lianes', 0.5),
    'La Tribu du Singe Solaire': jungle('singe-solaire', 0.35),
    // Crocodile : version paysage seule, la version portrait en est recadrée
    'L’Ordre du Crocodile': { landscape: '/bg/jungle/crocodile-paysage.webp', contentTop: '5vh', shade: 0.2 },
  },
  // Arts : fonds clairs et lumineux, donc voile plus sombre (shade) pour que le texte reste lisible ; pas d'emblème en haut
  art: {
    'Les Jocondiers': art('jocondiers', 0.6),
    'Les Samothraciens': art('samothraciens'),
    'Les Vénusiens': art('venusiens'),
    'Les Scribes': art('scribes'),
    'Les Pharaons': art('pharaons'),
    'Les Chevaliers du Louvre': art('chevaliers'),
    'Les Delacroix': art('delacroix'),
    'Les Nymphéas': art('nympheas', 0.6),
    'Les Pyramidiens': art('pyramidiens'),
    'Les Apollons': art('apollons'),
    'Les Gardiens du Sphinx': art('gardiens-sphinx'),
    'Les Arcadiens': art('arcadiens'),
  },
};

export function getTeamBackground(themeId: string | null | undefined, teamName: string): TeamBg | null {
  if (!themeId) return null;
  return TEAM_BACKGROUNDS[themeId]?.[teamName] ?? null;
}
