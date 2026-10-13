// Nom du fichier image d'un mot : le « slug » de sa traduction française, article compris.
// Exemples : « un fromage » → un_fromage, « l'heure » → l_heure, « une sortie d'urgence » → une_sortie_d_urgence,
// « à côté de » → a_cote_de. Le même mot français a donc la même image dans toutes les langues.
// Fichiers : public/image_webp/<nom>.webp. Module pur (client et serveur).
export const IMAGE_DIR = '/image_webp';

export function imageSlug(translationFr: string): string {
  return (translationFr ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const imageUrl = (name: string) => `${IMAGE_DIR}/${name}.webp`;
