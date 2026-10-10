// Listes de kanji par niveau, d'après les "kyōiku kanji" (les 1026 kanji enseignés à l'école
// primaire japonaise, par année scolaire). Ce n'est pas une liste JLPT officielle (elle n'existe
// plus), mais un découpage pédagogique officiel et cohérent :
//   A1 = 1re année · A2 = 2e année · B1 = 3e et 4e années · B2 = 5e et 6e années.
// Module pur (pas de 'use server') : utilisable côté serveur et navigateur.
import type { LevelCode } from './constants';

const GRADE_1 =
  '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';

const GRADE_2 =
  '引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話';

const GRADE_3 =
  '悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和';

const GRADE_4 =
  '愛案以衣位茨印英栄媛塩岡億加果貨課芽賀改械害街各覚潟完官管関観願岐希季旗器機議求泣給挙漁共協鏡競極熊訓軍郡群径景芸欠結建健験固功好香候康佐差菜最埼材崎昨札刷察参産散残氏司試児治滋辞鹿失借種周祝順初松笑唱焼照城縄臣信井成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲貯兆腸低底停的典伝徒努灯堂働特得毒熱念敗梅博飯飛費必票標不夫付府副粉兵別辺変便包法望牧末満未脈民無約勇要養浴利陸良料量輪類令冷例歴連老労録阜奈梨阪沖栃';

const GRADE_5 =
  '圧移因永営衛易益液演往応恩仮価可河過賀快解格確額刊幹慣眼基寄規技義逆久旧居許境均禁句群経潔件券険検限現減故個護効厚耕航鉱構興講告混査再災妻採際在財罪雑酸賛支志枝師資飼示似識質舎謝授修述術準序招証象賞条状常情織職制性政勢精製税責績接設舌絶銭祖素総造像増則測属率損退貸態団断築張提程適敵統銅導徳独任燃能破犯判版比肥非備俵評貧布婦富武復複仏編弁保墓報豊防貿暴務夢迷綿輸余預容略留領';

const GRADE_6 =
  '異遺域宇映延沿我灰拡革閣割株巻看簡危机貴揮疑吸供胸郷勤筋系敬警劇激穴絹権憲源厳己呼誤后孝皇紅降鋼刻穀骨困砂座済裁策冊蚕至私姿視詞誌磁射捨尺若樹収宗就衆従縦縮熟純処署諸除承将傷障蒸針仁垂推寸盛聖誠宣専泉洗染善奏窓創装層操蔵臓存尊宅担探段暖値宙忠著庁頂潮賃痛展討党糖届難乳認納脳派拝背肺俳班晩否批秘腹奮並陛閉片補暮宝訪亡忘棒枚幕密盟模訳優郵幼欲翌乱卵覧裏律臨朗論';

// Chaque kanji n'apparaît qu'une seule fois (au premier niveau où il est cité).
function build(): Record<LevelCode, string[]> {
  const seen = new Set<string>();
  const take = (s: string) => {
    const out: string[] = [];
    for (const c of Array.from(s)) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  };
  return {
    A1: take(GRADE_1),
    A2: take(GRADE_2),
    B1: [...take(GRADE_3), ...take(GRADE_4)],
    B2: [...take(GRADE_5), ...take(GRADE_6)],
  } as Record<LevelCode, string[]>;
}

const LISTS = build();

export function kanjiForLevel(level: string): string[] {
  return LISTS[level as LevelCode] ?? [];
}
