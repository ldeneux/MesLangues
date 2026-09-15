-- =========================================================
-- Migration 003 — mode Écoute (articles de presse locale)
-- =========================================================
create table if not exists listening_articles (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  title text not null,
  content text not null,
  content_fr text not null,
  audio_url text,
  created_at timestamptz not null default now()
);

alter table listening_articles enable row level security;
create policy "read articles" on listening_articles for select using (true);
create policy "server manages articles" on listening_articles for all using (true) with check (true);
