# Images des mots sur Cloudflare R2

Les images (un `.webp` par mot français, partagé par les 5 langues) peuvent vivre dans **R2** (même bucket que les audios, dossier `images/`)
au lieu du dossier `public/image_webp`. Avantages : dépôt GitHub et déploiements beaucoup plus légers, et une image ajoutée est utilisable
**tout de suite**, sans commit ni redéploiement.

Fonctionnement : le fichier est dans R2 sous `images/<mot>.webp` ; la table Supabase **`word_images`** garde seulement la liste des noms
(c'est elle qui dit à l'appli quelles images existent). Tant que la variable de l'étape 5 n'est pas définie, l'appli continue de lire
`public/image_webp` : rien ne casse pendant la migration.

## Étapes (dans cet ordre)

1. **R2 déjà configuré** pour les audios (voir `LISEZ-MOI-R2.md`) : les mêmes variables `R2_*` servent aux images. Rien à ajouter.
2. **Supabase** → SQL Editor : exécute `supabase/migrations/036_word_images.sql` (une fois).
3. **Cloudflare → ton bucket → Settings → CORS policy** : ajoute cette règle (nécessaire pour que le PDF des leçons puisse lire les images) :
   ```json
   [{ "AllowedOrigins": ["https://mes-langues-puce.vercel.app/"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"] }]
   ```
   (remplace par l'adresse réelle de ton application ; ajoute `http://localhost:3000` pour tester en local.)
4. **Application → onglet Packs → « Images des mots sur Cloudflare R2 » → Copier les images vers R2.** Garde la page ouverte ; si ça s'arrête, relance :
   les images déjà copiées sont ignorées. À la fin, la ligne « Vérification » doit afficher ✓.
5. **Vercel → Environment Variables** : ajoute `NEXT_PUBLIC_IMAGE_BASE_URL` = l'adresse affichée dans le bloc (du type `https://pub-xxxx.r2.dev/images`, sans « / » final),
   puis **redéploie**. Le bloc affiche alors « les pages lisent déjà les images sur R2 ✓ ».
6. Vérifie quelques pages (vocabulaire, jeux, PDF d'une leçon), puis **supprime le contenu de `public/image_webp`** du dépôt et pousse :
   le déploiement devient beaucoup plus léger. (Ne supprime rien avant l'étape 5 : la copie lit les images depuis le site déployé.)

## Nouvelles images

Bloc « Images manquantes » (onglet Packs) : génère n planches, vérifie les vignettes, puis **Envoyer sur R2**. Les images sont enregistrées dans R2 et dans
`word_images` ; elles apparaissent dans l'appli en quelques minutes au plus (la liste est relue toutes les 5 minutes).
À défaut, le bouton « Télécharger le ZIP » reste disponible.

## Bon à savoir

- Si tu définis `NEXT_PUBLIC_IMAGE_BASE_URL` avant d'avoir copié toutes les images, celles qui manquent dans R2 s'affichent cassées : copie d'abord.
- Le nom d'une image est le mot français tel qu'il est écrit (accents, espaces, apostrophes) : `images/un fromage.webp`.
- Une image envoyée sous un nom déjà existant remplace l'ancienne (le cache du navigateur peut garder l'ancienne jusqu'à 24 h).
- `lib/imageManifest.json` (liste des fichiers de `public/image_webp`) reste utilisé comme secours : il se vide tout seul quand le dossier est vide.
