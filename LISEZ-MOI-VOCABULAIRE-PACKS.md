# Livraison : packs de vocabulaire (doublons par niveau, nouveaux thèmes, tous les thèmes testés, leçons)

Copie ces fichiers dans le dépôt en respectant les dossiers, puis déploie (Vercel).
**Une migration SQL à lancer une fois** (SQL Editor Supabase) : `supabase/migrations/030_verbes_par_niveau.sql` (avant d'ouvrir l'onglet Packs).

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

## Verbes par niveau, séparés de la grammaire (nouveau)
- **120 verbes par langue ET par niveau** (A1, A2, B1, B2) au lieu de 120 par langue. Migration 030 : colonne `level_code` sur `conjugation_verbs`.
  Les verbes déjà présents sont rattachés au plus bas niveau dont une leçon les utilise, sinon A1. Un verbe reste unique par langue : A2 reçoit d'AUTRES verbes que A1.
- **Onglet Packs** : nouveau bloc « Verbes (niveau) » (120 verbes + audio, bouton Reprendre) et bloc « Grammaire et quiz (tous niveaux) » qui ne contient plus les verbes.
  Fichiers : `VerbsDownload.tsx` (nouveau), `GrammarConjugationDownload.tsx` (grammaire + quiz seulement), `PacksPanel.tsx`.
- Génération (`lib/conjugation.ts`, `lib/japaneseConjugation.ts`) : demande à Gemini des verbes adaptés au niveau, en évitant TOUS les verbes déjà présents dans la langue (plus de limite à 150),
  sans jamais écraser un verbe d'un autre niveau ; arrêt propre après 5 essais sans verbe nouveau.
- **Leçons** : le plan utilise les verbes du niveau (120 par niveau = 40 leçons × 3 verbes à chaque niveau).
- **Onglet Conjugaison** : verbes du niveau. **Jeux de conjugaison** : verbes du niveau et des niveaux inférieurs.
- **Score Conjugaison** : calculé sur les verbes du niveau (cible 120). **Inventaire** : cible 120 × 4 niveaux par langue.
- Fichiers touchés en plus : lib/constants.ts, pricing.ts, scores.ts, inventory.ts, lessons.ts, SettingsPanel.tsx, ConjugationPanel.tsx, GameConjugaisonEclair(.Ja).tsx, GamesPanel.tsx, GrammarPanel.tsx.
- Ordre conseillé pour un niveau : mots (vocabulaire) → Verbes → classement par utilité → plan de leçons.

## Coût de génération du vocabulaire réduit (nouveau)
Cause du « 1 € pour 30 mots » : quand un niveau est presque saturé, chaque appel Gemini ne renvoie que des redites. La boucle « tous les thèmes » refaisait jusqu'à 3 essais par thème
(≈ 100 appels à vide), chacun avec une longue liste de mots à éviter et de la réflexion Gemini activée par défaut.
- **1 seul essai à vide par thème** (au lieu de 3), puis thème suivant.
- **Arrêt après 6 appels à vide d'affilée** (le pack reste incomplet, « Reprendre » relance) et **budget plafonné à 0,30 € par session** (modifiable : `BUDGET_EUR_PER_RUN` dans `VocabularyDownload.tsx`).
- **Coût réel affiché** pendant et après la génération (tokens réellement consommés).
- **Réflexion Gemini désactivée** pour cette génération (`thinkingLevel: minimal`, `lib/gemini.ts`).
- **25 mots par appel** (au lieu de 15) : moins d'appels pour le même nombre de mots.
- **Liste à éviter réduite** : uniquement les mots du même thème (≤ 400), les autres redites sont filtrées par le code.
Les thèmes « réserve » (jamais utilisés) sont essayés en premier pour compléter un pack, car ils donnent presque 100 % de mots nouveaux.

## Autres packs : ce qui est appliqué (et ce qui ne l'est pas)
- **Réflexion Gemini désactivée** (`thinkingLevel: minimal`) aussi pour : phrases (`generatePhrases.ts`), Écoute (article + questions, `articles.ts`), consignes de rédaction (`writing.ts`), quiz de grammaire (`grammar.ts`).
  Volontairement NON touchés (la qualité compte) : fiches de grammaire, conjugaison européenne, verbes japonais, kanji, correction des rédactions, conversation, leçons.
- **Écoute plus rapide** : l'audio et la banque de questions d'un article sont maintenant générés en parallèle.
- **Saut de thème / budget / coût réel** : seulement pour le vocabulaire. Les phrases s'arrêtent déjà après 6 essais à vide sur un thème (le coût est donc borné) ; les phrases saturent rarement.
- Piste non appliquée (décision produit) : la banque de 25 questions par article n'en tire que 5 au hasard ; la passer à 15 réduirait encore le coût et le temps de l'Écoute.
