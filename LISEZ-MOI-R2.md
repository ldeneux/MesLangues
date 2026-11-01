# Audios sur Cloudflare R2

Les fichiers audio (mp3) peuvent être stockés sur **Cloudflare R2** (10 Go gratuits, téléchargements gratuits) au lieu de Supabase
Storage (1 Go gratuit). Tant que les variables `R2_*` ne sont pas renseignées, l'application continue d'utiliser Supabase.

Ordre à suivre (ne saute pas d'étape) :

## 1. Cloudflare : bucket, accès public, clé

1. Cloudflare → **Storage & databases → R2 Object Storage**. Si la page propose « Add R2 subscription », clique : tu ne paies rien
   tant que tu restes sous 10 Go de stockage, 1 million d'écritures et 10 millions de lectures par mois (Cloudflare peut demander un
   moyen de paiement ; en restant sous ces limites, rien n'est facturé).
2. **Create bucket** → nom : `meslangues-audio` (ou autre), localisation « Automatic », classe « Standard ».
3. Dans le bucket → **Settings → Public access** :
   - si tu as un nom de domaine géré par Cloudflare : **Custom Domains** → `audio.tondomaine.fr` (recommandé) ;
   - sinon : **R2.dev subdomain → Allow Access** (adresse du type `https://pub-xxxx.r2.dev`). Cloudflare la décrit comme une adresse de test,
     limitée en débit : suffisant pour un usage familial, à changer plus tard si besoin.
   Note l'adresse publique : ce sera `R2_PUBLIC_BASE_URL`.
4. R2 → **Manage API tokens → Create API token** : permission **Object Read & Write**, limitée à ton bucket. Copie
   **Access Key ID** et **Secret Access Key** (affichée une seule fois). L'**Account ID** est affiché sur la page R2.

⚠️ La clé secrète ne se donne à personne (ni dans un message, ni dans le dépôt GitHub). Elle va seulement dans `.env.local` et dans Vercel.

## 2. Variables d'environnement

Dans `.env.local` (sur ton ordinateur) **et** dans Vercel → Settings → Environment Variables :

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=meslangues-audio
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev      (sans « / » à la fin)
```

Puis redéploie sur Vercel : à partir de là, **les nouveaux audios** sont enregistrés sur R2.

## 3. Copier les fichiers existants (sur ton ordinateur)

```
npm install
node scripts/migrate-audio-to-r2.mjs --dry-run     # compte seulement
node scripts/migrate-audio-to-r2.mjs               # copie (relançable : les fichiers déjà copiés sont ignorés)
```

Le script a aussi besoin de `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`. Il lit 1 Go chez Supabase
(compté dans les 5 Go de transfert gratuits par mois) : ne le lance pas dix fois de suite.

## 4. Basculer les liens en base

Dans le SQL Editor de Supabase, ouvre `supabase/migrations/034_audio_vers_r2.sql`, remplace `old_base` et `new_base`, laisse
`dry_run := true` et exécute : les messages (onglet « Messages ») indiquent combien de lignes seraient modifiées dans chaque colonne audio.
Si c'est cohérent, passe `dry_run := false` et exécute à nouveau. Le script est sans risque à relancer.

## 5. Vérifier, puis libérer Supabase

1. Écoute des mots, des phrases, des verbes et un article d'écoute dans l'application : tout doit sonner comme avant.
2. Alors seulement : `node scripts/migrate-audio-to-r2.mjs --delete-source`. Il ne supprime de Supabase que les fichiers dont la copie R2 a la même taille.
3. Le compteur de Supabase peut mettre jusqu'à une heure à se mettre à jour.

## Bon à savoir

- Si de nouveaux audios ont été créés dans Supabase entre l'étape 3 et l'étape 4 (application pas encore redéployée), relance simplement les étapes 3 et 4.
- La suppression de mots, de packs ou d'audios dans l'application efface le fichier **aux deux endroits** (Supabase et R2).
- Le bloc « Stockage » des Réglages ne mesure que Supabase : après la migration, il affichera presque 0 Mo.
- Le ménage des doublons (SQL) ne sait lire que les anciens liens Supabase : après la migration, ses listes de fichiers à supprimer ne contiendront plus que ceux-là.
- Aucune configuration CORS n'est nécessaire pour lire les mp3 avec la balise audio habituelle.
