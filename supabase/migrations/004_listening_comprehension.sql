-- =========================================================
-- Migration 004 — thèmes sur les articles + compréhension notée
-- =========================================================
alter table listening_articles add column if not exists theme_code text;

create table if not exists listening_questions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references listening_articles(id) on delete cascade,
  position int not null,
  question text not null,
  options jsonb not null, -- tableau de 4 chaînes
  correct_index int not null
);

alter table listening_questions enable row level security;
create policy "read questions" on listening_questions for select using (true);
create policy "server manages questions" on listening_questions for all using (true) with check (true);

create table if not exists listening_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id) on delete cascade,
  article_id uuid not null references listening_articles(id) on delete cascade,
  correct_count int not null,
  total_count int not null,
  created_at timestamptz not null default now()
);

alter table listening_results enable row level security;
create policy "read own results" on listening_results for select using (true);
create policy "server manages results" on listening_results for all using (true) with check (true);

create index if not exists idx_listening_results_profile on listening_results(profile_id, article_id);
