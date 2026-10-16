# Déplacer les tables de MesLangues dans le schéma « langues »

**Ce qui est déplacé** : uniquement les 34 tables de cette application (liste dans `025_schema_langues.sql`).
**Ce qui n'est pas touché** : les tables des autres applications de la même base, les utilisateurs (Auth), le stockage des
audios, et les 4 fonctions de statistiques (elles restent dans « public »).
**Aucune donnée n'est copiée, vidée ou supprimée** : c'est un changement de rattachement (`ALTER TABLE … SET SCHEMA`).

> Le schéma s'appelle `langues` en minuscules : avec une majuscule (« Langues »), PostgreSQL oblige à mettre des
> guillemets partout, et l'API Supabase devient fragile. Pour un autre nom, remplace `langues` dans les scripts et dans
> la variable d'environnement.

## Déroulé (compter 10 minutes ; l'appli est indisponible entre les étapes 4 et 6)

1. **Sauvegarde** : Supabase → Database → Backups (ou `pg_dump`). À ne pas sauter.
2. Lancer `00_avant.sql` dans le SQL Editor (lecture seule) : note ou capture le nombre de lignes de chaque table, et la
   liste « table d'une autre application (non touchée) ».
3. Choisir un moment où personne n'utilise l'appli.
4. Lancer `supabase/migrations/025_schema_langues.sql` en entier. Il affiche `OK <table> (n lignes)` pour chaque table et
   « Terminé : 34 table(s) déplacée(s) ». Au moindre doute il s'annule tout seul et la base reste comme avant.
5. Dans **Vercel → Settings → Environment Variables**, ajouter `NEXT_PUBLIC_DB_SCHEMA` = `langues` (Production, Preview).
6. **Redéployer** (la variable est lue à la construction de l'appli). Tant que ce n'est pas fait, l'appli cherche encore
   dans « public ».
7. Lancer `02_verifier.sql` : mêmes nombres de lignes qu'à l'étape 2, « langues » dans les schémas exposés.
8. Ouvrir l'appli et tester : changer de langue, ouvrir une leçon, la page Réglages (statistiques de stockage).

Si « langues » n'apparaît pas dans les schémas exposés : Supabase → Project Settings → API → *Exposed schemas* → ajouter
`langues`.

## Annuler

Lancer `99_annuler.sql`, remettre `NEXT_PUBLIC_DB_SCHEMA=public` (ou supprimer la variable) et redéployer.

## Nouvelles migrations après le déplacement

Les futures migrations doivent créer leurs tables **dans** `langues` (`create table langues.ma_table …`) ou commencer par
`set search_path = langues, public;`.
