// Images des mots : le fichier porte le texte du mot français tel qu'il est écrit (article compris), avec espaces,
// accents, tirets et apostrophes autorisés : « un fromage » → public/image_webp/un fromage.webp,
// « l'heure » → l'heure.webp, « avant-hier » → avant-hier.webp.
// La reconnaissance est TOLÉRANTE (clé de comparaison) : casse, accents, apostrophes, tirets et espaces en trop sont
// ignorés, donc « À plus tard » trouve « A plus tard.webp » et « ça » trouve « çà ». En dernier recours l'ARTICLE est ignoré :
// « la pharmacie » trouve « une pharmacie.webp » (le nom exact est toujours essayé en premier). Module pur (client et serveur).
export const IMAGE_DIR = '/image_webp';

/** Clé de comparaison : minuscules, sans accents, tout ce qui n'est pas lettre ou chiffre devient un espace unique. */
export function imageKey(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Nom de fichier à créer pour un mot : le mot lui-même, sans les caractères interdits dans un nom de fichier (\ / : * ? " < > |). */
export function imageFileName(translationFr: string): string {
  return (translationFr ?? '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

/** Adresse publique d'une image (le nom est encodé : espaces, accents, apostrophes). */
export const imageUrl = (fileName: string) => `${IMAGE_DIR}/${encodeURIComponent(fileName)}.webp`;

/** Clé sans l'article de tête (le, la, les, l', un, une, des, du, de la, de l', d', au, aux) : « la pharmacie » et « une pharmacie » → « pharmacie ». */
export function imageBareKey(text: string): string {
  const k = imageKey(text);
  const m = k.match(/^(?:de la|de l|du|des|au|aux|le|la|les|l|un|une|d) (.+)$/);
  return m ? m[1] : k;
}

// exact : clé complète → fichier ; bare : clé sans article → fichier (premier fichier dans l'ordre alphabétique)
export type ImageIndex = { exact: Map<string, string>; bare: Map<string, string> };

export function makeImageIndex(fileNames: string[]): ImageIndex {
  const exact = new Map<string, string>();
  const bare = new Map<string, string>();
  for (const n of fileNames) {
    const k = imageKey(n);
    if (!k) continue;
    if (!exact.has(k)) exact.set(k, n);
    const b = imageBareKey(n);
    if (b && !bare.has(b)) bare.set(b, n);
  }
  return { exact, bare };
}

/**
 * Fichier image d'un mot, ou null. Ordre : nom enregistré en base (exact), traduction (exacte),
 * puis traduction sans article (« la pharmacie » → « une pharmacie.webp »).
 */
export function findImage(index: ImageIndex, stored: string | null | undefined, translationFr: string): string | null {
  if (stored) {
    const byStored = index.exact.get(imageKey(stored));
    if (byStored) return byStored;
  }
  return index.exact.get(imageKey(translationFr)) ?? index.bare.get(imageBareKey(translationFr)) ?? null;
}
