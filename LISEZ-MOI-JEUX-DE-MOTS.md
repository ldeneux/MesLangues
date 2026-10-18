# Livraison : jeux de mots dans l'onglet JEUX

Copie ces fichiers dans le dépôt en respectant les dossiers.

1. Supabase (SQL Editor) : lancer UNE fois `supabase/migrations/028_word_definitions.sql` (nécessaire seulement pour l'indice « Définition » des mots croisés ; les autres jeux fonctionnent sans).
2. Déployer (Vercel).

Nouveaux fichiers : lib/wordGamesLogic.ts, lib/wordGamesServer.ts, supabase/migrations/028_word_definitions.sql, app/components/wordgames/ (wordgames.css, WordGameShell, WordGameView, GameMotsCroises, GameMotsCaches, GameLettresMelangees, GameBoggle, GamePhrasesATrous, GameMahjongKanji).
Fichier existant modifié (une seule fois, +10 lignes) : app/components/GamesPanel.tsx (import + boutons + affichage). En cas de fusion avec une autre version : ne reporter que ces lignes.

Aucune autre modification des fichiers partagés ; styles dans wordgames.css (importé par WordGameShell), globals.css inchangé.

Coût : seul le bouton « Préparer N définitions » appelle Gemini (≈ 0,001 € par mot, confirmation demandée, résultat conservé). Mahjong et les autres jeux ne coûtent rien.
