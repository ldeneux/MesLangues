// Coin lecture : 14 origines × 10 récits = 140 lectures (contes, légendes, mythes, épopées, nouvelles, extraits de romans).
// Choix : œuvres du domaine public ou traditions orales. Le texte lu dans l'appli n'est jamais une édition existante :
// c'est une adaptation écrite à la demande par Gemini, langue par langue, dont la longueur (champ « words ») est choisie récit par récit (voir readingLogic.ts).
// Pour changer un titre ou une origine : modifier ce fichier seulement (l'identifiant « origine-numéro » relie le récit à sa version enregistrée).

export type ReadingKind = 'conte' | 'légende' | 'mythe' | 'épopée' | 'nouvelle' | 'roman' | 'théâtre';

export type ReadingEntry = {
  id: string; // ex. « jp-03 » (ne pas changer une fois le récit généré)
  origin: string; // code de l'origine (fr, it, de, es, jp, gb…)
  n: number; // rang 1 à 10 dans l'origine
  title: string; // titre en français
  original: string; // titre dans la langue d'origine
  author: string | null; // null = tradition anonyme ou orale
  kind: ReadingKind;
  words: number; // longueur utile du résumé (en mots) : assez pour rester cohérent, au niveau B2
};

export type ReadingOrigin = {
  code: string;
  label: string;
  flag: string;
  stories: ReadingEntry[];
};

type Row = [title: string, original: string, author: string | null, kind: ReadingKind, words: number];

function origin(code: string, label: string, flag: string, rows: Row[]): ReadingOrigin {
  return {
    code,
    label,
    flag,
    stories: rows.map(([title, original, author, kind, words], i) => ({
      id: `${code}-${String(i + 1).padStart(2, '0')}`,
      origin: code,
      n: i + 1,
      title,
      original,
      author,
      kind,
      words,
    })),
  };
}

export const READING_ORIGINS: ReadingOrigin[] = [
  origin('fr', 'France', '🇫🇷', [
    ['Le Petit Chaperon rouge', 'Le Petit Chaperon rouge', 'Charles Perrault', 'conte', 500],
    ['La Belle et la Bête', 'La Belle et la Bête', 'Mme Leprince de Beaumont', 'conte', 1100],
    ['La Chèvre de monsieur Seguin', 'La Chèvre de monsieur Seguin', 'Alphonse Daudet', 'conte', 600],
    ['La Parure', 'La Parure', 'Guy de Maupassant', 'nouvelle', 800],
    ['Deux amis', 'Deux amis', 'Guy de Maupassant', 'nouvelle', 800],
    ['Mateo Falcone', 'Mateo Falcone', 'Prosper Mérimée', 'nouvelle', 900],
    ['Micromégas', 'Micromégas', 'Voltaire', 'conte', 1000],
    ['La Chanson de Roland : Roncevaux', 'La Chanson de Roland', null, 'épopée', 1000],
    ['Tristan et Iseut', 'Tristan et Iseut', null, 'légende', 1200],
    ['Mélusine', 'Mélusine', 'Jean d’Arras', 'légende', 800],
  ]),
  origin('it', 'Italie', '🇮🇹', [
    ['La Chatte Cendrillon', 'La gatta Cenerentola', 'Giambattista Basile', 'conte', 800],
    ['Les Aventures de Pinocchio', 'Le avventure di Pinocchio', 'Carlo Collodi', 'roman', 1800],
    ['Chichibio et la grue', 'Chichibio e la gru', 'Giovanni Boccaccio', 'nouvelle', 600],
    ['Federigo degli Alberighi', 'Federigo degli Alberighi', 'Giovanni Boccaccio', 'nouvelle', 700],
    ['Andreuccio de Pérouse', 'Andreuccio da Perugia', 'Giovanni Boccaccio', 'nouvelle', 900],
    ['Paolo et Francesca', 'Paolo e Francesca', 'Dante Alighieri', 'épopée', 600],
    ['Romulus et Remus', 'Romolo e Remo', null, 'légende', 700],
    ['Rosso Malpelo', 'Rosso Malpelo', 'Giovanni Verga', 'nouvelle', 900],
    ['La Richesse (La roba)', 'La roba', 'Giovanni Verga', 'nouvelle', 700],
    ['Le train a sifflé', 'Il treno ha fischiato', 'Luigi Pirandello', 'nouvelle', 700],
  ]),
  origin('de', 'Allemagne', '🇩🇪', [
    ['Le Petit Chaperon rouge (Grimm)', 'Rotkäppchen', 'Frères Grimm', 'conte', 500],
    ['Hansel et Gretel', 'Hänsel und Gretel', 'Frères Grimm', 'conte', 700],
    ['Les Musiciens de Brême', 'Die Bremer Stadtmusikanten', 'Frères Grimm', 'conte', 600],
    ['Nain Tracassin (Rumpelstilzchen)', 'Rumpelstilzchen', 'Frères Grimm', 'conte', 600],
    ['Le Joueur de flûte de Hamelin', 'Der Rattenfänger von Hameln', null, 'légende', 600],
    ['La Loreley', 'Die Lorelei', null, 'légende', 500],
    ['Siegfried et le dragon', 'Siegfried und der Drache', null, 'épopée', 1200],
    ['Till l’Espiègle', 'Till Eulenspiegel', null, 'conte', 800],
    ['Kannitverstan', 'Kannitverstan', 'Johann Peter Hebel', 'nouvelle', 500],
    ['La Mendiante de Locarno', 'Das Bettelweib von Locarno', 'Heinrich von Kleist', 'nouvelle', 600],
  ]),
  origin('es', 'Espagne', '🇪🇸', [
    ['Lazarillo de Tormès et l’aveugle', 'Lazarillo de Tormes', null, 'roman', 900],
    ['Le Comte Lucanor : Don Illán et le magicien', 'El conde Lucanor', 'Don Juan Manuel', 'conte', 600],
    ['Don Quichotte et les moulins à vent', 'Don Quijote de la Mancha', 'Miguel de Cervantes', 'roman', 700],
    ['Rinconete et Cortadillo', 'Rinconete y Cortadillo', 'Miguel de Cervantes', 'nouvelle', 1000],
    ['Le Cid : l’exil', 'Cantar de mio Cid', null, 'épopée', 1100],
    ['Don Juan Tenorio', 'Don Juan Tenorio', 'José Zorrilla', 'théâtre', 1000],
    ['Le Mont des Âmes', 'El monte de las ánimas', 'Gustavo Adolfo Bécquer', 'légende', 800],
    ['Les Yeux verts', 'Los ojos verdes', 'Gustavo Adolfo Bécquer', 'légende', 800],
    ['Adieu, Cordera !', '¡Adiós, Cordera!', 'Clarín (Leopoldo Alas)', 'nouvelle', 800],
    ['Les Bas rouges', 'Las medias rojas', 'Emilia Pardo Bazán', 'nouvelle', 700],
  ]),
  origin('jp', 'Japon', '🇯🇵', [
    ['Le Conte du coupeur de bambou (Kaguya-hime)', '竹取物語', null, 'conte', 900],
    ['Urashima Tarō', '浦島太郎', null, 'conte', 600],
    ['Momotarō, l’enfant-pêche', '桃太郎', null, 'conte', 500],
    ['La Grue reconnaissante', '鶴の恩返し', null, 'conte', 600],
    ['Yamata no Orochi, le serpent à huit têtes', '八岐大蛇', null, 'mythe', 600],
    ['Yuki-onna, la dame des neiges', '雪女', null, 'légende', 600],
    ['Gon, le petit renard', 'ごん狐', 'Niimi Nankichi', 'conte', 800],
    ['Le Restaurant aux nombreuses commandes', '注文の多い料理店', 'Miyazawa Kenji', 'conte', 900],
    ['Rashōmon', '羅生門', 'Akutagawa Ryūnosuke', 'nouvelle', 800],
    ['Le Fil d’araignée', '蜘蛛の糸', 'Akutagawa Ryūnosuke', 'nouvelle', 600],
  ]),
  origin('gb', 'Monde anglophone', '🇬🇧', [
    ['Jack et le haricot magique', 'Jack and the Beanstalk', 'Joseph Jacobs', 'conte', 600],
    ['Beowulf et Grendel', 'Beowulf', null, 'épopée', 1200],
    ['L’Épée dans la pierre', 'The Sword in the Stone', 'Thomas Malory', 'légende', 900],
    ['Le Prince heureux', 'The Happy Prince', 'Oscar Wilde', 'conte', 700],
    ['Un chant de Noël', 'A Christmas Carol', 'Charles Dickens', 'nouvelle', 1200],
    ['Rip Van Winkle', 'Rip Van Winkle', 'Washington Irving', 'nouvelle', 800],
    ['Le Cœur révélateur', 'The Tell-Tale Heart', 'Edgar Allan Poe', 'nouvelle', 700],
    ['Le Cadeau des Mages', 'The Gift of the Magi', 'O. Henry', 'nouvelle', 700],
    ['Le Ruban moucheté', 'The Adventure of the Speckled Band', 'Arthur Conan Doyle', 'nouvelle', 1200],
    ['Rikki-Tikki-Tavi', 'Rikki-Tikki-Tavi', 'Rudyard Kipling', 'conte', 1000],
  ]),
  origin('cn', 'Chine', '🇨🇳', [
    ['Le Bouvier et la Tisserande', '牛郎织女', null, 'légende', 600],
    ['Hou Yi et Chang’e', '后羿与嫦娥', null, 'mythe', 600],
    ['Le Roi Singe : le chaos au Ciel', '西游记', 'Wu Cheng’en', 'roman', 1200],
    ['La Légende du Serpent blanc', '白蛇传', null, 'légende', 1100],
    ['Liang Shanbo et Zhu Yingtai', '梁山伯与祝英台', null, 'légende', 900],
    ['Mulan', '木兰辞', null, 'légende', 700],
    ['Meng Jiangnu et la Grande Muraille', '孟姜女哭长城', null, 'légende', 700],
    ['La Peau peinte', '画皮', 'Pu Songling', 'conte', 800],
    ['Le Rêve du papillon', '庄周梦蝶', 'Zhuangzi', 'conte', 400],
    ['Kong Yiji', '孔乙己', 'Lu Xun', 'nouvelle', 800],
  ]),
  origin('se', 'Suède', '🇸🇪', [
    ['Le Merveilleux Voyage de Nils Holgersson', 'Nils Holgerssons underbara resa', 'Selma Lagerlöf', 'roman', 1800],
    ['La Rose de Noël', 'Julrosor', 'Selma Lagerlöf', 'légende', 700],
    ['Le Trésor de Herr Arne', 'Herr Arnes penningar', 'Selma Lagerlöf', 'roman', 1200],
    ['La Charrette fantôme', 'Körkarlen', 'Selma Lagerlöf', 'roman', 1200],
    ['Gösta Berling : le bal d’Ekeby', 'Gösta Berlings saga', 'Selma Lagerlöf', 'roman', 900],
    ['Le Docteur Glas', 'Doktor Glas', 'Hjalmar Söderberg', 'roman', 1200],
    ['La Saga de Frithiof', 'Frithiofs saga', 'Esaias Tegnér', 'épopée', 1200],
    ['Näcken, l’esprit de la rivière', 'Näcken', null, 'légende', 500],
    ['La Dame de la forêt', 'Skogsrået', null, 'légende', 500],
    ['Gustav Vasa et les hommes de Dalécarlie', 'Gustav Vasa i Dalarna', null, 'légende', 800],
  ]),
  origin('no', 'Norvège', '🇳🇴', [
    ['Les Trois Boucs bourrus', 'De tre bukkene Bruse', 'Asbjørnsen et Moe', 'conte', 400],
    ['À l’est du soleil et à l’ouest de la lune', 'Østenfor sol og vestenfor måne', 'Asbjørnsen et Moe', 'conte', 900],
    ['Askeladden et le troll', 'Askeladden som kappåt med trollet', 'Asbjørnsen et Moe', 'conte', 600],
    ['Gudbrand sur la colline', 'Gudbrand på Lia', 'Asbjørnsen et Moe', 'conte', 500],
    ['Peer Gynt chez le roi de la montagne', 'Peer Gynt', 'Henrik Ibsen', 'théâtre', 1200],
    ['La Peste noire (Pesta)', 'Pesta', null, 'légende', 500],
    ['Huldra', 'Huldra', null, 'légende', 500],
    ['Fossegrimen', 'Fossegrimen', null, 'légende', 500],
    ['La Faim', 'Sult', 'Knut Hamsun', 'roman', 1200],
    ['Synnøve Solbakken', 'Synnøve Solbakken', 'Bjørnstjerne Bjørnson', 'roman', 1200],
  ]),
  origin('ru', 'Russie', '🇷🇺', [
    ['Vassilissa la Belle et Baba Yaga', 'Василиса Прекрасная', 'Afanassiev', 'conte', 800],
    ['L’Oiseau de feu et le Loup gris', 'Жар-птица и серый волк', 'Afanassiev', 'conte', 900],
    ['Le Pêcheur et le Petit Poisson', 'Сказка о рыбаке и рыбке', 'Alexandre Pouchkine', 'conte', 500],
    ['La Dame de pique', 'Пиковая дама', 'Alexandre Pouchkine', 'nouvelle', 1200],
    ['Le Manteau', 'Шинель', 'Nicolas Gogol', 'nouvelle', 1000],
    ['La Nuit de Noël', 'Ночь перед Рождеством', 'Nicolas Gogol', 'conte', 1200],
    ['Combien faut-il de terre à un homme ?', 'Много ли человеку земли нужно', 'Léon Tolstoï', 'nouvelle', 900],
    ['Le Rêve d’un homme ridicule', 'Сон смешного человека', 'Fiodor Dostoïevski', 'nouvelle', 900],
    ['La Mort d’un fonctionnaire', 'Смерть чиновника', 'Anton Tchekhov', 'nouvelle', 500],
    ['Moumou', 'Муму', 'Ivan Tourgueniev', 'nouvelle', 1000],
  ]),
  origin('br', 'Brésil', '🇧🇷', [
    ['L’Aliéniste', 'O Alienista', 'Machado de Assis', 'nouvelle', 1200],
    ['La Cartomancienne', 'A Cartomante', 'Machado de Assis', 'nouvelle', 800],
    ['La Messe du coq', 'Missa do Galo', 'Machado de Assis', 'nouvelle', 800],
    ['L’Homme qui parlait javanais', 'O Homem que Sabia Javanês', 'Lima Barreto', 'nouvelle', 900],
    ['Curupira', 'Curupira', null, 'légende', 500],
    ['Iara, la mère des eaux', 'Iara', null, 'légende', 500],
    ['Saci-Pererê', 'Saci-Pererê', null, 'légende', 500],
    ['La Légende de la Victoria regia', 'Vitória-régia', null, 'légende', 500],
    ['Boitatá, le serpent de feu', 'Boitatá', null, 'légende', 500],
    ['La Légende du guarana', 'Lenda do Guaraná', null, 'légende', 600],
  ]),
  origin('mx', 'Mexique', '🇲🇽', [
    ['Popocatépetl et Iztaccíhuatl', 'Popocatépetl e Iztaccíhuatl', null, 'légende', 600],
    ['Le Cinquième Soleil', 'El Quinto Sol', null, 'mythe', 700],
    ['Quetzalcóatl et le maïs', 'Quetzalcóatl y el maíz', null, 'mythe', 700],
    ['L’aigle sur le nopal (fondation de Tenochtitlan)', 'El águila y el nopal', null, 'légende', 600],
    ['La Llorona', 'La Llorona', null, 'légende', 500],
    ['Hunahpú et Xbalanqué', 'Popol Vuh', null, 'mythe', 1200],
    ['Nezahualcóyotl, le roi-poète', 'Nezahualcóyotl', null, 'légende', 800],
    ['Le Callejón del Beso', 'El Callejón del Beso', null, 'légende', 500],
    ['Noël dans les montagnes', 'Navidad en las montañas', 'Ignacio Manuel Altamirano', 'nouvelle', 1000],
    ['La Malinche', 'La Malinche', null, 'légende', 800],
  ]),
  origin('eg', 'Égypte', '🇪🇬', [
    ['Le Conte des deux frères', 'Papyrus d’Orbiney', null, 'conte', 900],
    ['Le Naufragé', 'Papyrus de l’Ermitage', null, 'conte', 600],
    ['Les Aventures de Sinouhé', 'Histoire de Sinouhé', null, 'roman', 1500],
    ['Le Paysan éloquent', 'Le Paysan éloquent', null, 'conte', 800],
    ['Isis et Osiris', 'Isis et Osiris', null, 'mythe', 900],
    ['Horus et Seth', 'Les Aventures d’Horus et Seth', null, 'mythe', 1000],
    ['Isis et le nom secret de Rê', 'Isis et Rê', null, 'mythe', 600],
    ['Le Prince prédestiné', 'Le Prince prédestiné', null, 'conte', 600],
    ['Khéops et les magiciens', 'Papyrus Westcar', null, 'conte', 800],
    ['Le Voyage d’Ounamon', 'Voyage d’Ounamon', null, 'conte', 900],
  ]),
  origin('ml', 'Mali', '🇲🇱', [
    ['Soundiata Keïta, l’enfant-lion', 'Soundiata', null, 'épopée', 1500],
    ['Soumaoro Kanté, le roi forgeron', 'Soumaoro Kanté', null, 'épopée', 1000],
    ['Le Luth de Gassire', 'Dausi', null, 'épopée', 900],
    ['Le Serpent Bida et le Wagadou', 'Bida', null, 'légende', 600],
    ['Kankou Moussa : le pèlerinage', 'Kankou Moussa', null, 'légende', 700],
    ['Le Sacrifice de Tapama (Djenné)', 'Tapama', null, 'légende', 600],
    ['La Fondation de Tombouctou', 'Tombouctou', null, 'légende', 500],
    ['Faro et la création du monde', 'Faro', null, 'mythe', 800],
    ['Le Lièvre et l’hyène', 'Le Lièvre et l’hyène', null, 'conte', 500],
    ['Le Griot et le roi', 'Le Griot et le roi', null, 'conte', 600],
  ]),
];

export const READING_TOTAL = READING_ORIGINS.reduce((s, o) => s + o.stories.length, 0);

const BY_ID = new Map<string, ReadingEntry>();
for (const o of READING_ORIGINS) for (const s of o.stories) BY_ID.set(s.id, s);

export function findReadingEntry(id: string): ReadingEntry | null {
  return BY_ID.get(id) ?? null;
}

export function findReadingOrigin(code: string): ReadingOrigin | null {
  return READING_ORIGINS.find((o) => o.code === code) ?? null;
}
