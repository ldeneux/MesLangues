// Phrases d'exemple des leçons : retrouver les mots d'une leçon dans une phrase, puis choisir les 3 phrases qui en couvrent
// le plus. Module PUR (sans base de données, sans appel Gemini) : gratuit, testable avec node.
//
// Reconnaissance (approximative, volontairement prudente : mieux vaut rater un mot que valider un faux) :
//  - langues à espaces (it, es, en, de) : on compare les mots sans accents ni majuscules, après avoir retiré l'article du mot
//    de la leçon ; un mot est retrouvé tel quel, ou par son radical (pluriel, féminin, verbe conjugué) si le radical a ≥ 4 lettres ;
//  - japonais : on cherche le texte du mot dans la phrase (verbes : toutes leurs formes conjuguées ; adjectifs en い : leurs
//    formes), avec une règle de « frontière » pour éviter de retrouver 本 dans 日本.
import { conjugateJapaneseVerb } from './japaneseVerbs';

export type MatchWordSpec = {
  id: string;
  text: string; // forme du dictionnaire (target_text, ou infinitif pour un verbe)
  type: 'nom' | 'adjectif' | 'verbe' | 'autre';
  weight: number; // 1 = mot de la leçon, 0.5 = mot de révision
  reading?: string; // japonais, verbes : lecture en kana
  group?: string; // japonais, verbes : groupe (godan, ichidan, suru, kuru)
};

export type MatchSpan = [number, number]; // début (inclus), fin (exclue) dans le texte d'origine

export type PhraseMatch = {
  ids: string[]; // mots retrouvés (sans doublon)
  spans: MatchSpan[]; // où les surligner
  main: number; // nombre de mots de la leçon (poids 1) retrouvés
  score: number; // somme des poids
};

const ARTICLES: Record<string, string[]> = {
  it: ['il', 'lo', 'la', 'l', 'i', 'gli', 'le', 'un', 'uno', 'una', 'dei', 'delle', 'del', 'della', 'dello', 'dell', 'degli', 'al', 'alla', 'allo', 'all', 'ai', 'alle'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo'],
  en: ['the', 'a', 'an', 'to'],
  de: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'],
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');

type Token = { norm: string; start: number; end: number };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) out.push({ norm: norm(m[0]), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return out;
}

// Formes possibles d'un mot (pluriel, féminin, conjugaisons) : on compare mot entier à mot entier, jamais des débuts de mots
// (« mela » ne retrouve pas « melone », « comer » ne retrouve pas « comida »). Terminaisons sans accents, comme les mots comparés.
const VERB_TAILS: Record<string, string[]> = {
  it: ['are', 'ere', 'ire', 'o', 'i', 'a', 'e', 'iamo', 'ate', 'ete', 'ite', 'ano', 'ono', 'ai', 'asti', 'arono', 'ei', 'esti', 'ette', 'etti', 'emmo', 'erono', 'ii', 'isti', 'irono',
       'avo', 'avi', 'ava', 'avamo', 'avate', 'avano', 'evo', 'evi', 'eva', 'evamo', 'evate', 'evano', 'ivo', 'ivi', 'iva', 'ivamo', 'ivate', 'ivano', 'ando', 'endo', 'ato', 'uto', 'ito',
       'ero', 'erai', 'era', 'eremo', 'erete', 'eranno', 'erei', 'erebbe', 'iro', 'isco', 'isci', 'isce', 'iscono'],
  es: ['ar', 'er', 'ir', 'o', 'as', 'es', 'a', 'e', 'amos', 'emos', 'imos', 'ais', 'eis', 'is', 'an', 'en', 'aste', 'iste', 'aron', 'ieron', 'aba', 'abas', 'aban', 'abamos', 'ia', 'ias', 'ian', 'iamos',
       'ando', 'iendo', 'ado', 'ido', 'are', 'ere', 'ire', 'ara', 'era', 'ira', 'aran', 'eran', 'iran', 'i', 'io'],
  en: ['', 's', 'es', 'ed', 'd', 'ing', 'ies', 'ied'],
  de: ['en', 'e', 'st', 't', 'et', 'te', 'ten', 'test', 'tet', 'end'],
};

const NOUN_TAILS: Record<string, string[]> = {
  it: ['', 'a', 'e', 'i', 'o', 'he', 'hi', 'ia', 'ie', 'ci', 'ce', 'ghe', 'ghi', 'che', 'chi'],
  es: ['', 'a', 'e', 'o', 'as', 'os', 'es', 's', 'ones', 'on'],
  en: ['', 's', 'es', 'ed', 'ing', 'er', 'ly', 'd'],
  de: ['', 'e', 'en', 'er', 's', 'n', 'es', 'em'],
};

function verbBase(lang: string, t: string): string {
  if (lang === 'it') return t.replace(/(ar|er|ir)si$/, '$1e').replace(/(are|ere|ire)$/, '');
  if (lang === 'es') return t.replace(/(ar|er|ir)se$/, '$1').replace(/(ar|er|ir)$/, '');
  if (lang === 'de') return t.endsWith('en') ? t.slice(0, -2) : t.endsWith('n') ? t.slice(0, -1) : t;
  return t;
}

function nounBase(lang: string, t: string): string {
  if ((lang === 'it' || lang === 'es') && t.length >= 4 && /[aeiou]$/.test(t)) return t.slice(0, -1);
  return t;
}

const formsCache = new Map<string, Set<string>>();

function formsOf(lang: string, type: MatchWordSpec['type'], spec: string): Set<string> {
  const cacheKey = `${lang}|${type}|${spec}`;
  const cached = formsCache.get(cacheKey);
  if (cached) return cached;
  const forms = new Set<string>([spec]);
  if (type !== 'autre') {
    const base = type === 'verbe' ? verbBase(lang, spec) : nounBase(lang, spec);
    if (base.length >= 3) {
      const tails = (type === 'verbe' ? VERB_TAILS[lang] : NOUN_TAILS[lang]) ?? [];
      for (const t of tails) forms.add(base + t);
    }
    if (lang === 'en' && spec.length >= 3) {
      if (spec.endsWith('e')) for (const t of ['ing', 'ed', 'er', 'es']) forms.add(spec.slice(0, -1) + t);
      if (spec.endsWith('y')) for (const t of ['ies', 'ied', 'ier']) forms.add(spec.slice(0, -1) + t);
    }
  }
  formsCache.set(cacheKey, forms);
  return forms;
}

function tokenMatches(lang: string, type: MatchWordSpec['type'], spec: string, tok: string): boolean {
  return tok === spec || formsOf(lang, type, spec).has(tok);
}

// ---------- japonais ----------
const isKanji = (c: string | undefined) => !!c && /[\u4e00-\u9fff々]/.test(c);
const isKatakana = (c: string | undefined) => !!c && /[\u30a1-\u30fa\u30fc]/.test(c);
const hasKanji = (s: string) => /[\u4e00-\u9fff々]/.test(s);

function jaNeedles(spec: MatchWordSpec): string[] {
  const t = spec.text.trim();
  if (!t) return [];
  if (spec.type === 'verbe') {
    const forms = new Set<string>([t]);
    if (spec.reading && spec.group) {
      try {
        for (const r of conjugateJapaneseVerb(t, spec.reading, spec.group as any)) forms.add(r.written);
      } catch {
        /* groupe inconnu : on garde la forme du dictionnaire */
      }
    }
    return Array.from(forms);
  }
  if (spec.type === 'adjectif' && t.length >= 2 && t.endsWith('い')) {
    const s = t.slice(0, -1);
    return [t, s + 'く', s + 'かっ', s + 'けれ'];
  }
  return [t];
}

function jaFind(text: string, needle: string): MatchSpan | null {
  if (!needle) return null;
  // mot uniquement en hiragana : au moins 3 signes pour éviter les faux positifs (は、 で、 はい…)
  if (!hasKanji(needle) && !/[\u30a1-\u30fa]/.test(needle) && needle.length < 3) return null;
  let from = 0;
  for (;;) {
    const i = text.indexOf(needle, from);
    if (i < 0) return null;
    const prev = text[i - 1];
    const next = text[i + needle.length];
    const first = needle[0];
    const last = needle[needle.length - 1];
    const bad =
      (isKanji(first) && isKanji(prev)) ||
      (isKanji(last) && isKanji(next)) ||
      (isKatakana(first) && isKatakana(prev)) ||
      (isKatakana(last) && isKatakana(next));
    if (!bad) return [i, i + needle.length];
    from = i + 1;
  }
}

/** Retrouve dans `phrase` les mots de `specs`. */
export function matchPhrase(lang: string, specs: MatchWordSpec[], phrase: string): PhraseMatch {
  const ids: string[] = [];
  const spans: MatchSpan[] = [];
  let main = 0;
  let score = 0;

  if (lang === 'ja') {
    for (const spec of specs) {
      let hit: MatchSpan | null = null;
      for (const n of jaNeedles(spec)) {
        hit = jaFind(phrase, n);
        if (hit) break;
      }
      if (hit) {
        ids.push(spec.id);
        spans.push(hit);
        score += spec.weight;
        if (spec.weight >= 1) main++;
      }
    }
    return { ids, spans: mergeSpans(spans), main, score };
  }

  const toks = tokenize(phrase);
  const articles = new Set(ARTICLES[lang] ?? []);
  for (const spec of specs) {
    let words = tokenize(spec.text).map((t) => t.norm);
    while (words.length > 1 && articles.has(words[0])) words = words.slice(1);
    words = words.filter((w) => w.length > 0);
    if (words.length === 0 || (words.length === 1 && words[0].length < 2)) continue;

    let found: MatchSpan | null = null;
    for (let i = 0; i + words.length <= toks.length && !found; i++) {
      let ok = true;
      for (let j = 0; j < words.length; j++) {
        if (!tokenMatches(lang, spec.type, words[j], toks[i + j].norm)) {
          ok = false;
          break;
        }
      }
      if (ok) found = [toks[i].start, toks[i + words.length - 1].end];
    }
    if (found) {
      ids.push(spec.id);
      spans.push(found);
      score += spec.weight;
      if (spec.weight >= 1) main++;
    }
  }
  return { ids, spans: mergeSpans(spans), main, score };
}

function mergeSpans(spans: MatchSpan[]): MatchSpan[] {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0]);
  const out: MatchSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

/** Met le texte en surbrillance avec la convention **…** (affichage et PDF). */
export function markSpans(text: string, spans: MatchSpan[]): string {
  let out = '';
  let pos = 0;
  for (const [a, b] of spans) {
    out += text.slice(pos, a) + '**' + text.slice(a, b) + '**';
    pos = b;
  }
  return out + text.slice(pos);
}

// ---------- choix des phrases ----------
export type SentenceCandidate = {
  id: string;
  text: string;
  fr: string;
  audio_url: string | null;
  source: 'pack' | 'generated';
  theme?: string | null;
};

export type PickedSentence = SentenceCandidate & { match: PhraseMatch };

export const SENTENCES_PER_LESSON = 3;

/**
 * Choisit jusqu'à `max` phrases : d'abord celles qui contiennent au moins 2 mots de la leçon, en maximisant le nombre de mots
 * différents couverts ; à défaut, celles qui en contiennent un. Reproductible : à données égales, même résultat.
 */
export function pickSentences(lang: string, specs: MatchWordSpec[], theme: string, candidates: SentenceCandidate[], max = SENTENCES_PER_LESSON): PickedSentence[] {
  const scored: PickedSentence[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.text.trim().toLowerCase();
    if (!key || seen.has(key) || c.text.length > 140) continue;
    seen.add(key);
    const match = matchPhrase(lang, specs, c.text);
    if (match.score >= 1) scored.push({ ...c, match });
  }

  const covered = new Set<string>();
  const picked: PickedSentence[] = [];
  const better = (a: PickedSentence, b: PickedSentence) => {
    const gain = (p: PickedSentence) => p.match.ids.filter((id) => !covered.has(id)).length;
    if (gain(a) !== gain(b)) return gain(b) - gain(a);
    if (a.match.score !== b.match.score) return b.match.score - a.match.score;
    const ta = a.theme === theme ? 0 : 1;
    const tb = b.theme === theme ? 0 : 1;
    if (ta !== tb) return ta - tb;
    if (a.text.length !== b.text.length) return a.text.length - b.text.length;
    return a.id < b.id ? -1 : 1;
  };

  for (const tier of [(p: PickedSentence) => p.match.main >= 2, (p: PickedSentence) => p.match.score >= 1]) {
    let pool = scored.filter((p) => tier(p) && !picked.includes(p));
    while (picked.length < max && pool.length > 0) {
      pool = pool.slice().sort(better);
      const best = pool.shift()!;
      picked.push(best);
      for (const id of best.match.ids) covered.add(id);
    }
    if (picked.length >= max) break;
  }
  return picked;
}

/** Nombre de phrases « bonnes » (≥ 2 mots de la leçon) parmi les candidates, plafonné à `max` : sert à savoir combien en générer. */
export function countGoodSentences(lang: string, specs: MatchWordSpec[], candidates: { text: string }[], max = SENTENCES_PER_LESSON): number {
  let n = 0;
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.text.trim().toLowerCase();
    if (!key || seen.has(key) || c.text.length > 140) continue;
    seen.add(key);
    if (matchPhrase(lang, specs, c.text).main >= 2) {
      n++;
      if (n >= max) return max;
    }
  }
  return n;
}

/** Une phrase générée est acceptée si elle contient bien au moins 2 mots de la leçon (contrôle par le code, pas par la confiance en Gemini). */
export function validateGenerated(lang: string, specs: MatchWordSpec[], text: string): boolean {
  return text.trim().length >= 3 && text.length <= 140 && matchPhrase(lang, specs, text).main >= 2;
}
