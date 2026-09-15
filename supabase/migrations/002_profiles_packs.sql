-- =========================================================
-- Migration 002 — comptes apprenants (sans authentification)
-- + packs thématiques de phrases
-- =========================================================
-- Hypothèse : appli pré-lancement, pas de données réelles à préserver sur
-- user_profiles / user_phrase_progress / user_test_results. Si ce n'est
-- plus vrai au moment d'exécuter cette migration, sauvegarder ces tables
-- avant.

-- ---------------------------------------------------------
-- 1) user_profiles devient une simple table de "profils apprenants",
--    plus liée à Supabase Auth (auth.users).
-- ---------------------------------------------------------
alter table user_profiles drop constraint if exists user_profiles_id_fkey;
alter table user_profiles alter column id set default gen_random_uuid();
alter table user_profiles add column if not exists emoji text not null default '🙂';
update user_profiles set display_name = 'Sans nom' where display_name is null;
alter table user_profiles alter column display_name set not null;

-- ---------------------------------------------------------
-- 2) Repointer les tables enfants sur user_profiles au lieu de auth.users
-- ---------------------------------------------------------
alter table user_language_settings drop constraint if exists user_language_settings_user_id_fkey;
alter table user_language_settings
  add constraint user_language_settings_user_id_fkey
  foreign key (user_id) references user_profiles(id) on delete cascade;

alter table user_phrase_progress drop constraint if exists user_phrase_progress_user_id_fkey;
alter table user_phrase_progress
  add constraint user_phrase_progress_user_id_fkey
  foreign key (user_id) references user_profiles(id) on delete cascade;

alter table user_test_results drop constraint if exists user_test_results_user_id_fkey;
alter table user_test_results
  add constraint user_test_results_user_id_fkey
  foreign key (user_id) references user_profiles(id) on delete cascade;

-- ---------------------------------------------------------
-- 3) RLS : il n'y a plus d'auth.uid() possible. L'app ne parle à Supabase
--    qu'au travers du service role côté serveur (server actions), donc ces
--    policies sont surtout là pour le jour où un accès client direct
--    apparaîtrait — permissif par défaut, à durcir si besoin plus tard.
-- ---------------------------------------------------------
drop policy if exists "own profile" on user_profiles;
drop policy if exists "own language settings" on user_language_settings;
drop policy if exists "own progress" on user_phrase_progress;
drop policy if exists "own test results" on user_test_results;

create policy "server manages profiles" on user_profiles for all using (true) with check (true);
create policy "server manages language settings" on user_language_settings for all using (true) with check (true);
create policy "server manages progress" on user_phrase_progress for all using (true) with check (true);
create policy "server manages test results" on user_test_results for all using (true) with check (true);

-- ---------------------------------------------------------
-- 4) Packs thématiques
-- ---------------------------------------------------------
create table if not exists packs (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  pack_number int not null,
  target_count int not null default 350,
  status text not null default 'pending', -- pending | generating | ready
  generated_count int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (language_code, level_code, pack_number)
);

alter table packs enable row level security;
create policy "read packs" on packs for select using (true);
create policy "server manages packs" on packs for all using (true) with check (true);

-- ---------------------------------------------------------
-- 5) phrases rejoint les packs. phrase_set_id devient optionnel : les
--    anciennes phrases générées par jour restent lisibles, les nouvelles
--    (issues des packs) n'auront pas de phrase_set_id.
-- ---------------------------------------------------------
alter table phrases alter column phrase_set_id drop not null;
alter table phrases add column if not exists pack_id uuid references packs(id) on delete cascade;
alter table phrases add column if not exists theme_code text;
alter table phrases add column if not exists pack_position int;

create index if not exists idx_phrases_pack on phrases(pack_id);
create index if not exists idx_phrases_pack_theme on phrases(pack_id, theme_code);

-- ---------------------------------------------------------
-- 6) Rattacher les tests de niveau aux profils apprenants
-- ---------------------------------------------------------
alter table user_test_results add column if not exists profile_id uuid references user_profiles(id) on delete cascade;
