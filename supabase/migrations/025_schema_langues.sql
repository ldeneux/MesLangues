-- =========================================================
-- Migration 025 — Déplacer les tables de l'application dans le schéma « langues »
--
-- SANS RISQUE POUR LES DONNÉES : « ALTER TABLE … SET SCHEMA » ne copie, ne vide et ne supprime rien. C'est un simple
-- changement de rattachement : lignes, index, clés étrangères, séquences et règles RLS suivent la table.
-- La migration ne touche QU'AUX 34 tables de cette application (liste ci-dessous). Les tables des autres
-- applications de la base ne sont ni lues ni déplacées.
--
-- Protections :
--  * une table n'est déplacée que si elle ressemble bien à la nôtre (4 colonnes attendues) ; au moindre doute
--    (table du même nom mais différente) TOUTE la migration est annulée, rien n'est déplacé ;
--  * le nombre de lignes est compté avant et après chaque déplacement ; une différence annule tout ;
--  * tout se passe dans une seule transaction : en cas d'erreur, la base reste exactement comme avant ;
--  * relançable sans danger (les tables déjà déplacées sont ignorées).
--
-- AVANT de lancer : sauvegarde (Supabase → Database → Backups) et lis supabase/schema_langues/LISEZ-MOI.md.
-- APRÈS : mettre NEXT_PUBLIC_DB_SCHEMA=langues dans Vercel et redéployer (sinon l'appli cherchera encore dans « public »).
-- Les 4 fonctions de statistiques (get_db_size_bytes…) restent dans « public » : l'appli les appelle explicitement là.
-- =========================================================
begin;

create schema if not exists langues;

do $$
declare
  spec record;
  c text;
  ok boolean;
  n_before bigint;
  n_after bigint;
  moved int := 0;
  already int := 0;
  absent int := 0;
begin
  for spec in
    select * from (values
      ('languages', array['code', 'label', 'bcp47', 'flag_emoji']),
      ('levels', array['code', 'ordre']),
      ('phrase_sets', array['id', 'language_code', 'level_code', 'set_date']),
      ('phrases', array['id', 'phrase_set_id', 'target_text', 'translation_fr']),
      ('user_profiles', array['id', 'display_name', 'created_at', 'emoji']),
      ('user_language_settings', array['user_id', 'language_code', 'current_level', 'daily_goal']),
      ('user_phrase_progress', array['user_id', 'phrase_id', 'seen_count', 'last_seen_at']),
      ('level_tests', array['id', 'language_code', 'level_code', 'title']),
      ('level_test_questions', array['id', 'level_test_id', 'question', 'choices']),
      ('user_test_results', array['id', 'user_id', 'level_test_id', 'score']),
      ('packs', array['id', 'language_code', 'level_code', 'pack_number']),
      ('listening_articles', array['id', 'language_code', 'level_code', 'title']),
      ('listening_questions', array['id', 'article_id', 'position', 'question']),
      ('listening_results', array['id', 'profile_id', 'article_id', 'correct_count']),
      ('grammar_topics', array['id', 'language_code', 'topic_code', 'title']),
      ('conjugation_verbs', array['id', 'language_code', 'infinitive', 'translation_fr']),
      ('vocabulary_words', array['id', 'language_code', 'level_code', 'theme_code']),
      ('vocabulary_progress', array['profile_id', 'word_id', 'success_count', 'fail_count']),
      ('conjugation_progress', array['profile_id', 'verb_id', 'success_count', 'fail_count']),
      ('vocabulary_packs', array['id', 'language_code', 'level_code', 'pack_number']),
      ('listening_packs', array['id', 'language_code', 'level_code', 'pack_number']),
      ('exercise_progress', array['profile_id', 'phrase_id', 'success_count', 'fail_count']),
      ('grammar_questions', array['id', 'language_code', 'topic_code', 'question']),
      ('grammar_results', array['id', 'profile_id', 'language_code', 'topic_code']),
      ('writing_prompts', array['id', 'language_code', 'level_code', 'theme_code']),
      ('writing_results', array['id', 'profile_id', 'prompt_id', 'submitted_text']),
      ('ja_readings', array['text', 'ruby', 'romaji', 'created_at']),
      ('kanji', array['id', 'char', 'level_code', 'position']),
      ('kanji_progress', array['profile_id', 'kanji_id', 'success_count', 'fail_count']),
      ('conversation_results', array['id', 'profile_id', 'language_code', 'level_code']),
      ('lessons', array['id', 'language_code', 'level_code', 'number']),
      ('lesson_progress', array['profile_id', 'lesson_id', 'completed_at']),
      ('lesson_sentences', array['id', 'lesson_id', 'position', 'target_text']),
      ('exam_sessions', array['id', 'profile_id', 'language_code', 'level_code'])
    ) as t(tbl, req)
  loop
    if to_regclass(format('langues.%I', spec.tbl)) is not null then
      already := already + 1;
      continue;
    end if;
    if to_regclass(format('public.%I', spec.tbl)) is null then
      raise notice 'Table % : absente de public (jamais créée ?), ignorée.', spec.tbl;
      absent := absent + 1;
      continue;
    end if;

    ok := true;
    foreach c in array spec.req loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = spec.tbl and column_name = c
      ) then
        ok := false;
        exit;
      end if;
    end loop;
    if not ok then
      raise exception 'public.% existe mais ne ressemble pas à la table de cette application (colonne % absente) : appartient-elle à une autre application ? MIGRATION ANNULÉE, rien n''a été déplacé.', spec.tbl, c;
    end if;

    execute format('select count(*) from public.%I', spec.tbl) into n_before;
    execute format('alter table public.%I set schema langues', spec.tbl);
    execute format('select count(*) from langues.%I', spec.tbl) into n_after;
    if n_before <> n_after then
      raise exception 'Table % : % lignes avant, % après. MIGRATION ANNULÉE.', spec.tbl, n_before, n_after;
    end if;
    moved := moved + 1;
    raise notice 'OK  %  (% lignes)', spec.tbl, n_after;
  end loop;

  raise notice 'Terminé : % table(s) déplacée(s), % déjà dans « langues », % absente(s).', moved, already, absent;
end $$;

-- Droits : l'appli utilise la clé service côté serveur (le navigateur ne lit aucune table directement).
grant usage on schema langues to anon, authenticated, service_role;
grant all on all tables in schema langues to service_role;
grant all on all sequences in schema langues to service_role;
alter default privileges in schema langues grant all on tables to service_role;
alter default privileges in schema langues grant all on sequences to service_role;

-- API Supabase : ajouter « langues » aux schémas exposés SANS retirer ceux qui y sont déjà (autres applications).
do $$
declare cur text;
begin
  select o.option_value into cur
  from pg_roles r, lateral pg_options_to_table(r.rolconfig) o
  where r.rolname = 'authenticator' and o.option_name = 'pgrst.db_schemas';
  cur := coalesce(cur, 'public, graphql_public');
  if position('langues' in cur) = 0 then
    execute format('alter role authenticator set pgrst.db_schemas = %L', cur || ', langues');
    raise notice 'Schémas exposés : %', cur || ', langues';
  end if;
end $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
