// Écran et PDF des verbes japonais : à quoi sert chaque forme, et classement des formes de la plus utile à la moins utile.
// Module pur (sans 'use client' ni 'use server').

// À quoi sert chaque forme (en français, en une phrase)
export const JA_FORM_USAGE: Record<string, string> = {
  dict: 'Forme de base, celle du dictionnaire. Langage familier : présent et futur.',
  masu: 'Langage poli : présent et futur. À employer avec des inconnus, au travail, en magasin.',
  masen: 'Langage poli : « ne pas faire ».',
  mashita: "Langage poli : le passé (« j'ai fait »).",
  masendeshita: "Langage poli : « je n'ai pas fait ».",
  mashou: 'Pour proposer : « faisons… ! ».',
  te: 'Pour enchaîner des actions, demander (〜てください) ou dire « en train de » (〜ている).',
  nai: 'Négation familière : « ne pas faire ».',
  ta: "Passé familier : « j'ai fait ».",
  tai: 'Pour dire qu’on veut faire quelque chose.',
  nakatta: "Familier : « je n'ai pas fait ».",
  teiru: 'Action en cours (« je suis en train de… ») ou état qui dure.',
  tekudasai: 'Demande polie : « faites… s’il vous plaît ».',
  naidekudasai: 'Demande polie de ne pas faire : « ne faites pas… ».',
  pot: '« Pouvoir faire » : être capable de.',
  vol: 'Familier : « faisons… » ou « je vais faire… ».',
  tara: '« Si / quand je fais… ».',
  ba: 'Condition : « si… » (plus théorique).',
  pass: 'Passif : « être fait par… ».',
  caus: 'Causatif : « faire faire ».',
  imp: 'Ordre direct, brutal : à éviter en pratique.',
  prohib: 'Interdiction : « ne fais pas ! ».',
  causpass: '« Être obligé de faire ».',
  sonkeigo: "Politesse envers l'autre : on honore l'action de l'interlocuteur.",
  kenjou: 'Politesse humble : on abaisse sa propre action.',
};

// Les formes, de la plus utile à la moins utile
export const JA_FORM_CATEGORIES: { key: string; label: string; ids: string[] | null }[] = [
  { key: 'essential', label: '★ Les 5 formes essentielles', ids: ['dict', 'masu', 'nai', 'te', 'ta'] },
  { key: 'polite', label: 'Le langage poli : les autres formes en ます', ids: ['masen', 'mashita', 'masendeshita', 'mashou'] },
  { key: 'useful', label: 'Autres formes utiles', ids: ['tai', 'nakatta', 'teiru', 'tekudasai', 'naidekudasai', 'pot', 'vol'] },
  { key: 'advanced', label: 'Formes avancées', ids: null }, // tout le reste
];
