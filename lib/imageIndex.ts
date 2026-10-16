// Index des images présentes dans public/image_webp (liste générée au build par scripts/make-image-manifest.mjs).
import imageManifest from './imageManifest.json';
import { makeImageIndex, findImage, findNearImage } from './imageName';

export const IMAGE_INDEX = makeImageIndex(imageManifest as string[]);

/** Fichier image du mot s'il existe (nom enregistré en base en priorité, sinon déduit de la traduction), sinon null. */
export function resolveImage(stored: string | null | undefined, translationFr: string): string | null {
  return findImage(IMAGE_INDEX, stored, translationFr);
}

/** Fichier aux accents différents (non utilisé), pour avertir dans la liste des images manquantes. */
export function nearImage(translationFr: string): string | null {
  return findNearImage(IMAGE_INDEX, translationFr);
}
