-- =========================================================
-- Migration 012 — fonctions de volumétrie (taille base + stockage)
-- =========================================================
create or replace function get_db_size_bytes()
returns bigint
language sql
security definer
as $$
  select pg_database_size(current_database());
$$;

create or replace function get_storage_size_bytes()
returns bigint
language sql
security definer
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects;
$$;

-- Taille de stockage (audio) par préfixe de chemin ("it/A1/...", etc.) —
-- utilisée pour répartir la taille du bucket par langue/niveau.
create or replace function get_storage_size_by_prefix()
returns table(path_prefix text, total_bytes bigint)
language sql
security definer
as $$
  select
    (string_to_array(name, '/'))[1] || '/' || coalesce((string_to_array(name, '/'))[2], '') as path_prefix,
    sum((metadata->>'size')::bigint) as total_bytes
  from storage.objects
  group by 1;
$$;

-- Taille de chaque table de contenu, pour répartir la taille DB au
-- prorata du nombre de lignes par langue/niveau côté application.
create or replace function get_content_table_sizes()
returns table(table_name text, total_bytes bigint)
language sql
security definer
as $$
  select relname, pg_total_relation_size(relid)
  from pg_catalog.pg_statio_user_tables
  where relname in (
    'phrases', 'packs',
    'vocabulary_words', 'vocabulary_packs',
    'listening_articles', 'listening_questions', 'listening_packs',
    'writing_prompts', 'writing_results',
    'grammar_topics', 'grammar_questions',
    'conjugation_verbs',
    'user_phrase_progress', 'vocabulary_progress', 'conjugation_progress',
    'exercise_progress', 'listening_results', 'grammar_results'
  );
$$;

grant execute on function get_db_size_bytes() to service_role;
grant execute on function get_storage_size_bytes() to service_role;
grant execute on function get_storage_size_by_prefix() to service_role;
grant execute on function get_content_table_sizes() to service_role;
