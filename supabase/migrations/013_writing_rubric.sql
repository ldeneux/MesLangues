-- =========================================================
-- Migration 013 — détail de notation Écriture (barème par critère)
-- =========================================================
alter table writing_results
  add column if not exists level_code text,
  add column if not exists criteria jsonb,
  add column if not exists errors jsonb,
  add column if not exists penalties jsonb,
  add column if not exists word_count int,
  add column if not exists rubric_version text;
