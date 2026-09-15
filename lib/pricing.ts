// Tarifs de référence (voir discussion produit) — à ajuster si les prix
// Gemini/Google Cloud TTS changent. Volontairement approximatif : sert à
// donner un ordre de grandeur avant de lancer une génération, pas une
// facture exacte.

const GEMINI_INPUT_PRICE_PER_M = 1.5; // $/1M tokens
const GEMINI_OUTPUT_PRICE_PER_M = 7.5; // $/1M tokens
const TTS_PRICE_PER_M_CHARS = 4; // $/1M caractères (voix Standard)

const EST_OUTPUT_TOKENS_PER_PHRASE = 70;
const EST_INPUT_TOKENS_PER_CHUNK = 600;
const EST_CHARS_PER_PHRASE = 70;
const CHUNK_SIZE = 20;

const USD_TO_EUR = 0.93;

export type CostEstimate = {
  usd: number;
  eur: number;
};

export function estimatePackCost(phraseCount: number): CostEstimate {
  const chunks = Math.ceil(phraseCount / CHUNK_SIZE);
  const geminiInputTokens = chunks * EST_INPUT_TOKENS_PER_CHUNK;
  const geminiOutputTokens = phraseCount * EST_OUTPUT_TOKENS_PER_PHRASE;
  const geminiCost =
    (geminiInputTokens / 1e6) * GEMINI_INPUT_PRICE_PER_M + (geminiOutputTokens / 1e6) * GEMINI_OUTPUT_PRICE_PER_M;

  const ttsChars = phraseCount * EST_CHARS_PER_PHRASE;
  const ttsCost = (ttsChars / 1e6) * TTS_PRICE_PER_M_CHARS;

  const usd = geminiCost + ttsCost;
  return { usd, eur: usd * USD_TO_EUR };
}
