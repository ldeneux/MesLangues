'use server';

import { callGemini, LANGUAGE_NAMES } from './gemini';

export type ConversationTurn = {
  speaker: 'ai' | 'user';
  text: string;
};

export type ConversationReply = {
  message: string;
  feedback_fr: string;
};

const LEVEL_INSTRUCTIONS: Record<string, string> = {
  A1: "phrases très simples, présent, vocabulaire de base, questions courtes.",
  A2: "phrases simples mais un peu plus riches, passé/futur proche, connecteurs simples.",
  B1: "rythme normal, subordonnées simples, tu peux relancer sur des opinions.",
  B2: "rythme naturel, nuances, tu peux challenger un peu plus l'apprenant.",
};

function buildSystemPrompt(languageCode: string, levelCode: string, theme?: string) {
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const levelHint = LEVEL_INSTRUCTIONS[levelCode] ?? LEVEL_INSTRUCTIONS.A1;
  const themeHint = theme ? ` Le sujet de la conversation est : "${theme}".` : '';

  return `Tu es un partenaire de conversation en ${langName} pour un(e) apprenant(e)
francophone de niveau CECRL ${levelCode} qui s'entraîne à l'oral.${themeHint}

Règles :
- Tu parles UNIQUEMENT en ${langName} dans le champ "message" (jamais en français).
- Tu poses des questions courtes et naturelles, comme une vraie discussion
  informelle, pas un exercice scolaire.
- Tu t'adaptes à ce que dit l'apprenant : si sa réponse est brève, demande une
  précision ; si elle est riche, rebondis dessus et va plus loin ; si elle est
  hors sujet, suis-le avec curiosité plutôt que de forcer ton sujet de départ.
- Niveau ${levelCode} : ${levelHint}
- Si l'apprenant fait une erreur de grammaire ou de vocabulaire notable dans sa
  dernière réponse, mets une courte reformulation corrigée et bienveillante en
  français dans "feedback_fr" (une phrase maximum). Sinon laisse "feedback_fr"
  vide (chaîne vide, pas de commentaire de politesse superflu).
- Une seule question ou relance à la fois dans "message", jamais plusieurs
  d'un coup, pour garder un vrai rythme de conversation.

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement ces clés :
{ "message": "ta réplique en ${langName}", "feedback_fr": "correction brève en français, ou chaîne vide" }`;
}

/**
 * Calcule le prochain tour de la conversation (ouverture si l'historique est
 * vide, sinon relance adaptée à la dernière réponse de l'apprenant).
 */
export async function getConversationTurn(
  languageCode: string,
  levelCode: string,
  history: ConversationTurn[],
  theme?: string
): Promise<ConversationReply> {
  const system = buildSystemPrompt(languageCode, levelCode, theme);

  let user: string;
  if (history.length === 0) {
    user = `Démarre la conversation avec une première question simple et naturelle
(pas de "bonjour, comment vas-tu" trop scolaire, sois créatif dans le choix du sujet
d'ouverture). "feedback_fr" doit être une chaîne vide pour ce premier message.`;
  } else {
    const transcript = history
      .map((t) => `${t.speaker === 'ai' ? 'Toi' : "Apprenant"} : ${t.text}`)
      .join('\n');
    user = `Voici la conversation jusqu'ici :
${transcript}

Réagis à la dernière réponse de l'apprenant, puis relance avec ta prochaine
question ou remarque, en respectant les règles données.`;
  }

  const text = await callGemini(system, user);
  const parsed = JSON.parse(text) as Partial<ConversationReply>;

  if (!parsed || typeof parsed.message !== 'string') {
    throw new Error('Format de réponse de conversation inattendu reçu de Gemini');
  }

  return { message: parsed.message, feedback_fr: parsed.feedback_fr ?? '' };
}
