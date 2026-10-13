-- VÉRIFICATION APRÈS LE DÉPLACEMENT — lecture seule. Compare avec l'état des lieux d'avant : mêmes nombres de lignes.

with t(tbl) as (values
      ('languages'),
      ('levels'),
      ('phrase_sets'),
      ('phrases'),
      ('user_profiles'),
      ('user_language_settings'),
      ('user_phrase_progress'),
      ('level_tests'),
      ('level_test_questions'),
      ('user_test_results'),
      ('packs'),
      ('listening_articles'),
      ('listening_questions'),
      ('listening_results'),
      ('grammar_topics'),
      ('conjugation_verbs'),
      ('vocabulary_words'),
      ('vocabulary_progress'),
      ('conjugation_progress'),
      ('vocabulary_packs'),
      ('listening_packs'),
      ('exercise_progress'),
      ('grammar_questions'),
      ('grammar_results'),
      ('writing_prompts'),
      ('writing_results'),
      ('ja_readings'),
      ('kanji'),
      ('kanji_progress'),
      ('conversation_results'),
      ('lessons'),
      ('lesson_progress'),
      ('exam_sessions')
)
select
  t.tbl as "table",
  case when to_regclass('langues.'||t.tbl) is not null then 'langues'
       when to_regclass('public.'||t.tbl) is not null then 'public  ← PAS déplacée'
       else '— absente —' end as "schéma actuel",
  case when to_regclass('langues.'||t.tbl) is not null
         then (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from langues.%I', t.tbl), false, true, '')))[1]::text::bigint
  end as "lignes"
from t
order by 2, 1;

-- Les 4 fonctions de statistiques doivent toujours exister dans « public »
select routine_schema, routine_name
from information_schema.routines
where routine_name in ('get_db_size_bytes','get_storage_size_bytes','get_storage_size_by_prefix','get_content_table_sizes')
order by 2;

-- « langues » doit figurer dans les schémas exposés
select o.option_value as "pgrst.db_schemas"
from pg_roles r, lateral pg_options_to_table(r.rolconfig) o
where r.rolname = 'authenticator' and o.option_name = 'pgrst.db_schemas';
