// Coin lecture : demandes à Gemini et vérification des réponses. Module pur (testable sans réseau).
//  - 1re langue lue d'un récit : une version dans la langue apprise + la traduction française, en un appel.
//  - langue suivante : version écrite à partir de la traduction française déjà enregistrée (même histoire, mêmes paragraphes).
import type { ReadingEntry } from './readingCatalog';
import { findReadingOrigin } from './readingCatalog';

export type ReadingLang = 'it' | 'es' | 'en' | 'ja' | 'de' | 'fr';

export type StoredVersion = { title: string; paragraphs: string[] };

/** Ce que le lecteur affiche : la version dans la langue apprise + la traduction française alignée. */
export type ReadingView = { lang: ReadingLang; version: StoredVersion; fr: StoredVersion };

export const LANG_NAMES: Record<ReadingLang, string> = {
  it: 'italien',
  es: 'espagnol',
  en: 'anglais',
  ja: 'japonais',
  de: 'allemand',
  fr: 'français',
};

/** Longueur visée dans la langue : mots, ou caractères pour le japonais (≈ 1,7 caractère par mot). */
export function targetUnits(entry: ReadingEntry, lang: ReadingLang): number {
  return lang === 'ja' ? Math.round(entry.words * 1.7) : entry.words;
}

/** Nombre de paragraphes souhaité (≈ 105 à 170 mots chacun). */
export function paragraphRange(words: number): [number, number] {
  return [Math.max(4, Math.round(words / 170)), Math.max(6, Math.round(words / 105))];
}

function lengthRule(entry: ReadingEntry, lang: ReadingLang): string {
  const u = targetUnits(entry, lang);
  return lang === 'ja' ? `environ ${u} caractères` : `environ ${u} mots`;
}

const COMMON_RULES = `Tu es un écrivain et un professeur de langues. Tu adaptes de grands récits du monde en lectures pour des apprenants de niveau B2 (CECRL).

Principes :
- Raconte l'histoire du début à la fin, fidèlement : tous les épisodes importants, les personnages principaux, le dénouement, le ton et l'atmosphère du récit d'origine. C'est un résumé cohérent, pas un squelette : la longueur indiquée a été choisie pour cela, respecte-la à ±15 %.
- Niveau B2 : vocabulaire riche mais clair, phrases variées avec subordonnées, temps du récit propres à chaque langue. Ni notes, ni commentaire, ni moralité ajoutée.
- C'est une adaptation écrite avec tes propres mots : ne recopie jamais une traduction ou une édition existante.
- Japonais : écriture naturelle avec kanji, sans furigana ni romaji.`;

function storyLine(entry: ReadingEntry): string {
  const origin = findReadingOrigin(entry.origin);
  return `Récit à adapter : « ${entry.title} » (titre d'origine : ${entry.original}) — ${entry.kind}${
    entry.author ? ` de ${entry.author}` : ' (tradition anonyme ou orale)'
  }. Origine : ${origin?.label ?? entry.origin}.`;
}

/** 1re version d'un récit : langue apprise + traduction française (même nombre de paragraphes, alignés). */
export function buildMasterPrompt(entry: ReadingEntry, lang: ReadingLang): { system: string; user: string } {
  const [pMin, pMax] = paragraphRange(entry.words);
  const name = LANG_NAMES[lang];
  const system = `${COMMON_RULES}

Tâche : écris deux versions du même récit.
(a) La version en ${name}, ${lengthRule(entry, lang)}, écrite comme le ferait un auteur natif.
(b) La traduction française fidèle de (a), paragraphe pour paragraphe.
Les deux versions ont exactement le même nombre de paragraphes, entre ${pMin} et ${pMax}, alignés un à un : le paragraphe i du français traduit le paragraphe i de la version en ${name}.
Donne aussi le titre dans chaque langue.

Réponds uniquement avec ce JSON :
{ "title": "…", "paragraphs": ["…"], "title_fr": "…", "paragraphs_fr": ["…"] }`;
  return { system, user: storyLine(entry) };
}

/** Version dans une autre langue, écrite à partir de la traduction française déjà enregistrée. */
export function buildTranslationPrompt(entry: ReadingEntry, lang: ReadingLang, fr: StoredVersion): { system: string; user: string } {
  const name = LANG_NAMES[lang];
  const n = fr.paragraphs.length;
  const system = `${COMMON_RULES}

Tâche : on te donne la version française d'un récit, en ${n} paragraphes. Écris la version en ${name} : même histoire, même contenu, ${lengthRule(entry, lang)}, au niveau B2, comme le ferait un auteur natif (pas de calque du français).
Elle contient exactement ${n} paragraphes, alignés un à un avec le français : le paragraphe i en ${name} correspond au paragraphe i du français.
Donne aussi le titre en ${name}.

Réponds uniquement avec ce JSON :
{ "title": "…", "paragraphs": ["…"] }`;
  const user = `${storyLine(entry)}\n\nVersion française (titre : ${fr.title}) :\n${JSON.stringify(fr.paragraphs)}`;
  return { system, user };
}

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJson(raw: string): any {
  try {
    return JSON.parse(stripFences(raw));
  } catch {
    throw new Error("La réponse de Gemini n'est pas un JSON valide : rien n'a été enregistré, réessaie.");
  }
}

function countUnits(paragraphs: string[], lang: ReadingLang): number {
  const text = paragraphs.join(' ');
  return lang === 'ja' ? text.replace(/\s+/g, '').length : text.trim().split(/\s+/).filter(Boolean).length;
}

function checkVersion(title: unknown, paras: unknown, lang: ReadingLang, entry: ReadingEntry): StoredVersion {
  const name = LANG_NAMES[lang];
  if (typeof title !== 'string' || !title.trim()) throw new Error(`Titre manquant (${name}) : rien n'a été enregistré, réessaie.`);
  if (!Array.isArray(paras) || paras.length === 0 || paras.some((p) => typeof p !== 'string' || !p.trim())) {
    throw new Error(`Texte manquant ou mal formé (${name}) : rien n'a été enregistré, réessaie.`);
  }
  const list = (paras as string[]).map((p) => p.trim());
  const target = targetUnits(entry, lang);
  const units = countUnits(list, lang);
  if (units < target * 0.55 || units > target * 1.6) {
    throw new Error(
      `Longueur inattendue (${name} : ${units} ${lang === 'ja' ? 'caractères' : 'mots'} au lieu de ≈ ${target}) : rien n'a été enregistré, réessaie.`
    );
  }
  if (list.length < 3 || list.length > 24) throw new Error(`Nombre de paragraphes inattendu (${name} : ${list.length}) : rien n'a été enregistré, réessaie.`);
  return { title: title.trim(), paragraphs: list };
}

/** Réponse à buildMasterPrompt : version dans la langue + traduction française, mêmes paragraphes. */
export function parseMaster(raw: string, lang: ReadingLang, entry: ReadingEntry): { version: StoredVersion; fr: StoredVersion } {
  const d = parseJson(raw);
  const version = checkVersion(d?.title, d?.paragraphs, lang, entry);
  const fr = checkVersion(d?.title_fr, d?.paragraphs_fr, 'fr', entry);
  if (version.paragraphs.length !== fr.paragraphs.length) {
    throw new Error(
      `La version et sa traduction n'ont pas le même nombre de paragraphes (${version.paragraphs.length} et ${fr.paragraphs.length}) : rien n'a été enregistré, réessaie.`
    );
  }
  return { version, fr };
}

/** Réponse à buildTranslationPrompt : doit avoir autant de paragraphes que le français enregistré. */
export function parseTranslation(raw: string, lang: ReadingLang, entry: ReadingEntry, expectedParagraphs: number): StoredVersion {
  const d = parseJson(raw);
  const version = checkVersion(d?.title, d?.paragraphs, lang, entry);
  if (version.paragraphs.length !== expectedParagraphs) {
    throw new Error(
      `La version n'a pas le même nombre de paragraphes que la traduction française (${version.paragraphs.length} au lieu de ${expectedParagraphs}) : rien n'a été enregistré, réessaie.`
    );
  }
  return version;
}
