// Affichage et lecture des conjugaisons : fonctions pures, utilisables côté client ET côté serveur.

export type TenseKey = 'present' | 'passe_compose' | 'futur' | 'imparfait';

// Pronoms français affichés devant chaque forme (3e personne du singulier : « elle » seul).
export const PRONOUNS_FR = ['je', 'tu', 'elle', 'nous', 'vous', 'ils/elles'];

export const TENSE_LABELS: Record<TenseKey, string> = {
  present: 'Présent',
  passe_compose: 'Passé composé',
  futur: 'Futur simple',
  imparfait: 'Imparfait',
};

// Deux tableaux de deux temps : présent / passé composé, puis futur / imparfait.
export const TENSE_TABLES: [TenseKey, TenseKey][] = [
  ['present', 'passe_compose'],
  ['futur', 'imparfait'],
];

// Vitesse de lecture des conjugaisons (80 % : plus facile à suivre).
export const CONJUGATION_PLAYBACK_RATE = 0.8;

/** Anglais : infinitif complet (« to have »). Les autres langues sont inchangées. */
export function displayInfinitive(infinitive: string, languageCode: string): string {
  const t = (infinitive ?? '').trim();
  if (languageCode === 'en' && t && !/^to\s/i.test(t)) return `to ${t}`;
  return infinitive;
}

// « he/she/it has » → « she has » (idem dans les autres langues) : l'audio lisait toute la liste de pronoms.
const SEP = String.raw`\s*(?:\/|,|\bor\b|\bo\b|\bou\b)\s*`;
const THIRD_PERSON: Record<string, RegExp[]> = {
  en: [new RegExp(String.raw`(?<![\p{L}])he${SEP}she(?:${SEP}it)?(?![\p{L}])`, 'iu')],
  it: [new RegExp(String.raw`(?<![\p{L}])lui${SEP}lei(?![\p{L}])`, 'iu')],
  es: [new RegExp(String.raw`(?<![\p{L}])él${SEP}ella(?![\p{L}])`, 'iu')],
  de: [new RegExp(String.raw`(?<![\p{L}])er${SEP}sie(?:${SEP}es)?(?![\p{L}])`, 'iu')],
};
const THIRD_REPLACEMENT: Record<string, string> = { en: 'she', it: 'lei', es: 'ella', de: 'sie' };

export function simplifyForm(form: string, languageCode: string): string {
  const patterns = THIRD_PERSON[languageCode];
  if (!patterns) return form;
  let out = form;
  for (const re of patterns) out = out.replace(re, THIRD_REPLACEMENT[languageCode]);
  return out;
}

/** Texte lu par la synthèse vocale pour un temps (6 formes). */
export function spokenConjugation(forms: string[], languageCode: string): string {
  return forms.map((f) => simplifyForm(f, languageCode)).join(', ') + '.';
}

/** Vrai si le texte lu change avec les règles ci-dessus (l'ancien audio est à régénérer). */
export function spokenConjugationChanged(forms: string[], languageCode: string): boolean {
  return spokenConjugation(forms, languageCode) !== forms.join(', ') + '.';
}
