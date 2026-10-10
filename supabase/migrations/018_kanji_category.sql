-- =========================================================
-- Migration 018 — Kanji : catégorie (filtre par thème)
-- =========================================================
alter table kanji add column if not exists category text;
create index if not exists idx_kanji_category on kanji(level_code, category);
