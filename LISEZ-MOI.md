# Quiz-Party — projet complet (habillages, équipes en français, éditeur de disposition)

## Installer
1. Décompresse **par-dessus** ton dossier de projet (ne supprime pas l'ancien) : les fichiers que je ne connais pas restent en place.
2. `package.json` est ta version (avec `jsqr`, sans fichier lock). Rien d'autre à installer.
3. Commit + push comme d'habitude.

## À vérifier après décompression (fichiers que tu as pu modifier de ton côté)
- `components/QrScanner.tsx` : absent de mes archives, ne l'écrase pas (il n'est pas dans ce zip, donc il reste).
- `lib/themes.ts` : si tu y as personnalisé des thèmes (ex. le fond de **Sciences**, des zones), reporte-les : ce fichier est celui de mon projet.
  Le fond de Sciences est ici « page blanche » ; ton fichier `public/themes/sciences/stage.webp` reste en place, il suffit de repointer `stage.src`.
- `app/page.tsx`, `app/play/[gameId]/page.tsx`, `components/GameArea.tsx` : si tu les as modifiés hors de nos échanges, compare avant d'écraser.

## Nouveautés de cette version
- Thème **Voyages dans le temps** complet (décor, icônes de modes, boutons de menu, 12 équipes).
- 19 habillages ; un thème sans images s'affiche sur page blanche (jamais celui d'Espace).
- Équipes : noms en français (12 par thème) ; un thème sans jeu d'équipes n'en propose aucune.
- Éditeur de disposition : les boutons de la barre de menu se déplacent et se redimensionnent comme les icônes des modes.

## Base de données (facultatif)
`supabase/rename-teams-fr.sql` renomme en français les équipes déjà créées dans des parties existantes.
Les nouvelles parties utilisent directement les noms de `lib/teamPresets.ts`. Les équipes ne sont pas stockées comme « modèles » en base : elles sont créées à chaque partie.

## Nouvel écran Paramétrage (packs, profils, catégories, niveaux)
1. **Exécute `supabase/migration-014-parametrage.sql`** dans l'éditeur SQL de Supabase (une seule fois) : niveaux configurables
   (icône, « niveau scolaire », masqué) + vue de comptage qui rend l'écran léger. Sans elle l'écran fonctionne en mode dégradé (comptage plus lent, options de niveaux grisées).
2. Menu à 4 options : Générer les packs (Gemini) · Gérer les profils · Gérer les catégories · Gérer les niveaux, avec un tableau catégories × niveaux commun.
3. **Coût Gemini** : une fenêtre affiche le coût estimé AVANT toute génération ; le coût réel est affiché à la fin.
   Tarifs réglables sans toucher au code (optionnel, `.env.local`) : `NEXT_PUBLIC_GEMINI_PRICE_IN`, `NEXT_PUBLIC_GEMINI_PRICE_OUT` ($ par million de tokens), `NEXT_PUBLIC_USD_EUR`.
4. Optimisations de coût : lots de 15 questions par appel, sortie JSON structurée (plus d'appel perdu), anti-doublons avant insertion, aucun appel de « rattrapage ».
5. Corrections : « Impossible de parser la réponse Gemini en JSON » (récupération des questions complètes + sortie structurée) et
   « value too long for type character(1) » (la lettre de la bonne réponse est validée a/b/c/d avant l'insertion).

## Thèmes Sucrerie et Mythologie, vidéo de lancement
- **Sucrerie** (décor, 12 icônes de jeu et de menu, 12 équipes) et **Mythologie** (décor, 13 icônes, 12 équipes) sont complets. Les noms d'équipes sont en français.
- Les fonds **Sports** et **Fantasy** sont remplacés par les nouveaux (les icônes de Sports restent à fournir : boutons neutres).
- **Vidéo de lancement par thème** (`lib/themeIntros.ts`) : au démarrage d'une partie, la vidéo s'affiche dans le hublot, figée sur sa première image ;
  décompte 3-2-1 ; la vidéo se joue ; elle reste 3 secondes sur sa dernière image ; la première question démarre. Un bouton « Passer › » permet de sauter la vidéo.
  Un thème sans vidéo n'affiche que le décompte puis « C'EST PARTI ! ». La fusée du décompte a été retirée.
  Pour la vidéo d'un autre thème : `public/themes/<thème>/intro.mp4` + `intro-poster.webp` (sa première image), puis une ligne dans `lib/themeIntros.ts`.
- La vidéo Sucrerie a été compressée (10 Mo → 4 Mo) et n'a pas de piste audio ; je n'y ai trouvé aucun filigrane visible (coins et zones fixes vérifiés).

## Fonds d'équipe par thème, intros vidéo, compression
- **Fonds d'équipe** : rangés par thème, comme les avatars : `public/bg/<thème>/<équipe>-portrait.webp` et `-paysage.webp`, déclarés dans `lib/teamBackgrounds.ts` (clé = thème, puis nom d'équipe).
  Deux thèmes peuvent donc avoir une équipe du même nom sans confusion. Un seul format suffit : l'autre est recadré.
  Fichiers existants à ranger une fois : `node tools/move-bg-to-theme-folders.mjs --dry-run`, puis sans `--dry-run`.
- **Intros vidéo** : `lib/themeIntros.ts` a une ligne par thème (`public/themes/<thème>/intro.mp4`). Fichier absent : « ? » lumineux ; fichier présent : la vidéo est jouée.
- **Compression des images** : `node tools/compress-images.mjs` (rapport), puis `--write` pour appliquer. Seules les images de plus de 400 Ko sont touchées, dimensions conservées.

## Blind test (Deezer)
- Une question peut porter un lien de morceau Deezer (colonne `questions.media_url`, migration `supabase/migration-015-media.sql`) : rien n'est stocké à part ce lien.
- Page `/blindtest` (lien dans Paramétrage) : recherche d'un morceau, écoute de l'extrait de 30 s, création de la question (3 mauvaises réponses prises chez des artistes proches ou dans les autres titres de l'artiste). Les questions vont dans le pack « Blind test · <catégorie> » à ajouter à un profil.
- « Importer en masse » (même page) : charge un classement du moment (par genre), une playlist Deezer (ex. « années 80 ») ou les titres d'un artiste, trie par popularité, limite à 2 titres par artiste et crée jusqu'à 300 questions par lots de 25, avec barre de progression. Les mauvaises réponses viennent de la même liste ; les morceaux déjà présents dans le pack sont ignorés.
- L'extrait est joué sur l'écran de l'hôte (composant `DeezerClip` de `components/GameArea.tsx`) ; le lien d'aperçu est redemandé à Deezer à chaque lecture (`/api/deezer`).

## Films (TMDB) et vidéos YouTube (page /medias)
- **Films :** classement des mieux notés, populaires, à l'affiche, tendances ou par décennie ; la bande-annonce YouTube, le réalisateur et l'année viennent de TMDB. Il faut une clé gratuite : variable `TMDB_API_KEY` dans `.env.local` et dans les variables Vercel (usage non commercial, mention TMDB affichée sur la page).
- **Liens collés (pubs, extraits, clips) :** une ligne par vidéo, `lien ; bonne réponse ; autre1 | autre2 | autre3` (les autres réponses sont facultatives). « Vérifier les liens » écarte les vidéos introuvables ou non intégrables. Début/fin dans le lien (`&start=12&end=40`).
- La vidéo est jouée sur l'écran de l'hôte par `MediaClip` (`components/GameArea.tsx`) : seul le lien est enregistré (`questions.media_url`).

## Habillage « Défaut » (sobre, par défaut)
- Premier de la liste et thème par défaut (`lib/themes.ts`, `lib/themes.extra.ts`). Disposition sans décor : barre du haut (icône, Démarrer / Nouvelle partie / Plein écran, paramétrage, statistiques, profil), menu des 5 modes à gauche, équipes puis QR à droite (`components/SoberConsole.tsx`, branché dans `app/page.tsx`).
- Aucun fond dans la console ni sur l'écran des équipes ; seuls les avatars (modes et équipes) sont conservés. Équipes : une équipe de chaque thème (`lib/teamPresets.ts`).
- Pour l'appliquer sur un appareil : Paramétrage, carrousel des habillages, « Défaut », « Utiliser ». Pas d'éditeur de zones (« Modifier ») pour ce thème.

## Vidéo illisible, suppression de packs
- **« Vérifier les liens »** (page /medias) joue un instant chaque vidéo dans un mini-lecteur YouTube : privée, supprimée, intégration interdite ou bloquée dans ton pays → ❌, non importée.
- **En partie**, si une vidéo (ou un extrait Deezer) ne se lit pas, l'écran de l'hôte propose « Passer cette question » (aucun point, même tour, même catégorie en Trivial) ou « Retirer du jeu et passer » (`validated = false`).
- **Suppression d'un pack déjà joué** : exécuter `supabase/migration-016-delete-questions.sql` (une partie qui avait la question « en cours » et les réponses données ne bloquent plus la suppression). L'appli libère aussi ces références avant de supprimer, même sans la migration.
