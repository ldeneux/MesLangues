-- Bascule des liens audio de Supabase Storage vers Cloudflare R2.
-- À exécuter UNE FOIS, APRÈS la copie des fichiers (scripts/migrate-audio-to-r2.mjs) et le déploiement de l'appli avec les variables R2_*.
-- 1) Remplace les deux valeurs ci-dessous (sans « / » final).
-- 2) Exécute d'abord avec dry_run = true : le script affiche combien de lignes seraient modifiées. Puis false.

do $$
declare
  old_base text := 'https://VOTRE-PROJET.supabase.co/storage/v1/object/public/phrase-audio';   -- ancien préfixe (Supabase)
  new_base text := 'https://VOTRE-DOMAINE-PUBLIC-R2';                                          -- nouveau préfixe (= R2_PUBLIC_BASE_URL)
  dry_run  boolean := true;
  r record;
  n bigint;
begin
  -- Toutes les colonnes de texte ou jsonb dont le nom contient « audio », dans les schémas de l'appli
  for r in
    select c.table_schema, c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema in ('langues', 'public')
      and c.column_name ilike '%audio%'
      and c.data_type in ('text', 'character varying', 'jsonb')
  loop
    if r.data_type = 'jsonb' then
      execute format('select count(*) from %I.%I where %I::text like %L', r.table_schema, r.table_name, r.column_name, '%' || old_base || '%') into n;
      raise notice '% .% .% : % ligne(s)', r.table_schema, r.table_name, r.column_name, n;
      if not dry_run and n > 0 then
        execute format('update %I.%I set %I = replace(%I::text, %L, %L)::jsonb where %I::text like %L',
          r.table_schema, r.table_name, r.column_name, r.column_name, old_base, new_base, r.column_name, '%' || old_base || '%');
      end if;
    else
      execute format('select count(*) from %I.%I where %I like %L', r.table_schema, r.table_name, r.column_name, old_base || '%') into n;
      raise notice '% .% .% : % ligne(s)', r.table_schema, r.table_name, r.column_name, n;
      if not dry_run and n > 0 then
        execute format('update %I.%I set %I = replace(%I, %L, %L) where %I like %L',
          r.table_schema, r.table_name, r.column_name, r.column_name, old_base, new_base, r.column_name, old_base || '%');
      end if;
    end if;
  end loop;
end $$;
