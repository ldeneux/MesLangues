const MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const LANGUAGE_NAMES: Record<string, string> = {
  it: 'italien',
  es: 'espagnol',
  en: 'anglais',
  ja: 'japonais',
  de: 'allemand',
};

export const LANGUAGE_DEMONYM: Record<string, string> = {
  it: 'italophone',
  es: 'hispanophone',
  en: 'anglophone',
  ja: 'japonophone',
  de: 'germanophone',
};

export const BCP47: Record<string, string> = {
  it: 'it-IT',
  es: 'es-ES',
  en: 'en-US',
  ja: 'ja-JP',
  de: 'de-DE',
};

/**
 * Appelle l'API Gemini et retourne le texte brut de la réponse (JSON forcé
 * côté génération pour éviter d'avoir à nettoyer des balises markdown).
 */
export async function callGemini(
  system: string,
  user: string,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant');

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: options?.temperature ?? 0.9,
        responseMimeType: 'application/json',
        maxOutputTokens: options?.maxOutputTokens ?? 8192,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini a échoué (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const candidate = json?.candidates?.[0];

  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Réponse Gemini tronquée (limite de tokens atteinte) — réduis le nombre d\'éléments demandés par appel.'
    );
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse Gemini sans contenu texte');
  return text;
}
