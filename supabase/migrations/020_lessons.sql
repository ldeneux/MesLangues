-- =========================================================
-- Migration 020 — Mode Leçons
--  * vocabulary_words.usage_score : utilité du mot (1-100), pour apprendre les mots courants d'abord
--  * lessons : le plan de leçons (identique pour tous les profils)
--  * lesson_progress : leçons terminées, par profil
-- =========================================================

alter table vocabulary_words add column if not exists usage_score smallint;
create index if not exists idx_vocab_words_usage on vocabulary_words(language_code, level_code, usage_score);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  number int not null,
  theme_code text not null,
  noun_ids jsonb not null default '[]'::jsonb,        -- uuid des noms (vocabulary_words)
  adjective_ids jsonb not null default '[]'::jsonb,   -- uuid des adjectifs
  other_ids jsonb not null default '[]'::jsonb,       -- mots complémentaires si le stock de noms manque
  verb_ids jsonb not null default '[]'::jsonb,        -- uuid des verbes (conjugation_verbs)
  phrase_ids jsonb not null default '[]'::jsonb,      -- adverbes / expressions utiles (vocabulary_words)
  review jsonb not null default '[]'::jsonb,          -- [{ "k": "w" | "v", "id": "uuid" }] mots des leçons précédentes
  grammar_topic_code text,
  created_at timestamptz not null default now(),
  unique (language_code, level_code, number)
);

alter table lessons enable row level security;
create policy "read lessons" on lessons for select using (true);
create policy "server manages lessons" on lessons for all using (true) with check (true);

create table if not exists lesson_progress (
  profile_id uuid not null references user_profiles(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);

alter table lesson_progress enable row level security;
create policy "server manages lesson progress" on lesson_progress for all using (true) with check (true);

notify pgrst, 'reload schema';
