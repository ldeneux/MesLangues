-- =========================================================
-- Migration 015 — Japonais : kanji (fiches + progression)
-- =========================================================
create table if not exists kanji (
  id uuid primary key default gen_random_uuid(),
  char text not null unique,           -- le kanji, ex. "日"
  level_code text not null references levels(code),
  position int not null,               -- ordre dans la liste du niveau
  meaning_fr text not null,            -- ex. "soleil, jour"
  onyomi jsonb not null default '[]'::jsonb,   -- ["ニチ","ジツ"]
  kunyomi jsonb not null default '[]'::jsonb,  -- ["ひ","か"] ("." sépare la partie en kanji des okurigana)
  examples jsonb not null default '[]'::jsonb, -- [{"word":"日本","reading":"にほん","meaning_fr":"Japon"}]
  created_at timestamptz not null default now()
);

alter table kanji enable row level security;
create policy "read kanji" on kanji for select using (true);
create policy "server manages kanji" on kanji for all using (true) with check (true);
create index if not exists idx_kanji_level on kanji(level_code, position);

create table if not exists kanji_progress (
  profile_id uuid not null references user_profiles(id) on delete cascade,
  kanji_id uuid not null references kanji(id) on delete cascade,
  success_count int not null default 0,
  fail_count int not null default 0,
  last_practiced_at timestamptz,
  primary key (profile_id, kanji_id)
);

alter table kanji_progress enable row level security;
create policy "server manages kanji progress" on kanji_progress for all using (true) with check (true);
