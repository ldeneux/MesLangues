-- =========================================================
-- Migration 014 — Japonais : lectures (furigana + rōmaji) mises en cache
-- =========================================================
create table if not exists ja_readings (
  text text primary key,          -- phrase japonaise telle qu'affichée
  ruby text not null,             -- ex. "{食|た}べる" (kanji | lecture)
  romaji text not null,           -- ex. "taberu"
  created_at timestamptz not null default now()
);

alter table ja_readings enable row level security;
create policy "server manages ja readings" on ja_readings for all using (true) with check (true);
