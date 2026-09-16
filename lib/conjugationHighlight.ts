// Heuristique volontairement simple : essaie de repérer la terminaison la
// plus longue parmi les terminaisons régulières usuelles pour ce temps/cette
// langue. Ne fonctionne pas pour les verbes irréguliers (essere, avoir,
// ser/estar, to be...) — dans ce cas, on n'affiche pas de surbrillance
// plutôt que d'afficher un découpage faux.

const SUFFIXES: Record<string, Record<string, string[]>> = {
  it: {
    present: ['iamo', 'iscono', 'isco', 'isci', 'isce', 'ete', 'ono', 'ano', 'ate', 'o', 'i', 'a', 'e'],
    futur: ['anno', 'emo', 'ete', 'ò', 'ai', 'à'],
    passe_compose: ['ato', 'uto', 'ito'],
    imparfait: ['avamo', 'avate', 'avano', 'evamo', 'evate', 'evano', 'ivamo', 'ivate', 'ivano', 'avo', 'avi', 'ava', 'evo', 'evi', 'eva', 'ivo', 'ivi', 'iva'],
  },
  es: {
    present: ['amos', 'áis', 'emos', 'éis', 'imos', 'ís', 'an', 'en', 'as', 'es', 'o', 'a', 'e'],
    futur: ['emos', 'éis', 'án', 'ás', 'é', 'á'],
    passe_compose: ['ado', 'ido'],
    imparfait: ['ábamos', 'abais', 'aban', 'íamos', 'íais', 'ían', 'aba', 'abas', 'ía', 'ías'],
  },
  en: {
    present: ['es', 's'],
    futur: [],
    passe_compose: ['ed'],
    imparfait: ['ing'],
  },
};

export function splitEnding(form: string, languageCode: string, tense: string): { stem: string; ending: string } | null {
  const candidates = SUFFIXES[languageCode]?.[tense] ?? [];
  const lower = form.toLowerCase();

  for (const suffix of candidates) {
    if (lower.endsWith(suffix) && form.length - suffix.length >= 2) {
      return { stem: form.slice(0, form.length - suffix.length), ending: form.slice(form.length - suffix.length) };
    }
  }
  return null;
}
