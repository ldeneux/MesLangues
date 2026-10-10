// Conjugaison japonaise CALCULÉE PAR CODE (module pur, sans 'use server') :
// zéro erreur de génération, zéro coût. Gemini ne fournit que la liste des verbes.
import { readingFromRuby, stripRuby } from './japanese';

export type JaVerbGroup = 'godan' | 'ichidan' | 'suru' | 'kuru';
export type JaVerbData = { group: JaVerbGroup; ruby: string; reading: string };
export type JaLevel = 'A1' | 'A2' | 'B1' | 'B2';
export type JaFormRow = { id: string; label_fr: string; term_jp: string; level: JaLevel; written: string; reading: string };

export const JA_LEVEL_ORDER: JaLevel[] = ['A1', 'A2', 'B1', 'B2'];

export const JA_GROUP_INFO: Record<JaVerbGroup, { label: string; tip: string }> = {
  godan: {
    label: 'Groupe 1 (五段 godan)',
    tip: "La dernière syllabe change de colonne (書く → 書かない / 書きます / 書いて).",
  },
  ichidan: {
    label: 'Groupe 2 (一段 ichidan)',
    tip: 'On enlève る et on ajoute la terminaison (食べる → 食べない / 食べます / 食べて).',
  },
  suru: { label: 'Groupe 3 irrégulier (する)', tip: 'する et les verbes « nom + する » (勉強する) : formes à apprendre par cœur.' },
  kuru: { label: 'Groupe 3 irrégulier (来る)', tip: '来る (くる) : la lecture du kanji change à chaque forme (こ / き / く).' },
};

const ROWS: Record<string, { a: string; i: string; e: string; o: string }> = {
  う: { a: 'わ', i: 'い', e: 'え', o: 'お' },
  く: { a: 'か', i: 'き', e: 'け', o: 'こ' },
  ぐ: { a: 'が', i: 'ぎ', e: 'げ', o: 'ご' },
  す: { a: 'さ', i: 'し', e: 'せ', o: 'そ' },
  つ: { a: 'た', i: 'ち', e: 'て', o: 'と' },
  ぬ: { a: 'な', i: 'に', e: 'ね', o: 'の' },
  ぶ: { a: 'ば', i: 'び', e: 'べ', o: 'ぼ' },
  む: { a: 'ま', i: 'み', e: 'め', o: 'も' },
  る: { a: 'ら', i: 'り', e: 'れ', o: 'ろ' },
};

type Kit = {
  dict: string;
  nai: string;
  ta: string;
  te: string;
  stemI: string; // base des formes en ます
  pot: string;
  pass: string;
  caus: string;
  causPass: string;
  vol: string;
  imp: string;
  ba: string;
  keigoStem: string | null; // base de お〜になる / お〜する (null si non applicable)
  keigoPrefix: 'お' | 'ご';
};

function kit(w: string, group: JaVerbGroup): Kit {
  if (group === 'ichidan') {
    const b = w.slice(0, -1);
    return {
      dict: w, nai: b + 'ない', ta: b + 'た', te: b + 'て', stemI: b,
      pot: b + 'られる', pass: b + 'られる', caus: b + 'させる', causPass: b + 'させられる',
      vol: b + 'よう', imp: b + 'ろ', ba: b + 'れば',
      keigoStem: b.length >= 1 ? b : null, keigoPrefix: 'お',
    };
  }
  if (group === 'godan') {
    const b = w.slice(0, -1);
    const last = w.slice(-1);
    const row = ROWS[last];
    if (!row) throw new Error(`Verbe godan invalide : ${w}`);
    let te: string;
    let ta: string;
    if (last === 'う' || last === 'つ' || last === 'る') {
      te = b + 'って'; ta = b + 'った';
    } else if (last === 'ぬ' || last === 'ぶ' || last === 'む') {
      te = b + 'んで'; ta = b + 'んだ';
    } else if (last === 'く') {
      const iku = w.endsWith('行く') || w.endsWith('いく'); // 行く est irrégulier : 行って
      te = b + (iku ? 'って' : 'いて'); ta = b + (iku ? 'った' : 'いた');
    } else if (last === 'ぐ') {
      te = b + 'いで'; ta = b + 'いだ';
    } else {
      te = b + 'して'; ta = b + 'した';
    }
    const isAru = w === 'ある' || w === '有る'; // ある → ない (et non あらない)
    return {
      dict: w, nai: isAru ? 'ない' : b + row.a + 'ない', ta, te, stemI: b + row.i,
      pot: b + row.e + 'る', pass: b + row.a + 'れる', caus: b + row.a + 'せる', causPass: b + row.a + 'せられる',
      vol: b + row.o + 'う', imp: b + row.e, ba: b + row.e + 'ば',
      keigoStem: b + row.i, keigoPrefix: 'お',
    };
  }
  if (group === 'suru') {
    const p = w.slice(0, -2);
    return {
      dict: w, nai: p + 'しない', ta: p + 'した', te: p + 'して', stemI: p + 'し',
      pot: p + 'できる', pass: p + 'される', caus: p + 'させる', causPass: p + 'させられる',
      vol: p + 'しよう', imp: p + 'しろ', ba: p + 'すれば',
      keigoStem: p.length > 0 ? p : null, keigoPrefix: 'ご',
    };
  }
  // kuru : 来る (kanji conservé) ou くる (lecture : こ / き / く)
  const kanji = w.endsWith('来る');
  const p = w.slice(0, -2);
  const ko = kanji ? '来' : 'こ';
  const ki = kanji ? '来' : 'き';
  const ku = kanji ? '来' : 'く';
  return {
    dict: w, nai: p + ko + 'ない', ta: p + ki + 'た', te: p + ki + 'て', stemI: p + ki,
    pot: p + ko + 'られる', pass: p + ko + 'られる', caus: p + ko + 'させる', causPass: p + ko + 'させられる',
    vol: p + ko + 'よう', imp: p + (kanji ? '来い' : 'こい'), ba: p + ku + 'れば',
    keigoStem: null, keigoPrefix: 'お',
  };
}

// Verbes dont la politesse élevée / humble est un mot spécial (et non le motif régulier お〜になる / お〜する)
const KEIGO_SPECIAL: Record<string, { son?: [string, string]; ken?: [string, string] }> = {
  食べる: { son: ['召し上がる', 'めしあがる'], ken: ['いただく', 'いただく'] },
  飲む: { son: ['召し上がる', 'めしあがる'], ken: ['いただく', 'いただく'] },
  見る: { son: ['ご覧になる', 'ごらんになる'], ken: ['拝見する', 'はいけんする'] },
  言う: { son: ['おっしゃる', 'おっしゃる'], ken: ['申す', 'もうす'] },
  行く: { son: ['いらっしゃる', 'いらっしゃる'], ken: ['参る', 'まいる'] },
  来る: { son: ['いらっしゃる', 'いらっしゃる'], ken: ['参る', 'まいる'] },
  いる: { son: ['いらっしゃる', 'いらっしゃる'], ken: ['おる', 'おる'] },
  居る: { son: ['いらっしゃる', 'いらっしゃる'], ken: ['おる', 'おる'] },
  する: { son: ['なさる', 'なさる'], ken: ['いたす', 'いたす'] },
  知る: { son: ['ご存じです', 'ごぞんじです'], ken: ['存じる', 'ぞんじる'] },
  くれる: { son: ['くださる', 'くださる'] },
  もらう: { ken: ['いただく', 'いただく'] },
  あげる: { ken: ['差し上げる', 'さしあげる'] },
  聞く: { ken: ['伺う', 'うかがう'] },
  会う: { ken: ['お目にかかる', 'おめにかかる'] },
  着る: { son: ['お召しになる', 'おめしになる'] },
  寝る: { son: ['お休みになる', 'おやすみになる'] },
};

type FormSpec = { id: string; label_fr: string; term_jp: string; level: JaLevel; build: (k: Kit) => string | null };

const FORM_SPECS: FormSpec[] = [
  { id: 'dict', label_fr: 'Forme du dictionnaire (familier, présent / futur)', term_jp: '辞書形', level: 'A1', build: (k) => k.dict },
  { id: 'masu', label_fr: 'Poli : présent / futur', term_jp: 'ます形', level: 'A1', build: (k) => k.stemI + 'ます' },
  { id: 'masen', label_fr: 'Poli : négatif', term_jp: 'ません', level: 'A1', build: (k) => k.stemI + 'ません' },
  { id: 'mashita', label_fr: 'Poli : passé', term_jp: 'ました', level: 'A1', build: (k) => k.stemI + 'ました' },
  { id: 'masendeshita', label_fr: 'Poli : passé négatif', term_jp: 'ませんでした', level: 'A1', build: (k) => k.stemI + 'ませんでした' },
  { id: 'mashou', label_fr: 'Proposition : « faisons… »', term_jp: 'ましょう', level: 'A1', build: (k) => k.stemI + 'ましょう' },
  { id: 'te', label_fr: 'Forme en て (enchaîner, demander)', term_jp: 'て形', level: 'A1', build: (k) => k.te },
  { id: 'nai', label_fr: 'Familier : négatif', term_jp: 'ない形', level: 'A1', build: (k) => k.nai },
  { id: 'ta', label_fr: 'Familier : passé', term_jp: 'た形', level: 'A1', build: (k) => k.ta },
  { id: 'tai', label_fr: 'Vouloir faire', term_jp: 'たい形', level: 'A1', build: (k) => k.stemI + 'たい' },
  { id: 'nakatta', label_fr: 'Familier : passé négatif', term_jp: 'なかった', level: 'A2', build: (k) => k.nai.slice(0, -1) + 'かった' },
  { id: 'teiru', label_fr: 'En train de… / état résultant', term_jp: 'ている', level: 'A2', build: (k) => k.te + 'いる' },
  { id: 'tekudasai', label_fr: 'Demander poliment : « faites… »', term_jp: 'てください', level: 'A2', build: (k) => k.te + 'ください' },
  { id: 'naidekudasai', label_fr: 'Demander de ne pas faire', term_jp: 'ないでください', level: 'A2', build: (k) => k.nai.slice(0, -1) + 'いでください' },
  { id: 'pot', label_fr: 'Pouvoir faire (potentiel)', term_jp: '可能形', level: 'A2', build: (k) => k.pot },
  { id: 'vol', label_fr: 'Familier : « faisons / je vais… »', term_jp: '意向形', level: 'A2', build: (k) => k.vol },
  { id: 'tara', label_fr: 'Condition : « si / quand je fais… »', term_jp: 'たら形', level: 'B1', build: (k) => k.ta + 'ら' },
  { id: 'ba', label_fr: 'Condition : « si… » (ば)', term_jp: 'ば形', level: 'B1', build: (k) => k.ba },
  { id: 'pass', label_fr: 'Passif', term_jp: '受身形', level: 'B1', build: (k) => k.pass },
  { id: 'caus', label_fr: 'Causatif : « faire faire »', term_jp: '使役形', level: 'B1', build: (k) => k.caus },
  { id: 'imp', label_fr: 'Impératif (familier, brutal)', term_jp: '命令形', level: 'B1', build: (k) => k.imp },
  { id: 'prohib', label_fr: 'Interdiction : « ne fais pas »', term_jp: '禁止形', level: 'B1', build: (k) => k.dict + 'な' },
  { id: 'causpass', label_fr: 'Causatif-passif : « être forcé de »', term_jp: '使役受身', level: 'B2', build: (k) => k.causPass },
  {
    id: 'sonkeigo', label_fr: 'Politesse élevée : action de l’autre', term_jp: '尊敬語 (お〜になる)', level: 'B2',
    build: (k) => (k.keigoStem && k.keigoStem.length >= 2 ? k.keigoPrefix + k.keigoStem + 'になる' : null),
  },
  {
    id: 'kenjou', label_fr: 'Politesse humble : ma propre action', term_jp: '謙譲語 (お〜する)', level: 'B2',
    build: (k) => (k.keigoStem && k.keigoStem.length >= 2 ? k.keigoPrefix + k.keigoStem + 'する' : null),
  },
];

/** Toutes les formes d'un verbe : écriture normale + lecture en kana. */
export function conjugateJapaneseVerb(written: string, reading: string, group: JaVerbGroup): JaFormRow[] {
  const kw = kit(written, group);
  const kr = kit(reading, group);
  const rows: JaFormRow[] = [];
  for (const spec of FORM_SPECS) {
    const special = KEIGO_SPECIAL[written];
    if ((spec.id === 'sonkeigo' || spec.id === 'kenjou') && special) {
      const pair = spec.id === 'sonkeigo' ? special.son : special.ken;
      if (pair) {
        rows.push({ id: spec.id, label_fr: spec.label_fr, term_jp: spec.term_jp + ' — mot spécial', level: spec.level, written: pair[0], reading: pair[1] });
      }
      continue;
    }
    const w = spec.build(kw);
    const r = spec.build(kr);
    if (w == null || r == null) continue;
    rows.push({ id: spec.id, label_fr: spec.label_fr, term_jp: spec.term_jp, level: spec.level, written: w, reading: r });
  }
  return rows;
}

// ---------------------------------------------------------
// Contrôle des verbes proposés par Gemini (anti-erreur de classement)
// ---------------------------------------------------------
const I_E_ROW = 'いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ';
// Verbes en -iru / -eru qui sont pourtant du groupe 1 (godan) — courants.
const GODAN_IRU_ERU = new Set([
  '帰る', '入る', '切る', '知る', '走る', '要る', '減る', '限る', '蹴る', '参る', '散る', '滑る', '握る', '照る',
  '焦る', '茂る', '湿る', '練る', '捻る', '遮る', '返る', '喋る', 'しゃべる', 'はいる',
]);
const KANA_OK = /^[\u3041-\u3096\u30A1-\u30FAー]+$/;

export type JaVerbCheck = { ok: true; reading: string } | { ok: false; reason: string };

export function validateJapaneseVerb(written: string, ruby: string, group: string): JaVerbCheck {
  if (!written || typeof ruby !== 'string') return { ok: false, reason: 'champs manquants' };
  if (stripRuby(ruby) !== written) return { ok: false, reason: 'furigana incohérent' };
  const reading = readingFromRuby(ruby);
  if (!KANA_OK.test(reading)) return { ok: false, reason: 'lecture non kana' };
  if (written.slice(-1) !== reading.slice(-1)) return { ok: false, reason: 'terminaison différente' };

  const pre = reading.slice(-2, -1);
  switch (group) {
    case 'suru':
      return written.endsWith('する') && reading.endsWith('する') ? { ok: true, reading } : { ok: false, reason: 'pas un verbe en する' };
    case 'kuru':
      return (written === 'くる' || written.endsWith('来る') || written.endsWith('てくる') || written.endsWith('でくる')) && reading.endsWith('くる')
        ? { ok: true, reading }
        : { ok: false, reason: 'pas 来る' };
    case 'ichidan':
      if (reading.length < 2 || !reading.endsWith('る') || !I_E_ROW.includes(pre)) return { ok: false, reason: 'pas -iru/-eru' };
      if (GODAN_IRU_ERU.has(written)) return { ok: false, reason: 'classé ichidan à tort (godan)' };
      return { ok: true, reading };
    case 'godan': {
      const last = reading.slice(-1);
      if (!ROWS[last]) return { ok: false, reason: 'terminaison godan inconnue' };
      if (last === 'る' && I_E_ROW.includes(pre) && !GODAN_IRU_ERU.has(written)) {
        return { ok: false, reason: 'classement godan/ichidan ambigu' };
      }
      return { ok: true, reading };
    }
    default:
      return { ok: false, reason: 'groupe inconnu' };
  }
}
