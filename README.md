# Frasi — apprendre l'italien, l'espagnol et l'anglais au quotidien

30 phrases de vraie vie générées par IA (Gemini, gratuit) chaque jour,
prononcées en audio (Google Cloud TTS, gratuit dans la limite), niveaux
A1/A2 pour commencer, puis tests de niveau en QCM. Stack quasi 100%
gratuite pour un usage personnel (Vercel Hobby + Supabase Free + Gemini
free tier + Google TTS free tier avec quota de sécurité).

## 1. Créer le projet Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Va dans **SQL Editor**, colle le contenu de `supabase/schema.sql`, exécute.
3. Va dans **Storage**, crée un bucket nommé exactement `phrase-audio`, **public**
   (lecture publique des fichiers audio — aucune donnée sensible dedans).
4. Récupère dans **Project Settings > API** :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ à garder secrète, jamais côté client)

## 2. Clé API Gemini (génération des phrases et des tests, gratuite)

1. Va sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Connecte-toi avec un compte Google, crée une clé (aucune carte bancaire requise).
3. Copie-la → `GEMINI_API_KEY`.

Palier gratuit : 1500 requêtes/jour sur les modèles Flash, sans expiration.
Cette appli n'a besoin que de 3 requêtes/jour (une génération par langue),
donc largement dans la marge. Seul point à savoir : en free tier, Google
peut utiliser le contenu envoyé pour améliorer ses produits (pas le cas en
palier payant) — sans enjeu pour des phrases de vocabulaire courant.

## 3. Clé Google Cloud TTS (gratuite) + garde-fou anti-facturation

1. Crée/utilise un projet sur [console.cloud.google.com](https://console.cloud.google.com).
2. Un compte de facturation doit être associé au projet pour activer l'API
   (obligatoire côté Google, même pour rester dans le palier gratuit).
3. Active l'API **Cloud Text-to-Speech API**.
4. Va dans **APIs & Services > Identifiants > Créer une clé API**.
5. Restreins cette clé à l'API Text-to-Speech uniquement (sécurité).
6. Copie la clé → `GOOGLE_TTS_API_KEY`.

**Garde-fou (important)** : Google ne bloque pas automatiquement les
dépenses par défaut — une alerte de budget ne fait qu'envoyer un email, elle
ne coupe rien. Pose plutôt un **quota dur sur l'API elle-même** :

1. Console Google Cloud → **IAM & Admin > Quotas**.
2. Cherche "Cloud Text-to-Speech API".
3. Édite le quota de caractères par jour, fixe-le à **150 000/jour**
   (large marge au-dessus de ton usage réel ~5 000/jour, mais bien en
   dessous du seuil gratuit mensuel de 4M).

Une fois ce plafond atteint, l'API refuse simplement les requêtes
suivantes — impossible d'être facturé au-delà, même en cas de bug qui
partirait en boucle.

## 4. Configuration locale

```bash
cp .env.example .env.local
# remplis toutes les valeurs
npm install
npm run dev
```

Génère un premier lot de phrases manuellement (remplace `CRON_SECRET` par la
valeur choisie dans `.env.local`) :

```
http://localhost:3000/api/generate-daily?language=it&level=A1&secret=CRON_SECRET
```

Puis va sur `http://localhost:3000` et clique sur Italien.

## 5. Déploiement Vercel

1. Push ce projet sur GitHub, importe-le dans Vercel.
2. Ajoute toutes les variables de `.env.example` dans **Settings > Environment Variables**.
3. Le fichier `vercel.json` déclenche automatiquement 3 crons/jour (it, es, en,
   niveau A1) — le plan Hobby de Vercel autorise les cron jobs quotidiens.
4. Pour passer un utilisateur en A2, ou générer un test de niveau, appelle
   manuellement (ou ajoute un bouton admin plus tard) :
   ```
   /api/generate-daily?language=it&level=A2&secret=...
   /api/generate-test?language=it&level=A1&secret=...
   ```

## Ce qui est déjà en place

- Schéma Supabase complet (phrases, progression, tests, RLS)
- Génération de phrases idiomatiques (pas du vocabulaire isolé) via Claude
- Synthèse vocale Google Cloud TTS (HTTPS simple, fiable en serverless) + stockage Supabase Storage (jamais regénérée deux fois)
- Page d'accueil + page de pratique par langue avec lecteur audio
- Génération de QCM de niveau

## Pistes pour la suite (non implémenté)

- Authentification utilisateur (Supabase Auth) + suivi de progression réel
  (les tables `user_*` existent déjà côté schéma, il manque juste les pages)
- Passage automatique A1 → A2 selon les résultats aux tests
- Page pour repasser/consulter les phrases des jours précédents
- Bouton admin "générer maintenant" au lieu d'appeler l'URL à la main
- Purge automatique des vieux lots (texte + audio Storage) : à ~200-270 Mo/mois
  générés, le quota gratuit Supabase (1 Go de stockage fichiers) sera atteint
  au bout de quelques mois sans nettoyage — à surveiller
