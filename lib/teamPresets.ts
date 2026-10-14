// Équipes proposées aux joueurs, par habillage (12 par thème, noms en français).
// L'avatar est une image : /public/avatars/<thème>/NN.webp (même ordre que les noms ci-dessous).
// Un thème sans jeu d'équipes n'en propose aucune : il ne reprend pas celles d'un autre thème.

export type TeamPreset = {
  name: string;
  avatar: string; // chemin d'image (ou, pour d'anciennes équipes, un emoji)
  color: string;
};

const make = (theme: string, names: string[], colors: string[]): TeamPreset[] =>
  names.map((name, i) => ({ name, avatar: `/avatars/${theme}/${String(i + 1).padStart(2, '0')}.webp`, color: colors[i] }));

export const TEAM_PRESETS: Record<string, TeamPreset[]> = {
  egypte: make('egypte', [
    'Les Anubis', 'Les Pharaons', 'La Légion des Scarabées', 'Les Ailes d’Horus', 'Les Gardiens du Sphinx', 'L’Ordre d’Osiris', 'Le Clan de Bastet', 'Pyramide Alpha', 'Les Explorateurs du Nil', 'Les Fils de Rê', 'La Dynastie du Cobra', 'Les Chercheurs de Temples',
  ], [
    '#f2bd5c', '#f2d05c', '#5cf287', '#f2e35c', '#f2af5c', '#5cf286', '#f2c35c', '#f2d15c', '#5cddf2', '#f2a95c', '#f2db5c', '#f2bf5c',
  ]),
  espace: make('espace', [
    'Les Novas', 'Les Martiens', 'Les Astronautes', 'Les Saturniens', 'Les Explorateurs Cosmiques', 'Zénith', 'Les Météores', 'Les Lunaires', 'Galaxie', 'Orion', 'Les Chevaucheurs d’Étoiles', 'Les Nébuleuses',
  ], [
    '#f2b65c', '#5cf26c', '#5c76f2', '#5caaf2', '#5c9ef2', '#5c90f2', '#5c9bf2', '#5c75f2', '#905cf2', '#5c66f2', '#5c8ef2', '#755cf2',
  ]),
  jungle: make('jungle', [
    'La Fureur des Jaguars', 'La Tribu des Lianes', 'Les Serpents d’Émeraude', 'Les Gardiens du Totem', 'Les Perroquets', 'Le Clan du Bambou', 'Les Coureurs de Lianes', 'La Tribu du Singe Solaire', 'Les Esprits de la Jungle', 'L’Ordre du Crocodile', 'Les Grenouilles du Tonnerre', 'Les Chasseurs de Fleurs',
  ], [
    '#f2cb5c', '#edf25c', '#5cf279', '#f2bd5c', '#c7f25c', '#e9f25c', '#baf25c', '#f2bd5c', '#5cf2a9', '#adf25c', '#5cbbf2', '#5cf277',
  ]),
  sciences: make('sciences', [
    'Les Étincelles Quantiques', 'Les Maîtres du Labo', 'Les Teslas', 'La Force Moléculaire', 'BioGenèse', 'Les Briseurs de Circuits', 'Les Coureurs de Plasma', 'Les Nanobots', 'Le Noyau de Fusion', 'Les Maîtres de la Gravité', 'Tempête Chimique', 'La Tribu des Photons',
  ], [
    '#8d5cf2', '#5df25c', '#5c8ff2', '#5cd7f2', '#5cb6f2', '#5c9af2', '#5c9ff2', '#5cf2de', '#f2d15c', '#6f5cf2', '#5cf2ef', '#5c70f2',
  ]),
  inventions: make('inventions', [
    'Les Maîtres des Engrenages', 'La Forge à Vapeur', 'Les Coureurs de Boulons', 'Les Artisans Tesla', 'Les Cerveaux de Cuivre', 'Les Clés à Molette', 'Les Ingénieurs Étincelle', 'La Nation des Rouages', 'La Tribu des Plans', 'Les Inventeurs de Fer', 'Les Vapeurbots', 'Les Faiseurs de Temps',
  ], [
    '#f2995c', '#f2995c', '#5ce2f2', '#5cc1f2', '#f2945c', '#f2985c', '#5cd7f2', '#f2a35c', '#5cacf2', '#f2a25c', '#f2b05c', '#f2a85c',
  ]),
  marins: make('marins', [
    'Les Chevaliers du Corail', 'Les Serpents des Abysses', 'Les Gardiens des Perles', 'Les Gardiens des Marées', 'Les Krakens', 'La Tribu des Lanternes', 'Les Chevaucheurs de Requins', 'Les Rangers des Bulles', 'La Force du Trident', 'L’Équipage des Étoiles de Mer', 'Le Clan des Coquillages', 'Les Esprits Manta',
  ], [
    '#5cdcf2', '#5c98f2', '#5ca0f2', '#5ce6f2', '#8e5cf2', '#f2ed5c', '#5cb2f2', '#5cb2f2', '#5cf2dc', '#f2bf5c', '#5cbbf2', '#5c8ff2',
  ]),
  art: make('art', [
    'Les Jocondiers', 'Les Samothraciens', 'Les Vénusiens', 'Les Scribes', 'Les Pharaons', 'Les Chevaliers du Louvre', 'Les Delacroix', 'Les Nymphéas', 'Les Pyramidiens', 'Les Apollons', 'Les Gardiens du Sphinx', 'Les Arcadiens',
  ], [
    '#f2b35c', '#5cccf2', '#f25c9a', '#f29a5c', '#f2cc5c', '#f25c68', '#5c9bf2', '#5ce6f2', '#5cb4f2', '#f2b35c', '#5cc4f2', '#9a5cf2',
  ]),
  fantasy: make('fantasy', [
    'Les Flammes du Dragon', 'Les Feuilles Elfiques', 'Les Mages de Cristal', 'Les Loups de l’Ombre', 'Le Réveil du Phénix', 'Les Gardiens des Runes', 'La Lumière des Licornes', 'La Bande des Gobelins', 'Les Sorciers de la Lune', 'Les Esprits de la Forêt', 'Les Griffons du Tonnerre', 'La Forge Mystique',
  ], [
    '#f2905c', '#cbf25c', '#5c9ef2', '#b25cf2', '#f2b15c', '#5ca4f2', '#5c9ff2', '#f2cd5c', '#5c76f2', '#e2f25c', '#5c91f2', '#5c5cf2',
  ]),
  terre: make('terre', [
    'Les Coureurs de Lave', 'Les Chercheurs de Cristaux', 'Les Gardiens du Magma', 'Le Clan des Stalactites', 'Les Explorateurs des Grottes', 'La Force des Fossiles', 'La Tribu du Noyau', 'Les Serpents des Tunnels', 'Les Champignons Lumineux', 'Les Casseurs de Roche', 'Les Esprits des Géodes', 'L’Équipe Souterraine',
  ], [
    '#f2855c', '#5caef2', '#f27d5c', '#5cf2f1', '#f2b55c', '#f2a05c', '#f2a15c', '#f2a35c', '#725cf2', '#f2a85c', '#9a5cf2', '#5cd0f2',
  ]),
  temps: make('temps', [
    'Les Chrononautes', 'Les Gardiens du Sablier', 'Les Hommes des Cavernes', 'La Légion Romaine', 'Les Pharaons du Temps', 'Les Chevaliers du Temps', 'Les Horlogers Vapeur', 'Les Soldats de 44', 'Les Voyageurs du Futur', 'Les Mammouths Givrés', 'Les Chamans du Temps', 'Les Bâtisseurs de Siècles',
  ], [
    '#5cd1f2', '#5ca4f2', '#f29c5c', '#5cd5f2', '#f2b05c', '#5ca7f2', '#f2a65c', '#5ccaf2', '#5cbaf2', '#5cacf2', '#5c7ff2', '#5cc1f2',
  ]),
  sucrerie: make('sucrerie', [
    'La Capsule Bonbon', 'Le Sablier de Sucre', 'Les Chamallows Copains', 'Les Oursons Gélifiés', 'Les Gardiens Cupcake', 'Les Sucettes Tourbillon', 'Les Carrés de Chocolat', 'Le Tourbillon de Caramel', 'Les Amis Glacés', 'Les Sucres d’Orge Torsadés', 'L’Esprit Macaron', 'Les Donuts Pop',
  ], [
    '#f2d15c', '#f2c85c', '#f25cd2', '#f2945c', '#5c71f2', '#5cbbf2', '#f2895c', '#f2a35c', '#5cd7f2', '#f25cd5', '#bc5cf2', '#f25cb7',
  ]),
  mythologie: make('mythologie', [
    'Les Foudres de Zeus', 'Les Corbeaux d’Odin', 'Les Gardiens d’Anubis', 'Les Phénix Éternels', 'Les Tridents de Poséidon', 'Les Valkyries Sacrées', 'Les Cyclopes Titans', 'Les Dragons de Tiamat', 'Les Lions de Sekhmet', 'Les Minotaures d’Or', 'Les Gardiens du Kraken', 'Les Griffons Célestes',
  ], [
    '#f2b75c', '#5ca4f2', '#f2ca5c', '#f2965c', '#5cc4f2', '#5ca1f2', '#f29f5c', '#5ce0f2', '#f2945c', '#f2a95c', '#5cb6f2', '#f2b35c',
  ]),
};

export function getRandomPresets(theme: string, count: number): TeamPreset[] {
  const pool = TEAM_PRESETS[theme] ?? [];
  return pool.slice(0, count);
}

// Habillage « Défaut » (sans décor) : une équipe de chaque thème, avec son avatar et sa couleur
for (const key of ['espace', 'jungle', 'marins', 'egypte', 'art', 'sciences', 'inventions', 'terre', 'fantasy', 'temps', 'mythologie', 'sucrerie']) {
  const first = TEAM_PRESETS[key]?.[0];
  if (first) (TEAM_PRESETS['defaut'] ??= []).push(first);
}
