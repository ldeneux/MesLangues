-- =========================================================
-- Migration 009 — Lot 2 : banque de quiz par fiche de grammaire
-- =========================================================
create table if not exists grammar_questions (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  topic_code text not null,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  created_at timestamptz not null default now()
);

alter table grammar_questions enable row level security;
create policy "read grammar questions" on grammar_questions for select using (true);
create policy "server manages grammar questions" on grammar_questions for all using (true) with check (true);

create index if not exists idx_grammar_questions_topic on grammar_questions(language_code, topic_code);

create table if not exists grammar_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id) on delete cascade,
  language_code text not null references languages(code),
  topic_code text not null,
  correct_count int not null,
  total_count int not null,
  created_at timestamptz not null default now()
);

alter table grammar_results enable row level security;
create policy "server manages grammar results" on grammar_results for all using (true) with check (true);
