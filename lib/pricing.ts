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

// --- Grammaire + Conjugaison (pas d'audio, texte seulement) ---
const GRAMMAR_TOPIC_COUNT = 10;
const GRAMMAR_INPUT_TOKENS_PER_CALL = 350;
const GRAMMAR_OUTPUT_TOKENS_PER_CALL = 450;

const CONJUGATION_CHUNK_SIZE = 10;
const CONJUGATION_INPUT_TOKENS_PER_CALL = 700; // grossit avec la liste anti-doublon
const CONJUGATION_OUTPUT_TOKENS_PER_CALL = 1200; // 10 verbes x 4 temps x 6 formes
const CONJUGATION_TENSE_AUDIO_CHARS = 55; // "dico, dici, dice, diciamo, dite, dicono." environ
const TENSES_PER_VERB = 4;

export function estimateGrammarConjugationCost(conjugationTarget: number): CostEstimate {
  const conjugationChunks = Math.ceil(conjugationTarget / CONJUGATION_CHUNK_SIZE);

  const inputTokens =
    GRAMMAR_TOPIC_COUNT * GRAMMAR_INPUT_TOKENS_PER_CALL + conjugationChunks * CONJUGATION_INPUT_TOKENS_PER_CALL;
  const outputTokens =
    GRAMMAR_TOPIC_COUNT * GRAMMAR_OUTPUT_TOKENS_PER_CALL + conjugationChunks * CONJUGATION_OUTPUT_TOKENS_PER_CALL;

  const geminiCost = (inputTokens / 1e6) * GEMINI_INPUT_PRICE_PER_M + (outputTokens / 1e6) * GEMINI_OUTPUT_PRICE_PER_M;

  const ttsChars = conjugationTarget * TENSES_PER_VERB * CONJUGATION_TENSE_AUDIO_CHARS;
  const ttsCost = (ttsChars / 1e6) * TTS_PRICE_PER_M_CHARS;

  const usd = geminiCost + ttsCost;
  return { usd, eur: usd * USD_TO_EUR };
}

// --- Vocabulaire (mots courts + 1 audio chacun) ---
const VOCAB_CHUNK_SIZE = 15;
const VOCAB_INPUT_TOKENS_PER_CHUNK = 500; // grossit avec la liste anti-doublon
const VOCAB_OUTPUT_TOKENS_PER_WORD = 30;
const VOCAB_CHARS_PER_WORD = 25;

export function estimateVocabularyCost(wordCount: number): CostEstimate {
  const chunks = Math.ceil(wordCount / VOCAB_CHUNK_SIZE);
  const inputTokens = chunks * VOCAB_INPUT_TOKENS_PER_CHUNK;
  const outputTokens = wordCount * VOCAB_OUTPUT_TOKENS_PER_WORD;
  const geminiCost = (inputTokens / 1e6) * GEMINI_INPUT_PRICE_PER_M + (outputTokens / 1e6) * GEMINI_OUTPUT_PRICE_PER_M;

  const ttsChars = wordCount * VOCAB_CHARS_PER_WORD;
  const ttsCost = (ttsChars / 1e6) * TTS_PRICE_PER_M_CHARS;

  const usd = geminiCost + ttsCost;
  return { usd, eur: usd * USD_TO_EUR };
}

// --- Écoute (article + 25 questions + audio, par article) ---
const ARTICLE_INPUT_TOKENS = 300;
const ARTICLE_OUTPUT_TOKENS = 400;
const ARTICLE_CHARS = 500;
const QUESTIONS_INPUT_TOKENS = 650;
const QUESTIONS_OUTPUT_TOKENS_PER_25 = 1350;

export function estimateListeningPackCost(articleCount: number): CostEstimate {
  const inputTokens = articleCount * (ARTICLE_INPUT_TOKENS + QUESTIONS_INPUT_TOKENS);
  const outputTokens = articleCount * (ARTICLE_OUTPUT_TOKENS + QUESTIONS_OUTPUT_TOKENS_PER_25);
  const geminiCost = (inputTokens / 1e6) * GEMINI_INPUT_PRICE_PER_M + (outputTokens / 1e6) * GEMINI_OUTPUT_PRICE_PER_M;

  const ttsChars = articleCount * ARTICLE_CHARS;
  const ttsCost = (ttsChars / 1e6) * TTS_PRICE_PER_M_CHARS;

  const usd = geminiCost + ttsCost;
  return { usd, eur: usd * USD_TO_EUR };
}
