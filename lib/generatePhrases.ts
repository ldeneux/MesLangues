import { callGemini, LANGUAGE_NAMES } from './gemini';

export type GeneratedPhrase = {
  target_text: string;
  translation_fr: string;
  notes?: string;
};

/**
 * Génère `count` phrases de langue courante (pas des mots isolés, pas des
 * phrases de manuel scolaire artificielles) adaptées au niveau CECRL donné.
 */
export async function generatePhrases(
  languageCode: string,
  levelCode: string,
  count: number,
  theme?: string
): Promise<GeneratedPhrase[]> {
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;

  const themeInstruction = theme
    ? `Toutes les phrases doivent tourner autour du thème : "${theme}".`
    : `Varie les situations de la vie quotidienne (courses, transports, travail, famille, loisirs, imprévus, sentiments...), sans te répéter d'un jour à l'autre.`;

  const system = `Tu es un professeur de ${langName} langue étrangère, spécialisé dans la
progression CECRL (A1, A2, B1, B2). Tu génères des phrases RÉELLEMENT utilisées
dans la vie courante (pas des phrases de manuel artificielles, pas de simples
mots de vocabulaire isolés). Chaque phrase doit être idiomatique, naturelle,
et utilisable telle quelle par quelqu'un qui vit ou voyage dans un pays
${langName === 'anglais' ? 'anglophone' : langName === 'italien' ? 'italophone' : 'hispanophone'}.

Tu réponds STRICTEMENT en JSON valide, un tableau d'objets, sans aucun texte
avant ou après, sans balises markdown. Chaque objet a exactement ces clés :
- "target_text" : la phrase en ${langName}
- "translation_fr" : sa traduction en français
- "notes" : (optionnel) une remarque courte de grammaire, de registre ou de
  prononciation utile pour un apprenant francophone niveau ${levelCode}, ou
  omets la clé si rien de particulier à signaler.`;

  const user = `Génère exactement ${count} phrases de niveau CECRL ${levelCode} en ${langName}.
${themeInstruction}
Niveau ${levelCode} : ${
    levelCode === 'A1'
      ? 'phrases très simples, présent, vocabulaire de base, structures courtes.'
      : levelCode === 'A2'
      ? 'phrases simples mais un peu plus riches, quelques temps du passé/futur, connecteurs simples (parce que, mais, après).'
      : 'phrases plus complexes, subordonnées, nuances, registre varié.'
  }`;

  const text = await callGemini(system, user);
  const parsed = JSON.parse(text) as GeneratedPhrase[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de phrases inattendu reçu de Gemini');
  }

  return parsed;
}
