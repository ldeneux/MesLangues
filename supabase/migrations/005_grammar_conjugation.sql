-- =========================================================
-- Migration 005 — Grammaire de base + Conjugaison
-- =========================================================
create table if not exists grammar_topics (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  topic_code text not null,
  title text not null,
  explanation_fr text not null,
  examples jsonb not null, -- [{ "target": "...", "fr": "..." }, ...]
  created_at timestamptz not null default now(),
  unique (language_code, topic_code)
);

alter table grammar_topics enable row level security;
create policy "read grammar" on grammar_topics for select using (true);
create policy "server manages grammar" on grammar_topics for all using (true) with check (true);

create table if not exists conjugation_verbs (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  infinitive text not null,
  translation_fr text not null,
  frequency_rank int not null,
  theme_code text,
  tenses jsonb not null, -- { "present": [...6], "futur": [...6], "passe_compose": [...6], "imparfait": [...6] }
  created_at timestamptz not null default now(),
  unique (language_code, infinitive)
);

alter table conjugation_verbs enable row level security;
create policy "read conjugation" on conjugation_verbs for select using (true);
create policy "server manages conjugation" on conjugation_verbs for all using (true) with check (true);

create index if not exists idx_conjugation_lang_rank on conjugation_verbs(language_code, frequency_rank);
create index if not exists idx_conjugation_lang_theme on conjugation_verbs(language_code, theme_code);
