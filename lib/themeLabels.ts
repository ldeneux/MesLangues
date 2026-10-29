// Noms des thèmes et des natures de mots dans chaque langue étudiée (pour l'affichage en haut de la liste de vocabulaire).
// Japonais : écriture suivie de la lecture entre parenthèses.
type L = { it: string; es: string; en: string; de: string; ja: string };

export const THEME_LABELS: Record<string, L> = {
  food_restaurant: { it: 'Cibo, bevande, ristorante', es: 'Comida, bebidas, restaurante', en: 'Food, drinks, restaurant', de: 'Essen, Getränke, Restaurant', ja: '食べ物・飲み物・レストラン（たべもの・のみもの・レストラン）' },
  greetings: { it: 'Saluti, cortesia, presentazioni', es: 'Saludos, cortesía, presentaciones', en: 'Greetings, politeness, introductions', de: 'Begrüßungen, Höflichkeit, Vorstellungen', ja: 'あいさつ・礼儀・自己紹介（あいさつ・れいぎ・じこしょうかい）' },
  transport: { it: 'Trasporti e spostamenti', es: 'Transporte y desplazamientos', en: 'Transport and getting around', de: 'Verkehrsmittel und Fortbewegung', ja: '交通・移動（こうつう・いどう）' },
  shopping: { it: 'Acquisti e shopping', es: 'Compras', en: 'Shopping', de: 'Einkaufen und Shopping', ja: '買い物（かいもの）' },
  numbers_time: { it: 'Numeri, ora, data, denaro', es: 'Números, hora, fecha, dinero', en: 'Numbers, time, date, money', de: 'Zahlen, Uhrzeit, Datum, Geld', ja: '数・時間・日付・お金（かず・じかん・ひづけ・おかね）' },
  directions: { it: 'Orientarsi e indicazioni in città', es: 'Orientarse y direcciones en la ciudad', en: 'Finding your way, directions in town', de: 'Orientierung und Wegbeschreibung in der Stadt', ja: '道案内（みちあんない）' },
  work_school: { it: 'Lavoro, scuola, vita quotidiana', es: 'Trabajo, escuela, vida diaria', en: 'Work, school, daily life', de: 'Arbeit, Schule, Alltag', ja: '仕事・学校・日常（しごと・がっこう・にちじょう）' },
  family: { it: 'Famiglia e relazioni', es: 'Familia y relaciones', en: 'Family and relationships', de: 'Familie und Beziehungen', ja: '家族・人間関係（かぞく・にんげんかんけい）' },
  housing: { it: 'Alloggio, albergo', es: 'Alojamiento, hotel', en: 'Housing, hotel', de: 'Wohnen, Hotel', ja: '住まい・ホテル（すまい・ホテル）' },
  health: { it: 'Corpo e salute', es: 'Cuerpo y salud', en: 'Body and health', de: 'Körper und Gesundheit', ja: '体と健康（からだとけんこう）' },
  emotions: { it: 'Emozioni, gusti, opinioni semplici', es: 'Emociones, gustos, opiniones sencillas', en: 'Emotions, tastes, simple opinions', de: 'Gefühle, Vorlieben, einfache Meinungen', ja: '感情・好み・簡単な意見（かんじょう・このみ・かんたんないけん）' },
  leisure: { it: 'Tempo libero, sport, cultura', es: 'Ocio, deporte, cultura', en: 'Leisure, sport, culture', de: 'Freizeit, Sport, Kultur', ja: '趣味・スポーツ・文化（しゅみ・スポーツ・ぶんか）' },
  technology: { it: 'Telefono e tecnologia quotidiana', es: 'Teléfono y tecnología cotidiana', en: 'Phone and everyday technology', de: 'Telefon und Alltagstechnik', ja: '電話と身近なテクノロジー（でんわとみぢかなテクノロジー）' },
  emergencies: { it: 'Emergenze e imprevisti', es: 'Urgencias e imprevistos', en: 'Emergencies and the unexpected', de: 'Notfälle und Unvorhergesehenes', ja: '緊急事態・予定外の出来事（きんきゅうじたい・よていがいのできごと）' },
  weather: { it: 'Meteo', es: 'El tiempo', en: 'Weather', de: 'Wetter', ja: '天気（てんき）' },
  clothing: { it: 'Abbigliamento e accessori', es: 'Ropa y accesorios', en: 'Clothing and accessories', de: 'Kleidung und Accessoires', ja: '衣服・アクセサリー（いふく・アクセサリー）' },
  home_objects: { it: 'Casa, mobili e oggetti di uso quotidiano', es: 'Casa, muebles y objetos cotidianos', en: 'Home, furniture and everyday objects', de: 'Haus, Möbel und Alltagsgegenstände', ja: '家・家具・日用品（いえ・かぐ・にちようひん）' },
  animals: { it: 'Animali', es: 'Animales', en: 'Animals', de: 'Tiere', ja: '動物（どうぶつ）' },
  nature: { it: 'Natura, piante e paesaggi', es: 'Naturaleza, plantas y paisajes', en: 'Nature, plants and landscapes', de: 'Natur, Pflanzen und Landschaften', ja: '自然・植物・景色（しぜん・しょくぶつ・けしき）' },
  jobs: { it: 'Mestieri e professioni', es: 'Oficios y profesiones', en: 'Jobs and professions', de: 'Berufe', ja: '職業（しょくぎょう）' },
  school_study: { it: 'Studi, corsi e materie', es: 'Estudios, clases y asignaturas', en: 'Studies, classes and subjects', de: 'Studium, Kurse und Fächer', ja: '勉強・授業・科目（べんきょう・じゅぎょう・かもく）' },
  travel_tourism: { it: 'Viaggi, vacanze e turismo', es: 'Viajes, vacaciones y turismo', en: 'Travel, holidays and tourism', de: 'Reisen, Urlaub und Tourismus', ja: '旅行・休暇・観光（りょこう・きゅうか・かんこう）' },
  sports: { it: 'Sport e attività fisica', es: 'Deportes y actividad física', en: 'Sports and physical activities', de: 'Sport und körperliche Aktivitäten', ja: 'スポーツ・運動（スポーツ・うんどう）' },
  arts_media: { it: 'Musica, cinema, arti e media', es: 'Música, cine, artes y medios', en: 'Music, cinema, arts and media', de: 'Musik, Kino, Kunst und Medien', ja: '音楽・映画・芸術・メディア（おんがく・えいが・げいじゅつ・メディア）' },
  money_bank: { it: 'Denaro, banca e pagamenti', es: 'Dinero, banco y pagos', en: 'Money, banking and payments', de: 'Geld, Bank und Zahlungen', ja: 'お金・銀行・支払い（おかね・ぎんこう・しはらい）' },
  character: { it: 'Carattere, pregi e difetti', es: 'Carácter, cualidades y defectos', en: 'Character, qualities and flaws', de: 'Charakter, Stärken und Schwächen', ja: '性格・長所と短所（せいかく・ちょうしょとたんしょ）' },
  appearance: { it: 'Descrizione fisica e aspetto', es: 'Descripción física y apariencia', en: 'Physical description and appearance', de: 'Äußere Beschreibung und Aussehen', ja: '外見・容姿（がいけん・ようし）' },
  cooking: { it: 'Cucina, ricette e ingredienti', es: 'Cocina, recetas e ingredientes', en: 'Cooking, recipes and ingredients', de: 'Kochen, Rezepte und Zutaten', ja: '料理・レシピ・材料（りょうり・レシピ・ざいりょう）' },
  city_services: { it: 'Città, negozi e servizi pubblici', es: 'Ciudad, comercios y servicios públicos', en: 'Town, shops and public services', de: 'Stadt, Geschäfte und öffentliche Dienste', ja: '町・お店・公共サービス（まち・おみせ・こうきょうサービス）' },
  admin: { it: 'Amministrazione, posta e pratiche', es: 'Administración, correo y trámites', en: 'Administration, mail and paperwork', de: 'Verwaltung, Post und Behördengänge', ja: '手続き・郵便・役所（てつづき・ゆうびん・やくしょ）' },
  environment: { it: 'Ambiente ed ecologia', es: 'Medio ambiente y ecología', en: 'Environment and ecology', de: 'Umwelt und Ökologie', ja: '環境・エコロジー（かんきょう・エコロジー）' },
  adjectives_opposites: { it: 'Aggettivi comuni e contrari', es: 'Adjetivos comunes y contrarios', en: 'Common adjectives and opposites', de: 'Gebräuchliche Adjektive und Gegensätze', ja: 'よく使う形容詞と反対語（よくつかうけいようしとはんたいご）' },
  time_quantity: { it: 'Tempo, frequenza e quantità', es: 'Tiempo, frecuencia y cantidades', en: 'Time, frequency and quantities', de: 'Zeit, Häufigkeit und Mengen', ja: '時間・頻度・量（じかん・ひんど・りょう）' },
  useful_expressions: { it: 'Connettivi ed espressioni utili', es: 'Conectores y expresiones útiles', en: 'Linking words and useful expressions', de: 'Bindewörter und nützliche Ausdrücke', ja: 'つなぎ言葉と便利な表現（つなぎことばとべんりなひょうげん）' },
  celebrations: { it: 'Feste, tradizioni ed eventi', es: 'Fiestas, tradiciones y eventos', en: 'Celebrations, traditions and events', de: 'Feste, Traditionen und Veranstaltungen', ja: '祭り・伝統・イベント（まつり・でんとう・イベント）' },
  society_news: { it: 'Società, attualità e vita pubblica', es: 'Sociedad, actualidad y vida pública', en: 'Society, current affairs and public life', de: 'Gesellschaft, Aktuelles und öffentliches Leben', ja: '社会・ニュース・公共の生活（しゃかい・ニュース・こうきょうのせいかつ）' },
  verbes: { it: 'Verbi', es: 'Verbos', en: 'Verbs', de: 'Verben', ja: '動詞（どうし）' },
};

export const NATURE_LABELS: Record<string, L> = {
  nom: { it: 'Sostantivi', es: 'Sustantivos', en: 'Nouns', de: 'Nomen', ja: '名詞（めいし）' },
  adjectif: { it: 'Aggettivi', es: 'Adjetivos', en: 'Adjectives', de: 'Adjektive', ja: '形容詞（けいようし）' },
  adverbe: { it: 'Avverbi', es: 'Adverbios', en: 'Adverbs', de: 'Adverbien', ja: '副詞（ふくし）' },
  expression: { it: 'Espressioni', es: 'Expresiones', en: 'Expressions', de: 'Ausdrücke', ja: '表現（ひょうげん）' },
};

/** Nom d'un thème dans la langue étudiée (null si inconnu ou langue non gérée). */
export function themeLabelIn(code: string, lang: string): string | null {
  return (THEME_LABELS[code] as Record<string, string> | undefined)?.[lang] ?? null;
}

/** Nom d'une nature de mots dans la langue étudiée. */
export function natureLabelIn(code: string, lang: string): string | null {
  return (NATURE_LABELS[code] as Record<string, string> | undefined)?.[lang] ?? null;
}
