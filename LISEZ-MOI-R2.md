# Audios sur Cloudflare R2

Les fichiers audio (mp3) peuvent être stockés sur **Cloudflare R2** (10 Go gratuits, téléchargements gratuits) au lieu de Supabase
Storage (1 Go gratuit). Tant que les variables `R2_*` ne sont pas renseignées, l'application continue d'utiliser Supabase.
Tout se pilote depuis l'application : **onglet Packs → bloc « Migrer les audios vers Cloudflare R2 »** (rien à installer).

## 1. Cloudflare : bucket, accès public, clé

1. Cloudflare → **Storage & databases → R2 Object Storage** (« Add R2 subscription » si demandé : rien n'est facturé sous 10 Go de
   stockage, 1 million d'écritures et 10 millions de lectures par mois).
2. **Create bucket** → par exemple `meslangues-audio`, localisation « Automatic », classe « Standard ».
3. Dans le bucket → **Settings → Public access** : « Custom Domains » (si tu as un domaine géré par Cloudflare) ou « R2.dev subdomain → Allow Access »
   (adresse du type `https://pub-xxxx.r2.dev`, décrite comme une adresse de test à débit limité, suffisante pour un usage familial).
4. Page R2 → **Manage API tokens → Create API token** (formulaire R2, pas « Account API tokens ») : permission **Object Read & Write**, limitée à ton bucket.
   Copie **Access Key ID** et **Secret Access Key** (affichée une seule fois). L'**Account ID** est dans l'adresse de la page.

⚠️ La clé secrète ne se donne à personne (ni message, ni dépôt GitHub). Elle va seulement dans Vercel.

## 2. Vercel : 5 variables, puis redéploiement

```
R2_ACCOUNT_ID=...            R2_ACCESS_KEY_ID=...        R2_SECRET_ACCESS_KEY=...
R2_BUCKET=meslangues-audio   R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev   (sans « / » final)
```
Les variables ne sont prises en compte qu'à un **nouveau déploiement**. À partir de là, les nouveaux audios vont sur R2.

## 3. Supabase : migration 034 (une seule fois)

SQL Editor → colle et exécute `supabase/migrations/034_audio_vers_r2.sql` (3 petites fonctions réservées à l'application).

## 4. Dans l'application : onglet Packs → « Migrer les audios vers Cloudflare R2 »

1. **Tester R2** : l'application écrit un petit fichier, le relit par l'adresse publique, puis l'efface. Le message dit exactement ce qui manque, le cas échéant.
2. **Copier les fichiers** : garde la page ouverte (environ 15 à 25 minutes pour ~45 000 fichiers). Tu peux mettre en pause et reprendre : les fichiers déjà copiés sont ignorés.
3. **Vérifier**, puis **Basculer les liens** : vérifie que R2 contient au moins autant de fichiers que Supabase, puis remplace les adresses audio dans toute la base.
   Ensuite, écoute des mots, des phrases, des verbes et un article d'écoute : tout doit sonner comme avant.
4. **Supprimer les copies de Supabase** : ne supprime que les fichiers dont la copie R2 a la même taille, et seulement quand plus aucun lien ne pointe vers Supabase.
   Le compteur de Supabase peut mettre jusqu'à une heure à se mettre à jour.

## Savoir si tu as basculé

Dans le bloc, la ligne « Liens en base qui pointent encore vers Supabase » doit tomber à **0**. Ou, dans le SQL Editor :

```sql
select coalesce(substring(audio_url from '^https?://[^/]+'), '(sans audio)') as hote, count(*) as mots
from langues.vocabulary_words group by 1 order by 2 desc;
```
(`hote` = ton adresse R2 une fois basculé ; remplace `langues.` par `public.` si tes tables sont dans le schéma public.)

## Bon à savoir

- Si de nouveaux audios ont été créés chez Supabase avant le redéploiement de l'étape 2, relance simplement les étapes 4.2 et 4.3.
- La suppression de mots, de packs ou d'audios dans l'application efface le fichier **aux deux endroits** (Supabase et R2).
- Le bloc « Stockage » des Réglages ne mesure que Supabase : après la migration, il affichera presque 0 Mo.
- Le ménage des doublons (SQL) ne sait lire que les anciens liens Supabase.
- Aucune configuration CORS n'est nécessaire pour lire les mp3 avec la balise audio habituelle.
- `scripts/migrate-audio-to-r2.mjs` fait la même copie en ligne de commande (nécessite Node.js) : facultatif, le bouton suffit.
