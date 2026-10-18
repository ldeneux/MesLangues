# Livraison : bouton de nettoyage + anti-doublons a la generation

Copie ces fichiers dans le depot MesLangues-main en respectant les dossiers (ils remplacent / completent l'existant).

1. Dans Supabase (SQL Editor), lance UNE fois `supabase/migrations/027_menage_doublons.sql` (fichier ASCII, rapide : tables, index, fonctions).
2. Deploie l'appli (Vercel).
3. Onglet Packs -> section "Nettoyage des doublons de vocabulaire" :
   - "Nettoyer les doublons" : apercu + confirmation, puis le menage se fait en petites etapes (progression, archive, suppression, packs).
   - "Supprimer les audios en double (N)" : apparait quand des audios sont listes ; irreversible, avec confirmation.

Nouveaux fichiers : 027_menage_doublons.sql, lib/maintenance.ts, lib/paging.ts, app/components/DuplicatesCleanup.tsx
Modifies : lib/vocabulary.ts, lib/packs.ts, lib/textUtils.ts, app/components/PacksPanel.tsx, app/components/VocabularyDownload.tsx
