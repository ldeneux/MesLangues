// Index des images présentes dans public/image_webp (liste générée au build par scripts/make-image-manifest.mjs).
import imageManifest from './imageManifest.json';
import { makeImageIndex, findImage } from './imageName';

export const IMAGE_INDEX = makeImageIndex(imageManifest as string[]);

/** Fichier image du mot s'il existe (nom enregistré en base en priorité, sinon déduit de la traduction), sinon null. */
export function resolveImage(stored: string | null | undefined, translationFr: string): string | null {
  return findImage(IMAGE_INDEX, stored, translationFr);
}
