/**
 * Normalise une chaîne pour la comparaison (anti-doublon, vérification de
 * réponse) de façon à fonctionner avec N'IMPORTE QUELLE écriture — latine
 * (accents retirés) mais aussi kanji/kana, cyrillique, etc.
 *
 * ⚠️ Ne JAMAIS filtrer sur une plage de caractères type [a-z0-9] : ça
 * retire silencieusement tout le texte des langues à écriture non-latine
 * (japonais...), ce qui fait que tous les mots normalisent vers la même
 * chaîne vide et se font traiter comme des doublons les uns des autres.
 */
export function normalizeForCompare(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents latins (é -> e, etc.)
    .replace(/[\s'".,!?;:()\-—–、。！？「」『』・]/g, ''); // espaces + ponctuation courante (latine + CJK)
}
