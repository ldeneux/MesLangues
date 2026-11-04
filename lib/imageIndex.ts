// Index des images disponibles : noms enregistrés dans la table word_images (images sur Cloudflare R2, migration 036)
// + fichiers encore présents dans public/image_webp (liste générée au build par scripts/make-image-manifest.mjs).
// Module SERVEUR uniquement (il lit Supabase) : les fonctions qui l'utilisent appellent d'abord `await ensureImageIndex()`,
// puis resolveImage / nearImage (synchrones) lisent l'index en mémoire.
import imageManifest from './imageManifest.json';
import { makeImageIndex, findImage, findNearImage, type ImageIndex } from './imageName';
import { supabaseAdmin } from './supabaseAdmin';
import { FUNCTIONS_SCHEMA } from './dbSchema';

const TTL_MS = 5 * 60 * 1000; // l'index est relu au plus toutes les 5 minutes (et tout de suite après un envoi d'images)
const RETRY_MS = 30 * 1000; // si la lecture échoue, nouvel essai dans 30 s

const localNames = imageManifest as string[];
let current: ImageIndex = makeImageIndex(localNames);
let expiresAt = 0;
let loading: Promise<void> | null = null;

/** Noms enregistrés dans word_images : un seul appel (fonction SQL), sinon lecture page par page. */
async function fetchRegisteredNames(): Promise<string[]> {
  const rpc = await supabaseAdmin.schema(FUNCTIONS_SCHEMA).rpc('list_image_names');
  if (!rpc.error && Array.isArray(rpc.data)) return rpc.data as string[];
  const names: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('word_images').select('name').order('name').range(from, from + 999);
    if (error) throw new Error(error.message); // table absente (migration 036 pas exécutée) : on garde les fichiers du dépôt
    names.push(...((data ?? []) as { name: string }[]).map((r) => r.name));
    if (!data || data.length < 1000) break;
  }
  return names;
}

export async function ensureImageIndex(): Promise<void> {
  if (Date.now() < expiresAt) return;
  if (!loading) {
    loading = (async () => {
      try {
        const registered = await fetchRegisteredNames();
        current = makeImageIndex(Array.from(new Set([...localNames, ...registered])));
        expiresAt = Date.now() + TTL_MS;
      } catch {
        expiresAt = Date.now() + RETRY_MS; // on garde l'index précédent
      } finally {
        loading = null;
      }
    })();
  }
  await loading;
}

/** À appeler après avoir ajouté des images : l'index est relu au prochain besoin. */
export function invalidateImageIndex(): void {
  expiresAt = 0;
}

/** Fichier image du mot s'il existe (nom enregistré en base en priorité, sinon déduit de la traduction), sinon null. */
export function resolveImage(stored: string | null | undefined, translationFr: string): string | null {
  return findImage(current, stored, translationFr);
}

/** Fichier aux accents différents (non utilisé), pour avertir dans la liste des images manquantes. */
export function nearImage(translationFr: string): string | null {
  return findNearImage(current, translationFr);
}
