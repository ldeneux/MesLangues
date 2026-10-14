-- Blind test Deezer : on ne stocke que le LIEN du morceau (aucun fichier audio).
-- À exécuter une fois dans l'éditeur SQL de Supabase.
alter table questions add column if not exists media_url text;

notify pgrst, 'reload schema';
