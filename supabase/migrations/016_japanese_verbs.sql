-- =========================================================
-- Migration 016 — Japonais : verbes (groupe + lecture, formes calculées par code)
-- =========================================================
alter table conjugation_verbs add column if not exists ja_data jsonb;
-- ja_data (japonais uniquement) : { "group": "godan|ichidan|suru|kuru", "ruby": "{食|た}べる", "reading": "たべる" }
