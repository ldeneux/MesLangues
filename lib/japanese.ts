// Données et fonctions PURES pour le japonais (pas de 'use server' ici :
// ces constantes et fonctions sont utilisées côté navigateur).

export type KanaEntry = { romaji: string; hira: string; rare?: boolean };

// "ka:か ki:き - ko:こ*" → une ligne ; "-" = case vide ; "*" = kana rare (exclu des quiz)
function row(spec: string): (KanaEntry | null)[] {
  return spec.split(' ').map((tok) => {
    if (tok === '-') return null;
    const [romaji, rest] = tok.split(':');
    const rare = rest.endsWith('*');
    return { romaji, hira: rare ? rest.slice(0, -1) : rest, rare };
  });
}

export const KANA_SECTIONS: { key: 'base' | 'daku' | 'yoon'; label: string; columns: number; rows: (KanaEntry | null)[][] }[] = [
  {
    key: 'base',
    label: 'Base (46)',
    columns: 5,
    rows: [
      row('a:あ i:い u:う e:え o:お'),
      row('ka:か ki:き ku:く ke:け ko:こ'),
      row('sa:さ shi:し su:す se:せ so:そ'),
      row('ta:た chi:ち tsu:つ te:て to:と'),
      row('na:な ni:に nu:ぬ ne:ね no:の'),
      row('ha:は hi:ひ fu:ふ he:へ ho:ほ'),
      row('ma:ま mi:み mu:む me:め mo:も'),
      row('ya:や - yu:ゆ - yo:よ'),
      row('ra:ら ri:り ru:る re:れ ro:ろ'),
      row('wa:わ - - - wo:を'),
      row('n:ん - - - -'),
    ],
  },
  {
    key: 'daku',
    label: 'Sons voisés (゛ ゜)',
    columns: 5,
    rows: [
      row('ga:が gi:ぎ gu:ぐ ge:げ go:ご'),
      row('za:ざ ji:じ zu:ず ze:ぜ zo:ぞ'),
      row('da:だ ji:ぢ* zu:づ* de:で do:ど'),
      row('ba:ば bi:び bu:ぶ be:べ bo:ぼ'),
      row('pa:ぱ pi:ぴ pu:ぷ pe:ぺ po:ぽ'),
    ],
  },
  {
    key: 'yoon',
    label: 'Combinaisons (ゃ ゅ ょ)',
    columns: 3,
    rows: [
      row('kya:きゃ kyu:きゅ kyo:きょ'),
      row('gya:ぎゃ gyu:ぎゅ gyo:ぎょ'),
      row('sha:しゃ shu:しゅ sho:しょ'),
      row('ja:じゃ ju:じゅ jo:じょ'),
      row('cha:ちゃ chu:ちゅ cho:ちょ'),
      row('nya:にゃ nyu:にゅ nyo:にょ'),
      row('hya:ひゃ hyu:ひゅ hyo:ひょ'),
      row('bya:びゃ byu:びゅ byo:びょ'),
      row('pya:ぴゃ pyu:ぴゅ pyo:ぴょ'),
      row('mya:みゃ myu:みゅ myo:みょ'),
      row('rya:りゃ ryu:りゅ ryo:りょ'),
    ],
  },
];

/** hiragana → katakana (décalage Unicode de 0x60) */
export function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

// ---------------------------------------------------------
// Saisie rōmaji → kana (clavier intégré)
// ---------------------------------------------------------
const INPUT_TABLE: Record<string, string> = {};
for (const section of KANA_SECTIONS) {
  for (const r of section.rows) {
    for (const e of r) {
      if (e && !e.rare && e.romaji !== 'n') INPUT_TABLE[e.romaji] = e.hira;
    }
  }
}
Object.assign(INPUT_TABLE, {
  // variantes courantes de saisie
  si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', di: 'ぢ', du: 'づ',
  sya: 'しゃ', syu: 'しゅ', syo: 'しょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  // petits kana et mots d'origine étrangère
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', she: 'しぇ', che: 'ちぇ', je: 'じぇ',
  tsa: 'つぁ', wi: 'うぃ', we: 'うぇ',
});

const PUNCT: Record<string, string> = { ',': '、', '.': '。', '?': '？', '!': '！' };
const VOWELS = 'aiueo';

export function romajiToHiragana(input: string, final = false): string {
  const s = input;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i).toLowerCase();
    const c = rest[0];

    // "n" : ん ou début de na/ni/nu/ne/no/nya…
    if (c === 'n') {
      const n1 = rest[1];
      const n2 = rest[2];
      if (n1 === undefined) {
        out += final ? 'ん' : s[i];
        i += 1;
        continue;
      }
      if (n1 === "'") {
        out += 'ん';
        i += 2;
        continue;
      }
      if (n1 === 'n') {
        if (n2 === undefined) {
          out += final ? 'ん' : s.slice(i, i + 2); // "nn" reste affiché tant qu'on ne sait pas si une voyelle suit
          i += 2;
          continue;
        }
        if (VOWELS.includes(n2) || n2 === 'y') {
          out += 'ん'; // "nna" → んな
          i += 1;
          continue;
        }
        out += 'ん'; // "nn" + consonne
        i += 2;
        continue;
      }
      if (!(VOWELS.includes(n1) || n1 === 'y')) {
        out += 'ん'; // n + consonne / espace / ponctuation
        i += 1;
        continue;
      }
      // sinon : na, ni, nya… → table ci-dessous
    }

    // consonne double → っ (kitte → きって, matcha → まっちゃ)
    if (/[bcdfghjkmpqrstvz]/.test(c) && rest[1] === c) {
      out += 'っ';
      i += 1;
      continue;
    }
    if (c === 't' && rest.startsWith('tch')) {
      out += 'っ';
      i += 1;
      continue;
    }

    let matched = false;
    for (let len = 4; len >= 1; len--) {
      const key = rest.slice(0, len);
      if (key.length === len && INPUT_TABLE[key]) {
        out += INPUT_TABLE[key];
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    out += PUNCT[s[i]] ?? s[i]; // lettre incomplète (reste en latin) ou autre caractère
    i += 1;
  }
  return out;
}

export function romajiToKana(input: string, opts: { katakana?: boolean; final?: boolean } = {}): string {
  const hira = romajiToHiragana(input, opts.final ?? false);
  if (!opts.katakana) return hira;
  return toKatakana(hira).replace(/-/g, 'ー');
}

// ---------------------------------------------------------
// Furigana : format "{食|た}べる" (kanji | lecture)
// ---------------------------------------------------------
export type RubySegment = { base: string; rt?: string };

export function parseRuby(ruby: string): RubySegment[] {
  const out: RubySegment[] = [];
  const re = /\{([^|}]+)\|([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ruby)) !== null) {
    if (m.index > last) out.push({ base: ruby.slice(last, m.index) });
    out.push({ base: m[1], rt: m[2] });
    last = m.index + m[0].length;
  }
  if (last < ruby.length) out.push({ base: ruby.slice(last) });
  return out;
}

export function stripRuby(ruby: string): string {
  return ruby.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1');
}

// ---------------------------------------------------------
// Lectures et comparaison de textes japonais
// ---------------------------------------------------------
/** katakana → hiragana (pour comparer "コーヒー" et "こーひー") */
export function toHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Lecture complète en kana d'un texte au format furigana : "{食|た}べる" → "たべる" */
export function readingFromRuby(ruby: string): string {
  return parseRuby(ruby)
    .map((seg) => seg.rt ?? seg.base)
    .join('');
}

// ---------------------------------------------------------
// Kana → rōmaji (Hepburn, avec macrons) — pour afficher la prononciation d'une lecture en kana
// ---------------------------------------------------------
const KANA_TO_ROMAJI: Record<string, string> = {};
for (const section of KANA_SECTIONS) {
  for (const r of section.rows) {
    for (const e of r) if (e && !e.rare) KANA_TO_ROMAJI[e.hira] = e.romaji;
  }
}
Object.assign(KANA_TO_ROMAJI, { を: 'o', ぢ: 'ji', づ: 'zu', ん: 'n' });
const MACRON: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };

export function kanaToRomaji(kana: string): string {
  const s = toHiragana(kana);
  let out = '';
  let geminate = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === 'っ') {
      geminate = true;
      i++;
      continue;
    }
    if (c === 'ー') {
      out = out.replace(/[aiueo]$/, (m) => MACRON[m]);
      i++;
      continue;
    }
    if (c === 'ん') {
      const next = s[i + 1];
      out += 'n' + (next && /[あいうえおやゆよ]/.test(next) ? "'" : '');
      i++;
      continue;
    }
    let r: string | undefined;
    let len = 1;
    if (i + 1 < s.length && /[ゃゅょ]/.test(s[i + 1]) && KANA_TO_ROMAJI[s.slice(i, i + 2)]) {
      r = KANA_TO_ROMAJI[s.slice(i, i + 2)];
      len = 2;
    } else {
      r = KANA_TO_ROMAJI[c];
    }
    if (!r) {
      out += c; // kanji, espace, ponctuation : on laisse tel quel
      geminate = false;
      i++;
      continue;
    }
    if (geminate) {
      out += r.startsWith('ch') ? 't' : r[0];
      geminate = false;
    }
    out += r;
    i += len;
  }
  return out.replace(/ou/g, 'ō').replace(/oo/g, 'ō').replace(/uu/g, 'ū').replace(/aa/g, 'ā').replace(/ee/g, 'ē');
}

/**
 * Reporte les surbrillances **...** d'un texte sur sa version avec furigana.
 * marked : "私は**学生**です" ; ruby : "{私|わたし}は{学生|がくせい}です" → "{私|わたし}は**{学生|がくせい}**です"
 * Renvoie null si le furigana ne correspond pas au texte (on affichera alors le texte sans furigana).
 */
export function applyHighlightToRuby(marked: string, ruby: string): string | null {
  // 1. texte brut + intervalles surlignés
  let plain = '';
  const intervals: [number, number][] = [];
  for (const part of marked.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const inner = part.slice(2, -2);
      intervals.push([plain.length, plain.length + inner.length]);
      plain += inner;
    } else {
      plain += part;
    }
  }
  if (stripRuby(ruby) !== plain) return null;

  // 2. unités : un groupe {kanji|lecture} = 1 unité ; un texte brut = 1 unité par caractère
  type Unit = { text: string; start: number; end: number };
  const units: Unit[] = [];
  let pos = 0;
  for (const seg of parseRuby(ruby)) {
    if (seg.rt) {
      units.push({ text: `{${seg.base}|${seg.rt}}`, start: pos, end: pos + seg.base.length });
      pos += seg.base.length;
    } else {
      for (const ch of Array.from(seg.base)) {
        units.push({ text: ch, start: pos, end: pos + ch.length });
        pos += ch.length;
      }
    }
  }

  // 3. on regroupe les unités surlignées voisines entre ** **
  const isHl = (u: Unit) => intervals.some(([a, b]) => u.start < b && u.end > a);
  let out = '';
  let open = false;
  for (const u of units) {
    const hl = isHl(u);
    if (hl && !open) out += '**';
    if (!hl && open) out += '**';
    open = hl;
    out += u.text;
  }
  if (open) out += '**';
  return out;
}
