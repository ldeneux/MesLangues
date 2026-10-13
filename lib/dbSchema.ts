// Schéma PostgreSQL où vivent les tables de l'application.
//  - « public » (par défaut) : situation historique.
//  - « langues » : après la migration 025 (voir supabase/schema_langues/LISEZ-MOI.md), en définissant
//    NEXT_PUBLIC_DB_SCHEMA=langues dans Vercel (puis redéploiement : la valeur est lue à la construction de l'appli).
export const DB_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA || 'public';

// Les 4 fonctions de statistiques (get_db_size_bytes…) restent toujours dans « public ».
export const FUNCTIONS_SCHEMA = 'public';
