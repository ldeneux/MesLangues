-- =========================================================
-- Migration 010 — Lot 4 : Production écrite
-- =========================================================
create table if not exists writing_prompts (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  theme_code text not null,
  instruction text not null,
  guiding_points jsonb not null, -- ["point 1", "point 2", ...]
  min_words int not null,
  max_words int not null,
  created_at timestamptz not null default now()
);

alter table writing_prompts enable row level security;
create policy "read writing prompts" on writing_prompts for select using (true);
create policy "server manages writing prompts" on writing_prompts for all using (true) with check (true);

create index if not exists idx_writing_prompts_lang_level on writing_prompts(language_code, level_code);

create table if not exists writing_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id) on delete cascade,
  prompt_id uuid not null references writing_prompts(id) on delete cascade,
  submitted_text text not null,
  corrected_text text not null,
  feedback_fr text not null,
  score int not null, -- 0-100
  created_at timestamptz not null default now()
);

alter table writing_results enable row level security;
create policy "server manages writing results" on writing_results for all using (true) with check (true);

create index if not exists idx_writing_results_profile_prompt on writing_results(profile_id, prompt_id);
