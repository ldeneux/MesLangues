-- =========================================================
-- Migration 017 — volumétrie : prise en compte des tables japonaises (kanji, lectures)
-- =========================================================
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
    'exercise_progress', 'listening_results', 'grammar_results',
    'kanji', 'kanji_progress', 'ja_readings'
  );
$$;

grant execute on function get_content_table_sizes() to service_role;
