-- =========================================================
-- Migration 036 — Images des mots sur Cloudflare R2 : liste des images disponibles
--  * word_images : une ligne par image présente dans R2 (name = le mot français tel qu'il est écrit, sans « .webp »,
--    comme les noms de fichiers de public/image_webp ; l'image est dans R2 sous « images/<name>.webp »).
--    Les images sont partagées par les 5 langues : une seule ligne par mot français.
--  * list_image_names() : renvoie tous les noms d'un coup (utilisé par l'application pour savoir quelles images existent).
-- À exécuter UNE FOIS dans le SQL Editor de Supabase. Relançable sans danger.
-- =========================================================
set search_path = langues, public;

create table if not exists word_images (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table word_images enable row level security;
drop policy if exists "server manages word images" on word_images;
create policy "server manages word images" on word_images for all using (true) with check (true);

create or replace function public.list_image_names()
returns jsonb
language sql
stable
security definer
set search_path = langues, public
as $$
  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from word_images;
$$;

notify pgrst, 'reload schema';
