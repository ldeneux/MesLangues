'use server';

// Génération AUTOMATIQUE d'une planche de 20 illustrations par l'API OpenAI (1536x1024, PNG sans perte).
// Un appel = une planche. Le navigateur appelle cette fonction une fois par planche, puis découpe l'image reçue (lib/imageBoard.ts).
// La clé OPENAI_API_KEY reste côté serveur (variable d'environnement Vercel, jamais envoyée au navigateur).
//
// Réglages (variables d'environnement Vercel, sans toucher au code) :
//   OPENAI_IMAGE_MODEL    modèle principal. Par défaut « gpt-image-2.5-sunburst » (le plus fidèle aux consignes de mise en page).
//   OPENAI_IMAGE_QUALITY  low | medium | high | xhigh | max. Par défaut « high ». Plus haut = grille plus régulière, texte plus net, et plus cher.
//   OPENAI_IMAGE_COST_USD coût d'une planche en dollars (affichage seulement), si tu veux remplacer l'estimation par le coût réel mesuré.
// Si OpenAI refuse le nom du modèle ou la qualité, l'appel est refait automatiquement avec un modèle de repli, puis avec la qualité « high ».

import { BOARD_IMAGE_QUALITY, BOARD_IMAGE_SIZE, BOARD_SIZE, buildBoardPrompt, estimateBoardCostUsd } from './imageBoard';

// Type volontairement « plat » (pas d'union ok: true / ok: false) : le projet compile sans « strict »
export type GenerateBoardResult = {
  ok: boolean;
  b64?: string; // image PNG encodée en base64 (si ok)
  model?: string; // modèle réellement utilisé
  quality?: string; // qualité réellement utilisée
  error?: string; // message d'erreur (si !ok)
  retryable?: boolean; // limite de débit ou panne passagère : on peut réessayer
};

const DEFAULT_MODEL = 'gpt-image-2.5-sunburst';
const FALLBACK_MODELS = ['gpt-image-2', 'gpt-image-1.5']; // utilisés dans l'ordre si le modèle principal est refusé
const QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];

function configuredModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;
}
function configuredQuality(): string {
  const q = (process.env.OPENAI_IMAGE_QUALITY || BOARD_IMAGE_QUALITY).toLowerCase();
  return QUALITIES.includes(q) ? q : BOARD_IMAGE_QUALITY;
}

export type BoardGenConfig = { model: string; quality: string; size: string; costUsd: number; hasKey: boolean };

/** Réglages actuels de la génération automatique (pour l'affichage : modèle, qualité, coût indicatif d'une planche). */
export async function getBoardGenConfig(): Promise<BoardGenConfig> {
  const model = configuredModel();
  const quality = configuredQuality();
  const envCost = Number(process.env.OPENAI_IMAGE_COST_USD);
  return {
    model,
    quality,
    size: BOARD_IMAGE_SIZE,
    costUsd: Number.isFinite(envCost) && envCost > 0 ? envCost : estimateBoardCostUsd(model, quality),
    hasKey: !!process.env.OPENAI_API_KEY,
  };
}

async function callOpenAI(apiKey: string, model: string, quality: string, prompt: string): Promise<{ res?: Response; error?: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt,
        size: BOARD_IMAGE_SIZE,
        quality,
        n: 1,
        output_format: 'png', // sans perte : les traits magenta servent à repérer la grille
      }),
      signal: AbortSignal.timeout(280_000),
    });
    return { res };
  } catch (e: any) {
    return { error: `Appel OpenAI interrompu : ${e?.message ?? e}` };
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    return (await res.json())?.error?.message ?? '';
  } catch {
    return ''; // corps non JSON
  }
}

export async function generateBoardImage(words: string[]): Promise<GenerateBoardResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY manquante (à ajouter dans les variables d’environnement Vercel, puis redéployer).', retryable: false };
  }
  // Garde-fou : une seule planche par appel, jamais plus de 20 mots (limite le coût d'un appel mal formé)
  if (!Array.isArray(words) || words.length === 0 || words.length > BOARD_SIZE || words.some((w) => typeof w !== 'string' || w.length > 120)) {
    return { ok: false, error: `Liste de mots invalide (1 à ${BOARD_SIZE} mots attendus).`, retryable: false };
  }

  const prompt = buildBoardPrompt(words);
  const models = [configuredModel(), ...FALLBACK_MODELS.filter((m) => m !== configuredModel())];
  let quality = configuredQuality();
  let lastError = '';

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let attemptQuality = quality;
    for (let q = 0; q < 2; q++) {
      const { res, error } = await callOpenAI(apiKey, model, attemptQuality, prompt);
      if (error) return { ok: false, error, retryable: true };
      if (res!.ok) {
        const json = await res!.json();
        const b64 = json?.data?.[0]?.b64_json;
        if (!b64) return { ok: false, error: 'Réponse OpenAI sans image.', retryable: true };
        return { ok: true, b64, model, quality: attemptQuality };
      }
      const detail = await errorDetail(res!);
      lastError = `OpenAI ${res!.status}${detail ? ` : ${detail}` : ''} (modèle ${model}, qualité ${attemptQuality})`;
      const status = res!.status;
      if (status === 429 || status >= 500) return { ok: false, error: lastError, retryable: true };
      if ((status === 400 || status === 404) && /quality/i.test(detail) && attemptQuality !== 'high') {
        attemptQuality = 'high'; // qualité inconnue de ce modèle : on réessaie en « high »
        continue;
      }
      break; // modèle refusé (inconnu, non autorisé…) → modèle de repli suivant
    }
    if (!(lastError.includes('OpenAI 400') || lastError.includes('OpenAI 404') || lastError.includes('OpenAI 403'))) break;
  }
  return { ok: false, error: lastError || 'Échec de la génération.', retryable: false };
}
