'use server';

// Génération AUTOMATIQUE d'une planche de 20 illustrations par l'API OpenAI (gpt-image-1-mini, qualité medium, 1536x1024).
// Un appel = une planche = environ 0,015 $. Le navigateur appelle cette fonction une fois par planche, puis découpe l'image reçue
// (lib/imageBoard.ts). La clé OPENAI_API_KEY reste côté serveur (variable d'environnement Vercel, jamais envoyée au navigateur).

import { BOARD_IMAGE_QUALITY, BOARD_IMAGE_SIZE, BOARD_SIZE, buildBoardPrompt } from './imageBoard';

// Type volontairement « plat » (pas d'union ok: true / ok: false) : le projet compile sans « strict », et TypeScript ne sait
// alors pas distinguer les deux cas, ce qui faisait échouer le build (« Property 'error' does not exist »).
export type GenerateBoardResult = {
  ok: boolean;
  b64?: string; // image PNG encodée en base64 (si ok)
  error?: string; // message d'erreur (si !ok)
  retryable?: boolean; // limite de débit ou panne passagère : on peut réessayer
};

// Le modèle peut être changé sans toucher au code (OPENAI_IMAGE_MODEL), par exemple quand gpt-image-1-mini sera retiré de l'API.
const DEFAULT_MODEL = 'gpt-image-1-mini';

export async function generateBoardImage(words: string[]): Promise<GenerateBoardResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY manquante (à ajouter dans les variables d’environnement Vercel, puis redéployer).', retryable: false };
  }
  // Garde-fou : une seule planche par appel, jamais plus de 20 mots (limite le coût d'un appel mal formé)
  if (!Array.isArray(words) || words.length === 0 || words.length > BOARD_SIZE || words.some((w) => typeof w !== 'string' || w.length > 120)) {
    return { ok: false, error: `Liste de mots invalide (1 à ${BOARD_SIZE} mots attendus).`, retryable: false };
  }

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL,
        prompt: buildBoardPrompt(words),
        size: BOARD_IMAGE_SIZE,
        quality: BOARD_IMAGE_QUALITY,
        n: 1,
        output_format: 'png', // sans perte : les traits magenta servent à repérer la grille
      }),
      signal: AbortSignal.timeout(280_000),
    });
  } catch (e: any) {
    return { ok: false, error: `Appel OpenAI interrompu : ${e?.message ?? e}`, retryable: true };
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* corps non JSON */
    }
    return {
      ok: false,
      error: `OpenAI ${res.status}${detail ? ` : ${detail}` : ''}`,
      retryable: res.status === 429 || res.status >= 500,
    };
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: 'Réponse OpenAI sans image.', retryable: true };
  return { ok: true, b64 };
}
