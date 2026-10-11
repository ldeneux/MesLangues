// Leçon 0 : prononciation. Contenu écrit une fois (aucun appel Gemini). L'audio vient de la synthèse
// vocale du navigateur (gratuite, jamais lancée automatiquement). Module pur, sans 'use server'.

export type PronExample = { text: string; note: string };
export type PronSection = { title: string; explain: string; examples: PronExample[] };
export type PronLesson = { intro: string; sections: PronSection[] };

export const PRONUNCIATION: Record<string, PronLesson> = {
  it: {
    intro:
      "L'italien se lit presque comme il s'écrit : chaque lettre se prononce, et rien n'est muet, sauf le h. Voici les points qui piègent un francophone.",
    sections: [
      {
        title: 'Les voyelles',
        explain: 'Cinq voyelles pures, toujours nettes et sans glisser : a, e, i, o, u. Le u se lit « ou », comme dans « loup ».',
        examples: [
          { text: 'luna', note: '« louna » : la lune' },
          { text: 'sole', note: '« solé » : le soleil' },
          { text: 'uno', note: '« ouno » : un' },
          { text: 'amico', note: '« amiko » : l\'ami' },
        ],
      },
      {
        title: 'C et G : doux ou durs',
        explain:
          'Devant e et i, le c se lit « tch » et le g se lit « dj ». Devant a, o, u, ils sont durs : « k » et « g ». Pour garder le son dur devant e ou i, on ajoute un h : che, chi, ghe, ghi.',
        examples: [
          { text: 'ciao', note: '« tchao »' },
          { text: 'cena', note: '« tchéna » : le dîner' },
          { text: 'gelato', note: '« djélato » : la glace' },
          { text: 'giorno', note: '« djorno » : le jour' },
          { text: 'caro', note: '« karo » : cher' },
          { text: 'che', note: '« ké » : que' },
          { text: 'spaghetti', note: '« spaguétti » : le h garde le g dur' },
        ],
      },
      {
        title: 'GN, GL et SC',
        explain:
          'gn se lit comme dans « agneau ». gli se lit comme « ill » dans « bouteille ». sc devant e ou i se lit « ch » comme dans « chat » ; devant a, o, u, il se lit « sk ».',
        examples: [
          { text: 'gnocchi', note: '« gnoki »' },
          { text: 'bagno', note: '« bagno » : la salle de bain' },
          { text: 'famiglia', note: 'gli = le « ill » de « bouteille » : la famille' },
          { text: 'pesce', note: '« péché », avec un ch un peu long : le poisson' },
          { text: 'scuola', note: '« skouola » : l\'école' },
        ],
      },
      {
        title: 'Les consonnes doubles',
        explain:
          'Une consonne doublée se prononce plus longuement : on marque une toute petite pause avant. Cela change le sens du mot.',
        examples: [
          { text: 'pala', note: 'la pelle' },
          { text: 'palla', note: 'la balle, avec un l long' },
          { text: 'caro', note: 'cher' },
          { text: 'carro', note: 'le chariot, avec un r long' },
          { text: 'nono', note: 'neuvième' },
          { text: 'nonno', note: 'le grand-père, avec un n long' },
        ],
      },
      {
        title: "L'accent tonique",
        explain:
          "En général, on appuie sur l'avant-dernière syllabe. Quand un accent est écrit à la fin d'un mot, on appuie sur la dernière syllabe.",
        examples: [
          { text: 'parlare', note: 'par-LA-re : parler' },
          { text: 'amico', note: 'a-MI-co : l\'ami' },
          { text: 'città', note: 'tchit-TA : la ville (accent écrit)' },
          { text: 'caffè', note: 'kaf-FÈ : le café' },
          { text: 'perché', note: 'per-KÉ : pourquoi / parce que' },
        ],
      },
      {
        title: 'Le h et le z',
        explain: 'Le h ne se prononce jamais. Le z se lit « ts » ou « dz » selon les mots.',
        examples: [
          { text: 'ho', note: '« o » : j\'ai (le h est muet)' },
          { text: 'pizza', note: '« pitsa »' },
          { text: 'zero', note: '« dzéro » : zéro' },
        ],
      },
    ],
  },

  es: {
    intro:
      "L'espagnol se lit presque comme il s'écrit. Les voyelles sont pures et courtes ; ce sont surtout quelques consonnes qui demandent un peu d'attention.",
    sections: [
      {
        title: 'Les voyelles',
        explain: 'Cinq voyelles pures et nettes : a, e, i, o, u. Le u se lit « ou » comme dans « loup ».',
        examples: [
          { text: 'casa', note: 'la maison' },
          { text: 'vino', note: 'le vin' },
          { text: 'uno', note: '« ouno » : un' },
          { text: 'luna', note: '« louna » : la lune' },
        ],
      },
      {
        title: 'J et G',
        explain:
          "Le j se lit comme un r doux et râclé au fond de la gorge, proche du ch de l'allemand « Bach » : c'est la « jota ». Le g devant e et i se lit pareil. Devant a, o, u, c'est un g dur ; pour garder le g dur devant e ou i, on écrit gu, où le u ne se prononce pas.",
        examples: [
          { text: 'jamón', note: 'la jota : le jambon' },
          { text: 'hijo', note: 'la jota : le fils' },
          { text: 'gente', note: 'g = jota : les gens' },
          { text: 'guerra', note: '« guérra » : la guerre, le u est muet' },
          { text: 'guitarra', note: '« guitarra » : la guitare' },
        ],
      },
      {
        title: 'C, Z et QU',
        explain:
          "En Espagne, c devant e ou i et z se lisent comme le « th » sourd de l'anglais « think ». En Amérique latine et dans le sud de l'Espagne, ils se lisent « s ». Dans les autres cas, c se lit « k », et qu se lit « k » (le u est muet).",
        examples: [
          { text: 'cena', note: '« thena » en Espagne, « sena » en Amérique latine : le dîner' },
          { text: 'zapato', note: 'la chaussure' },
          { text: 'gracias', note: 'merci' },
          { text: 'casa', note: '« kasa »' },
          { text: 'queso', note: '« késo » : le fromage' },
        ],
      },
      {
        title: 'Ñ et LL',
        explain: "ñ se lit comme gn dans « agneau ». ll se lit « y » comme dans « yeux » (« ill » dans certaines régions).",
        examples: [
          { text: 'España', note: '« Espagne »' },
          { text: 'niño', note: 'l\'enfant' },
          { text: 'llamar', note: 'appeler' },
          { text: 'pollo', note: 'le poulet' },
        ],
      },
      {
        title: 'H, B et V',
        explain: 'Le h est toujours muet. Le b et le v se prononcent exactement de la même façon, comme un b doux.',
        examples: [
          { text: 'hola', note: '« ola » : bonjour' },
          { text: 'hombre', note: '« ombré » : l\'homme' },
          { text: 'vino', note: '« bino » : le vin' },
          { text: 'bien', note: 'bien' },
        ],
      },
      {
        title: 'R et RR',
        explain:
          'Le r simple est un tout petit roulement de la langue. Le rr, et le r au début d\'un mot, est roulé plus longtemps. La différence change le sens.',
        examples: [
          { text: 'pero', note: 'mais' },
          { text: 'perro', note: 'le chien, avec le rr roulé' },
          { text: 'caro', note: 'cher' },
          { text: 'carro', note: 'le chariot, avec le rr roulé' },
          { text: 'rojo', note: 'rouge (r roulé au début)' },
        ],
      },
      {
        title: "L'accent tonique",
        explain:
          "Si le mot finit par une voyelle, un n ou un s, on appuie sur l'avant-dernière syllabe. Sinon, on appuie sur la dernière. Un accent écrit signale une exception : c'est lui qui indique la syllabe forte.",
        examples: [
          { text: 'casa', note: 'CA-sa' },
          { text: 'hablar', note: 'ha-BLAR : parler' },
          { text: 'teléfono', note: 'te-LÉ-fo-no (accent écrit)' },
          { text: 'canción', note: 'can-CIÓN : la chanson (accent écrit)' },
        ],
      },
    ],
  },

  en: {
    intro:
      "L'anglais s'écrit souvent très différemment de ce qu'il se prononce, et c'est normal d'hésiter. Voici les sons qui n'existent pas en français et les pièges les plus courants. Les signes entre barres obliques sont l'alphabet phonétique international.",
    sections: [
      {
        title: 'Le « th »',
        explain:
          'Deux sons absents du français : on place la langue entre les dents. /θ/ est un souffle sourd, comme un s soufflé (think). /ð/ est sonore, comme un z (the).',
        examples: [
          { text: 'think', note: '/θɪŋk/ : penser' },
          { text: 'three', note: '/θriː/ : trois' },
          { text: 'thanks', note: '/θæŋks/ : merci' },
          { text: 'the', note: '/ðə/ : le, la, les' },
          { text: 'this', note: '/ðɪs/ : ceci' },
        ],
      },
      {
        title: 'Voyelles courtes et longues',
        explain: 'La longueur de la voyelle change le sens du mot : il faut vraiment allonger les voyelles longues.',
        examples: [
          { text: 'ship', note: '/ʃɪp/ : le bateau' },
          { text: 'sheep', note: '/ʃiːp/ : le mouton, voyelle longue' },
          { text: 'sit', note: '/sɪt/ : s\'asseoir' },
          { text: 'seat', note: '/siːt/ : le siège, voyelle longue' },
          { text: 'full', note: '/fʊl/ : plein' },
          { text: 'fool', note: '/fuːl/ : le fou, voyelle longue' },
        ],
      },
      {
        title: 'Le h et le r',
        explain:
          'Le h se prononce en soufflant légèrement (en français il est muet). Le r ne se roule pas : la langue recule dans la bouche, sans toucher le palais.',
        examples: [
          { text: 'house', note: 'la maison : on souffle le h' },
          { text: 'hello', note: 'bonjour' },
          { text: 'red', note: 'rouge : r sans rouler' },
          { text: 'car', note: 'la voiture' },
        ],
      },
      {
        title: 'Lettres muettes',
        explain: "Beaucoup de lettres s'écrivent sans se prononcer. Il faut apprendre ces mots tels quels.",
        examples: [
          { text: 'knee', note: '/niː/ : le genou, le k est muet' },
          { text: 'write', note: '/raɪt/ : écrire, le w est muet' },
          { text: 'island', note: '/ˈaɪlənd/ : l\'île, le s est muet' },
          { text: 'listen', note: '/ˈlɪsən/ : écouter, le t est muet' },
          { text: 'hour', note: '/ˈaʊər/ : l\'heure, le h est muet' },
        ],
      },
      {
        title: 'Le -ed du passé',
        explain: 'La terminaison -ed se prononce /t/ après un son sourd, /d/ après un son sonore, et /ɪd/ après t ou d.',
        examples: [
          { text: 'walked', note: '/wɔːkt/ : marché' },
          { text: 'played', note: '/pleɪd/ : joué' },
          { text: 'wanted', note: '/ˈwɒntɪd/ : voulu' },
        ],
      },
      {
        title: 'Le -s final',
        explain: 'Le s du pluriel ou de la 3e personne se prononce /s/, /z/ ou /ɪz/ selon le son qui précède.',
        examples: [
          { text: 'cats', note: '/kæts/ : les chats' },
          { text: 'dogs', note: '/dɒɡz/ : les chiens' },
          { text: 'buses', note: '/ˈbʌsɪz/ : les bus' },
        ],
      },
      {
        title: "L'accent tonique",
        explain:
          'Chaque mot a une syllabe très appuyée, et les autres sont faibles : leurs voyelles se réduisent à un son neutre /ə/, presque avalé. C\'est ce rythme qui rend l\'anglais naturel.',
        examples: [
          { text: 'banana', note: '/bəˈnɑːnə/ : on appuie sur la 2e syllabe' },
          { text: 'about', note: '/əˈbaʊt/ : à propos de' },
          { text: 'family', note: '/ˈfæməli/ : la famille, 3 syllabes seulement' },
          { text: 'photograph', note: '/ˈfəʊtəɡrɑːf/ : on appuie sur le début' },
        ],
      },
    ],
  },

  de: {
    intro:
      "L'allemand se prononce très régulièrement dès qu'on connaît quelques règles. Tous les noms prennent une majuscule, mais cela ne change rien à la prononciation.",
    sections: [
      {
        title: 'Ä, Ö et Ü',
        explain:
          'ä se lit comme un « è ». ö se lit « eu » en arrondissant les lèvres. ü se lit comme le « u » français de « mur ».',
        examples: [
          { text: 'Käse', note: '« kèze » : le fromage' },
          { text: 'schön', note: '« cheune » : beau (lèvres arrondies)' },
          { text: 'Tür', note: '« tur », comme le u de « mur » : la porte' },
          { text: 'müde', note: 'fatigué' },
        ],
      },
      {
        title: 'Le « ch »',
        explain:
          "Après e, i, ä, ö, ü ou une consonne, il se prononce par un souffle doux, la langue près du palais. Après a, o, u, il se prononce râclé, au fond de la gorge.",
        examples: [
          { text: 'ich', note: 'je : souffle doux' },
          { text: 'Milch', note: 'le lait : souffle doux' },
          { text: 'Buch', note: 'le livre : râclé' },
          { text: 'Nacht', note: 'la nuit : râclé' },
          { text: 'machen', note: 'faire : râclé' },
        ],
      },
      {
        title: 'SCH, SP et ST',
        explain: 'sch se lit « ch » comme dans « chat ». Au début d\'un mot, sp se lit « chp » et st se lit « cht ».',
        examples: [
          { text: 'Schule', note: '« choule » : l\'école' },
          { text: 'Sport', note: '« chport »' },
          { text: 'Stein', note: '« chtaïn » : la pierre' },
          { text: 'Straße', note: '« chtrasse » : la rue' },
        ],
      },
      {
        title: 'Z, S, V et W',
        explain:
          'z se lit « ts ». s devant une voyelle se lit « z ». v se lit « f » dans la plupart des mots allemands, et w se lit « v ».',
        examples: [
          { text: 'Zeit', note: '« tsaït » : le temps' },
          { text: 'Sonne', note: '« zoneu » : le soleil' },
          { text: 'Vater', note: '« fatère » : le père' },
          { text: 'Wasser', note: '« vasseur » : l\'eau' },
        ],
      },
      {
        title: 'EI, IE, EU et ÄU',
        explain: 'ei se lit « aï ». ie se lit « i » long. eu et äu se lisent « oï ».',
        examples: [
          { text: 'nein', note: '« naïn » : non' },
          { text: 'Liebe', note: '« libeu » : l\'amour' },
          { text: 'Freund', note: '« froïnt » : l\'ami' },
          { text: 'Häuser', note: '« hoïzeur » : les maisons' },
        ],
      },
      {
        title: 'Fin de mot et ß',
        explain:
          'À la fin d\'un mot, b, d, g se lisent comme p, t, k. La lettre ß se lit « ss » et suit une voyelle longue.',
        examples: [
          { text: 'Hund', note: '« hount » : le chien, d final = t' },
          { text: 'Tag', note: '« tak » : le jour, g final = k' },
          { text: 'groß', note: '« gross » : grand' },
          { text: 'heiß', note: '« haïss » : chaud' },
        ],
      },
      {
        title: 'Le r',
        explain:
          "Le r se prononce au fond de la gorge, comme en français. À la fin d'un mot, après une voyelle, il s'adoucit presque en un petit « a ».",
        examples: [
          { text: 'rot', note: 'rouge' },
          { text: 'Bruder', note: 'le frère : le r final s\'adoucit' },
          { text: 'Mutter', note: 'la mère' },
        ],
      },
    ],
  },

  ja: {
    intro:
      "Le japonais est très régulier : chaque kana se lit toujours de la même façon. Les kana eux-mêmes s'apprennent dans l'onglet あ Kana ; ici, on voit les règles de prononciation. La voix vient de ton navigateur : la mélodie de certains mots peut y être approximative.",
    sections: [
      {
        title: 'Les cinq voyelles',
        explain:
          'Cinq voyelles courtes et nettes : あ (a), い (i), う (ou, sans arrondir les lèvres), え (é), お (o). Elles ne changent jamais.',
        examples: [
          { text: 'あさ', note: 'asa : le matin' },
          { text: 'いえ', note: 'ié : la maison' },
          { text: 'うみ', note: 'oumi : la mer' },
          { text: 'えき', note: 'éki : la gare' },
          { text: 'おと', note: 'oto : le bruit' },
        ],
      },
      {
        title: 'Voyelles longues',
        explain:
          "Une voyelle longue dure deux temps, et elle change le sens du mot. À l'écrit, on double la voyelle (おばあさん) ou on ajoute う après o ou u (ゆうき).",
        examples: [
          { text: 'おばさん', note: 'obasan : la tante' },
          { text: 'おばあさん', note: 'obâsan : la grand-mère' },
          { text: 'おじさん', note: 'ojisan : l\'oncle' },
          { text: 'おじいさん', note: 'ojîsan : le grand-père' },
          { text: 'ゆき', note: 'yuki : la neige' },
          { text: 'ゆうき', note: 'yûki : le courage' },
        ],
      },
      {
        title: 'Le petit っ',
        explain: 'Le petit っ marque une courte pause qui double la consonne suivante : on retient son souffle un instant.',
        examples: [
          { text: 'きて', note: 'kité : viens' },
          { text: 'きって', note: 'kitté : le timbre, avec la pause' },
          { text: 'がっこう', note: 'gakkô : l\'école' },
          { text: 'ざっし', note: 'zasshi : le magazine' },
        ],
      },
      {
        title: 'Le ん',
        explain:
          "ん est une syllabe à part entière, qui dure un temps. Il se prononce « m » devant p, b, m, et « n » nasal ailleurs ou à la fin d'un mot.",
        examples: [
          { text: 'ほん', note: 'hon : le livre' },
          { text: 'さんぽ', note: 'sampo : la promenade (ん se lit m)' },
          { text: 'てんき', note: 'tenki : la météo' },
        ],
      },
      {
        title: 'Les sons voisés',
        explain:
          'Les deux petits traits ゛ rendent la consonne sonore (か → が, さ → ざ, た → だ, は → ば). Le petit rond ゜ donne le son p (は → ぱ). Le sens change.',
        examples: [
          { text: 'てんき', note: 'tenki : la météo' },
          { text: 'でんき', note: 'denki : l\'électricité' },
          { text: 'かぎ', note: 'kagi : la clé' },
          { text: 'ばん', note: 'ban : le soir' },
          { text: 'ぱん', note: 'pan : le pain' },
        ],
      },
      {
        title: 'Les sons combinés',
        explain:
          'Un petit ゃ, ゅ ou ょ se fond avec le kana qui le précède en une seule syllabe : き + ょ = きょ (kyo). Cela ne compte que pour un temps.',
        examples: [
          { text: 'きょう', note: 'kyô : aujourd\'hui' },
          { text: 'しゃしん', note: 'shashin : la photo' },
          { text: 'りょこう', note: 'ryokô : le voyage' },
          { text: 'びょういん', note: 'byôin : l\'hôpital' },
        ],
      },
      {
        title: 'Les particules は, へ et を',
        explain:
          'Quand ce sont des particules, は se lit « wa » (et non « ha »), へ se lit « é » et を se lit « o ». On ne les lit comme ça que dans ce rôle.',
        examples: [
          { text: 'わたしは', note: 'watashi wa : quant à moi' },
          { text: 'とうきょうへ', note: 'Tôkyô é : vers Tokyo' },
          { text: 'ほんを', note: 'hon o : le livre (complément)' },
        ],
      },
      {
        title: 'Le r japonais',
        explain: 'Le r japonais est un petit coup rapide de la pointe de la langue, entre le r, le l et le d. Il ne se roule pas.',
        examples: [
          { text: 'さくら', note: 'sakura : le cerisier' },
          { text: 'ありがとう', note: 'arigatô : merci' },
          { text: 'りんご', note: 'ringo : la pomme' },
        ],
      },
      {
        title: 'Rythme et mélodie',
        explain:
          "Chaque kana dure à peu près le même temps, sans syllabe fortement appuyée comme en français ou en anglais. Une mélodie haut-bas distingue quelques mots écrits pareil : le contexte aide toujours, donc inutile de s'en inquiéter au début.",
        examples: [
          { text: 'はし', note: 'hashi : les baguettes (haut-bas) ou le pont (bas-haut)' },
          { text: 'あめ', note: 'ame : la pluie (haut-bas) ou le bonbon (bas-haut)' },
        ],
      },
    ],
  },
};
