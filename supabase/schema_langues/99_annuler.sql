-- ANNULATION : remet les tables de l'application dans le schéma « public » (même protections que la migration 025).
-- Aucune donnée n'est copiée ni supprimée. Après l'annulation : remettre NEXT_PUBLIC_DB_SCHEMA=public (ou supprimer la
-- variable) dans Vercel et redéployer.
begin;

do $$
declare
  tbl text;
  n_before bigint;
  n_after bigint;
  moved int := 0;
begin
  foreach tbl in array array['languages', 'levels', 'phrase_sets', 'phrases', 'user_profiles', 'user_language_settings', 'user_phrase_progress', 'level_tests', 'level_test_questions', 'user_test_results', 'packs', 'listening_articles', 'listening_questions', 'listening_results', 'grammar_topics', 'conjugation_verbs', 'vocabulary_words', 'vocabulary_progress', 'conjugation_progress', 'vocabulary_packs', 'listening_packs', 'exercise_progress', 'grammar_questions', 'grammar_results', 'writing_prompts', 'writing_results', 'ja_readings', 'kanji', 'kanji_progress', 'conversation_results', 'lessons', 'lesson_progress', 'exam_sessions'] loop
    if to_regclass(format('langues.%I', tbl)) is null then continue; end if;
    if to_regclass(format('public.%I', tbl)) is not null then
      raise exception 'public.% existe déjà : impossible de remettre langues.% sans écraser. ANNULATION ANNULÉE (rien n''a bougé).', tbl, tbl;
    end if;
    execute format('select count(*) from langues.%I', tbl) into n_before;
    execute format('alter table langues.%I set schema public', tbl);
    execute format('select count(*) from public.%I', tbl) into n_after;
    if n_before <> n_after then
      raise exception 'Table % : % lignes avant, % après. ANNULÉ.', tbl, n_before, n_after;
    end if;
    moved := moved + 1;
  end loop;
  raise notice '% table(s) remise(s) dans public.', moved;
end $$;

commit;
