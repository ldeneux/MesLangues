-- =========================================================
-- Migration 007 — vocabulaire en packs de 350 (comme les phrases)
-- =========================================================
create table if not exists vocabulary_packs (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  level_code text not null references levels(code),
  pack_number int not null,
  target_count int not null default 350,
  status text not null default 'pending',
  generated_count int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (language_code, level_code, pack_number)
);

alter table vocabulary_packs enable row level security;
create policy "read vocabulary packs" on vocabulary_packs for select using (true);
create policy "server manages vocabulary packs" on vocabulary_packs for all using (true) with check (true);

alter table vocabulary_words add column if not exists pack_id uuid references vocabulary_packs(id) on delete cascade;
create index if not exists idx_vocab_words_pack on vocabulary_words(pack_id);
