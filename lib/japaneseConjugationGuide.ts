// Texte « Comprendre la conjugaison japonaise » : écrit une fois (aucun appel Gemini), pour l'onglet Conjugaison
// (lien au-dessus du tableau) et pour la leçon 1 de japonais. Module pur, sans 'use server'.
// Dans les phrases, **…** met en couleur la forme du verbe (même convention que les fiches de grammaire).

export type GuideExample = { ja: string; romaji: string; fr: string };
export type GuideVerbRow = {
  dict: string;
  reading: string;
  nai: string;
  masu: string;
  te: string;
  fr: string;
  group?: 'godan' | 'ichidan' | 'suru' | 'kuru'; // si différent du groupe du tableau
};
export type GuideVerbTable = { caption: string; group: 'godan' | 'ichidan' | 'suru' | 'kuru'; rows: GuideVerbRow[] };
export type GuideSection = {
  title: string;
  paragraphs: string[];
  examples?: GuideExample[];
  verbTables?: GuideVerbTable[];
  // Tableau libre : en-têtes + lignes (le texte entre ** ** est mis en couleur)
  table?: { head: string[]; rows: string[][] };
};

export const JA_GUIDE_TITLE = 'Comprendre la conjugaison japonaise';

export const JA_GUIDE: GuideSection[] = [
  {
    title: 'Ce qui change par rapport au français',
    paragraphs: [
      "Un verbe japonais ne change jamais selon la personne ni le nombre : 食べる peut vouloir dire « je mange », « tu manges », « elle mange » ou « ils mangent ». On comprend qui agit grâce au contexte, et le sujet est très souvent omis.",
      "Il n'y a pas d'article (ni « le », ni « la », ni « un »). De petits mots appelés particules (は, を, に…) indiquent le rôle de chaque mot dans la phrase.",
      "Le verbe garde toujours son sens. Ce qui change, c'est sa terminaison : elle indique si l'on parle poliment ou familièrement, au présent ou au passé, à la forme affirmative ou négative, ou si le verbe est relié à la suite de la phrase.",
    ],
    examples: [{ ja: '私は毎日パンを食べ**ます**。', romaji: 'Watashi wa mainichi pan o tabemasu.', fr: 'Je mange du pain tous les jours.' }],
  },
  {
    title: 'Un radical qui reste, une terminaison qui change',
    paragraphs: [
      "Chaque verbe se compose d'une partie qui ne bouge pas (le radical) et d'une terminaison qui change selon ce qu'on veut dire. Dans l'appli, la partie en couleur est toujours celle qui change par rapport à la forme du dictionnaire.",
      "La forme du dictionnaire, aussi appelée forme neutre, est celle qu'on trouve quand on cherche un verbe. Elle se termine toujours par un son en « u » (う, く, ぐ, す, つ, ぬ, ぶ, む, る).",
    ],
    table: {
      head: ['Forme', 'Verbe 食べる (manger)', 'Sens'],
      rows: [
        ['Dictionnaire', '食べる', 'manger (familier)'],
        ['Poli', '食べ**ます**', 'je mange / je mangerai'],
        ['Négatif familier', '食べ**ない**', 'je ne mange pas'],
        ['Passé familier', '食べ**た**', "j'ai mangé"],
        ['Forme en て', '食べ**て**', 'pour enchaîner ou demander'],
      ],
    },
  },
  {
    title: 'Les trois groupes de verbes',
    paragraphs: [
      "Pour savoir comment conjuguer un verbe, il faut connaître son groupe. Dans l'appli, le groupe est affiché en haut du tableau de chaque verbe.",
      "Groupe 2 (一段, ichidan) : le verbe se termine par いる ou える (食べる, 見る, 起きる, 開ける). On enlève る, puis on ajoute la terminaison. C'est le groupe le plus simple.",
      "Groupe 1 (五段, godan) : tous les autres verbes (書く, 飲む, 会う, 話す…). La dernière syllabe change de colonne dans le tableau des kana : く devient か pour la négation, き pour ます, et い pour て. Attention : quelques verbes finissent en いる ou える mais sont du groupe 1 (帰る, 入る, 知る, 走る, 切る, 要る) : il faut les apprendre.",
      "Groupe 3, les irréguliers : il n'y en a que deux, する (faire) et 来る (くる, venir). Les verbes du type « nom + する », comme 勉強する (étudier), se conjuguent comme する.",
    ],
    verbTables: [
      {
        caption: 'Groupe 2 (ichidan) : on enlève る',
        group: 'ichidan',
        rows: [
          { dict: '食べる', reading: 'たべる', nai: '食べない', masu: '食べます', te: '食べて', fr: 'manger' },
          { dict: '見る', reading: 'みる', nai: '見ない', masu: '見ます', te: '見て', fr: 'voir, regarder' },
          { dict: '起きる', reading: 'おきる', nai: '起きない', masu: '起きます', te: '起きて', fr: 'se lever' },
          { dict: '開ける', reading: 'あける', nai: '開けない', masu: '開けます', te: '開けて', fr: 'ouvrir' },
        ],
      },
      {
        caption: 'Groupe 1 (godan) : la dernière syllabe change',
        group: 'godan',
        rows: [
          { dict: '書く', reading: 'かく', nai: '書かない', masu: '書きます', te: '書いて', fr: 'écrire' },
          { dict: '飲む', reading: 'のむ', nai: '飲まない', masu: '飲みます', te: '飲んで', fr: 'boire' },
          { dict: '会う', reading: 'あう', nai: '会わない', masu: '会います', te: '会って', fr: 'rencontrer' },
          { dict: '話す', reading: 'はなす', nai: '話さない', masu: '話します', te: '話して', fr: 'parler' },
          { dict: '待つ', reading: 'まつ', nai: '待たない', masu: '待ちます', te: '待って', fr: 'attendre' },
          { dict: '泳ぐ', reading: 'およぐ', nai: '泳がない', masu: '泳ぎます', te: '泳いで', fr: 'nager' },
          { dict: '遊ぶ', reading: 'あそぶ', nai: '遊ばない', masu: '遊びます', te: '遊んで', fr: "s'amuser" },
          { dict: '帰る', reading: 'かえる', nai: '帰らない', masu: '帰ります', te: '帰って', fr: 'rentrer (en る, mais groupe 1)' },
        ],
      },
      {
        caption: 'Groupe 3 : les deux irréguliers',
        group: 'suru',
        rows: [
          { dict: 'する', reading: 'する', nai: 'しない', masu: 'します', te: 'して', fr: 'faire' },
          { dict: '来る', reading: 'くる', nai: '来ない', masu: '来ます', te: '来て', fr: 'venir (la lecture change : こ / き / き)', group: 'kuru' },
        ],
      },
    ],
  },
  {
    title: 'Les cinq formes essentielles',
    paragraphs: [
      "Dans la vie quotidienne au Japon, ces cinq formes, avec leurs variantes polies (ません, ました), couvrent l'essentiel de ce qu'on entend et de ce qu'on dit.",
      "1. La forme du dictionnaire (辞書形) : la forme de base. Elle s'emploie en langage familier, pour le présent et le futur.",
      "2. La forme en ます (ます形) : la forme polie, à utiliser avec des inconnus, au travail, à l'école, dans un magasin. Elle sert pour le présent comme pour le futur. En cas de doute, c'est elle qu'il faut choisir : elle n'est jamais impolie.",
      "3. La forme en ない (ない形) : la négation familière, « ne pas faire ».",
      "4. La forme en た (た形) : le passé familier.",
      "5. La forme en て (て形) : elle sert à enchaîner des actions, à demander quelque chose (〜てください), à dire qu'on est en train de faire (〜ている) et à construire de nombreuses autres expressions. C'est la plus importante à bien maîtriser.",
    ],
    examples: [
      { ja: '毎日、コーヒーを飲**む**。', romaji: 'Mainichi, kōhī o nomu.', fr: 'Je bois du café tous les jours. (familier)' },
      { ja: '明日、友達に会い**ます**。', romaji: 'Ashita, tomodachi ni aimasu.', fr: 'Demain, je retrouve un ami. (poli, avenir)' },
      { ja: '肉を食べ**ない**。', romaji: 'Niku o tabenai.', fr: 'Je ne mange pas de viande. (familier)' },
      { ja: '昨日、映画を見**た**。', romaji: 'Kinō, eiga o mita.', fr: "Hier, j'ai vu un film. (familier)" },
      { ja: '朝ごはんを食べ**て**、学校に行きます。', romaji: 'Asagohan o tabete, gakkō ni ikimasu.', fr: "Je prends mon petit-déjeuner, puis je vais à l'école." },
      { ja: 'ゆっくり話し**て**ください。', romaji: 'Yukkuri hanashite kudasai.', fr: "Parlez lentement, s'il vous plaît." },
      { ja: '今、本を読ん**で**います。', romaji: 'Ima, hon o yonde imasu.', fr: 'En ce moment, je lis un livre.' },
    ],
  },
  {
    title: 'Comment former la forme en て et la forme en た',
    paragraphs: [
      "Pour le groupe 2, c'est simple : on enlève る et on ajoute て (食べる → 食べて). Pour le groupe 1, ça dépend de la dernière syllabe. La forme en た se construit exactement pareil : て devient た, et で devient だ (飲んで → 飲んだ).",
      "Une seule exception à retenir : 行く (aller) donne 行って, et non 行いて.",
    ],
    table: {
      head: ['Le verbe se termine par', 'Forme en て', 'Exemple'],
      rows: [
        ['う, つ, る', '**って**', '会う → 会**って**'],
        ['む, ぶ, ぬ', '**んで**', '飲む → 飲**んで**'],
        ['く', '**いて**', '書く → 書**いて**'],
        ['ぐ', '**いで**', '泳ぐ → 泳**いで**'],
        ['す', '**して**', '話す → 話**して**'],
      ],
    },
  },
  {
    title: 'Poli ou familier ?',
    paragraphs: [
      "Le japonais a deux « registres ». Les formes en ます sont polies. La forme du dictionnaire, ない et た sont familières : on les emploie entre amis, en famille, et on les entend beaucoup dans les séries et les mangas. Voici les équivalences pour 食べる.",
    ],
    table: {
      head: ['', 'Poli', 'Familier'],
      rows: [
        ['Présent / futur', '食べ**ます**', '食べ**る**'],
        ['Négatif', '食べ**ません**', '食べ**ない**'],
        ['Passé', '食べ**ました**', '食べ**た**'],
        ['Passé négatif', '食べ**ませんでした**', '食べ**なかった**'],
      ],
    },
  },
  {
    title: 'Et le futur ?',
    paragraphs: [
      "Il n'y a pas de forme de futur : le présent sert aussi pour l'avenir. On ajoute un mot de temps quand c'est utile (明日 « demain », 来週 « la semaine prochaine »).",
    ],
    examples: [{ ja: '来週、京都に行き**ます**。', romaji: 'Raishū, Kyōto ni ikimasu.', fr: 'La semaine prochaine, je vais à Kyoto.' }],
  },
  {
    title: 'Deux autres formes très utiles dès le début',
    paragraphs: [
      "〜たい exprime le désir (vouloir faire) : on prend la base du ます et on ajoute たい. 〜ましょう propose de faire quelque chose ensemble. Les autres formes (négation polie, passé poli, potentiel, condition…) sont dans le tableau du verbe, classées de la plus utile à la moins utile.",
    ],
    examples: [
      { ja: '水を飲み**たい**です。', romaji: 'Mizu o nomitai desu.', fr: "Je veux boire de l'eau." },
      { ja: '一緒に行き**ましょう**。', romaji: 'Issho ni ikimashō.', fr: 'Allons-y ensemble.' },
    ],
  },
];
