// Prompt à copier dans Claude pour obtenir un lot d'articles d'écoute (JSON à importer dans l'onglet Packs > Écoute).
// Module pur (client et serveur). Le format décrit ici est celui que vérifie importListeningArticle (lib/articles.ts).
import { QUESTIONS_PER_ARTICLE } from './constants';

export const LISTENING_LOT_SIZES = [5, 10] as const;

export function listeningLotFileName(languageCode: string, levelCode: string, lot: number): string {
  return `ecoute_${languageCode}_${levelCode}_lot${lot}.json`;
}

export function buildListeningPrompt(p: { languageLabel: string; languageCode: string; levelCode: string; lot: number; count: number }): string {
  const lang = p.languageLabel.toLowerCase();
  const file = listeningLotFileName(p.languageCode, p.levelCode, p.lot);
  const q = QUESTIONS_PER_ARTICLE;
  const ja = p.languageCode === 'ja';

  return `Je développe une application d'apprentissage des langues. Je te demande de rédiger un lot de ${p.count} articles
d'écoute en JSON, à importer dans mon application.

Langue : ${lang} (${p.languageCode})    Niveau : ${p.levelCode}    Lot n° : ${p.lot}

Fichiers joints :
- l'inventaire des articles déjà présents pour cette langue (tous niveaux) ;
- un exemple de lot au format attendu (facultatif : le format est aussi décrit plus bas).

Règles :
1. Thèmes : choisis en priorité les thèmes qui ont le plus de « remaining » dans l'inventaire pour ce niveau,
   et utilise ${p.count} thèmes différents dans ce lot. Le champ "theme" est le code du thème.
2. Doublons : aucun sujet, personnage, lieu ou situation déjà présent dans l'inventaire, quel que soit le
   niveau. Pas de personnages ni de noms réutilisés. Contenu intemporel (pas d'actualité réelle).
3. Longueur des textes : A1 = 60 à 90 mots, A2 = 90 à 130, B1 = 130 à 180, B2 = 180 à 250.${ja ? '\n   (Japonais : adapte en nombre de caractères pour une durée de lecture équivalente.)' : ''}
   Style adapté au niveau (A1 phrases très courtes ; B2 style journalistique naturel).
4. Chaque article : "title", "content" (dans la langue étudiée), "content_fr" (traduction française fidèle),
   et exactement ${q} questions.
5. Questions : en français, 4 options, une seule bonne réponse, "correct_index" de 0 à 3.
   Réponses uniquement vérifiables dans le texte. Varie les angles : détails, chiffres, idée générale,
   déduction, vocabulaire en contexte, et la difficulté. Mauvaises réponses plausibles mais clairement fausses.
   Positions de la bonne réponse réparties à peu près également sur les 4 positions.
6. Ne simplifie rien pour aller plus vite : mêmes ${q} questions, même longueur, pour chacun des ${p.count} articles.
7. Vérifie le fichier avec un script avant de me le donner (nombre d'articles, nombre de questions, options distinctes,
   longueur des textes, répartition des positions) et donne-moi le JSON dans un fichier téléchargeable
   nommé ${file}.

Format du fichier (les valeurs "language" et "level" doivent être exactement celles-ci : l'import refuse le fichier sinon) :
{
  "language": "${p.languageCode}",
  "level": "${p.levelCode}",
  "articles": [
    {
      "theme": "code_du_theme",
      "title": "…",
      "content": "…",
      "content_fr": "…",
      "questions": [
        { "question": "…", "options": ["…", "…", "…", "…"], "correct_index": 0 }
      ]
    }
  ]
}`;
}
