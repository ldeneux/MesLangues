'use server';

import { callGemini, LANGUAGE_NAMES } from './gemini';

export type ConversationTurn = {
  speaker: 'ai' | 'user';
  text: string;
};

export type ConversationCorrection = {
  has_error: boolean;
  corrected_text: string;
  explanation_fr: string;
};

export type ConversationReply = {
  message: string;
  message_fr: string;
  correction: ConversationCorrection;
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

Règles pour la conversation elle-même :
- Tu parles UNIQUEMENT en ${langName} dans le champ "message" (jamais en français).
- Tu poses des questions courtes et naturelles, comme une vraie discussion
  informelle, pas un exercice scolaire.
- Tu t'adaptes à ce que dit l'apprenant : si sa réponse est brève, demande une
  précision ; si elle est riche, rebondis dessus et va plus loin ; si elle est
  hors sujet, suis-le avec curiosité plutôt que de forcer ton sujet de départ.
- Niveau ${levelCode} : ${levelHint}
- Une seule question ou relance à la fois dans "message", jamais plusieurs
  d'un coup, pour garder un vrai rythme de conversation.
- "message_fr" est la traduction française fidèle de "message", pour un
  bouton "traduire" côté apprenant.

Règles pour la correction (champ "correction"), TRÈS IMPORTANT :
- Analyse la DERNIÈRE réponse de l'apprenant (pas les précédentes).
- Dès qu'il y a une faute de grammaire, de conjugaison, d'accord ou de
  vocabulaire — MÊME SI tu as parfaitement compris le sens — tu dois la
  signaler. Ne laisse pas passer une erreur sous prétexte que le message
  reste compréhensible : l'objectif est que l'apprenant progresse.
- "has_error" : true s'il y a au moins une erreur notable, false sinon (pas
  de correction pour une simple hésitation ou une réponse déjà correcte).
- "corrected_text" (si has_error) : la phrase de l'apprenant réécrite
  correctement en ${langName}, rien d'autre.
- "explanation_fr" (si has_error) : en français, une explication courte et
  pédagogique du point corrigé (ex : "conjugaison du verbe être au présent",
  "accord de l'adjectif au féminin", "ordre des mots dans la question"...).
  Une ou deux phrases maximum, orientée apprentissage, pas juste "faute
  d'orthographe".
- Si has_error est false, laisse "corrected_text" et "explanation_fr" vides.
- Pour le tout premier message de la conversation (pas encore de réponse de
  l'apprenant), "correction.has_error" doit être false.

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement cette forme :
{
  "message": "ta réplique en ${langName}",
  "message_fr": "traduction française de ta réplique",
  "correction": {
    "has_error": true ou false,
    "corrected_text": "réponse corrigée de l'apprenant en ${langName}, ou chaîne vide",
    "explanation_fr": "explication pédagogique en français, ou chaîne vide"
  }
}`;
}

/**
 * Calcule le prochain tour de la conversation (ouverture si l'historique est
 * vide, sinon relance adaptée à la dernière réponse de l'apprenant, avec
 * correction pédagogique systématique).
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
d'ouverture). "correction.has_error" doit être false pour ce premier message.`;
  } else {
    const transcript = history
      .map((t) => `${t.speaker === 'ai' ? 'Toi' : "Apprenant"} : ${t.text}`)
      .join('\n');
    user = `Voici la conversation jusqu'ici :
${transcript}

Corrige la dernière réponse de l'apprenant si besoin (voir règles), puis
réagis et relance avec ta prochaine question ou remarque.`;
  }

  const text = await callGemini(system, user);
  const parsed = JSON.parse(text) as Partial<ConversationReply>;

  if (!parsed || typeof parsed.message !== 'string') {
    throw new Error('Format de réponse de conversation inattendu reçu de Gemini');
  }

  return {
    message: parsed.message,
    message_fr: parsed.message_fr ?? '',
    correction: {
      has_error: parsed.correction?.has_error ?? false,
      corrected_text: parsed.correction?.corrected_text ?? '',
      explanation_fr: parsed.correction?.explanation_fr ?? '',
    },
  };
}
