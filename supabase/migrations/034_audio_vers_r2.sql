-- =========================================================
-- Migration 034 — fonctions pour la migration des audios vers Cloudflare R2
-- (boutons du bloc « Migrer les audios vers Cloudflare R2 » de l'onglet Packs).
-- À exécuter UNE FOIS dans le SQL Editor de Supabase. Ces fonctions ne sont appelables que par l'application (clé service_role).
-- =========================================================

-- Fichiers du bucket « phrase-audio », par ordre de nom, à partir d'un curseur (nom du dernier fichier traité).
create or replace function list_audio_objects(p_after text default '', p_limit int default 100)
returns table(name text, size bigint)
language sql
security definer
set search_path = public, storage
as $$
  select o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'phrase-audio' and o.name > coalesce(p_after, '')
  order by o.name
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- Nombre et poids des fichiers du bucket.
create or replace function count_audio_objects()
returns table(files bigint, bytes bigint)
language sql
security definer
set search_path = public, storage
as $$
  select count(*), coalesce(sum((metadata->>'size')::bigint), 0)
  from storage.objects
  where bucket_id = 'phrase-audio';
$$;

-- Remplace l'ancien préfixe d'URL (Supabase) par le nouveau (R2) dans TOUTES les colonnes « audio » (texte ou jsonb)
-- des schémas de l'appli. p_apply = false : compte seulement les lignes concernées (aucune modification).
create or replace function rewrite_audio_urls(p_old text, p_new text, p_apply boolean default false)
returns table(tbl text, col text, n_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
begin
  if p_old is null or length(p_old) < 12 or p_new is null or length(p_new) < 12 or p_old = p_new then
    raise exception 'Adresses invalides';
  end if;

  for r in
    select c.table_schema as s, c.table_name as t, c.column_name as c, c.data_type as d
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'langues')
      and c.column_name ilike '%audio%'
      and c.data_type in ('text', 'character varying', 'jsonb')
  loop
    if r.d = 'jsonb' then
      execute format('select count(*) from %I.%I where %I::text like %L', r.s, r.t, r.c, '%' || p_old || '%') into n;
      if p_apply and n > 0 then
        execute format('update %I.%I set %I = replace(%I::text, %L, %L)::jsonb where %I::text like %L',
          r.s, r.t, r.c, r.c, p_old, p_new, r.c, '%' || p_old || '%');
      end if;
    else
      execute format('select count(*) from %I.%I where %I like %L', r.s, r.t, r.c, p_old || '%') into n;
      if p_apply and n > 0 then
        execute format('update %I.%I set %I = replace(%I, %L, %L) where %I like %L',
          r.s, r.t, r.c, r.c, p_old, p_new, r.c, p_old || '%');
      end if;
    end if;
    tbl := r.s || '.' || r.t;
    col := r.c;
    n_rows := n;
    return next;
  end loop;
end;
$$;

-- Réservé à l'application (clé service_role) : ni anon, ni utilisateurs connectés.
revoke all on function list_audio_objects(text, int) from public, anon, authenticated;
revoke all on function count_audio_objects() from public, anon, authenticated;
revoke all on function rewrite_audio_urls(text, text, boolean) from public, anon, authenticated;
grant execute on function list_audio_objects(text, int) to service_role;
grant execute on function count_audio_objects() to service_role;
grant execute on function rewrite_audio_urls(text, text, boolean) to service_role;
