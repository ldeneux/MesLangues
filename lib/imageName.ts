// Images des mots : le fichier porte le texte du mot français tel qu'il est écrit (article compris), avec espaces,
// accents, tirets et apostrophes autorisés : « un fromage » → public/image_webp/un fromage.webp,
// « l'heure » → l'heure.webp, « avant-hier » → avant-hier.webp.
// La reconnaissance est TOLÉRANTE (clé de comparaison) : casse, accents, apostrophes, tirets et espaces en trop sont
// ignorés, donc « À plus tard » trouve « A plus tard.webp » et « ça » trouve « çà ». Module pur (client et serveur).
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

export type ImageIndex = Map<string, string>; // clé → nom réel du fichier (sans .webp)

export function makeImageIndex(fileNames: string[]): ImageIndex {
  const index: ImageIndex = new Map();
  for (const n of fileNames) {
    const k = imageKey(n);
    if (k && !index.has(k)) index.set(k, n);
  }
  return index;
}

/** Fichier image d'un mot : d'abord le nom enregistré en base (s'il existe), sinon celui déduit de la traduction ; null si aucun. */
export function findImage(index: ImageIndex, stored: string | null | undefined, translationFr: string): string | null {
  const byStored = stored ? index.get(imageKey(stored)) : undefined;
  return byStored ?? index.get(imageKey(translationFr)) ?? null;
}
