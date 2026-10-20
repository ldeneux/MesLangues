# Livraison : packs de vocabulaire (doublons par niveau, nouveaux thèmes, tous les thèmes testés, leçons)

Copie ces fichiers dans le dépôt en respectant les dossiers, puis déploie (Vercel).
**Migrations SQL** (SQL Editor Supabase) : `030_verbes_par_niveau.sql` (à lancer une fois) et `031_rebalance_vocabulaire.sql` (installe la fonction de remise à plat, voir la dernière section : elle ne modifie rien tant que tu ne l'appelles pas avec `true`).

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

## Objectifs par niveau et remise à plat du vocabulaire (nouveau)
**Objectif par langue, phrases ET mots** (éléments nouveaux à chaque niveau) : A1 = 2 packs (700) · A2 = 2 packs (700) · B1 = 3 packs (1050) · B2 = 4 packs (1400).
- `lib/constants.ts` : `LEVEL_PACK_COUNT` (2/2/3/4) et `LEVEL_CUMULATIVE_TARGET` (700/700/1050/1400, désormais PAR NIVEAU, utilisé par l'inventaire, les scores et l'onglet Packs).
- Onglets Packs (phrases) et Vocabulaire : le bouton « Télécharger un pack » disparaît une fois l'objectif de packs atteint (« Objectif atteint »).

**Remise à plat des mots en base** : `031_rebalance_vocabulaire.sql` crée la fonction `langues.rebalance_vocabulary(p_apply)`.
1. Aperçu, sans rien écrire : `select * from langues.rebalance_vocabulary();`
2. Application : `select * from langues.rebalance_vocabulary(true);`
Elle fait, pour toutes les langues, en une seule transaction :
- **Reclassement** : si un niveau dépasse son objectif, les mots les moins utiles (`usage_score` le plus bas ; score absent = 50 ; à égalité les plus récents) passent au niveau suivant, en cascade A1 → A2 → B1 → B2.
- **Packs** : les mots de chaque niveau sont rangés par paquets de 350 (anciens packs réutilisés par numéro, packs créés si besoin). Les mots « SANS PACK » sont rattachés.
- **Statuts** recalculés (350 mots = ready, sinon generating) ; packs vides supprimés. Aucun mot n'est supprimé, les ids (progression, audio) ne changent pas.
Après application : recréer le plan de leçons des niveaux concernés (les mots ont changé de niveau), puis « Reprendre » les packs incomplets.
Prérequis conseillé : lancer le classement par utilité sur les mots sans score (italien A2, anglais A2, allemand A1), sinon leur score vaut 50 par défaut.

## Affichage et audio des verbes, leçon 0 (nouveau)
- **Tableaux de conjugaison** (`app/components/ConjugationTables.tsx`, nouveau) : personnes en lignes, temps en colonnes, 2 par 2 :
  présent / passé composé, puis futur simple / imparfait. Un bouton ▶ par temps. Même composant dans l'onglet Conjugaison, dans la carte « Verbe » des leçons et dans la fiche de conjugaison de fin de leçon.
- **3e personne** : libellé « elle » seul (au lieu de « il/elle ») ; dans les formes, « he/she/it has » devient « she has » à l'affichage ET à la lecture
  (aussi lui/lei en italien, él/ella en espagnol, er/sie/es en allemand). Règles dans `lib/conjugationDisplay.ts`.
- **Anglais : infinitif complet** (« to have ») dans les listes, les leçons, les exercices, les jeux et le PDF ; l'audio de l'infinitif lit aussi « to have ».
- **Lecture à 80 %** : appliquée à la lecture de la conjugaison (vitesse du lecteur, donc aussi sur les anciens fichiers, sans régénération).
- **Mettre à jour l'audio des verbes** (onglet Packs > Verbes, bouton ajouté) : supprime puis régénère SEULEMENT les anciens audios dont le texte change (« she », « to … » pour l'anglais).
  Une marque (`rev: 2`) évite de refaire le travail ; un second clic ne coûte rien. Coût = quelques centaines de caractères de synthèse vocale par verbe concerné.
- **Leçon 0 « Prononciation »** : n'apparaît plus qu'au niveau A1.
- Non modifié : les formes affichées dans le jeu « Conjugaison éclair » (seul l'infinitif et le libellé « elle » changent) ; le PDF garde sa mise en page (infinitif « to … » et « elle » appliqués).

## Pack Écoute : contenu inchangé
Aucun changement de contenu pédagogique : 25 questions par article, consigne de génération d'origine, longueur des articles inchangée.
Les seules économies en place sont techniques : audio et questions générés en parallèle (gain de temps), et réflexion Gemini désactivée (`thinkingLevel: minimal`, voir `lib/articles.ts`) — ce dernier point reste à valider par toi.

## Import manuel d'articles d'écoute (JSON) + audio manquant (nouveau)
Principe : les articles et leurs 25 questions sont écrits à la main (aucun appel à Gemini) ; l'application les importe, puis génère seulement l'audio.
- **Onglet Packs > Écoute** : bloc « Importer des articles (fichier JSON) » (choix du fichier) et bouton « Générer l'audio manquant » avec estimation du coût (voix Standard).
- **Format du fichier** : `{ "language": "it", "level": "A2", "articles": [ { "theme": "food_restaurant", "title": "...", "content": "texte dans la langue", "content_fr": "traduction française", "questions": [ { "question": "...", "options": ["...","...","...","..."], "correct_index": 0 } ] } ] }`
  Règles contrôlées à l'import : exactement 25 questions par article, 4 options distinctes, `correct_index` entre 0 et 3. Un article dont le titre existe déjà pour cette langue et ce niveau est ignoré (réimport sans risque).
  La langue et le niveau du fichier doivent correspondre à la langue et au niveau ouverts dans l'application.
- **Packs** : les articles vont dans le premier pack du niveau qui a de la place (50 articles par pack), un nouveau pack est créé si besoin. La case « Rendre disponibles tout de suite » met le pack en « Prêt (partiel) » pour pouvoir tester avant d'atteindre 50 ; un pack prêt n'est jamais proposé en « Reprendre » (ce qui aurait lancé Gemini).
- **Audio** : 3 articles à la fois, même voix et même emplacement de stockage que la génération automatique. Coût ≈ 0,004 € par article A2.
- Fichiers : `lib/articles.ts` (`importListeningArticle`, `getMissingArticleAudio`, `generateMissingArticleAudioStep`), `app/components/ListeningDownload.tsx`, `lib/pricing.ts` (`estimateTtsCost`).
- Lot test fourni : `ecoute_it_A2_lot1.json` (italien A2, 5 articles de 115 à 120 mots, 25 questions chacun, bonnes réponses réparties à peu près également sur les 4 positions).

## Objectifs d'écoute, couverture des thèmes et anti-doublon (nouveau)
- **Objectif d'articles d'écoute par langue et par niveau** : A1 = 100, A2 = 100, B1 = 150, B2 = 200 (`LISTENING_LEVEL_TARGET` dans `lib/constants.ts` = 2 / 2 / 3 / 4 packs de 50). Affiché dans l'onglet Écoute (« Objectif du niveau : n / 100 ») et dans l'inventaire ; le bouton de génération automatique disparaît une fois l'objectif atteint.
- **Couverture par thème** : tableau repliable « Couverture par thème » (onglet Écoute). Répartition cible = poids des 15 thèmes appliqué à l'objectif du niveau (ex. A2 : 11 articles « nourriture », 10 « salutations »… 3 « météo »). C'est un guide de rédaction : l'import ne refuse pas un article parce qu'un thème dépasse son quota.
- **Anti-doublon à l'import** (`importListeningArticle`) : un article est refusé s'il est trop proche d'un article existant de la LANGUE (tous niveaux), ou si son titre existe déjà. Mesure : ressemblance des mots de 5 lettres et plus (japonais : paires de caractères). Réglage sur tes données : sujets différents ≈ 0,02–0,10 ; même sujet réécrit ≈ 0,28 ; reformulation ≈ 0,9 ; seuil 0,22. Les articles refusés sont listés avec le titre auquel ils ressemblent.
- **Inventaire à me transmettre avant chaque lot** : bouton « Télécharger l'inventaire des articles » (fichier `inventaire_ecoute_<langue>.json` : objectif, nombre d'articles et quotas restants par niveau et par thème, titre et début de chaque article existant). Je rédige chaque lot à partir de ce fichier.
