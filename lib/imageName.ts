// Images des mots : le fichier porte le texte du mot français tel qu'il est écrit (article compris), avec espaces,
// accents, tirets et apostrophes autorisés : « un fromage » → public/image_webp/un fromage.webp,
// « l'heure » → l'heure.webp, « avant-hier » → avant-hier.webp.
//
// Reconnaissance (clé de comparaison) :
//  - la casse, les apostrophes (droite ou typographique), les tirets et les espaces en trop sont ignorés ;
//  - les ACCENTS COMPTENT : « salé » (goût) ≠ « sale » (propreté), « ou » ≠ « où », « a » ≠ « à » ;
//    seule exception : l'accent d'une majuscule initiale, qu'on tape rarement (« À plus tard » = « A plus tard ») ;
//  - en dernier recours l'ARTICLE est ignoré : « la pharmacie » trouve « une pharmacie.webp » (nom exact toujours prioritaire).
// Un fichier presque identique mais aux accents différents n'est pas utilisé : il est signalé dans la liste des images manquantes.
// Module pur (client et serveur).
export const IMAGE_DIR = '/image_webp';

const ARTICLE = /^(?:de la|de l|du|des|au|aux|le|la|les|l|un|une|d) (.+)$/;

/** Clé de comparaison, accents conservés : minuscules, tout ce qui n'est ni lettre ni chiffre devient un espace unique. */
export function imageKey(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Comme imageKey, mais l'accent d'une MAJUSCULE initiale est retiré (« À plus tard » → « a plus tard »). */
export function imageKeyCap(text: string): string {
  const t = (text ?? '').normalize('NFC').trim();
  const first = t.charAt(0);
  if (first && first !== first.toLowerCase()) {
    const base = first.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return imageKey(base + t.slice(1));
  }
  return imageKey(t);
}

/** Clé sans accents (pour repérer les fichiers « presque » identiques) : « salé » et « sale » → « sale ». */
export function imageLooseKey(text: string): string {
  return imageKey(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Ancien calcul des noms (sans accents, avec _), encore présent en base pour les mots traités par une ancienne version. */
export function legacySlug(text: string): string {
  return imageLooseKey(text).replace(/ /g, '_');
}

/** Clé sans l'article de tête : « la pharmacie » et « une pharmacie » → « pharmacie ». */
export function imageBareKey(text: string): string {
  const k = imageKeyCap(text);
  const m = k.match(ARTICLE);
  return m ? m[1] : k;
}

/** Nom de fichier à créer pour un mot : le mot lui-même, sans les caractères interdits dans un nom de fichier (\ / : * ? " < > |). */
export function imageFileName(translationFr: string): string {
  return (translationFr ?? '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

/** Adresse publique d'une image (le nom est encodé : espaces, accents, apostrophes). */
export const imageUrl = (fileName: string) => `${IMAGE_DIR}/${encodeURIComponent(fileName)}.webp`;

// exact : clé → fichier ; bare : clé sans article → fichier ; loose : clé sans accents → fichier (sert seulement aux avertissements)
export type ImageIndex = { exact: Map<string, string>; bare: Map<string, string>; loose: Map<string, string> };

export function makeImageIndex(fileNames: string[]): ImageIndex {
  const exact = new Map<string, string>();
  const bare = new Map<string, string>();
  const loose = new Map<string, string>();
  for (const n of fileNames) {
    for (const k of new Set([imageKey(n), imageKeyCap(n)])) {
      if (!k) continue;
      if (!exact.has(k)) exact.set(k, n);
      const m = k.match(ARTICLE);
      const b = m ? m[1] : k;
      if (!bare.has(b)) bare.set(b, n);
    }
    const l = imageLooseKey(n);
    if (l && !loose.has(l)) loose.set(l, n);
  }
  return { exact, bare, loose };
}

/**
 * Fichier image d'un mot, ou null. Ordre : nom enregistré en base (s'il n'est pas un reste de l'ancien calcul sans accents),
 * traduction exacte, puis traduction sans article (« la pharmacie » → « une pharmacie.webp »).
 */
export function findImage(index: ImageIndex, stored: string | null | undefined, translationFr: string): string | null {
  if (stored && stored !== legacySlug(translationFr)) {
    const byStored = index.exact.get(imageKey(stored)) ?? index.exact.get(imageKeyCap(stored));
    if (byStored) return byStored;
  }
  const keys = Array.from(new Set([imageKey(translationFr), imageKeyCap(translationFr)]));
  for (const k of keys) {
    const hit = index.exact.get(k);
    if (hit) return hit;
  }
  for (const k of keys) {
    const m = k.match(ARTICLE);
    const hit = index.bare.get(m ? m[1] : k);
    if (hit) return hit;
  }
  return null;
}

/** Fichier aux accents différents de ce mot (« salé » → « sale.webp »), pour avertir ; null s'il n'y en a pas. */
export function findNearImage(index: ImageIndex, translationFr: string): string | null {
  return index.loose.get(imageLooseKey(translationFr)) ?? null;
}
