-- =========================================================
-- Schéma Supabase — appli d'apprentissage de langues
-- (italien / espagnol / anglais, phrases générées par IA + TTS)
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------
create table if not exists languages (
  code text primary key,           -- 'it', 'es', 'en'
  label text not null,             -- 'Italien', 'Espagnol', 'Anglais'
  bcp47 text not null,             -- 'it-IT', 'es-ES', 'en-GB' (pour Google TTS)
  flag_emoji text
);

insert into languages (code, label, bcp47, flag_emoji) values
  ('it', 'Italien', 'it-IT', '🇮🇹'),
  ('es', 'Espagnol', 'es-ES', '🇪🇸'),
  ('en', 'Anglais', 'en-GB', '🇬🇧')
on conflict (code) do nothing;

create table if not exists levels (
  code text primary key,           -- 'A1', 'A2', 'B1'...
  ordre int not null
);

insert into levels (code, ordre) values
  ('A1', 1), ('A2', 2), ('B1', 3), ('B2', 4)
on conflict (code) do nothing;

-- ---------------------------------------------------------
-- Lots de phrases générés (un par jour / langue / niveau)
-- ---------------------------------------------------------
create table if not exists phrase_sets (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  set_date date not null default current_date,
  theme text,                       -- thème du jour éventuel ("au restaurant", "les voyages"...)
  generation_model text,            -- ex. 'claude-sonnet-4-6'
  created_at timestamptz not null default now(),
  unique (language_code, level_code, set_date)
);

create table if not exists phrases (
  id uuid primary key default gen_random_uuid(),
  phrase_set_id uuid not null references phrase_sets(id) on delete cascade,
  target_text text not null,        -- la phrase dans la langue cible
  translation_fr text not null,     -- traduction française
  notes text,                       -- point grammatical/culturel éventuel
  audio_url text,                   -- URL Supabase Storage du fichier TTS
  audio_voice text,                 -- nom de la voix Google TTS utilisée
  position int not null default 0,  -- ordre dans le lot (1 à 30)
  created_at timestamptz not null default now()
);

create index if not exists idx_phrases_set on phrases(phrase_set_id);

-- ---------------------------------------------------------
-- Utilisateurs & progression
-- (auth.users est géré par Supabase Auth)
-- ---------------------------------------------------------
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists user_language_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  language_code text not null references languages(code),
  current_level text not null default 'A1' references levels(code),
  daily_goal int not null default 30,
  created_at timestamptz not null default now(),
  primary key (user_id, language_code)
);

create table if not exists user_phrase_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  phrase_id uuid not null references phrases(id) on delete cascade,
  seen_count int not null default 0,
  last_seen_at timestamptz,
  mastered boolean not null default false,
  primary key (user_id, phrase_id)
);

-- ---------------------------------------------------------
-- Tests de niveau
-- ---------------------------------------------------------
create table if not exists level_tests (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  title text not null,
  generation_model text,
  created_at timestamptz not null default now()
);

create table if not exists level_test_questions (
  id uuid primary key default gen_random_uuid(),
  level_test_id uuid not null references level_tests(id) on delete cascade,
  question text not null,
  choices jsonb not null,           -- ["réponse A", "réponse B", "réponse C", "réponse D"]
  correct_index int not null,
  explanation text,
  position int not null default 0
);

create table if not exists user_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level_test_id uuid not null references level_tests(id) on delete cascade,
  score int not null,
  total int not null,
  passed boolean not null,
  taken_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- RLS : chacun ne voit/modifie que ses propres données perso ;
-- le contenu (phrases, tests) est en lecture publique pour
-- tout utilisateur authentifié.
-- ---------------------------------------------------------
alter table user_profiles enable row level security;
alter table user_language_settings enable row level security;
alter table user_phrase_progress enable row level security;
alter table user_test_results enable row level security;

create policy "own profile" on user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own language settings" on user_language_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own progress" on user_phrase_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own test results" on user_test_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table phrase_sets enable row level security;
alter table phrases enable row level security;
alter table level_tests enable row level security;
alter table level_test_questions enable row level security;

create policy "read phrase_sets" on phrase_sets for select using (true);
create policy "read phrases" on phrases for select using (true);
create policy "read level_tests" on level_tests for select using (true);
create policy "read level_test_questions" on level_test_questions for select using (true);
-- Les écritures sur ces 4 tables passent uniquement par la clé service_role
-- (routes serveur / cron), jamais depuis le client.
