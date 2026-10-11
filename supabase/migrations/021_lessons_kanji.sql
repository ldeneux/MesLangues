-- =========================================================
-- Migration 021 — Leçons : kanji à apprendre dans chaque leçon (japonais)
-- =========================================================
alter table lessons add column if not exists kanji_chars jsonb not null default '[]'::jsonb; -- ex. ["日","本"]
notify pgrst, 'reload schema';
