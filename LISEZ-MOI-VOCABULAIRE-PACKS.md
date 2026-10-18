# Livraison : packs de vocabulaire (doublons par niveau, nouveaux thèmes, tous les thèmes testés, leçons)

Copie ces fichiers dans le dépôt en respectant les dossiers, puis déploie (Vercel). Aucune migration SQL à lancer.

## Ordre conseillé
1. Onglet Packs > A1 : « Reprendre » sur les packs incomplets (A1 accepte maintenant les mots déjà présents en A2/B1/B2).
2. Même chose pour A2, puis B1.
3. « Nettoyer les doublons » (inchangé) : pour chaque mot présent à plusieurs niveaux, il garde le niveau le plus bas et supprime la copie des niveaux supérieurs.
   Les packs touchés (B1, B2…) repassent « incomplets » : « Reprendre » les complète avec d'autres mots.
4. Leçons : recréer le plan (bouton de création du plan) pour obtenir les leçons 41 à 61 des nouveaux thèmes.

## Ce qui change
- **Règle de doublons** (`lib/vocabulary.ts`) : un mot du niveau N est refusé seulement s'il existe déjà au niveau N ou à un niveau inférieur.
  B1 refusé si présent en A1/A2/B1 ; A1 accepté même si présent en A2/B1/B2.
- **21 nouveaux thèmes de vocabulaire** (`lib/constants.ts` : `EXTRA_VOCAB_THEMES`, `VOCAB_THEMES`). Les 15 thèmes principaux gardent leurs quotas ; les nouveaux servent de réserve pour atteindre 350.
- **Tous les thèmes testés** (`VocabularyDownload.tsx`) : un thème est écarté après 3 essais de suite sans mot nouveau, la génération passe au suivant ; le pack n'est déclaré incomplet qu'après les 36 thèmes.
- **Filtres par thème** (Vocabulaire, jeux de mots, jeu de l'intrus) : prennent en compte les nouveaux thèmes.
- **Leçons** (`lib/lessonPlan.ts`) : les leçons 1 à 40 (15 thèmes principaux) sont inchangées ; ajout d'une leçon par nouveau thème (leçons 41 à 61).
  Les mots des nouveaux thèmes sont réservés à leurs leçons (les 40 premières n'y piochent qu'en dernier recours si un thème principal manque de mots).
  Ces leçons n'ont des verbes que s'il en reste (3 par leçon sur les 120 verbes) ; sinon elles sont complétées par des mots. Libellés des thèmes mis à jour dans les leçons et le PDF.

## Fichiers
lib/constants.ts, lib/vocabulary.ts, lib/lessonPlan.ts, lib/lessons.ts,
app/components/VocabularyDownload.tsx, VocabularyPanel.tsx, GameIntrus.tsx, LessonsPanel.tsx, LessonViewer.tsx, pdf/LessonsDocument.tsx, wordgames/WordGameShell.tsx

## Module EXERCICES en fin de leçon (nouveau)
- Nouvelle carte « Exercices » avant « À retenir » (donc avant « J'ai terminé la leçon »), affichée si la leçon contient au moins 4 mots.
- 2 jeux tirés au sort parmi 8, construits uniquement sur les mots (et verbes) de la leçon ; les 2 jeux de la fois précédente sont évités (mémorisé dans le navigateur).
  Jeux : Quel est le mot ? · Que veut dire ce mot ? · Écoute et devine (si audio) · Quelle image ? (si images) · Memory · Lettres mélangées · Écris le mot · Vrai ou faux.
  Japonais : sans Lettres mélangées ni Écris le mot ; le furigana / rōmaji suit les réglages de la leçon.
- Chaque réponse met à jour la maîtrise du mot (mêmes compteurs que l'onglet Jeux).
- Bouton « Deux autres exercices » en fin de série pour rejouer avec d'autres jeux.
- Fichiers : app/components/LessonExercises.tsx (nouveau), LessonViewer.tsx (carte ajoutée), app/globals.css (styles ajoutés à la fin).
